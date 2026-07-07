import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Google GenAI if API key exists
let ai = null;
const API_KEY = process.env.GEMINI_API_KEY;
if (API_KEY && API_KEY !== 'your_gemini_api_key_here') {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log('✅ Google GenAI SDK initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize Google GenAI SDK:', error);
  }
} else {
  console.warn('⚠️ GEMINI_API_KEY is missing or template default. Running in mock developer mode.');
}

// ============================================================
// INPUT SAFETY & GUARDRAIL MIDDLEWARE
// ============================================================
const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(if|a|an)?/i,
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

function sanitizeInput(text) {
  if (typeof text !== 'string') return { safe: false, reason: 'Invalid input type' };
  if (text.length > MAX_MESSAGE_LENGTH) return { safe: false, reason: 'Message exceeds maximum length' };
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
// API ENDPOINTS
// ============================================================

// Endpoint to fetch mock data for frontend widgets
app.get('/api/stadium-data', (req, res) => {
  try {
    const gates = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock_data', 'gates.json'), 'utf8'));
    const concessions = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock_data', 'concessions.json'), 'utf8'));
    const transport = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock_data', 'transport.json'), 'utf8'));
    res.json({ gates, concessions, transport });
  } catch (error) {
    console.error('Error loading mock data:', error);
    res.status(500).json({ error: 'Failed to load stadium status data' });
  }
});

// Endpoint to handle chatbot conversation
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array is required' });
  }

  // Enforce history limit
  const trimmedMessages = messages.slice(-MAX_HISTORY_LENGTH);

  // Validate the last user message
  const lastMsg = trimmedMessages[trimmedMessages.length - 1];
  if (lastMsg) {
    const validation = sanitizeInput(lastMsg.content);
    if (!validation.safe) {
      return res.status(400).json({ 
        error: validation.reason,
        text: `⚠️ I couldn't process that request. ${validation.reason}. Please rephrase your question about MetLife Stadium.`
      });
    }
    lastMsg.content = validation.text;
  }

  try {
    // 1. Read base system prompt
    let systemPrompt = '';
    const sysPromptPath = path.join(__dirname, 'core_prompts', 'system_instruction.txt');
    if (fs.existsSync(sysPromptPath)) {
      systemPrompt = fs.readFileSync(sysPromptPath, 'utf8');
    } else {
      systemPrompt = 'You are MetLife Assist, the official copilot for MetLife Stadium.';
    }

    // 2. Load latest mock data to inject as real-time context
    let gatesContext = '';
    let concessionsContext = '';
    let transportContext = '';

    try {
      const gates = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock_data', 'gates.json'), 'utf8'));
      gatesContext = gates.map(g => `- ${g.gate}: ${g.status} (${g.congestion} Congestion, ${g.waitTimeMinutes}m wait). ${g.notes}`).join('\n');
    } catch (_) {
      gatesContext = '- Gate A (North): High Traffic\n- Gate B (South): Medium Traffic\n- Gate C (East): Low Traffic';
    }

    try {
      const concessions = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock_data', 'concessions.json'), 'utf8'));
      concessionsContext = concessions.map(c => `- Section ${c.section} (${c.name}): Level: ${c.level}, Wait: ${c.waitTimeMinutes} mins. Popular Item: ${c.popularItem}`).join('\n');
    } catch (_) {
      concessionsContext = '- Section 112: Tacos (12m wait)\n- Section 224: Burgers (5m wait)\n- Section 318: Hot Dogs (20m wait)';
    }

    try {
      const transport = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock_data', 'transport.json'), 'utf8'));
      transportContext = transport.map(t => `- ${t.type} at ${t.station}: Status: ${t.status}, Frequency: ${t.frequency}. ${t.notes}`).join('\n');
    } catch (_) {
      transportContext = '- NJ Transit: On Time\n- Coach USA Bus: Minor Delays\n- Rideshare (Lot E): High Demand (20m wait)';
    }

    // 3. Assemble full system instruction with dynamic data + structured output instruction
    const fullSystemInstruction = `
${systemPrompt}

[REAL-TIME STADIUM OPERATIONAL DATA]
Below is the live operational data from MetLife Stadium sensors. Use this information to answer fan questions accurately.

STADIUM GATES TRAFFIC STATUS:
${gatesContext}

CONCESSIONS WAIT TIMES:
${concessionsContext}

TRANSPORTATION STATUS:
${transportContext}

Current Local Time: ${new Date().toISOString()}

[RESPONSE FORMAT INSTRUCTIONS]
You MUST respond using this exact JSON structure. Do not wrap in markdown code fences. Return raw JSON only:
{
  "type": "standard | alert | navigation | data_card",
  "title": "A brief headline for the response (optional, use for data_card or alert types)",
  "body": "The main response text with markdown formatting (bold, lists, etc.)",
  "cards": [
    {
      "label": "Card title",
      "value": "Card value or description",
      "status": "good | warning | critical"
    }
  ],
  "tip": "An optional pro-tip or recommendation (or null if none)"
}

Rules for the JSON response:
- "type" determines how the frontend renders the response. Use "data_card" when showing structured data like gate times or food queues. Use "alert" for urgent safety info. Use "navigation" for directions. Use "standard" for conversational answers.
- "cards" is an array of structured data cards. Include these when the answer involves comparing options (gates, food, transport). Set to an empty array [] if not applicable.
- "status" on each card: "good" = low wait/on time, "warning" = moderate, "critical" = high wait/delayed/congested.
- "tip" is a helpful recommendation. Set to null if not applicable.
- Always respond in the user's language if they specified one.
`;

    // 4. Call Google Gemini API (or fallback if key is missing)
    if (ai) {
      const contents = trimmedMessages.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const chatSession = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.3,
          responseMimeType: 'application/json',
        }
      });

      const responseText = chatSession.text;
      
      // Try to parse structured response
      try {
        const structured = JSON.parse(responseText);
        return res.json({ text: responseText, structured: true });
      } catch {
        // If AI didn't return valid JSON, wrap it
        const fallback = JSON.stringify({
          type: 'standard',
          title: null,
          body: responseText,
          cards: [],
          tip: null
        });
        return res.json({ text: fallback, structured: true });
      }
    } else {
      // Premium Mock Response Engine
      const lastUserMessage = trimmedMessages[trimmedMessages.length - 1].content.toLowerCase();
      let responseObj = {};

      if (lastUserMessage.includes('hello') || lastUserMessage.includes('hi')) {
        responseObj = {
          type: 'standard',
          title: null,
          body: "Hello! Welcome to MetLife Stadium for the FIFA World Cup 2026. 🏟️\n\nI am **MetLife Assist**, your GenAI Copilot. I can help you with:\n- 🚶 Navigation & Accessibility paths\n- 🚗 Transport updates\n- 🍔 Concession stand wait times\n\n*Note: Running in demo mode.*",
          cards: [],
          tip: null
        };
      } else if (lastUserMessage.includes('gate') || lastUserMessage.includes('crowd') || lastUserMessage.includes('congestion') || lastUserMessage.includes('density')) {
        responseObj = {
          type: 'data_card',
          title: 'Gate Traffic Status',
          body: 'Here is the current gate traffic across MetLife Stadium:',
          cards: [
            { label: 'Gate A (North)', value: '35 min wait — High Traffic', status: 'critical' },
            { label: 'Gate B (South)', value: '15 min wait — Medium Traffic', status: 'warning' },
            { label: 'Gate C (East)', value: '5 min wait — Low Traffic ♿', status: 'good' }
          ],
          tip: '💡 Gate C has the shortest wait and is the accessible entry point.'
        };
      } else if (lastUserMessage.includes('wheelchair') || lastUserMessage.includes('accessible') || lastUserMessage.includes('mobility') || lastUserMessage.includes('ramp') || lastUserMessage.includes('sensory')) {
        responseObj = {
          type: 'navigation',
          title: 'Accessibility Routes',
          body: '♿ **Accessibility is our top priority.**\n\n- **Accessible Entry:** Gate C (East) — low traffic, 5 min wait\n- **Elevators/Ramps:** Step-free routes near Section 110, 215, 312\n- **Sensory Room:** Located near **Section 212** (Club Level)',
          cards: [
            { label: 'Gate C (Accessible)', value: '5 min wait', status: 'good' },
            { label: 'Sensory Room', value: 'Section 212 — Club Level', status: 'good' }
          ],
          tip: 'Ramps and escalators take you directly to the Club Level for Sensory Room access.'
        };
      } else if (lastUserMessage.includes('food') || lastUserMessage.includes('burger') || lastUserMessage.includes('taco') || lastUserMessage.includes('concession') || lastUserMessage.includes('eat')) {
        responseObj = {
          type: 'data_card',
          title: 'Concession Wait Times',
          body: 'Here are the current concession lines:',
          cards: [
            { label: 'Sec 224 • Champions Club Burgers', value: '5 min wait — Trophy Cheeseburger', status: 'good' },
            { label: 'Sec 112 • Goalpost Tacos & Nachos', value: '12 min wait — Carne Asada Nachos', status: 'warning' },
            { label: 'Sec 318 • Strikers Hot Dogs & Brew', value: '20 min wait — Footlong Jersey Dog', status: 'critical' }
          ],
          tip: '💡 Section 224 has the shortest line right now!'
        };
      } else if (lastUserMessage.includes('transit') || lastUserMessage.includes('train') || lastUserMessage.includes('bus') || lastUserMessage.includes('rideshare') || lastUserMessage.includes('uber') || lastUserMessage.includes('lyft') || lastUserMessage.includes('transport')) {
        responseObj = {
          type: 'data_card',
          title: 'Transportation Status',
          body: 'Here is the latest transport update:',
          cards: [
            { label: 'NJ Transit Rail (Lot B)', value: 'On Time — Every 10 min to Penn Station', status: 'good' },
            { label: 'Coach USA Bus (Lot A)', value: 'Minor Delays — Route 3 traffic', status: 'warning' },
            { label: 'Rideshare (Lot E)', value: '20-25 min wait — Surge pricing active', status: 'critical' }
          ],
          tip: '💡 NJ Transit Rail from Lot B is your fastest option right now!'
        };
      } else if (lastUserMessage.includes('emergency') || lastUserMessage.includes('evacuat') || lastUserMessage.includes('fire') || lastUserMessage.includes('help') || lastUserMessage.includes('danger')) {
        responseObj = {
          type: 'alert',
          title: '⚠️ Emergency Information',
          body: '**If you are experiencing an emergency:**\n\n1. **Stay calm** and follow stadium staff directions\n2. **Nearest exits** are illuminated in all sections\n3. **Gate C (East)** is the designated accessible emergency exit\n4. **Medical stations** are located at Sections 110, 215, and 318\n5. **Call stadium security:** Dial extension 911 on any courtesy phone',
          cards: [
            { label: 'Emergency Exit', value: 'Gate C (East) — Accessible', status: 'critical' },
            { label: 'Medical Station', value: 'Sections 110, 215, 318', status: 'warning' }
          ],
          tip: 'If this is a life-threatening emergency, call 911 immediately.'
        };
      } else {
        responseObj = {
          type: 'standard',
          title: null,
          body: "I can help you navigate MetLife Stadium! Feel free to ask about:\n\n- 🚶 **Gates & crowd density**\n- ♿ **Accessible pathways**\n- 🚆 **Transit options**\n- 🍔 **Concession wait times**\n- 🚨 **Emergency information**",
          cards: [],
          tip: null
        };
      }

      await new Promise(resolve => setTimeout(resolve, 600));
      return res.json({ text: JSON.stringify(responseObj), structured: true });
    }
  } catch (error) {
    console.error('Error generating chat response:', error);
    res.status(500).json({ error: 'Failed to process chat response. Please try again.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 MetLife Assist server running on http://localhost:${PORT}`);
});
