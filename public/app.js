/* ─── SCOUT — AI Film Location Scout ─────────────────────────────────────────
   Frontend app.js
   - WebSocket connection to server (which proxies to Gemini Live API)
   - Audio capture at 16 kHz PCM16 → streamed to server
   - Audio playback of AI responses (PCM16 24 kHz)
   - UI state management (idle / listening / speaking)
   - Renders location cards from Gemini tool calls
   ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const State = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING:   'connecting',
  READY:        'ready',
  LISTENING:    'listening',
  SPEAKING:     'speaking',
});

let currentState = State.DISCONNECTED;
let ws           = null;

// Audio — capture
let audioContext    = null;
let mediaStream     = null;
let sourceNode      = null;
let processorNode   = null;
let analyserNode    = null;

// Audio — playback
let playbackCtx     = null;
let nextPlayTime    = 0;
let isAISpeaking    = false;
let audioQueue      = [];

// Waveform animation
let waveformRAF     = null;

// Transcript state
let aiMessageEl     = null;       // current AI message being built
let aiText          = '';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const statusDot       = document.getElementById('statusDot');
const statusLabel     = document.getElementById('statusLabel');
const micBtn          = document.getElementById('micBtn');
const micWrapper      = document.getElementById('micWrapper');
const hintPrimary     = document.getElementById('hintPrimary');
const hintSecondary   = document.getElementById('hintSecondary');
const iconMic         = document.querySelector('.icon-mic');
const iconStop        = document.querySelector('.icon-stop');
const aiWaveBars      = document.getElementById('aiWaveBars');
const pulseRing1      = document.getElementById('pulseRing1');
const transcriptEl    = document.getElementById('transcriptMessages');
const clearBtn        = document.getElementById('clearBtn');
const sceneContext    = document.getElementById('sceneContext');
const sceneContextText = document.getElementById('sceneContextText');
const locationsPanel  = document.getElementById('locationsPanel');
const locationsGrid   = document.getElementById('locationsGrid');
const locationsHeader = document.getElementById('locationsHeader');
const locationsEmpty  = document.getElementById('locationsEmpty');
const locationsScene  = document.getElementById('locationsScene');
const locationsCount  = document.getElementById('locationsCount');
const waveformCanvas  = document.getElementById('waveformCanvas');
const cardTemplate    = document.getElementById('locationCardTemplate');

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Convert Float32 audio samples → Int16 PCM */
function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** ArrayBuffer → base64 string */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** base64 → Float32Array (PCM16 @ given sample rate) */
function base64PCM16ToFloat32(base64) {
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm16   = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;
  return float32;
}

/** Country code → flag emoji */
function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '';
  const offset = 127397;
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

/** Build Google Maps URL from lat/lng */
function mapsUrl(lat, lng, name) {
  if (lat && lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

// ─── UI State Machine ─────────────────────────────────────────────────────────

function setState(state) {
  currentState = state;

  // Reset visual state
  micBtn.classList.remove('listening', 'speaking');
  micWrapper.classList.remove('listening');
  iconMic.style.display  = '';
  iconStop.style.display = 'none';
  aiWaveBars.style.display = 'none';

  statusDot.className = 'status-dot';

  switch (state) {
    case State.DISCONNECTED:
      statusDot.classList.add('error');
      statusLabel.textContent = 'Disconnected';
      micBtn.disabled = true;
      hintPrimary.textContent   = 'Disconnected';
      hintSecondary.textContent = 'Refresh to reconnect';
      break;

    case State.CONNECTING:
      statusDot.classList.add('connecting');
      statusLabel.textContent = 'Connecting...';
      micBtn.disabled = true;
      hintPrimary.textContent   = 'Connecting to SCOUT...';
      hintSecondary.textContent = 'Initializing Gemini Live API';
      break;

    case State.READY:
      statusDot.classList.add('ready');
      statusLabel.textContent = 'Ready';
      micBtn.disabled = false;
      hintPrimary.textContent   = 'Click to speak';
      hintSecondary.textContent = 'Describe your scene to SCOUT';
      break;

    case State.LISTENING:
      statusDot.classList.add('listening');
      statusLabel.textContent = 'Listening';
      micBtn.disabled = false;
      micBtn.classList.add('listening');
      micWrapper.classList.add('listening');
      iconStop.style.display = 'block';
      iconMic.style.display  = 'none';
      hintPrimary.textContent   = 'Click to stop';
      hintSecondary.textContent = 'SCOUT is listening... You can stop anytime';
      break;

    case State.SPEAKING:
      statusDot.classList.add('speaking');
      statusLabel.textContent = 'SCOUT Speaking';
      micBtn.disabled = false;
      micBtn.classList.add('speaking');
      iconMic.style.display    = 'none';
      iconStop.style.display   = 'none';
      aiWaveBars.style.display = 'flex';
      hintPrimary.textContent   = 'SCOUT is speaking';
      hintSecondary.textContent = 'Click to interrupt';
      break;
  }
}

// ─── Transcript helpers ───────────────────────────────────────────────────────

function addMessage(role, text) {
  // Remove welcome message if present
  const welcome = transcriptEl.querySelector('.transcript-welcome');
  if (welcome) welcome.remove();

  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'D' : 'S';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  transcriptEl.appendChild(msg);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;

  return bubble;
}

function addThinkingIndicator() {
  const welcome = transcriptEl.querySelector('.transcript-welcome');
  if (welcome) welcome.remove();

  const msg = document.createElement('div');
  msg.className = 'message ai';
  msg.id = 'thinkingMsg';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = 'S';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble thinking';
  bubble.innerHTML = '<span></span><span></span><span></span>';

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  transcriptEl.appendChild(msg);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function removeThinkingIndicator() {
  const el = document.getElementById('thinkingMsg');
  if (el) el.remove();
}

// ─── Waveform Visualizer ──────────────────────────────────────────────────────

const canvasCtx = waveformCanvas.getContext('2d');

function drawIdleWave() {
  const w = waveformCanvas.width;
  const h = waveformCanvas.height;
  const t = Date.now() / 800;

  canvasCtx.clearRect(0, 0, w, h);
  canvasCtx.beginPath();
  canvasCtx.strokeStyle = 'rgba(201,162,39,0.2)';
  canvasCtx.lineWidth = 1.5;

  for (let x = 0; x < w; x++) {
    const y = h / 2 + Math.sin(x / 30 + t) * 4 + Math.sin(x / 15 + t * 1.3) * 2;
    x === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
  }
  canvasCtx.stroke();
  waveformRAF = requestAnimationFrame(drawIdleWave);
}

function drawLiveWave() {
  if (!analyserNode) return;
  const bufLen = analyserNode.fftSize;
  const dataArr = new Uint8Array(bufLen);
  analyserNode.getByteTimeDomainData(dataArr);

  const w = waveformCanvas.width;
  const h = waveformCanvas.height;

  canvasCtx.clearRect(0, 0, w, h);
  canvasCtx.beginPath();
  canvasCtx.strokeStyle = '#e84040';
  canvasCtx.lineWidth = 2;

  const sliceW = w / bufLen;
  let x = 0;
  for (let i = 0; i < bufLen; i++) {
    const v = dataArr[i] / 128.0;
    const y = (v * h) / 2;
    i === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
    x += sliceW;
  }
  canvasCtx.lineTo(w, h / 2);
  canvasCtx.stroke();
  waveformRAF = requestAnimationFrame(drawLiveWave);
}

function stopWaveform() {
  if (waveformRAF) { cancelAnimationFrame(waveformRAF); waveformRAF = null; }
}

// ─── Audio Capture ────────────────────────────────────────────────────────────

async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    audioContext = new AudioContext({ sampleRate: 16000 });
    sourceNode   = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 1024;

    // ScriptProcessor for raw PCM access (deprecated but well-supported)
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    sourceNode.connect(analyserNode);
    analyserNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    processorNode.onaudioprocess = (ev) => {
      if (currentState !== State.LISTENING) return;
      const float32 = ev.inputBuffer.getChannelData(0);
      const pcm16   = floatTo16BitPCM(float32);
      const b64     = arrayBufferToBase64(pcm16.buffer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }],
          },
        }));
      }
    };

    stopWaveform();
    drawLiveWave();
    setState(State.LISTENING);
  } catch (err) {
    console.error('Mic error:', err);
    alert('Could not access microphone: ' + err.message);
  }
}

function stopRecording() {
  if (processorNode) { processorNode.disconnect(); processorNode = null; }
  if (sourceNode)    { sourceNode.disconnect();    sourceNode = null; }
  if (analyserNode)  { analyserNode.disconnect();  analyserNode = null; }
  if (audioContext)  { audioContext.close();        audioContext = null; }
  if (mediaStream)   {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  stopWaveform();
  drawIdleWave();
}

// ─── Audio Playback ───────────────────────────────────────────────────────────

function ensurePlaybackCtx() {
  if (!playbackCtx || playbackCtx.state === 'closed') {
    playbackCtx = new AudioContext({ sampleRate: 24000 });
    nextPlayTime = 0;
  }
  if (playbackCtx.state === 'suspended') {
    playbackCtx.resume();
  }
}

function scheduleAudioChunk(base64Data) {
  ensurePlaybackCtx();

  const float32    = base64PCM16ToFloat32(base64Data);
  const buffer     = playbackCtx.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);

  const sourceNode = playbackCtx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.connect(playbackCtx.destination);

  const now       = playbackCtx.currentTime;
  const startTime = Math.max(now + 0.01, nextPlayTime);
  sourceNode.start(startTime);
  nextPlayTime = startTime + buffer.duration;

  // Track when playback finishes
  sourceNode.onended = checkPlaybackEnded;

  isAISpeaking = true;
}

function checkPlaybackEnded() {
  // Small debounce — if nothing is scheduled soon, mark as done
  setTimeout(() => {
    if (!playbackCtx) return;
    const now = playbackCtx.currentTime;
    if (nextPlayTime <= now + 0.1) {
      isAISpeaking = false;
      if (currentState === State.SPEAKING) {
        setState(State.READY);
        stopWaveform();
        drawIdleWave();
      }
    }
  }, 200);
}

function interruptPlayback() {
  if (playbackCtx) {
    playbackCtx.close();
    playbackCtx = null;
  }
  nextPlayTime = 0;
  isAISpeaking = false;
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

function connect() {
  setState(State.CONNECTING);

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    console.log('[WS] Connected to server');
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); }
    catch { return; }
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected');
    setState(State.DISCONNECTED);
    stopRecording();
    stopWaveform();
    // Auto-reconnect after 3 s
    setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
    setState(State.DISCONNECTED);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'ready':
      setState(State.READY);
      stopWaveform();
      drawIdleWave();
      break;

    case 'audio':
      removeThinkingIndicator();
      if (currentState !== State.SPEAKING) {
        setState(State.SPEAKING);
        stopWaveform();
        drawIdleWave();
      }
      scheduleAudioChunk(msg.data);
      break;

    case 'text':
      // Accumulate transcript text
      removeThinkingIndicator();
      if (!aiMessageEl) {
        aiMessageEl = addMessage('ai', '');
        aiText = '';
      }
      aiText += msg.text;
      aiMessageEl.textContent = aiText;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
      break;

    case 'turn_complete':
      aiMessageEl = null;
      aiText = '';
      // Let audio finish playing before setting READY
      if (!isAISpeaking && currentState === State.SPEAKING) {
        setState(State.READY);
      }
      break;

    case 'interrupted':
      // AI was interrupted — stop playback
      interruptPlayback();
      aiMessageEl = null;
      aiText = '';
      break;

    case 'tool_call':
      if (msg.name === 'suggest_filming_locations') {
        renderLocations(msg.args);
      }
      break;

    case 'error':
      console.error('[Server error]', msg.message);
      addMessage('ai', 'Connection error: ' + msg.message);
      break;

    default:
      console.log('[WS] Unknown message type:', msg.type);
  }
}

// ─── Mic button toggle ────────────────────────────────────────────────────────

micBtn.addEventListener('click', async () => {
  if (currentState === State.DISCONNECTED || currentState === State.CONNECTING) return;

  if (currentState === State.LISTENING) {
    // Stop recording
    stopRecording();
    setState(State.READY);
    addThinkingIndicator();
    return;
  }

  if (currentState === State.SPEAKING) {
    // Interrupt AI
    interruptPlayback();
    // Send a small silent buffer to signal interruption intent
    if (ws && ws.readyState === WebSocket.OPEN) {
      const silentPCM = new Int16Array(160); // 10ms silence
      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: arrayBufferToBase64(silentPCM.buffer) }],
        },
      }));
    }
    await startRecording();
    return;
  }

  // READY → start recording
  await startRecording();
});

// ─── Clear button ─────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  transcriptEl.innerHTML = `
    <div class="transcript-welcome">
      <p>Describe a scene. SCOUT will find the perfect locations.</p>
    </div>`;
  aiMessageEl = null;
  aiText = '';
});

// ─── Render Location Cards ────────────────────────────────────────────────────

async function renderLocations(args) {
  const { locations, scene_summary } = args;
  if (!locations || !locations.length) return;

  // Update scene context
  if (scene_summary) {
    sceneContextText.textContent = scene_summary;
    sceneContext.style.display = 'block';
  }

  // Clear grid, show header
  locationsGrid.innerHTML = '';
  locationsHeader.style.display = 'flex';
  locationsScene.textContent   = scene_summary || '';
  locationsCount.textContent   = `${locations.length} Location${locations.length > 1 ? 's' : ''}`;

  locations.forEach((loc, idx) => {
    const card = buildCard(loc, idx + 1);
    locationsGrid.appendChild(card);
    // Async fetch image
    fetchLocationImage(loc.search_query, loc.lat, loc.lng, card);
  });
}

function buildCard(loc, num) {
  const tpl  = cardTemplate.content.cloneNode(true);
  const card = tpl.querySelector('.location-card');

  // Number badge
  card.querySelector('.card-number').textContent = num;

  // Country badge
  const flag = countryCodeToFlag(loc.country_code);
  card.querySelector('.country-flag').textContent = flag;
  card.querySelector('.country-name').textContent = loc.country || '';

  // Name / city / country
  card.querySelector('.card-name').textContent = loc.name || '';
  card.querySelector('.card-city').textContent = [loc.city, loc.country].filter(Boolean).join(', ');

  // Tagline
  const taglineEl = card.querySelector('.card-tagline');
  if (loc.tagline) {
    taglineEl.textContent = `"${loc.tagline}"`;
  } else {
    taglineEl.style.display = 'none';
  }

  // Why it works
  card.querySelector('.card-why').textContent = loc.why_it_works || '';

  // Famous productions
  const prodsEl = card.querySelector('.card-productions');
  if (loc.famous_productions && loc.famous_productions.length) {
    const list = card.querySelector('.productions-list');
    loc.famous_productions.slice(0, 5).forEach(p => {
      const tag = document.createElement('span');
      tag.className = 'production-tag';
      tag.textContent = p;
      list.appendChild(tag);
    });
    prodsEl.style.display = 'block';
  }

  // Meta — best time
  const timeMeta = card.querySelector('.meta-item[data-field="time"]');
  if (loc.best_shooting_time) {
    timeMeta.querySelector('.meta-text').textContent = loc.best_shooting_time;
    timeMeta.style.display = 'flex';
  }

  // Meta — practical
  const practMeta = card.querySelector('.meta-item[data-field="practical"]');
  if (loc.practical_notes) {
    practMeta.querySelector('.meta-text').textContent = loc.practical_notes;
    practMeta.style.display = 'flex';
  }

  // Visual tags
  const tagsEl = card.querySelector('.card-tags');
  if (loc.visual_tags && loc.visual_tags.length) {
    loc.visual_tags.slice(0, 6).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'visual-tag';
      span.textContent = tag;
      tagsEl.appendChild(span);
    });
  } else {
    tagsEl.style.display = 'none';
  }

  // Map link
  const mapBtn = card.querySelector('.card-map-btn');
  mapBtn.href = mapsUrl(loc.lat, loc.lng, `${loc.name} ${loc.city}`);

  // Pin button
  const pinBtn = card.querySelector('.card-pin-btn');
  pinBtn.addEventListener('click', () => {
    card.classList.toggle('pinned');
    pinBtn.classList.toggle('active');
    pinBtn.querySelector('svg').style.fill = card.classList.contains('pinned') ? 'currentColor' : 'none';
  });

  return card;
}

async function fetchLocationImage(searchQuery, lat, lng, card) {
  const imgEl       = card.querySelector('.card-image');
  const skeletonEl  = card.querySelector('.card-image-skeleton');

  try {
    const res  = await fetch(`/api/places/photo?query=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();

    if (data.photoUrl) {
      imgEl.onload = () => {
        imgEl.classList.add('loaded');
        skeletonEl.style.display = 'none';
      };
      imgEl.onerror = () => loadMapFallback(lat, lng, searchQuery, card);
      imgEl.src = data.photoUrl;
      imgEl.alt = searchQuery;
    } else {
      loadMapFallback(lat, lng, searchQuery, card);
    }
  } catch {
    loadMapFallback(lat, lng, searchQuery, card);
  }
}

function loadMapFallback(lat, lng, query, card) {
  const skeletonEl = card.querySelector('.card-image-skeleton');
  const imgEl      = card.querySelector('.card-image');

  if (lat && lng) {
    const mapUrl = `/api/map-thumb?lat=${lat}&lng=${lng}`;
    const mapImg = new Image();
    mapImg.onload = () => {
      imgEl.src = mapUrl;
      imgEl.classList.add('loaded');
      skeletonEl.style.display = 'none';
    };
    mapImg.onerror = () => showPlaceholder(card, query);
    mapImg.src = mapUrl;
  } else {
    showPlaceholder(card, query);
  }
}

function showPlaceholder(card, query) {
  const skeletonEl = card.querySelector('.card-image-skeleton');
  const wrapper    = card.querySelector('.card-image-wrapper');

  skeletonEl.style.animation = 'none';
  skeletonEl.style.background = 'linear-gradient(135deg, #0d0d1a 0%, #111130 100%)';

  // Add text placeholder
  const ph = document.createElement('div');
  ph.style.cssText = `
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 8px; padding: 16px; text-align: center;
  `;
  ph.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.4)" stroke-width="1.2">
      <circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    </svg>
    <span style="font-size:11px;color:rgba(201,162,39,0.5);font-style:italic;">${query}</span>`;
  wrapper.appendChild(ph);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Resize canvas properly
function resizeCanvas() {
  const rect = waveformCanvas.parentElement.getBoundingClientRect();
  waveformCanvas.width  = rect.width  * devicePixelRatio;
  waveformCanvas.height = rect.height * devicePixelRatio;
  waveformCanvas.style.width  = rect.width + 'px';
  waveformCanvas.style.height = rect.height + 'px';
  canvasCtx.scale(devicePixelRatio, devicePixelRatio);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Kick things off
connect();
drawIdleWave();
