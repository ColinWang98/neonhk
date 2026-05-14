export type RelativeDirection = "ahead" | "left" | "right" | "behind" | "nearby";

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMeters = 6371008.8;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLng = toRadians(lng2 - lng1);
  const y = Math.sin(deltaLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

export function relativeDirectionFromHeading(
  bearing: number | undefined,
  heading: number | undefined
): RelativeDirection {
  if (!Number.isFinite(bearing) || !Number.isFinite(heading)) return "nearby";
  const diff = shortestAngleDifference(bearing || 0, heading || 0);
  const abs = Math.abs(diff);
  if (abs <= 35) return "ahead";
  if (abs >= 145) return "behind";
  return diff < 0 ? "left" : "right";
}

export function viewAlignmentFromHeading(
  bearing: number | undefined,
  heading: number | undefined,
  headingHalfAngle?: number
) {
  if (!Number.isFinite(bearing) || !Number.isFinite(heading)) return "unknown" as const;
  const halfAngle = Number.isFinite(headingHalfAngle)
    ? Math.min(Math.max(headingHalfAngle || 0, 6), 70)
    : 18;
  const delta = Math.abs(shortestAngleDifference(bearing || 0, heading || 0));
  if (delta <= halfAngle) return "inside_fragment_view" as const;
  if (delta <= halfAngle + 18) return "near_fragment_view" as const;
  return "outside_fragment_view" as const;
}

export function rayIntersectsLatLngPolygon(params: {
  originLat: number;
  originLng: number;
  heading: number | undefined;
  polygon: Array<{ lat: number; lng: number }>;
  maxDistanceMeters?: number;
}) {
  if (!Number.isFinite(params.heading) || params.polygon.length < 3) return false;
  const maxDistance = params.maxDistanceMeters || 260;
  const rayStart = { x: 0, y: 0 };
  const radians = toRadians(params.heading || 0);
  const rayEnd = {
    x: Math.sin(radians) * maxDistance,
    y: Math.cos(radians) * maxDistance
  };
  const points = params.polygon.map((point) =>
    latLngToLocalMeters(params.originLat, params.originLng, point.lat, point.lng)
  );

  if (pointInPolygon(rayStart, points)) return true;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    if (segmentsIntersect(rayStart, rayEnd, points[index], points[next])) return true;
  }
  return false;
}

export function shortestAngleDifference(a: number, b: number) {
  return ((normalizeDegrees(a) - normalizeDegrees(b) + 540) % 360) - 180;
}

export function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function latLngToLocalMeters(originLat: number, originLng: number, lat: number, lng: number) {
  const meanLat = toRadians((originLat + lat) / 2);
  return {
    x: (lng - originLng) * 111320 * Math.cos(meanLat),
    y: (lat - originLat) * 110540
  };
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return false;
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}
