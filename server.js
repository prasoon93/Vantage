require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const placesRouter = require('./server/routes/places');
const mapThumbRouter = require('./server/routes/mapThumb');
const { LIVE_CONFIG, TOOLS } = require('./server/gemini/config');

const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Allow requests from GitHub Pages and localhost in dev
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));
app.use(express.json());
app.use('/api/places', placesRouter);
app.use('/api/map-thumb', mapThumbRouter);

// ─── AI-generated location image ─────────────────────────────────────────────
app.get('/api/generate-image', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const interaction = await ai.interactions.create({
      model: 'gemini-3-pro-image-preview',
      input: `Cinematic film location photograph: ${query}. Wide establishing shot, photorealistic, professional cinematography, dramatic natural lighting.`,
      response_modalities: ['image'],
    });
    const imageOutput = interaction.outputs?.find((o) => o.type === 'image');
    if (!imageOutput) throw new Error('No image in response');
    const buffer = Buffer.from(imageOutput.data, 'base64');
    res.set('Content-Type', imageOutput.mime_type || 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(buffer);
  } catch (err) {
    console.error('[Server] generate-image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check — used by Railway to verify the service is up
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Serve built React client in production (only when client/dist exists — not on Railway)
const distPath = path.join(__dirname, 'client/dist');
const fs = require('fs');
if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_API_KEY is not set in .env file');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// ─── Step 3: Extract structured locations from user's scene description ───────
// Called when the user stops the mic; the user's transcribed speech is the input.

app.post('/api/suggest-locations', async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query required' });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `A film director described this scene: "${query}"\n\nSuggest the best real-world filming locations for it.`,
      config: {
        tools: TOOLS,
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    console.log('[Gemini] suggest-locations parts:', JSON.stringify(parts, null, 2));
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    if (calls.length) {
      console.log('[Gemini] function calls:', JSON.stringify(calls, null, 2));
      res.json({ success: true, ...calls[0].args });
    } else {
      res.json({ success: false, locations: [] });
    }
  } catch (err) {
    console.error('[Server] suggest-locations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Model 2: extract locations from conversation ────────────────────────────

async function extractLocations(conversationHistory) {
  const transcript = conversationHistory
    .map((t) => `${t.role === 'user' ? 'Director' : 'Scout'}: ${t.text}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `You are a data extraction assistant. Below is a conversation between a film director and a location scout called SCOUT.\n\n${transcript}\n\nThe Scout has already named specific real-world filming locations in the conversation above. Your job is to extract EXACTLY those locations (do not invent new ones) and call suggest_filming_locations with structured data for each location the Scout mentioned. Also extract the scene specs from what was discussed.`,
    config: {
      tools: TOOLS,
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const call = parts.find((p) => p.functionCall)?.functionCall;
  if (!call) return null;
  return call.args;
}

// ─── Step 1 & 2: WebSocket → Gemini Live (voice conversation) ────────────────

wss.on('connection', async (clientWs) => {
  console.log('[Server] Client connected');
  let session = null;

  // Per-session conversation state
  const conversationHistory = []; // [{role:'user'|'model', text}] — one entry per full turn
  let userBuffer      = '';   // accumulates user speech across multiple short utterances
  let modelBuffer     = '';   // accumulates model speech for the current model turn
  let isExtracting    = false;
  let locationsFound  = false; // once set, stop re-extracting

  try {
    session = await ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => console.log('[Server] Gemini Live connected'),

        onmessage: (msg) => {
          try {
            if (msg.setupComplete) {
              send(clientWs, { type: 'ready' });
              return;
            }

            if (msg.serverContent) {
              const { modelTurn, turnComplete, interrupted,
                      outputTranscription, inputTranscription } = msg.serverContent;

              // Accumulate transcriptions
              if (inputTranscription?.text) {
                userBuffer += inputTranscription.text;
              }
              if (outputTranscription?.text) {
                modelBuffer += outputTranscription.text;
              }

              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData) {
                    send(clientWs, { type: 'audio', data: part.inlineData.data, mimeType: part.inlineData.mimeType });
                  }
                  if (part.text) {
                    send(clientWs, { type: 'text', text: part.text });
                  }
                }
              }

              if (interrupted) {
                modelBuffer = '';
                send(clientWs, { type: 'interrupted' });
              }

              if (turnComplete) {
                const isModelTurn = modelBuffer.trim().length > 0;

                // Buffer user speech until model responds — produces one clean user entry per exchange
                if (userBuffer.trim()) {
                  // Don't push yet if the model hasn't responded (user spoke multiple times)
                  if (isModelTurn) {
                    // Commit accumulated user speech as one entry
                    conversationHistory.push({ role: 'user', text: userBuffer.trim() });
                    userBuffer = '';
                  }
                  // If no model text yet, keep buffering user speech
                }

                // Capture buffer content before clearing — needed for the list detection below
                const completedModelText = modelBuffer.trim();

                if (isModelTurn) {
                  conversationHistory.push({ role: 'model', text: completedModelText });
                  modelBuffer = '';
                }

                const exchanges = Math.floor(conversationHistory.filter(t => t.role === 'model').length);
                console.log(`[Server] conversation: ${conversationHistory.length} turns, ${exchanges} model exchanges`);
                console.log(`[Server] modelBuffer preview: "${completedModelText.slice(0, 120)}"`);

                send(clientWs, { type: 'turn_complete' });

                // Trigger Model 2 when: numbered list detected OR model gives a long response after 3+ exchanges
                const hasNumberedList = /\b1[.)]\s/.test(completedModelText) && /\b2[.)]\s/.test(completedModelText);
                const isLongResponseLate = exchanges >= 3 && completedModelText.length > 150;
                const modelIsListingLocations = isModelTurn && (hasNumberedList || isLongResponseLate);
                console.log(`[Server] listing check — numbered:${hasNumberedList} longLate:${isLongResponseLate} len:${completedModelText.length}`);

                if (modelIsListingLocations && !isExtracting && !locationsFound) {
                  isExtracting = true;
                  console.log(`[Server] Model 1 listed locations — running Model 2 extraction`);
                  extractLocations(conversationHistory)
                    .then((result) => {
                      if (result?.locations?.length) {
                        locationsFound = true;
                        console.log('[Server] locations extracted:', result.locations.length);
                        send(clientWs, {
                          type: 'locations',
                          locations: result.locations,
                          scene_summary: result.scene_summary || '',
                          specs: result.specs || null,
                        });
                      } else {
                        console.log('[Server] Model 2 returned no locations');
                      }
                    })
                    .catch((err) => console.error('[Server] extractLocations error:', err.message))
                    .finally(() => { isExtracting = false; });
                }
              }
            }
          } catch (err) {
            console.error('[Server] Message handling error:', err.message);
          }
        },

        onerror: (err) => {
          console.error('[Server] Gemini error:', err.message || err);
          send(clientWs, { type: 'error', message: 'AI connection failed: ' + (err.message || err) });
        },

        onclose: (event) => {
          console.log(`[Server] Gemini closed: ${event.code} ${event.reason}`);
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        },
      },
      config: LIVE_CONFIG,
    });
  } catch (err) {
    console.error('[Server] Failed to connect to Gemini:', err.message);
    send(clientWs, { type: 'error', message: 'Failed to connect to AI: ' + err.message });
    clientWs.close();
    return;
  }

  clientWs.on('message', (data) => {
    if (!session) return;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.realtimeInput) {
        const chunks = msg.realtimeInput.mediaChunks;
        if (chunks?.length) session.sendRealtimeInput({ media: chunks });
      }
    } catch (err) {
      console.error('[Server] Relay error:', err.message);
    }
  });

  clientWs.on('close', () => {
    console.log('[Server] Client disconnected');
    session?.close();
    session = null;
  });

  clientWs.on('error', (err) => {
    console.error('[Server] Client WS error:', err.message);
    session?.close();
    session = null;
  });
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  SCOUT server → http://localhost:${PORT}\n`);
});
