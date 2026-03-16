import './LocationHistory.css';

export function LocationHistory({ history, onSelect }) {
  return (
    <div className="loc-history">
      <div className="loc-history__header">
        <span className="loc-history__label">Location History</span>
      </div>

      <div className="loc-history__list">
        {history.length === 0 ? (
          <div className="loc-history__empty">
            <p>Past location sets will appear here.</p>
          </div>
        ) : (
          history.map((entry) => (
            <button
              key={entry.id}
              className="loc-history__entry"
              onClick={() => onSelect(entry)}
            >
              <span className="loc-history__scene">{entry.sceneSummary}</span>
              <span className="loc-history__names">
                {entry.locations.slice(0, 3).map((l) => l.name).join(' · ')}
                {entry.locations.length > 3 && ` +${entry.locations.length - 3}`}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
