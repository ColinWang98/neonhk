import { wikimediaUserAgent } from "@/lib/wikipedia";
import type { LocalEntity } from "@/types";

type SparqlBinding = {
  item?: { value?: string };
  itemLabel?: { value?: string };
  itemDescription?: { value?: string };
  distance?: { value?: string };
  coord?: { value?: string };
  article?: { value?: string };
};

type SparqlResponse = {
  results?: {
    bindings?: SparqlBinding[];
  };
};

export async function getNearbyWikidataEntities(params: {
  lat: number;
  lng: number;
  heading?: number;
  radiusKm?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<LocalEntity[]> {
  const radiusKm = Math.min(Math.max(params.radiusKm || 0.25, 0.05), 1);
  const limit = Math.min(Math.max(params.limit || 8, 1), 20);
  const query = buildNearbyQuery(params.lat, params.lng, radiusKm, limit);
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("format", "json");
  url.searchParams.set("query", query);

  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": wikimediaUserAgent(),
      "Api-User-Agent": wikimediaUserAgent()
    },
    signal: params.signal
  });

  if (!res.ok) {
    throw new Error(`Wikidata nearby lookup failed: ${res.status}`);
  }

  const data = (await res.json()) as SparqlResponse;
  const seen = new Map<string, LocalEntity>();

  for (const binding of data.results?.bindings || []) {
    const itemUrl = binding.item?.value;
    const id = itemUrl?.split("/").pop();
    const label = binding.itemLabel?.value;
    if (!id || !label || label === id) continue;

    const point = parseWikidataPoint(binding.coord?.value);
    const distanceMeters = Number(binding.distance?.value);
    const relation = relationFor(point, params.lat, params.lng, params.heading);
    const previous = seen.get(id);
    const candidate: LocalEntity = {
      id,
      label,
      description: binding.itemDescription?.value,
      distanceMeters: Number.isFinite(distanceMeters) ? Math.round(distanceMeters * 1000) : undefined,
      lat: point?.lat,
      lng: point?.lng,
      wikipediaUrl: binding.article?.value,
      wikipediaTitle: wikipediaTitleFromUrl(binding.article?.value),
      source: "wikidata",
      relation
    };

    if (!previous || (!previous.wikipediaUrl && candidate.wikipediaUrl)) {
      seen.set(id, candidate);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      const aScore = a.relation === "visible-candidate" ? 0 : 1;
      const bScore = b.relation === "visible-candidate" ? 0 : 1;
      return aScore - bScore || (a.distanceMeters || 9999) - (b.distanceMeters || 9999);
    })
    .slice(0, limit);
}

function buildNearbyQuery(lat: number, lng: number, radiusKm: number, limit: number) {
  const escapedPoint = `Point(${lng} ${lat})`;
  return `
SELECT ?item ?itemLabel ?itemDescription ?distance ?coord ?article WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "${escapedPoint}"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?distance .
  }
  OPTIONAL {
    ?article schema:about ?item ;
      schema:isPartOf ?wiki .
    FILTER(?wiki IN (<https://en.wikipedia.org/>, <https://zh.wikipedia.org/>))
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,zh-hant,zh-hk,zh".
  }
}
ORDER BY ?distance
LIMIT ${limit}
`.trim();
}

function parseWikidataPoint(value?: string) {
  const match = value?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  if (!match) return undefined;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function wikipediaTitleFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const title = url.pathname.split("/wiki/")[1];
    return title ? decodeURIComponent(title).replace(/_/g, " ") : undefined;
  } catch {
    return undefined;
  }
}

function relationFor(
  point: { lat: number; lng: number } | undefined,
  lat: number,
  lng: number,
  heading?: number
): LocalEntity["relation"] {
  if (!point || !Number.isFinite(heading)) return "nearby";
  const bearing = bearingDegrees(lat, lng, point.lat, point.lng);
  const diff = Math.abs(shortestAngleDifference(bearing, heading || 0));
  return diff <= 40 ? "visible-candidate" : "nearby";
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLng = toRadians(lng2 - lng1);
  const y = Math.sin(deltaLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function shortestAngleDifference(a: number, b: number) {
  return ((normalizeDegrees(a) - normalizeDegrees(b) + 540) % 360) - 180;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
