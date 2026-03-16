import { useRef, useCallback, useEffect } from 'react';
import { base64PCM16ToFloat32 } from '../utils/audio';

/**
 * Manages PCM16 audio playback from Gemini responses.
 * Uses a ref for onPlaybackEnd so the callback never causes downstream
 * hooks (scheduleChunk → handleMessage → connect) to recreate.
 */
export function useAudioPlayback({ onPlaybackEnd } = {}) {
  const ctxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const onPlaybackEndRef = useRef(onPlaybackEnd);

  // Keep the ref current without triggering re-renders or hook recreations
  useEffect(() => { onPlaybackEndRef.current = onPlaybackEnd; }, [onPlaybackEnd]);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // checkEnded has no external deps — reads everything through refs
  const checkEnded = useCallback(() => {
    setTimeout(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (nextPlayTimeRef.current <= ctx.currentTime + 0.1) {
        isPlayingRef.current = false;
        onPlaybackEndRef.current?.();
      }
    }, 200);
  }, []);

  const scheduleChunk = useCallback((base64Data) => {
    const ctx = ensureCtx();
    const float32 = base64PCM16ToFloat32(base64Data);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = checkEnded;

    const now = ctx.currentTime;
    const startTime = Math.max(now + 0.01, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
    isPlayingRef.current = true;
  }, [ensureCtx, checkEnded]);

  const interrupt = useCallback(() => {
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
    nextPlayTimeRef.current = 0;
    isPlayingRef.current = false;
  }, []);

  return { scheduleChunk, interrupt, isPlayingRef };
}
