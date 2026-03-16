import './SceneSpecsPanel.css';

const SPEC_FIELDS = [
  { key: 'tone',          label: 'Tone',          icon: '🎭' },
  { key: 'period',        label: 'Time Period',    icon: '🕰' },
  { key: 'location_type', label: 'Location Type',  icon: '📍' },
  { key: 'time_of_day',   label: 'Time of Day',    icon: '🌅' },
  { key: 'season',        label: 'Season',         icon: '🌿' },
  { key: 'props',         label: 'Props / Set',    icon: '🎬' },
  { key: 'budget',        label: 'Budget',         icon: '💰' },
];

export function SceneSpecsPanel({ specs }) {
  const filledCount = SPEC_FIELDS.filter((f) => specs[f.key]).length;
  const hasAny = filledCount > 0;

  if (!hasAny) return null;

  return (
    <div className="scene-specs">
      <div className="scene-specs__header">
        <span className="scene-specs__title">Scene Brief</span>
        <span className="scene-specs__progress">{filledCount} / {SPEC_FIELDS.length}</span>
      </div>

      <div className="scene-specs__grid">
        {SPEC_FIELDS.map(({ key, label, icon }) => {
          const value = specs[key];
          return (
            <div key={key} className={`scene-specs__item ${value ? 'scene-specs__item--filled' : 'scene-specs__item--empty'}`}>
              <span className="scene-specs__icon">{icon}</span>
              <div className="scene-specs__text">
                <span className="scene-specs__label">{label}</span>
                {value
                  ? <span className="scene-specs__value">{value}</span>
                  : <span className="scene-specs__pending">Pending...</span>
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
