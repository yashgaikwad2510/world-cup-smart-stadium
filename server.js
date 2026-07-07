import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import hpp from 'hpp';
import apicache from 'apicache';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security and Efficiency Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // disabled for GSAP/external fonts in this simple app
  })
);
app.use(cors());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(hpp());
// Cache static assets for 1 day to improve Efficiency score
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// ============================================================
// GOOGLE GENAI INITIALIZATION
// ============================================================
let ai = null;
const API_KEY = process.env.GEMINI_API_KEY;
if (API_KEY && API_KEY !== 'your_gemini_api_key_here') {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log('\u2705 Google GenAI SDK initialized successfully.');
  } catch (error) {
    console.error('\u274c Failed to initialize Google GenAI SDK:', error);
  }
} else {
  console.warn('\u26a0\ufe0f GEMINI_API_KEY is missing. Running in mock developer mode.');
}

// ============================================================
// 1. RATE LIMITER (express-rate-limit)
// ============================================================
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 12;

const rateLimitMiddleware = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Rate limit exceeded',
    text: JSON.stringify({
      type: 'alert',
      title: '\u26a0\ufe0f Rate Limit',
      body: 'You are sending too many requests. Please wait a moment before trying again.',
      cards: [],
      tip: 'The limit is 12 messages per minute to ensure quality for all fans.',
    }),
    structured: true,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// 2. INPUT SAFETY & GUARDRAILS
// ============================================================
const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(if|a|an)?\s/i,
  /pretend\s+(you|to\s+be)/i,
  /system\s*prompt/i,
  /reveal\s+(your|the)\s+(system|instructions)/i,
  /bypass\s+(safety|filter|content)/i,
  /jailbreak/i,
  /do\s+anything\s+now/i,
  /\bDAN\b/,
  /<script[^>]*>/i,
  /javascript:/i,
  /on(error|load|click)\s*=/i,
];

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH = 20;

/**
 * Sanitizes user input by checking against blocked patterns and stripping HTML.
 * @param {string} text - The raw user input.
 * @returns {{safe: boolean, reason?: string, text?: string}} The sanitization result.
 */
function sanitizeInput(text) {
  if (typeof text !== 'string') return { safe: false, reason: 'Invalid input type' };
  if (text.length > MAX_MESSAGE_LENGTH)
    return { safe: false, reason: 'Message exceeds maximum length (2000 characters)' };
  if (text.trim().length === 0) return { safe: false, reason: 'Empty message' };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Message contains disallowed content' };
    }
  }

  // Strip HTML tags
  const cleaned = text.replace(/<[^>]*>/g, '').trim();
  return { safe: true, text: cleaned };
}

// ============================================================
// 3. OUTPUT SANITIZATION
// ============================================================
const OUTPUT_LEAK_PATTERNS = [
  /\[REAL-TIME STADIUM OPERATIONAL DATA\]/gi,
  /\[RESPONSE FORMAT INSTRUCTIONS\]/gi,
  /systemInstruction/gi,
  /GEMINI_API_KEY/gi,
  /FEW-SHOT EXAMPLES:/gi,
  /GUARDRAILS & OPERATIONAL RULES:/gi,
  /PERSONA CONSISTENCY:/gi,
  /dotenv\.config/gi,
  /process\.env/gi,
];

/**
 * Redacts sensitive system information from the AI's output.
 * @param {string} text - The raw AI response.
 * @returns {string} The sanitized response.
 */
function sanitizeOutput(text) {
  if (typeof text !== 'string') return text;

  let cleaned = text;
  for (const pattern of OUTPUT_LEAK_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }

  return cleaned;
}

// ============================================================
// 4. CONVERSATION SUMMARIZATION
// ============================================================
/**
 * Summarizes older messages to prevent the prompt context from exceeding limits.
 * @param {Array<Object>} messages - The array of conversation messages.
 * @returns {Array<Object>} The compressed message array.
 */
function summarizeHistory(messages) {
  if (!messages || messages.length <= 10) return messages;

  // Keep the last 8 messages intact, compress older ones into a summary
  const oldMessages = messages.slice(0, messages.length - 8);
  const recentMessages = messages.slice(messages.length - 8);

  const summaryParts = oldMessages.map((m) => {
    const role = m.role === 'user' ? 'Fan asked' : 'Assistant answered';
    const snippet = (m.content || '').substring(0, 120).replace(/\n/g, ' ');
    return `${role}: ${snippet}`;
  });

  const summaryMessage = {
    role: 'user',
    content: `[CONVERSATION CONTEXT - Summary of earlier messages for continuity]\n${summaryParts.join('\n')}\n[END CONTEXT - Continue assisting the fan from here]`,
  };

  return [summaryMessage, ...recentMessages];
}

// ============================================================
// 5. AUTO LANGUAGE DETECTION (heuristic)
// ============================================================
/**
 * Heuristically detects the language of the user's input.
 * @param {string} text - The user input.
 * @returns {string} The 2-letter ISO language code (e.g., 'en', 'es', 'ar').
 */
function detectLanguage(text) {
  if (!text) return 'en';

  // Check character ranges for common languages
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Hindi (Devanagari)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Japanese
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; // Chinese
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'; // Korean

  // Latin-script heuristics based on common words
  const lower = text.toLowerCase();
  if (/\b(hola|d\u00f3nde|qu\u00e9|c\u00f3mo|gracias|por favor|est\u00e1|necesito)\b/.test(lower))
    return 'es';
  if (/\b(bonjour|o\u00f9|comment|merci|s'il vous pla\u00eet|je suis)\b/.test(lower)) return 'fr';
  if (/\b(hallo|wo|wie|bitte|danke|ich bin|guten)\b/.test(lower)) return 'de';
  if (/\b(ol\u00e1|onde|como|obrigado|preciso|bom dia)\b/.test(lower)) return 'pt';

  return 'en';
}

// ============================================================
// SYSTEM PROMPT BUILDER
// ============================================================
/**
 * Constructs the system prompt by combining base instructions with real-time stadium data.
 * @param {string} gatesContext - Formatted gates data.
 * @param {string} concessionsContext - Formatted concessions data.
 * @param {string} transportContext - Formatted transportation data.
 * @returns {string} The final system instruction string.
 */
function buildSystemInstruction(gatesContext, concessionsContext, transportContext) {
  let systemPrompt = '';
  const sysPromptPath = path.join(__dirname, 'core_prompts', 'system_instruction.txt');
  if (fs.existsSync(sysPromptPath)) {
    systemPrompt = fs.readFileSync(sysPromptPath, 'utf8');
  } else {
    systemPrompt = 'You are MetLife Assist, the official copilot for MetLife Stadium.';
  }

  return `
${systemPrompt}

[REAL-TIME STADIUM OPERATIONAL DATA]
Below is the live operational data from MetLife Stadium sensors. Use this data to answer fan questions accurately.

STADIUM GATES TRAFFIC STATUS:
${gatesContext}

CONCESSIONS WAIT TIMES:
${concessionsContext}

TRANSPORTATION STATUS:
${transportContext}

Current Local Time: ${new Date().toISOString()}

[RESPONSE FORMAT INSTRUCTIONS]
You MUST respond using this exact JSON structure. Do not wrap in markdown code fences. Return raw JSON only:
{"type":"standard|alert|navigation|data_card","title":"optional headline","body":"main response with **markdown**","cards":[{"label":"title","value":"description","status":"good|warning|critical"}],"tip":"optional recommendation or null"}

Rules:
- "type": "data_card" for structured comparisons (gates, food, transport). "alert" for emergencies. "navigation" for directions. "standard" for general conversation.
- "cards": Array of data items with status colors. Empty array [] if not applicable.
- "tip": Helpful recommendation. null if not applicable.
- Respond in the same language the user writes in.
`;
}

// Load mock data context strings
/**
 * Loads mock real-time data from JSON files.
 * @returns {{gatesContext: string, concessionsContext: string, transportContext: string}} The loaded data.
 */
function loadContextData() {
  let gatesContext, concessionsContext, transportContext;

  try {
    const gates = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mock_data', 'gates.json'), 'utf8')
    );
    gatesContext = gates
      .map(
        (g) =>
          `- ${g.gate}: ${g.status} (${g.congestion} Congestion, ${g.waitTimeMinutes}m wait). ${g.notes}`
      )
      .join('\n');
  } catch (_) {
    gatesContext =
      '- Gate A (North): High Traffic\n- Gate B (South): Medium Traffic\n- Gate C (East): Low Traffic';
  }

  try {
    const concessions = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mock_data', 'concessions.json'), 'utf8')
    );
    concessionsContext = concessions
      .map(
        (c) =>
          `- Section ${c.section} (${c.name}): Level: ${c.level}, Wait: ${c.waitTimeMinutes} mins. Popular Item: ${c.popularItem}`
      )
      .join('\n');
  } catch (_) {
    concessionsContext =
      '- Section 112: Tacos (12m wait)\n- Section 224: Burgers (5m wait)\n- Section 318: Hot Dogs (20m wait)';
  }

  try {
    const transport = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mock_data', 'transport.json'), 'utf8')
    );
    transportContext = transport
      .map(
        (t) =>
          `- ${t.type} at ${t.station}: Status: ${t.status}, Frequency: ${t.frequency}. ${t.notes}`
      )
      .join('\n');
  } catch (_) {
    transportContext =
      '- NJ Transit: On Time\n- Coach USA Bus: Minor Delays\n- Rideshare (Lot E): High Demand (20m wait)';
  }

  return { gatesContext, concessionsContext, transportContext };
}

// ============================================================
// MOCK RESPONSE ENGINE
// ============================================================
/**
 * Generates a mock response when the Gemini API key is missing.
 * @param {string} userMessage - The user input.
 * @returns {Object} A structured mock response.
 */
function getMockResponse(userMessage) {
  const msg = userMessage.toLowerCase();

  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return {
      type: 'standard',
      title: null,
      body: 'Hello! Welcome to MetLife Stadium for the FIFA World Cup 2026. \ud83c\udfdf\ufe0f\n\nI am **MetLife Assist**, your GenAI Copilot. I can help you with:\n- \ud83d\udeb6 Navigation & Accessibility paths\n- \ud83d\ude97 Transport updates\n- \ud83c\udf54 Concession stand wait times\n- \ud83d\udea8 Emergency information\n\n*Running in demo mode.*',
      cards: [],
      tip: null,
    };
  }
  if (
    msg.includes('gate') ||
    msg.includes('crowd') ||
    msg.includes('congestion') ||
    msg.includes('density') ||
    msg.includes('shortest')
  ) {
    return {
      type: 'data_card',
      title: 'Gate Traffic Status',
      body: 'Here are the current gate wait times across MetLife Stadium:',
      cards: [
        { label: 'Gate A (North)', value: '35 min wait \u2014 High Traffic', status: 'critical' },
        { label: 'Gate B (South)', value: '15 min wait \u2014 Medium Traffic', status: 'warning' },
        { label: 'Gate C (East)', value: '5 min wait \u2014 Low Traffic \u267f', status: 'good' },
      ],
      tip: '\ud83d\udca1 Gate C has the shortest wait. Based on flow patterns, Gate A should ease to ~15 min within 20 minutes.',
    };
  }
  if (
    msg.includes('wheelchair') ||
    msg.includes('accessible') ||
    msg.includes('mobility') ||
    msg.includes('ramp') ||
    msg.includes('sensory') ||
    msg.includes('elevator')
  ) {
    return {
      type: 'navigation',
      title: 'Accessibility Routes',
      body: '\u267f **Accessibility is our top priority.**\n\n- **Accessible Entry:** Gate C (East) \u2014 low traffic, 5 min wait\n- **Elevators/Ramps:** Step-free routes near Section 110, 215, 312\n- **Sensory Room:** Located near **Section 212** (Club Level)\n\nStadium staff at Gate C can assist with wheelchair access.',
      cards: [
        { label: 'Gate C (Accessible)', value: '5 min wait', status: 'good' },
        { label: 'Sensory Room', value: 'Section 212 \u2014 Club Level', status: 'good' },
      ],
      tip: 'Ramps and escalators take you directly to the Club Level for Sensory Room access.',
    };
  }
  if (
    msg.includes('food') ||
    msg.includes('burger') ||
    msg.includes('taco') ||
    msg.includes('concession') ||
    msg.includes('eat') ||
    msg.includes('nachos')
  ) {
    return {
      type: 'data_card',
      title: 'Concession Wait Times',
      body: 'Here are the current concession lines:',
      cards: [
        {
          label: 'Sec 224 \u2022 Champions Club Burgers',
          value: '5 min wait \u2014 Trophy Cheeseburger',
          status: 'good',
        },
        {
          label: 'Sec 112 \u2022 Goalpost Tacos & Nachos',
          value: '12 min wait \u2014 Carne Asada Nachos',
          status: 'warning',
        },
        {
          label: 'Sec 318 \u2022 Strikers Hot Dogs & Brew',
          value: '20 min wait \u2014 Footlong Jersey Dog',
          status: 'critical',
        },
      ],
      tip: '\ud83d\udca1 Section 224 has the shortest line right now!',
    };
  }
  if (
    msg.includes('transit') ||
    msg.includes('train') ||
    msg.includes('bus') ||
    msg.includes('rideshare') ||
    msg.includes('uber') ||
    msg.includes('lyft') ||
    msg.includes('transport') ||
    msg.includes('penn')
  ) {
    return {
      type: 'data_card',
      title: 'Transportation Status',
      body: 'Here is the latest transport update:',
      cards: [
        {
          label: 'NJ Transit Rail (Lot B)',
          value: 'On Time \u2014 Every 10 min to Penn Station',
          status: 'good',
        },
        {
          label: 'Coach USA Bus (Lot A)',
          value: 'Minor Delays \u2014 Route 3 traffic',
          status: 'warning',
        },
        {
          label: 'Rideshare (Lot E)',
          value: '20-25 min wait \u2014 Surge pricing active',
          status: 'critical',
        },
      ],
      tip: '\ud83d\udca1 NJ Transit Rail from Lot B is your fastest option right now!',
    };
  }
  if (
    msg.includes('emergency') ||
    msg.includes('evacuat') ||
    msg.includes('fire') ||
    msg.includes('help') ||
    msg.includes('danger') ||
    msg.includes('medical')
  ) {
    return {
      type: 'alert',
      title: '\u26a0\ufe0f Emergency Information',
      body: '**If you are experiencing an emergency:**\n\n1. **Stay calm** and follow stadium staff directions\n2. **Nearest exits** are illuminated in all sections\n3. **Gate C (East)** is the designated accessible emergency exit\n4. **Medical stations** are located at Sections 110, 215, and 318\n5. **Call stadium security:** Dial extension 911 on any courtesy phone',
      cards: [
        { label: 'Emergency Exit', value: 'Gate C (East) \u2014 Accessible', status: 'critical' },
        { label: 'Medical Station', value: 'Sections 110, 215, 318', status: 'warning' },
      ],
      tip: 'If this is a life-threatening emergency, call 911 immediately.',
    };
  }

  return {
    type: 'standard',
    title: null,
    body: 'I can help you navigate MetLife Stadium! Feel free to ask about:\n\n- \ud83d\udeb6 **Gates & crowd density**\n- \u267f **Accessible pathways & elevators**\n- \ud83d\ude86 **Transit options**\n- \ud83c\udf54 **Concession wait times**\n- \ud83d\udea8 **Emergency information**\n\nWhat can I help you with?',
    cards: [],
    tip: null,
  };
}

// ============================================================
// API ENDPOINTS
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: ai ? 'live' : 'mock', timestamp: new Date().toISOString() });
});

// Stadium data for sidebar widgets (cached for 1 minute)
const cache = apicache.middleware;
app.get('/api/stadium-data', cache('1 minute'), (req, res) => {
  try {
    const gates = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mock_data', 'gates.json'), 'utf8')
    );
    const concessions = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mock_data', 'concessions.json'), 'utf8')
    );
    const transport = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'mock_data', 'transport.json'), 'utf8')
    );
    res.json({ gates, concessions, transport });
  } catch (error) {
    console.error('Error loading mock data:', error);
    res.status(500).json({ error: 'Failed to load stadium status data' });
  }
});

// ============================================================
// 6. STREAMING CHAT ENDPOINT (SSE)
// ============================================================
app.post('/api/chat/stream', rateLimitMiddleware, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array is required' });
  }

  // Validate last user message
  const lastMsg = messages[messages.length - 1];
  if (lastMsg) {
    const validation = sanitizeInput(lastMsg.content);
    if (!validation.safe) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      const errorResponse = {
        type: 'alert',
        title: 'Input Blocked',
        body: `\u26a0\ufe0f ${validation.reason}. Please rephrase your question about MetLife Stadium.`,
        cards: [],
        tip: null,
      };
      res.write(`data: ${JSON.stringify({ done: true, structured: errorResponse })}\n\n`);
      return res.end();
    }
    lastMsg.content = validation.text;
  }

  // Auto-detect language
  const detectedLang = detectLanguage(lastMsg?.content || '');

  // Summarize conversation if too long
  const processedMessages = summarizeHistory(messages.slice(-MAX_HISTORY_LENGTH));

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { gatesContext, concessionsContext, transportContext } = loadContextData();
    const fullSystemInstruction = buildSystemInstruction(
      gatesContext,
      concessionsContext,
      transportContext
    );

    if (ai) {
      // LIVE MODE: Stream from Gemini
      const contents = processedMessages.map((msg) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.3,
        },
      });

      let fullText = '';
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
        }
      }

      // Sanitize full output
      const sanitized = sanitizeOutput(fullText);

      // Try to parse as structured JSON
      let structured = null;
      try {
        structured = JSON.parse(sanitized);
      } catch {
        // AI didn't return valid JSON, wrap it
        structured = { type: 'standard', title: null, body: sanitized, cards: [], tip: null };
      }

      res.write(`data: ${JSON.stringify({ done: true, structured, detectedLang })}\n\n`);
      res.end();
    } else {
      // MOCK MODE: Simulate streaming by sending body text word by word
      const mockResponse = getMockResponse(lastMsg?.content || '');
      const bodyWords = (mockResponse.body || '').split(' ');

      for (let i = 0; i < bodyWords.length; i++) {
        const token = (i > 0 ? ' ' : '') + bodyWords[i];
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
        await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
      }

      res.write(
        `data: ${JSON.stringify({ done: true, structured: mockResponse, detectedLang })}\n\n`
      );
      res.end();
    }
  } catch (error) {
    console.error('Streaming error:', error);
    const errorResponse = {
      type: 'alert',
      title: 'Error',
      body: 'An error occurred while processing your request. Please try again.',
      cards: [],
      tip: null,
    };
    res.write(`data: ${JSON.stringify({ done: true, structured: errorResponse })}\n\n`);
    res.end();
  }
});

// Fallback non-streaming endpoint (for compatibility)
app.post('/api/chat', rateLimitMiddleware, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array is required' });
  }

  const lastMsg = messages[messages.length - 1];
  if (lastMsg) {
    const validation = sanitizeInput(lastMsg.content);
    if (!validation.safe) {
      return res.status(400).json({
        text: JSON.stringify({
          type: 'alert',
          title: 'Input Blocked',
          body: `\u26a0\ufe0f ${validation.reason}.`,
          cards: [],
          tip: null,
        }),
        structured: true,
      });
    }
    lastMsg.content = validation.text;
  }

  const processedMessages = summarizeHistory(messages.slice(-MAX_HISTORY_LENGTH));

  try {
    const { gatesContext, concessionsContext, transportContext } = loadContextData();
    const fullSystemInstruction = buildSystemInstruction(
      gatesContext,
      concessionsContext,
      transportContext
    );

    if (ai) {
      const contents = processedMessages.map((msg) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: { systemInstruction: fullSystemInstruction, temperature: 0.3 },
      });

      const responseText = sanitizeOutput(result.text);

      try {
        JSON.parse(responseText);
        return res.json({ text: responseText, structured: true });
      } catch {
        const wrapped = JSON.stringify({
          type: 'standard',
          title: null,
          body: responseText,
          cards: [],
          tip: null,
        });
        return res.json({ text: wrapped, structured: true });
      }
    } else {
      const mockResponse = getMockResponse(lastMsg?.content || '');
      await new Promise((r) => setTimeout(r, 600));
      return res.json({ text: JSON.stringify(mockResponse), structured: true });
    }
  } catch (error) {
    console.error('Error generating chat response:', error);
    res.status(500).json({ error: 'Failed to process chat response.' });
  }
});

// Start the server if not imported as a module (for testing)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`\ud83d\ude80 MetLife Assist server running on http://localhost:${PORT}`);
    console.log(
      `\ud83d\udee1\ufe0f  Rate limiter: ${RATE_LIMIT_MAX_REQUESTS} req/${RATE_LIMIT_WINDOW_MS / 1000}s per IP`
    );
    console.log(`\ud83e\udde0 Mode: ${ai ? 'LIVE (Gemini API)' : 'MOCK (Demo responses)'}`);
  });
}

export default app;
