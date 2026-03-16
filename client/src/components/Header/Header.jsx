import './Header.css';

export function Header({ appState }) {
  const statusLabel = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    ready: 'Ready',
    listening: 'Listening',
    speaking: 'SCOUT Speaking',
  }[appState] ?? 'Disconnected';

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">✦</span>
        <h1 className="header__title">SCOUT</h1>
        <span className="header__sub">AI Film Location Scout</span>
      </div>

      <div className="header__badges">
        <span className={`header__status header__status--${appState}`}>
          <span className="header__status-dot" />
          {statusLabel}
        </span>
        <span className="header__gemini-badge">Gemini Live</span>
      </div>
    </header>
  );
}
