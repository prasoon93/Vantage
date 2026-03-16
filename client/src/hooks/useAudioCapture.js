import { useRef, useCallback } from 'react';
import { floatTo16BitPCM, arrayBufferToBase64 } from '../utils/audio';

/**
 * Manages microphone capture and PCM16 encoding via AudioWorkletNode.
 * onChunk(base64) — called for each audio buffer sent to the Live session.
 * onTranscript(text) — called once with the full user speech when mic stops.
 */
export function useAudioCapture({ onChunk, onTranscript }) {
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const workletRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const start = useCallback(async () => {
    transcriptRef.current = '';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    });

    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-processor.js`);

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const worklet = new AudioWorkletNode(ctx, 'pcm-processor');

    worklet.port.onmessage = (e) => {
      const pcm16 = floatTo16BitPCM(e.data);
      onChunk(arrayBufferToBase64(pcm16.buffer));
    };

    source.connect(analyser);
    analyser.connect(worklet);
    worklet.connect(ctx.destination);

    streamRef.current = stream;
    audioCtxRef.current = ctx;
    sourceRef.current = source;
    analyserRef.current = analyser;
    workletRef.current = worklet;

    // Run Web Speech API in parallel to capture transcript
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const recog = new SR();
      recog.continuous = true;
      recog.interimResults = false;
      recog.lang = 'en-US';
      recog.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            transcriptRef.current += e.results[i][0].transcript + ' ';
          }
        }
      };
      recog.onerror = () => {};
      recog.start();
      recognitionRef.current = recog;
    }
  }, [onChunk]);

  const stop = useCallback(() => {
    // Stop STT and fire transcript with everything captured so far
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent any auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
      const text = transcriptRef.current.trim();
      transcriptRef.current = '';
      if (text) onTranscriptRef.current?.(text);
    }

    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    workletRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
  }, []);

  return { start, stop, analyserRef };
}
