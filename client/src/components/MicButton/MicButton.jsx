import './MicButton.css';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export function MicButton({ appState, onClick, isProcessing, isAwaitingResponse }) {
  const isListening = appState === 'listening';
  const isSpeaking = appState === 'speaking';
  const isResponding = isAwaitingResponse || isSpeaking;
  const isDisabled = appState === 'disconnected' || appState === 'connecting' || isProcessing || isResponding;

  let hint = 'Click to speak';
  if (appState === 'disconnected') hint = 'Disconnected — refresh to reconnect';
  if (appState === 'connecting') hint = 'Connecting to SCOUT...';
  if (isResponding) hint = isSpeaking ? 'SCOUT is speaking…' : 'SCOUT is thinking…';
  if (isProcessing) hint = 'Finding locations…';
  if (isListening) hint = 'Click to stop';

  return (
    <div className="mic-area">
      <div className={`mic-wrapper ${isListening ? 'mic-wrapper--listening' : ''}`}>
        {isListening && (
          <>
            <span className="mic-pulse mic-pulse--1" />
            <span className="mic-pulse mic-pulse--2" />
          </>
        )}
        <button
          className={`mic-btn ${isListening ? 'mic-btn--listening' : ''} ${isSpeaking ? 'mic-btn--speaking' : ''}`}
          onClick={onClick}
          disabled={isDisabled}
          aria-label={hint}
        >
          <span className="mic-btn__icon">
            {isListening ? <StopIcon /> : <MicIcon />}
          </span>
        </button>
      </div>

      {isSpeaking && (
        <div className="ai-wave-bars" aria-hidden="true">
          {[...Array(5)].map((_, i) => (
            <span key={i} className="ai-wave-bar" />
          ))}
        </div>
      )}

      {isAwaitingResponse && !isSpeaking && (
        <div className="scout-thinking" aria-hidden="true">
          <span /><span /><span />
        </div>
      )}

      <p className="mic-hint">{hint}</p>
      {!isListening && !isResponding && !isProcessing && appState === 'ready' && (
        <p className="mic-sub-hint">Describe your scene to SCOUT</p>
      )}
    </div>
  );
}
