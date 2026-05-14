import { bearingDegrees, distanceMeters, relativeDirectionFromHeading, viewAlignmentFromHeading } from "@/lib/geoMath";
import { wgs84ToApproxHk80 } from "@/lib/hk80";
import type { PublicDataCandidate } from "@/types";

type GeoJsonFeature = {
  id?: string | number;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

type GeoJsonResponse = {
  features?: GeoJsonFeature[];
};

type LocationSearchRecord = {
  nameEN?: string;
  addressEN?: string;
  districtEN?: string;
  x?: number;
  y?: number;
};

export async function getHongKongLocationSearchCandidates(params: {
  lat: number;
  lng: number;
  heading?: number;
  headingHalfAngle?: number;
  queries: string[];
  radius?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PublicDataCandidate[]> {
  const origin = wgs84ToApproxHk80(params.lat, params.lng);
  const radius = Math.min(Math.max(params.radius || 150, 50), 600);
  const limit = Math.min(Math.max(params.limit || 10, 1), 30);
  const queries = Array.from(new Set(params.queries.map((query) => query.trim()).filter((query) => query.length >= 3))).slice(0, 3);
  const records = (
    await Promise.all(
      queries.map((query) => locationSearch(query, params.signal).catch(() => []))
    )
  ).flat();

  return records
    .map((record, index) => normalizeLocationSearchRecord(record, index, origin, params.heading, params.headingHalfAngle))
    .filter((candidate): candidate is PublicDataCandidate => Boolean(candidate))
    .filter((candidate) => !candidate.distanceMeters || candidate.distanceMeters <= radius * 2)
    .sort((a, b) => {
      const aScore = a.relation === "visible-candidate" ? 0 : 1;
      const bScore = b.relation === "visible-candidate" ? 0 : 1;
      return aScore - bScore || (a.distanceMeters || 9999) - (b.distanceMeters || 9999);
    })
    .slice(0, limit);
}

export async function getNearbyHongKongPublicDataCandidates(params: {
  lat: number;
  lng: number;
  heading?: number;
  headingHalfAngle?: number;
  radius?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PublicDataCandidate[]> {
  const radius = Math.min(Math.max(params.radius || 120, 50), 500);
  const limit = Math.min(Math.max(params.limit || 10, 1), 30);
  const bbox = bboxAround(params.lat, params.lng, radius);
  const url = new URL("https://portal.csdi.gov.hk/server/services/common/landsd_rcd_1648571595120_89752/MapServer/WFSServer");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "GEO_PLACE_NAME");
  url.searchParams.set("outputFormat", "GeoJSON");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`);
  url.searchParams.set("count", "100");
  url.searchParams.set("resultType", "results");
  url.searchParams.set("startIndex", "0");

  const res = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "HKSpatialStory/1.0 (https://neonhk.vercel.app/)"
    },
    signal: params.signal
  });

  if (!res.ok) {
    throw new Error(`Hong Kong CSDI nearby lookup failed: ${res.status}`);
  }

  const data = (await res.json()) as GeoJsonResponse;
  return (data.features || [])
    .map((feature, index) => normalizeFeature(feature, index, params))
    .filter((candidate): candidate is PublicDataCandidate => Boolean(candidate))
    .sort((a, b) => {
      const aScore = a.relation === "visible-candidate" ? 0 : 1;
      const bScore = b.relation === "visible-candidate" ? 0 : 1;
      return aScore - bScore || (a.distanceMeters || 9999) - (b.distanceMeters || 9999);
    })
    .slice(0, limit);
}

function normalizeFeature(
  feature: GeoJsonFeature,
  index: number,
  params: { lat: number; lng: number; heading?: number; headingHalfAngle?: number }
): PublicDataCandidate | undefined {
  const properties = feature.properties || {};
  const explicitLabel = firstString(properties, [
    "NAME_EN",
    "name_en",
    "NAMEEN",
    "ENGLISH_NAME",
    "PLACE_NAME_EN",
    "CNAME",
    "NAME_TC",
    "name",
    "Name"
  ]);
  const placeType = firstString(properties, ["PLACE_TYPE", "place_type", "TYPE", "type"]);
  const district = firstString(properties, ["DISTRICT", "district"]);
  const label = explicitLabel || [placeType, district].filter(Boolean).join(" in ");
  if (!label) return undefined;

  const point = centroidFromGeometry(feature.geometry?.coordinates);
  const distance = point ? distanceMeters(params.lat, params.lng, point.lat, point.lng) : undefined;
  const bearing = point ? bearingDegrees(params.lat, params.lng, point.lat, point.lng) : undefined;
  const relativeDirection = relativeDirectionFromHeading(bearing, params.heading);
  const viewAlignment = viewAlignmentFromHeading(bearing, params.heading, params.headingHalfAngle);
  const relation =
    (viewAlignment === "inside_fragment_view" || relativeDirection === "ahead") && Number.isFinite(distance) && (distance || 9999) <= 180
      ? "visible-candidate"
      : "nearby";
  const category = firstString(properties, ["PLACE_CLASS", "CLASS", "class", "TYPE", "type", "FEAT_TYPE", "category"]);

  return {
    id: `hk_landsd:${feature.id || stableId(label)}:${index}`,
    label,
    category: category || "place_name",
    lat: point?.lat,
    lng: point?.lng,
    distanceMeters: Number.isFinite(distance) ? Math.round(distance || 0) : undefined,
    bearingFromScene: Number.isFinite(bearing) ? Math.round(bearing || 0) : undefined,
    headingDelta: Number.isFinite(bearing) && Number.isFinite(params.heading)
      ? Math.round(Math.abs((((bearing || 0) - (params.heading || 0) + 540) % 360) - 180))
      : undefined,
    viewAlignment,
    relativeDirection,
    source: "hk_landsd",
    relation
  };
}

async function locationSearch(query: string, signal?: AbortSignal): Promise<LocationSearchRecord[]> {
  const url = new URL("https://www.map.gov.hk/gs/api/v1.0.0/locationSearch");
  url.searchParams.set("q", query);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HKSpatialStory/1.0 (https://neonhk.vercel.app/)"
    },
    signal
  });
  if (!res.ok) throw new Error(`Location Search failed: ${res.status}`);
  const data = (await res.json()) as LocationSearchRecord[];
  return Array.isArray(data) ? data : [];
}

function normalizeLocationSearchRecord(
  record: LocationSearchRecord,
  index: number,
  origin: { x: number; y: number },
  heading?: number,
  headingHalfAngle?: number
): PublicDataCandidate | undefined {
  if (!record.nameEN) return undefined;
  const distance = Number.isFinite(record.x) && Number.isFinite(record.y)
    ? Math.sqrt(Math.pow((record.x || 0) - origin.x, 2) + Math.pow((record.y || 0) - origin.y, 2))
    : undefined;
  const bearing = Number.isFinite(record.x) && Number.isFinite(record.y)
    ? normalizeGridBearing((record.x || 0) - origin.x, (record.y || 0) - origin.y)
    : undefined;
  const relativeDirection = relativeDirectionFromHeading(bearing, heading);
  const viewAlignment = viewAlignmentFromHeading(bearing, heading, headingHalfAngle);
  return {
    id: `hk_landsd:location-search:${stableId(record.nameEN)}:${index}`,
    label: record.nameEN,
    category: record.districtEN ? `location_search:${record.districtEN}` : "location_search",
    address: record.addressEN,
    distanceMeters: Number.isFinite(distance) ? Math.round(distance || 0) : undefined,
    bearingFromScene: Number.isFinite(bearing) ? Math.round(bearing || 0) : undefined,
    headingDelta: Number.isFinite(bearing) && Number.isFinite(heading)
      ? Math.round(Math.abs((((bearing || 0) - (heading || 0) + 540) % 360) - 180))
      : undefined,
    viewAlignment,
    relativeDirection,
    source: "hk_landsd",
    relation:
      (viewAlignment === "inside_fragment_view" || relativeDirection === "ahead") && Number.isFinite(distance) && (distance || 9999) <= 180
        ? "visible-candidate"
        : "nearby"
  };
}

function bboxAround(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return {
    minLat: lat - latDelta,
    minLng: lng - lngDelta,
    maxLat: lat + latDelta,
    maxLng: lng + lngDelta
  };
}

function centroidFromGeometry(coordinates: unknown): { lat: number; lng: number } | undefined {
  const points = flattenCoordinates(coordinates);
  if (!points.length) return undefined;
  const sum = points.reduce(
    (current, point) => ({
      lng: current.lng + point.lng,
      lat: current.lat + point.lat
    }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  };
}

function flattenCoordinates(value: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    const lng = value[0];
    const lat = value[1];
    return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
  }
  return value.flatMap((item) => flattenCoordinates(item));
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "candidate";
}

function normalizeGridBearing(deltaX: number, deltaY: number) {
  return ((Math.atan2(deltaX, deltaY) * 180) / Math.PI + 360) % 360;
}
