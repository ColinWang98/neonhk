export function makeBbox(lat: number, lng: number, radiusMeters = 100) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));

  return [
    lng - lngDelta,
    lat - latDelta,
    lng + lngDelta,
    lat + latDelta
  ].join(",");
}
