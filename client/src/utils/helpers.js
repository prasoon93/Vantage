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

/** WebSocket URL — direct to server in dev, same host in production */
export function getWsUrl() {
  if (import.meta.env.DEV) {
    return 'ws://localhost:3000';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}
