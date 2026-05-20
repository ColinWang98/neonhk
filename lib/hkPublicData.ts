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

type RegistryDataset = {
  id: string;
  serviceId: string;
  typeName: string;
  source: PublicDataCandidate["source"];
  sourceTitle: string;
  category: string;
  nameKeys: string[];
  addressKeys: string[];
  categoryKeys: string[];
  urlKeys?: string[];
};

const registryDatasets: RegistryDataset[] = [
  {
    id: "fehd_restaurant_licences",
    serviceId: "fehd_rcd_1630036390312_58893",
    typeName: "csdi:FEHD_RL",
    source: "hk_fehd",
    sourceTitle: "FEHD restaurant licences",
    category: "restaurant_licence",
    nameKeys: ["NSEARCH03_EN", "NAME_EN", "NSEARCH03_TC", "NAME_TC"],
    addressKeys: ["ADDRESS_EN", "ADDRESS_TC"],
    categoryKeys: ["DATASET_EN", "NAME_EN", "NSEARCH02_EN"]
  },
  {
    id: "amo_declared_monuments",
    serviceId: "devb_wb_rcd_1639040299687_46105",
    typeName: "csdi:DM_20260130_150858",
    source: "hk_amo",
    sourceTitle: "AMO declared monuments",
    category: "declared_monument",
    nameKeys: ["NAME", "NAME_TC"],
    addressKeys: ["ADDRESS", "ADDRESS_TC"],
    categoryKeys: ["DATASET", "DEC_YEAR", "DISTRICT"],
    urlKeys: ["DETAIL", "URL_IMAGE"]
  },
  {
    id: "amo_graded_historic_buildings",
    serviceId: "devb_wb_rcd_1639040388709_10687",
    typeName: "csdi:HBG_20260401_161518",
    source: "hk_amo",
    sourceTitle: "AMO graded historic buildings",
    category: "graded_historic_building",
    nameKeys: ["NAME", "NAME_TC"],
    addressKeys: ["ADDRESS", "ADDRESS_TC"],
    categoryKeys: ["DATASET", "GRADE", "GRADE_YEAR", "DISTRICT"],
    urlKeys: ["URL_IMAGE"]
  }
];

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

export async function getNearbyHongKongRegistryCandidates(params: {
  lat: number;
  lng: number;
  heading?: number;
  headingHalfAngle?: number;
  radius?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PublicDataCandidate[]> {
  const radius = Math.min(Math.max(params.radius || 160, 80), 650);
  const limit = Math.min(Math.max(params.limit || 12, 1), 36);
  const results = (
    await Promise.all(
      registryDatasets.map((dataset) =>
        fetchRegistryDataset(dataset, { ...params, radius }, params.signal).catch(() => [])
      )
    )
  ).flat();

  return results
    .filter((candidate) => !candidate.distanceMeters || candidate.distanceMeters <= radius * 2.5)
    .sort((a, b) => {
      const aScore = registryScore(a);
      const bScore = registryScore(b);
      return bScore - aScore || (a.distanceMeters || 9999) - (b.distanceMeters || 9999);
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

async function fetchRegistryDataset(
  dataset: RegistryDataset,
  params: { lat: number; lng: number; heading?: number; headingHalfAngle?: number; radius: number },
  signal?: AbortSignal
): Promise<PublicDataCandidate[]> {
  const bbox = bboxAround(params.lat, params.lng, params.radius);
  const url = new URL(`https://portal.csdi.gov.hk/server/services/common/${dataset.serviceId}/MapServer/WFSServer`);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", dataset.typeName);
  url.searchParams.set("outputFormat", "GeoJSON");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`);
  url.searchParams.set("count", "100");
  url.searchParams.set("resultType", "results");

  const res = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
      "User-Agent": "HKSpatialStory/1.0 (https://neonhk.vercel.app/)"
    },
    signal
  });
  if (!res.ok) throw new Error(`${dataset.sourceTitle} lookup failed: ${res.status}`);
  const data = (await res.json()) as GeoJsonResponse;
  return (data.features || [])
    .map((feature, index) => normalizeRegistryFeature(dataset, feature, index, params))
    .filter((candidate): candidate is PublicDataCandidate => Boolean(candidate));
}

function normalizeRegistryFeature(
  dataset: RegistryDataset,
  feature: GeoJsonFeature,
  index: number,
  params: { lat: number; lng: number; heading?: number; headingHalfAngle?: number }
): PublicDataCandidate | undefined {
  const properties = feature.properties || {};
  const label = firstString(properties, dataset.nameKeys);
  if (!label) return undefined;
  const address = firstString(properties, dataset.addressKeys);
  const point = pointFromProperties(properties) || centroidFromGeometry(feature.geometry?.coordinates);
  const distance = point ? distanceMeters(params.lat, params.lng, point.lat, point.lng) : undefined;
  const bearing = point ? bearingDegrees(params.lat, params.lng, point.lat, point.lng) : undefined;
  const relativeDirection = relativeDirectionFromHeading(bearing, params.heading);
  const viewAlignment = viewAlignmentFromHeading(bearing, params.heading, params.headingHalfAngle);
  const relation =
    (viewAlignment === "inside_fragment_view" || relativeDirection === "ahead") && Number.isFinite(distance) && (distance || 9999) <= 220
      ? "visible-candidate"
      : "nearby";
  const categoryParts = dataset.categoryKeys
    .map((key) => valueAsString(properties[key]))
    .filter(Boolean)
    .slice(0, 4);
  const url = firstString(properties, dataset.urlKeys || []);

  return {
    id: `${dataset.source}:${dataset.id}:${feature.id || firstString(properties, ["OBJECTID", "GmlID"]) || stableId(label)}:${index}`,
    label,
    category: [dataset.category, ...categoryParts].filter(Boolean).join(":"),
    address,
    url,
    sourceTitle: dataset.sourceTitle,
    sourceTier: "official",
    lat: point?.lat,
    lng: point?.lng,
    distanceMeters: Number.isFinite(distance) ? Math.round(distance || 0) : undefined,
    bearingFromScene: Number.isFinite(bearing) ? Math.round(bearing || 0) : undefined,
    headingDelta: Number.isFinite(bearing) && Number.isFinite(params.heading)
      ? Math.round(Math.abs((((bearing || 0) - (params.heading || 0) + 540) % 360) - 180))
      : undefined,
    viewAlignment,
    relativeDirection,
    source: dataset.source,
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
    const value = valueAsString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function valueAsString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function pointFromProperties(record: Record<string, unknown>) {
  const lat = numberFrom(record.LATITUDE);
  const lng = numberFrom(record.LONGITUDE);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat || 0, lng: lng || 0 } : undefined;
}

function numberFrom(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function registryScore(candidate: PublicDataCandidate) {
  const relationScore = candidate.relation === "visible-candidate" ? 50 : 0;
  const sourceScore = candidate.source === "hk_amo" ? 24 : candidate.source === "hk_fehd" ? 18 : 8;
  const distanceScore = Math.max(0, 28 - Math.min(candidate.distanceMeters || 350, 350) / 12);
  const alignmentScore =
    candidate.viewAlignment === "inside_fragment_view"
      ? 24
      : candidate.viewAlignment === "near_fragment_view"
        ? 14
        : candidate.relativeDirection === "ahead"
          ? 10
          : 0;
  return relationScore + sourceScore + distanceScore + alignmentScore;
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "candidate";
}

function normalizeGridBearing(deltaX: number, deltaY: number) {
  return ((Math.atan2(deltaX, deltaY) * 180) / Math.PI + 360) % 360;
}
