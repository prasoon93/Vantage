import { useState, useEffect } from 'react';
import { countryCodeToFlag, mapsUrl } from '../../utils/helpers';
import './LocationCard.css';

function useLocationImage(searchQuery, lat, lng) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchImage() {
      try {
        // 1. Try Google Places photo
        const res = await fetch(`/api/places/photo?query=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.photoUrl) {
          setImageUrl(data.photoUrl);
          return;
        }

        // 2. Try satellite map thumbnail
        if (lat && lng) {
          setImageUrl(`/api/map-thumb?lat=${lat}&lng=${lng}`);
          return;
        }

        // 3. AI-generated image fallback
        setImageUrl(`/api/generate-image?query=${encodeURIComponent(searchQuery)}`);
      } catch {
        if (cancelled) return;
        if (lat && lng) {
          setImageUrl(`/api/map-thumb?lat=${lat}&lng=${lng}`);
        } else {
          setImageUrl(`/api/generate-image?query=${encodeURIComponent(searchQuery)}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchImage();
    return () => { cancelled = true; };
  }, [searchQuery, lat, lng]);

  return { imageUrl, loading };
}

export function LocationCard({ location, index }) {
  const [pinned, setPinned] = useState(false);
  const { imageUrl, loading } = useLocationImage(location.search_query, location.lat, location.lng);

  const flag = countryCodeToFlag(location.country_code);
  const mapLink = mapsUrl(location.lat, location.lng, `${location.name} ${location.city}`);

  return (
    <article className={`location-card ${pinned ? 'location-card--pinned' : ''}`}>
      {/* Image */}
      <div className="location-card__image-wrapper">
        {loading && <div className="location-card__skeleton" />}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={location.name}
            className="location-card__image"
            onLoad={(e) => e.target.classList.add('location-card__image--loaded')}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : !loading && (
          <div className="location-card__image-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.4)" strokeWidth="1.2">
              <circle cx="12" cy="10" r="3" />
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            <span>{location.search_query}</span>
          </div>
        )}

        <span className="location-card__number">{index}</span>

        <div className="location-card__country-badge">
          <span className="location-card__flag">{flag}</span>
          <span className="location-card__country-name">{location.country}</span>
        </div>
      </div>

      {/* Content */}
      <div className="location-card__body">
        <h3 className="location-card__name">{location.name}</h3>
        <p className="location-card__city">{[location.city, location.country].filter(Boolean).join(', ')}</p>

        {location.tagline && (
          <p className="location-card__tagline">"{location.tagline}"</p>
        )}

        <p className="location-card__why">{location.why_it_works}</p>

        {location.famous_productions?.length > 0 && (
          <div className="location-card__productions">
            <span className="location-card__section-label">Filmed here</span>
            <div className="location-card__production-tags">
              {location.famous_productions.slice(0, 5).map((p) => (
                <span key={p} className="location-card__production-tag">{p}</span>
              ))}
            </div>
          </div>
        )}

        <div className="location-card__meta">
          {location.best_shooting_time && (
            <div className="location-card__meta-item">
              <span className="location-card__meta-icon">🕐</span>
              <span>{location.best_shooting_time}</span>
            </div>
          )}
          {location.practical_notes && (
            <div className="location-card__meta-item">
              <span className="location-card__meta-icon">📋</span>
              <span>{location.practical_notes}</span>
            </div>
          )}
        </div>

        {location.visual_tags?.length > 0 && (
          <div className="location-card__visual-tags">
            {location.visual_tags.slice(0, 6).map((tag) => (
              <span key={tag} className="location-card__visual-tag">{tag}</span>
            ))}
          </div>
        )}

        <div className="location-card__actions">
          <a
            href={mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="location-card__map-btn"
          >
            View on Maps →
          </a>
          <button
            className={`location-card__pin-btn ${pinned ? 'location-card__pin-btn--active' : ''}`}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Unpin location' : 'Pin location'}
          >
            <svg viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}
