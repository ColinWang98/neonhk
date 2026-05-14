const semiMajorAxis = 6378388;
const inverseFlattening = 297;
const flattening = 1 / inverseFlattening;
const eccentricitySquared = 2 * flattening - flattening * flattening;
const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
const originLat = toRadians(22.3121333333333);
const originLng = toRadians(114.178555555556);
const falseEasting = 836694.05;
const falseNorthing = 819069.8;

export function wgs84ToApproxHk80(lat: number, lng: number) {
  const phi = toRadians(lat);
  const lambda = toRadians(lng);
  const n = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * Math.sin(phi) * Math.sin(phi));
  const t = Math.tan(phi) * Math.tan(phi);
  const c = secondEccentricitySquared * Math.cos(phi) * Math.cos(phi);
  const a = (lambda - originLng) * Math.cos(phi);
  const m = meridionalArc(phi);
  const m0 = meridionalArc(originLat);
  const x =
    falseEasting +
    n *
      (a +
        ((1 - t + c) * Math.pow(a, 3)) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * secondEccentricitySquared) * Math.pow(a, 5)) / 120);
  const y =
    falseNorthing +
    (m -
      m0 +
      n *
        Math.tan(phi) *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * Math.pow(a, 4)) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * secondEccentricitySquared) * Math.pow(a, 6)) / 720));
  return { x, y };
}

function meridionalArc(phi: number) {
  const e4 = eccentricitySquared * eccentricitySquared;
  const e6 = e4 * eccentricitySquared;
  return (
    semiMajorAxis *
    ((1 - eccentricitySquared / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * eccentricitySquared) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
