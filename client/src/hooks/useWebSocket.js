import { useRef, useEffect, useCallback } from 'react';
import { getWsUrl } from '../utils/helpers';

/**
 * Manages the WebSocket connection to the SCOUT server.
 * onMessage(msg) is called for each parsed message from the server.
 * Returns a send(data) function.
 */
export function useWebSocket({ onMessage, onStateChange }) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const onStateChangeRef = useRef(onStateChange);

  // Keep refs current without triggering re-renders
  onMessageRef.current = onMessage;
  onStateChangeRef.current = onStateChange;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    onStateChangeRef.current('connecting');
    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      console.log('[WS] Connected');
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onMessageRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      console.log('[WS] Disconnected — reconnecting in 3s');
      onStateChangeRef.current('disconnected');
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      onStateChangeRef.current('disconnected');
    };

    wsRef.current = ws;
  }, []); // no external deps — fully stable reference

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.CONNECTING) {
          // Closing while CONNECTING throws the browser error — wait for open first
          ws.onopen = () => ws.close();
        } else {
          ws.close();
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
