# SCOUT — AI Film Location Intelligence

A real-time voice AI agent for movie directors, powered by **Gemini Live API**.

Describe your scene — SCOUT listens, understands, and surfaces the perfect real-world filming locations complete with photos, cinematic history, and logistics.

---

## Features

- **Real-time voice conversation** — Natural dialogue with interruption support via Gemini Live API
- **Multimodal output** — Voice responses + visual location cards with real photos
- **Function calling** — Gemini calls `suggest_filming_locations` tool to render structured cards
- **Google Places photos** — Real imagery fetched for every suggested location
- **Map integration** — Satellite map fallback + Google Maps deep-links
- **Cinematic UI** — Dark director's studio aesthetic with waveform visualizer

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- A Google API key with these APIs enabled:
  - **Generative Language API** (Gemini Live)
  - **Places API (New)**
  - **Maps Static API**

### 2. Setup

```bash
cd Vantage
npm install
cp .env.example .env
# Edit .env — add your GOOGLE_API_KEY
```

### 3. Run

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Open **http://localhost:3000**

---

## How It Works

```
Browser Mic → PCM16 16kHz → WebSocket → server.js → Gemini Live API
                                                         ↓
Browser ← PCM16 24kHz Audio ← WebSocket ← server.js ←──┘
Browser ← Tool Call (suggest_filming_locations) ← server.js
    ↓
Location Cards rendered + Places API photos fetched
```

### Architecture

| Layer | Technology |
|-------|-----------|
| Voice AI | Gemini 2.0 Flash Live (`gemini-2.0-flash-live-001`) |
| Transport | WebSocket (bidirectional streaming) |
| Backend | Node.js + Express + `ws` |
| Location photos | Google Places API (New) |
| Map fallback | Google Maps Static API |
| Frontend | Vanilla JS + Web Audio API |

### Audio Pipeline
- **Capture**: `getUserMedia` → `AudioContext` (16 kHz) → `ScriptProcessor` → PCM16 → base64 → WebSocket
- **Playback**: base64 PCM16 (24 kHz) ← WebSocket → `AudioContext` → scheduled playback queue

---

## Usage

1. Click the **microphone button** and describe your scene:
   > *"I need a dramatic location for a Cold War spy exchange — Eastern European, foggy, run-down, paranoid atmosphere"*

2. SCOUT responds with voice and displays **3–5 location cards**, each showing:
   - Real photo of the location
   - Why it cinematically matches your scene
   - Films & TV shows actually shot there
   - Best shooting season / time of day
   - Practical filming notes
   - Google Maps link

3. **Interrupt anytime** — click the mic while SCOUT is speaking to refine your request.

---

## Project Structure

```
Vantage/
├── server.js          # Express server + WebSocket proxy to Gemini Live
├── package.json
├── .env               # Your API keys (not committed)
├── .env.example       # Template
└── public/
    ├── index.html     # UI shell
    ├── style.css      # Dark cinematic theme
    └── app.js         # Audio capture/playback, WebSocket, card rendering
```

---

## Google Hackathon Compliance

- [x] **Gemini model** — `gemini-2.0-flash-live-001`
- [x] **Gemini Live API** — Real-time bidirectional streaming
- [x] **Multimodal inputs** — Voice (audio PCM16)
- [x] **Multimodal outputs** — Voice + visual location cards + images
- [x] **Interruptible** — User can interrupt SCOUT mid-sentence
- [x] **Real-world value** — Solves a genuine filmmaking workflow problem
- [x] **Function/Tool calling** — `suggest_filming_locations` for structured output
