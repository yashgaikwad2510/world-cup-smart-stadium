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

    // 3. Assemble full system instruction with dynamic data
    const fullSystemInstruction = `
${systemPrompt}

[REAL-TIME STADIUM OPERATIONAL DATA]
Below is the live operational data from MetLife Stadium sensors. Use this information to answer fan questions accurately. If a user asks about wait times, gates, food, or transportation, refer directly to this:

STADIUM GATES TRAFFIC STATUS:
${gatesContext}

CONCESSIONS WAIT TIMES:
${concessionsContext}

TRANSPORTATION STATUS:
${transportContext}

Current Local Time: ${new Date().toISOString()}
`;

    // 4. Call Google Gemini API (or fallback if key is missing)
    if (ai) {
      // Map frontend messages into GenAI API structure
      const contents = messages.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const chatSession = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.3,
        }
      });

      const responseText = chatSession.text;
      return res.json({ text: responseText });
    } else {
      // Premium Mock Response Engine for testing without key
      const lastUserMessage = messages[messages.length - 1].content.toLowerCase();
      let responseText = '';

      if (lastUserMessage.includes('hello') || lastUserMessage.includes('hi')) {
        responseText = "Hello! Welcome to MetLife Stadium for the FIFA World Cup 2026. 🏟️\n\nI am **MetLife Assist**, your GenAI Copilot. I can help you with: \n- 🚶 Navigation & Accessibility paths\n- 🚗 Transport updates\n- 🍔 Concession stand wait times\n\n*Note: I am running in mock developer mode because no API key is provided. Try asking about 'accessible routes', 'gate traffic', or 'burgers'!*";
      } else if (lastUserMessage.includes('gate') || lastUserMessage.includes('crowd') || lastUserMessage.includes('congestion')) {
        responseText = "Here is the current gate traffic update:\n\n" + 
                       "- **Gate A (North):** High Traffic (35 min wait). Highly congested!\n" +
                       "- **Gate B (South):** Medium Traffic (15 min wait). Moving steadily.\n" +
                       "- **Gate C (East):** Low Traffic (5 min wait). VIP & Accessible entry.\n\n" +
                       "💡 *Tip: If you're arriving by transit, consider entering through Gate B or C to save time.*";
      } else if (lastUserMessage.includes('wheelchair') || lastUserMessage.includes('accessible') || lastUserMessage.includes('mobility') || lastUserMessage.includes('ramp') || lastUserMessage.includes('sensory')) {
        responseText = "Hello! Accessibility is our top priority. ♿\n\n- **Accessible Entry:** Gate C (East) is designated for accessible entry with low traffic (5 min wait).\n- **Elevators/Ramps:** Step-free elevator routes are available near Section 110, 215, and 312.\n- **Sensory Support:** The **Sensory Room** is located near **Section 212** (Club Level). Ramps and escalators can take you to the Club Level directly.\n\nWould you like turn-by-turn guidance to any of these locations?";
      } else if (lastUserMessage.includes('food') || lastUserMessage.includes('burger') || lastUserMessage.includes('taco') || lastUserMessage.includes('concession') || lastUserMessage.includes('eat')) {
        responseText = "Here are the current concession lines:\n\n" +
                       "- **Champions Club Burgers** (Sec. 224): 🍔 5 min wait (Popular: Trophy Double Cheeseburger).\n" +
                       "- **Goalpost Tacos & Nachos** (Sec. 112): 🌮 12 min wait.\n" +
                       "- **Strikers Hot Dogs & Brew** (Sec. 318): 🌭 20 min wait.\n\n" +
                       "💡 *Tip: Section 224 currently has the shortest line!*";
      } else if (lastUserMessage.includes('transit') || lastUserMessage.includes('train') || lastUserMessage.includes('bus') || lastUserMessage.includes('rideshare') || lastUserMessage.includes('uber') || lastUserMessage.includes('lyft') || lastUserMessage.includes('transport')) {
        responseText = "Here is the latest transport update:\n\n" +
                       "- **NJ Transit Rail** (Lot B): 🚆 **On Time**. Trains departing every 10 minutes to NYC Penn Station.\n" +
                       "- **Coach USA Bus** (Lot A): 🚌 **Minor Delays** (Route 3 traffic). Busses departing every 15 minutes.\n" +
                       "- **Rideshare Zone** (Lot E): 🚗 **High Demand**. 20-25 min wait with surge pricing active.\n\n" +
                       "💡 *Recommendation: Taking the NJ Transit Rail from Lot B is currently your fastest options!*";
      } else {
        responseText = "I do not have access to live match action or scores right now, but I can help you navigate MetLife Stadium! \n\nFeel free to ask about stadium navigation, accessible pathways, transit hubs, concession queue times, or gate entries. \n\n*(Running in Mock Mode - set up GEMINI_API_KEY in .env for full AI logic)*";
      }

      // Simulate a small delay for premium UX
      await new Promise(resolve => setTimeout(resolve, 800));
      return res.json({ text: responseText });
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
