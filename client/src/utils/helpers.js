/** ISO 2-letter country code → flag emoji */
export function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '';
  const offset = 127397;
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

/** Build Google Maps URL from lat/lng or name */
export function mapsUrl(lat, lng, name) {
  if (lat && lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

/** WebSocket URL — uses VITE_WS_URL in production (required for GitHub Pages) */
export function getWsUrl() {
  if (import.meta.env.DEV) return 'ws://localhost:3000';
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  // Fallback: same host (works when server & client are co-hosted)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

/** API base URL — uses VITE_API_URL in production (required for GitHub Pages) */
export function getApiUrl(path) {
  const base = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');
  return `${base}${path}`;
}
