require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_API_KEY is not set in .env file');
  process.exit(1);
}

const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GOOGLE_API_KEY}`;

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are SCOUT, an elite AI film location scout with decades of experience working alongside Hollywood's greatest directors — Nolan, Villeneuve, Spielberg, and more.

Your mission: help movie directors find the perfect real-world filming locations for their scenes.

PERSONALITY:
- Passionate, cinematic, and authoritative
- You speak with the confidence of someone who has scouted every corner of the globe
- Reference real films, cinematographers, and directors to build rapport
- Be concise — the location cards will show the details

WORKFLOW:
1. When a director describes a scene, listen for: visual atmosphere, time period, emotional tone, architecture style, lighting conditions, climate, and any practical needs
2. After their first description (or at most one clarifying question), call suggest_filming_locations
3. Keep your spoken response SHORT and evocative — paint a verbal picture, then let the cards do the work
4. If they want different options or refine their vision, call suggest_filming_locations again immediately

LOCATION QUALITY RULES:
- Only suggest REAL, verifiable filming locations with accurate details
- Include real films/TV shows actually shot at those places
- Provide specific search queries for accurate image retrieval (e.g., "Chefchaouen Morocco blue medina streets" not just "Morocco")
- Coordinates must be real and accurate

INTERRUPTION HANDLING:
You can be interrupted at any time. If the director changes direction mid-sentence, immediately adapt and call suggest_filming_locations with the updated concept.

EXAMPLE INTERACTION:
Director: "I need something for a Cold War spy scene — Eastern European, run-down, foggy, paranoid atmosphere"
You: "Perfect — I'm thinking Prague's Old Town at dawn, Warsaw's Praga district... Let me pull up your options." [call suggest_filming_locations]`;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'suggest_filming_locations',
        description:
          'Suggest 3–5 specific real-world filming locations based on the director\'s scene description. Call this as soon as you have enough context to make meaningful recommendations.',
        parameters: {
          type: 'OBJECT',
          properties: {
            scene_summary: {
              type: 'STRING',
              description: 'A brief summary of the scene/mood the director described',
            },
            locations: {
              type: 'ARRAY',
              description: 'Array of 3–5 location suggestions',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING', description: 'Specific location name (e.g., "Deinhardstein Castle" or "Rue Crémieux")' },
                  city: { type: 'STRING' },
                  country: { type: 'STRING' },
                  country_code: { type: 'STRING', description: 'ISO 2-letter country code for flag emoji (e.g., "FR", "JP", "MA")' },
                  lat: { type: 'NUMBER', description: 'Latitude coordinate' },
                  lng: { type: 'NUMBER', description: 'Longitude coordinate' },
                  tagline: { type: 'STRING', description: 'A short, evocative phrase for this location (e.g., "Where shadows tell stories")' },
                  why_it_works: { type: 'STRING', description: 'Cinematic reason this location matches the scene perfectly' },
                  famous_productions: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'Real films or TV shows actually shot at this location',
                  },
                  best_shooting_time: { type: 'STRING', description: 'Best season and time of day for shooting' },
                  practical_notes: { type: 'STRING', description: 'Permit requirements, crew access, logistical notes' },
                  visual_tags: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'Visual descriptor tags (e.g., "gothic", "golden hour", "misty", "urban decay")',
                  },
                  search_query: {
                    type: 'STRING',
                    description: 'Specific Google Places search query to fetch an accurate photo (e.g., "Chefchaouen blue streets Morocco" or "Hashima Island Japan abandoned")',
                  },
                },
                required: ['name', 'city', 'country', 'country_code', 'tagline', 'why_it_works', 'search_query'],
              },
            },
          },
          required: ['locations'],
        },
      },
    ],
  },
];

// ─── Gemini Live API Setup Message ────────────────────────────────────────────

const SETUP_MESSAGE = {
  setup: {
    model: 'models/gemini-live-2.0-flash-001',
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Aoede',
          },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    tools: TOOLS,
  },
};

// ─── Google Places API — fetch location photo ─────────────────────────────────

app.get('/api/places/photo', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query is required' });

    // Step 1: Text search for the place
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.photos,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    const data = await searchRes.json();

    if (data.places && data.places[0] && data.places[0].photos && data.places[0].photos[0]) {
      const photoName = data.places[0].photos[0].name;
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=900&key=${GOOGLE_API_KEY}`;
      res.json({
        photoUrl,
        address: data.places[0].formattedAddress || '',
      });
    } else {
      // Fallback: return null, frontend will show a map placeholder
      res.json({ photoUrl: null, address: '' });
    }
  } catch (err) {
    console.error('Places API error:', err.message);
    res.json({ photoUrl: null, address: '' });
  }
});

// ─── Google Maps Static API — map thumbnail ───────────────────────────────────

app.get('/api/map-thumb', (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=13&size=800x450&maptype=satellite&key=${GOOGLE_API_KEY}`;
  res.redirect(url);
});

// ─── WebSocket Proxy to Gemini Live API ───────────────────────────────────────

wss.on('connection', (clientWs) => {
  console.log('[Server] Client connected');
  let geminiWs = null;
  let isAlive = true;

  // Connect to Gemini Live API
  geminiWs = new WebSocket(GEMINI_WS_URL);

  geminiWs.on('open', () => {
    console.log('[Server] Connected to Gemini Live API');
    geminiWs.send(JSON.stringify(SETUP_MESSAGE));
  });

  geminiWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      // Session ready
      if (msg.setupComplete) {
        console.log('[Server] Gemini setup complete');
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'ready' }));
        }
        return;
      }

      // Tool / function call
      if (msg.toolCall) {
        const call = msg.toolCall.functionCalls[0];
        console.log('[Server] Tool call:', call.name);

        // Forward tool call to browser for UI rendering
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'tool_call',
              name: call.name,
              args: typeof call.args === 'string' ? JSON.parse(call.args) : call.args,
              id: call.id,
            })
          );
        }

        // Acknowledge tool call back to Gemini immediately
        const toolResponse = {
          toolResponse: {
            functionResponses: [
              {
                id: call.id,
                response: { output: { success: true, message: 'Location cards displayed to director.' } },
              },
            ],
          },
        };
        geminiWs.send(JSON.stringify(toolResponse));
        return;
      }

      // Server turn content (audio / text)
      if (msg.serverContent) {
        const content = msg.serverContent;

        // Audio parts
        if (content.modelTurn && content.modelTurn.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData) {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType,
                  })
                );
              }
            }
            if (part.text) {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'text', text: part.text }));
              }
            }
          }
        }

        // Turn complete signal
        if (content.turnComplete) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));
          }
        }

        // Interrupted signal
        if (content.interrupted) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }
        }
      }
    } catch (err) {
      console.error('[Server] Error parsing Gemini message:', err.message);
    }
  });

  geminiWs.on('error', (err) => {
    console.error('[Server] Gemini WS error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'Connection to AI failed: ' + err.message }));
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[Server] Gemini WS closed: ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  // Relay messages from browser → Gemini (audio chunks, tool responses)
  clientWs.on('message', (data) => {
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(data);
    }
  });

  clientWs.on('close', () => {
    console.log('[Server] Client disconnected');
    isAlive = false;
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.error('[Server] Client WS error:', err.message);
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  SCOUT is running at http://localhost:${PORT}\n`);
});
