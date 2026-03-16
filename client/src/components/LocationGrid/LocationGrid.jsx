import { LocationCard } from '../LocationCard/LocationCard';
import './LocationGrid.css';

export function LocationGrid({ locations, sceneSummary, isLoading }) {
  if (isLoading) {
    return (
      <div className="location-grid location-grid--empty">
        <div className="location-grid__loading">
          <div className="location-grid__spinner" />
          <p className="location-grid__loading-text">SCOUT is finding locations…</p>
        </div>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="location-grid location-grid--empty">
        <div className="location-grid__empty-state">
          <div className="location-grid__empty-icon">🎬</div>
          <h2 className="location-grid__empty-title">Your locations will appear here</h2>
          <p className="location-grid__empty-sub">
            Speak with SCOUT and describe your scene — cinematography style, era, mood, climate.
          </p>
          <div className="location-grid__prompts">
            {[
              '"A misty, feudal Japanese village at dawn"',
              '"Cold War Berlin — brutalist, foggy, paranoid"',
              '"Sunbaked Morocco medina, vibrant and ancient"',
            ].map((p) => (
              <span key={p} className="location-grid__prompt-chip">{p}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="location-grid">
      <div className="location-grid__header">
        <div className="location-grid__meta">
          {sceneSummary && (
            <p className="location-grid__scene">Scene: {sceneSummary}</p>
          )}
          <span className="location-grid__count">
            {locations.length} Location{locations.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="location-grid__cards">
        {locations.map((loc, i) => (
          <LocationCard key={`${loc.name}-${i}`} location={loc} index={i + 1} />
        ))}
      </div>
    </div>
  );
}
