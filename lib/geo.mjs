// Small, dependency-free geodesic helpers. Coordinates always [longitude, latitude].
const R = 6371008.8;
const rad = Math.PI / 180;
const deg = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function destination([lng, lat], distanceMeters, bearingDegrees) {
  const theta = bearingDegrees * rad;
  const delta = distanceMeters / R;
  const phi = lat * rad;
  const lambda = lng * rad;
  const phi2 = Math.asin(clamp(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(theta), -1, 1));
  const lambda2 = lambda + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * Math.sin(phi2));
  const outLng = ((lambda2 * deg + 540) % 360) - 180;
  return [outLng, phi2 * deg];
}

export function circlePolygon(center, radiusMeters, steps = 72) {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) throw new RangeError('Radius must be positive');
  const ring = [];
  for (let i = 0; i <= steps; i++) ring.push(destination(center, radiusMeters, (i % steps) * 360 / steps));
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export function boundingSquare(center, radiusMeters) {
  // Square has side length ~2x radius. North/south/east/west corners are
  // derived from geodesic offsets rather than blindly applying degrees.
  const north = destination(center, radiusMeters, 0)[1];
  const south = destination(center, radiusMeters, 180)[1];
  const east = destination(center, radiusMeters, 90)[0];
  const west = destination(center, radiusMeters, 270)[0];
  if (west > east) throw new RangeError('Bounding area crosses the antimeridian; move the pin a little.');
  return [west, south, east, north];
}

export function squarePolygon([west, south, east, north]) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[west,south],[east,south],[east,north],[west,north],[west,south]]] } };
}

export function areaHectares(radiusMeters) { return Math.PI * radiusMeters ** 2 / 10000; }

export function formatCoordinates([lng, lat]) { return `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`; }
