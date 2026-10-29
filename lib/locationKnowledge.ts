import { distanceMeters } from "@/lib/geoMath";
import type { LocationKnowledge } from "@/types";

type NearbyParams = { lat: number; lng: number; radius?: number; topics?: string[]; signal?: AbortSignal };
type Feature = { geometry?: { type: string; coordinates: number[] | number[][] }; properties: Record<string, unknown> };
const governmentLicense = "https://data.gov.hk/en/terms-and-conditions";
const naturePattern = /\b(tree|trees|plant|plants|bird|birds|butterfly|butterflies|garden|park|woodland|mangrove|wildlife)\b|樹|植物|鳥|蝴蝶|公園/iu;

export async function getNearbyLocationKnowledge(params: NearbyParams): Promise<LocationKnowledge[]> {
  if (!isHongKongCoordinate(params.lat, params.lng)) return [];
  const tasks = [
    { source: "hk_heritage_trail", run: () => getHeritageTrailContext(params) },
    { source: "hk_tree", run: () => getTreeContext(params) },
    { source: "city_in_time", run: () => getCityInTimeContext(params) },
    ...(naturePattern.test((params.topics || []).join(" "))
      ? [{ source: "gbif", run: () => getNatureContext(params) }]
      : [])
  ];
  const results = await Promise.all(tasks.map(async (task) => {
    try {
      return await task.run();
    } catch (error) {
      console.warn("[location.knowledge] source_failed", { source: task.source, message: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }));
  return results.flat();
}

export function isHongKongCoordinate(lat: number, lng: number) {
  return lat >= 22.15 && lat <= 22.57 && lng >= 113.83 && lng <= 114.45;
}

export async function getHeritageTrailContext(params: NearbyParams): Promise<LocationKnowledge[]> {
  const features = await queryRegistry("devb_wb_rcd_1732687928039_22095", "csdi:HT_20250121_161219", params);
  return features.flatMap((feature): LocationKnowledge[] => {
    const p = feature.properties;
    const point = featurePoint(feature);
    if (!point || !text(p.NAME) || !text(p.TRAIL)) return [];
    return [{
      ...governmentItem("hk_heritage_trail", String(p.OBJECTID), text(p.NAME), "heritage", point, params),
      text: `${text(p.NAME)} at ${text(p.ADDRESS)} is a listed stop on ${text(p.TRAIL)}. The listing does not supply a construction date or establish which building is visible in the crop.`,
      address: text(p.ADDRESS),
      url: "https://data.gov.hk/en-data/dataset/hk-devb-htrails-heritage-trails-established-by-amo",
      attribution: "Antiquities and Monuments Office, heritage trails, DATA.GOV.HK"
    }];
  }).filter((item) => item.distanceMeters! <= radius(params)).sort(byDistance)
    .filter((item, index, items) => items.findIndex((other) => other.title === item.title && other.address === item.address) === index)
    .slice(0, 3);
}

export async function getTreeContext(params: NearbyParams): Promise<LocationKnowledge[]> {
  const features = await queryRegistry("devb_wb_rcd_1629267205229_51162", "csdi:geotagging", params);
  return features.flatMap((feature): LocationKnowledge[] => {
    const p = feature.properties;
    const point = featurePoint(feature);
    const species = text(p.Species_EN);
    const location = text(p.Location_EN);
    if (!point || !species || !location) return [];
    return [{
      ...governmentItem("hk_tree", text(p.TR_no_) || String(p.OBJECTID), `${species} at ${location}`, "tree", point, params),
      text: `Hong Kong's Old and Valuable Trees and Stonewall Trees register lists ${species} at ${location}, record ${text(p.OVTNo) || text(p.TR_no_)}. This is a nearby registry record, not identification of a tree in the selected image or evidence of its present condition.`,
      address: location,
      url: "https://data.gov.hk/en-data/dataset/hk-devb-ovt-ovt-and-stonewall",
      attribution: "Development Bureau, Old and Valuable Trees and Stonewall Trees, DATA.GOV.HK"
    }];
  }).filter((item) => item.distanceMeters! <= radius(params)).sort(byDistance).slice(0, 2);
}

export async function getCityInTimeContext(params: NearbyParams): Promise<LocationKnowledge[]> {
  const data = await readJson<{ cityintime?: { items?: Array<Record<string, unknown>> } }>(
    new URL("https://www.tourism.gov.hk/datagovhk/city_in_time/city_in_time_info.json"), params.signal
  );
  if (!Array.isArray(data.cityintime?.items)) throw new Error("City in Time returned an invalid location directory.");
  return data.cityintime.items.flatMap((item): LocationKnowledge[] => {
    const lat = coordinate(item.latitude);
    const lng = coordinate(item.longitude);
    const title = text(item.addr_eng);
    if (lat === undefined || lng === undefined || !isHongKongCoordinate(lat, lng) || !title) return [];
    return [{
      ...governmentItem("city_in_time", text(item.spot_num), title, "directory", { lat, lng }, params),
      text: `${title} is a designated City in Time experience location. This open directory provides location metadata only, not historical narratives, panoramas, film clips or evidence that the location is visible.`,
      address: title,
      url: "https://data.gov.hk/en-data/dataset/hk-cstb-cstb_tc-tc-city-in-time",
      attribution: "Culture, Sports and Tourism Bureau, City in Time location directory, DATA.GOV.HK"
    }];
  }).filter((item) => item.distanceMeters! <= radius(params)).sort(byDistance).slice(0, 3);
}

export async function getNatureContext(params: NearbyParams): Promise<LocationKnowledge[]> {
  const box = boundingBox(params);
  const url = new URL("https://api.gbif.org/v1/occurrence/search");
  url.search = new URLSearchParams({
    country: "HK", hasCoordinate: "true", hasGeospatialIssue: "false", occurrenceStatus: "PRESENT",
    basisOfRecord: "HUMAN_OBSERVATION", decimalLatitude: `${box.minLat},${box.maxLat}`,
    decimalLongitude: `${box.minLng},${box.maxLng}`, limit: "20"
  }).toString();
  url.searchParams.append("license", "CC0_1_0");
  url.searchParams.append("license", "CC_BY_4_0");
  const data = await readJson<{ results?: Array<Record<string, unknown>> }>(url, params.signal);
  if (!Array.isArray(data.results)) throw new Error("GBIF returned an invalid occurrence response.");
  const seen = new Set<string>();
  return data.results.flatMap((record): LocationKnowledge[] => {
    const lat = coordinate(record.decimalLatitude);
    const lng = coordinate(record.decimalLongitude);
    const species = text(record.species);
    const observedAt = text(record.eventDate);
    const licenseUrl = text(record.license);
    const uncertainty = Number(record.coordinateUncertaintyInMeters);
    if (lat === undefined || lng === undefined || !species || !record.key || record.countryCode !== "HK" ||
        !observedAt || !Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) > Date.now() ||
        !/^https?:\/\/creativecommons\.org\/(?:licenses\/by\/4\.0|publicdomain\/zero\/1\.0)(?:\/|$)/.test(licenseUrl) ||
        (Number.isFinite(uncertainty) && uncertainty > 100) || distanceMeters(params.lat, params.lng, lat, lng) > radius(params) || seen.has(species)) return [];
    seen.add(species);
    return [{
      id: `gbif:${record.key}`, source: "gbif", title: `${species} observation`, category: "nature_observation",
      lat, lng, distanceMeters: Math.round(distanceMeters(params.lat, params.lng, lat, lng)), observedAt,
      text: `A GBIF occurrence record documents ${species} near this area on ${observedAt.slice(0, 10)}. This dated observation does not establish that the species is in the panorama, remains present, or is common here.`,
      url: `https://www.gbif.org/occurrence/${record.key}`,
      attribution: `${text(record.datasetName) || "Occurrence publisher"}, GBIF occurrence ${record.key}`,
      license: licenseUrl.includes("/by/") ? "CC BY 4.0" : "CC0 1.0", licenseUrl
    }];
  }).sort(byDistance).slice(0, 1);
}

async function queryRegistry(service: string, typeName: string, params: NearbyParams) {
  const box = boundingBox(params);
  const url = new URL(`https://portal.csdi.gov.hk/server/services/common/${service}/MapServer/WFSServer`);
  url.search = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: typeName,
    outputFormat: "GeoJSON", srsName: "EPSG:4326", count: "60",
    // The services have different default CRSs; declare the bbox CRS explicitly.
    bbox: `${box.minLat},${box.minLng},${box.maxLat},${box.maxLng},urn:ogc:def:crs:EPSG::4326`
  }).toString();
  const data = await readJson<{ features?: Feature[] }>(url, params.signal);
  if (!Array.isArray(data.features)) throw new Error(`${service} returned an invalid feature collection.`);
  return data.features;
}

async function readJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json, application/geo+json", "User-Agent": "HKSpatialStory/1.0 (https://neonhk.vercel.app/)" },
    signal, next: { revalidate: 86400 }
  });
  if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}.`);
  return JSON.parse((await response.text()).replace(/^\uFEFF/, "")) as T;
}

function governmentItem(source: "hk_heritage_trail" | "hk_tree" | "city_in_time", id: string, title: string,
  category: LocationKnowledge["category"], point: { lat: number; lng: number }, params: NearbyParams) {
  return { id: `${source}:${id}`, source, title, category, ...point,
    distanceMeters: Math.round(distanceMeters(params.lat, params.lng, point.lat, point.lng)),
    license: "DATA.GOV.HK Terms of Use", licenseUrl: governmentLicense };
}

function featurePoint(feature: Feature) {
  const geometry = feature.geometry;
  const coordinates = geometry?.type === "MultiPoint" ? geometry.coordinates[0] : geometry?.type === "Point" ? geometry.coordinates : undefined;
  if (!Array.isArray(coordinates)) return undefined;
  const lng = coordinate(coordinates[0]);
  const lat = coordinate(coordinates[1]);
  return lat !== undefined && lng !== undefined && isHongKongCoordinate(lat, lng) ? { lat, lng } : undefined;
}

function coordinate(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function radius(params: NearbyParams) { return Math.min(1500, Math.max(150, params.radius || 300)); }
function boundingBox(params: NearbyParams) {
  const latDelta = radius(params) / 111320;
  const lngDelta = latDelta / Math.cos(params.lat * Math.PI / 180);
  return { minLat: params.lat - latDelta, maxLat: params.lat + latDelta, minLng: params.lng - lngDelta, maxLng: params.lng + lngDelta };
}
function text(value: unknown) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
function byDistance(a: LocationKnowledge, b: LocationKnowledge) { return (a.distanceMeters || 0) - (b.distanceMeters || 0); }
