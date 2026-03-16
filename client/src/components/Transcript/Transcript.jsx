import { useEffect, useRef } from 'react';
import './Transcript.css';

function Message({ role, text, streaming }) {
  return (
    <div className={`message message--${role}`}>
      <div className="message__avatar">{role === 'user' ? 'D' : 'S'}</div>
      <div className={`message__bubble ${streaming ? 'message__bubble--streaming' : ''}`}>
        {text || (
          <span className="message__thinking">
            <span /><span /><span />
          </span>
        )}
      </div>
    </div>
  );
}

export function Transcript({ messages, onClear }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="transcript">
      <div className="transcript__header">
        <span className="transcript__label">Conversation</span>
        <button className="transcript__clear" onClick={onClear}>Clear</button>
      </div>

      <div className="transcript__messages">
        {messages.length === 0 ? (
          <div className="transcript__welcome">
            <p>Describe a scene. SCOUT will find the perfect locations.</p>
          </div>
        ) : (
          messages.map((m) => (
            <Message key={m.id} role={m.role} text={m.text} streaming={m.streaming} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
