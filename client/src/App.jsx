import { useCallback, useRef, useState } from 'react';
import { useAppContext } from './context/AppContext';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { Header } from './components/Header/Header';
import { MicButton } from './components/MicButton/MicButton';
import { Waveform } from './components/Waveform/Waveform';
import { LocationHistory } from './components/LocationHistory/LocationHistory';
import { LocationGrid } from './components/LocationGrid/LocationGrid';
import { SceneSpecsPanel } from './components/SceneSpecsPanel/SceneSpecsPanel';
import './App.css';

export function App() {
  const { state, dispatch } = useAppContext();
  const { appState, locations, sceneSummary, locationHistory, isLoadingLocations, sceneSpecs } = state;
  const aiTextRef = useRef('');
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  // True while PCM mic capture is active — prevents model responses from overriding 'listening' state
  const isCapturingRef = useRef(false);

  // ── Audio playback ─────────────────────────────────────────────────────────
  const { scheduleChunk, interrupt, isPlayingRef } = useAudioPlayback({
    onPlaybackEnd: () => {
      setIsAwaitingResponse(false);
      // Don't reset to 'ready' if the user is still speaking
      if (!isCapturingRef.current) {
        dispatch({ type: 'SET_APP_STATE', payload: 'ready' });
      }
    },
  });

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'ready':
        dispatch({ type: 'SET_APP_STATE', payload: 'ready' });
        break;

      case 'audio':
        // Only switch to 'speaking' if user is not currently talking
        if (!isCapturingRef.current) {
          dispatch({ type: 'SET_APP_STATE', payload: 'speaking' });
        }
        scheduleChunk(msg.data);
        break;

      case 'text':
        aiTextRef.current += msg.text;
        dispatch({ type: 'STREAM_AI_TEXT', payload: msg.text });
        break;

      case 'turn_complete': {
        setIsAwaitingResponse(false);
        aiTextRef.current = '';
        dispatch({ type: 'FINISH_AI_STREAM' });
        // Don't reset to 'ready' if user is still speaking or audio is still playing
        if (!isPlayingRef.current && !isCapturingRef.current) {
          dispatch({ type: 'SET_APP_STATE', payload: 'ready' });
        }
        break;
      }

      case 'locations': {
        const locs = msg.locations || [];
        const summary = msg.scene_summary || '';
        dispatch({ type: 'SET_LOADING_LOCATIONS', payload: false });
        if (locs.length) {
          if (msg.specs) dispatch({ type: 'SET_SCENE_SPECS', payload: msg.specs });
          dispatch({ type: 'PUSH_LOCATION_HISTORY', payload: { id: Date.now(), sceneSummary: summary, locations: locs } });
          dispatch({ type: 'SET_LOCATIONS', payload: locs });
          if (summary) dispatch({ type: 'SET_SCENE_SUMMARY', payload: summary });
        }
        break;
      }

      case 'interrupted':
        setIsAwaitingResponse(false);
        interrupt();
        dispatch({ type: 'FINISH_AI_STREAM' });
        break;

      case 'error':
        console.error('[WS] error from server:', msg.message);
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'ai', text: `Error: ${msg.message}` } });
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleChunk, interrupt, isPlayingRef]);

  const handleStateChange = useCallback((wsState) => {
    if (wsState === 'disconnected' || wsState === 'connecting') {
      dispatch({ type: 'SET_APP_STATE', payload: wsState });
    }
  }, [dispatch]);

  const { send } = useWebSocket({ onMessage: handleMessage, onStateChange: handleStateChange });

  // ── Audio capture ──────────────────────────────────────────────────────────
  const handleChunk = useCallback((b64) => {
    send({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }] } });
  }, [send]);

  const { start: startCapture, stop: stopCapture, analyserRef } = useAudioCapture({
    onChunk: handleChunk,
  });

  // ── Mic button handler ─────────────────────────────────────────────────────
  const handleMicClick = useCallback(async () => {
    if (appState === 'listening') {
      isCapturingRef.current = false;
      stopCapture();
      setIsAwaitingResponse(true);
      dispatch({ type: 'SET_APP_STATE', payload: 'ready' });
      dispatch({ type: 'ADD_MESSAGE', payload: { role: 'ai', text: '', streaming: true } });
      return;
    }

    try {
      await startCapture();
      isCapturingRef.current = true;
      dispatch({ type: 'SET_APP_STATE', payload: 'listening' });
    } catch (err) {
      console.error('[Mic] failed to start:', err.message);
      alert('Could not access microphone: ' + err.message);
    }
  }, [appState, stopCapture, startCapture, dispatch]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <Header appState={appState} />
      <div className="app__body">
        <aside className="app__left">
          <MicButton appState={appState} onClick={handleMicClick} isProcessing={isLoadingLocations} isAwaitingResponse={isAwaitingResponse} />
          <Waveform appState={appState} analyserRef={analyserRef} />
          <SceneSpecsPanel specs={sceneSpecs} />
          <LocationHistory
            history={locationHistory}
            onSelect={(entry) => {
              dispatch({ type: 'SET_LOCATIONS', payload: entry.locations });
              dispatch({ type: 'SET_SCENE_SUMMARY', payload: entry.sceneSummary });
            }}
          />
        </aside>

        <main className="app__right">
          <LocationGrid locations={locations} sceneSummary={sceneSummary} isLoading={isLoadingLocations} />
        </main>
      </div>
    </div>
  );
}
