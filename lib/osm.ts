import { bearingDegrees, distanceMeters, rayIntersectsLatLngPolygon, relativeDirectionFromHeading, viewAlignmentFromHeading } from "@/lib/geoMath";
import type { PublicDataCandidate } from "@/types";

type OverpassElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

const osmTagKeys = ["shop", "amenity", "tourism", "historic", "leisure", "public_transport", "railway", "office", "building"];

export async function getNearbyOsmCandidates(params: {
  lat: number;
  lng: number;
  heading?: number;
  headingHalfAngle?: number;
  radius?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PublicDataCandidate[]> {
  const radius = Math.min(Math.max(params.radius || 120, 30), 250);
  const limit = Math.min(Math.max(params.limit || 12, 1), 30);
  const query = buildOverpassQuery(params.lat, params.lng, radius);
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "HKSpatialStory/1.0 (https://neonhk.vercel.app/)"
    },
    body: new URLSearchParams({ data: query }),
    signal: params.signal
  });

  if (!res.ok) {
    throw new Error(`OSM nearby lookup failed: ${res.status}`);
  }

  const data = (await res.json()) as OverpassResponse;
  const seen = new Map<string, PublicDataCandidate>();

  for (const element of data.elements || []) {
    const tags = element.tags || {};
    const label = tags.name || tags["name:en"] || tags["name:zh"] || tags.operator;
    const category = categoryFromTags(tags);
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!label || !category || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const bearing = bearingDegrees(params.lat, params.lng, lat || 0, lng || 0);
    const distance = distanceMeters(params.lat, params.lng, lat || 0, lng || 0);
    const relativeDirection = relativeDirectionFromHeading(bearing, params.heading);
    const viewAlignment = viewAlignmentFromHeading(bearing, params.heading, params.headingHalfAngle);
    const polygon = (element.geometry || [])
      .map((point) => ({ lat: point.lat, lng: point.lon }))
      .filter((point): point is { lat: number; lng: number } => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const footprintHit = rayIntersectsLatLngPolygon({
      originLat: params.lat,
      originLng: params.lng,
      heading: params.heading,
      polygon,
      maxDistanceMeters: Math.min(Math.max(radius, 160), 320)
    });
    const relation =
      footprintHit || ((viewAlignment === "inside_fragment_view" || relativeDirection === "ahead") && distance <= 120)
        ? "visible-candidate"
        : "nearby";
    const id = `osm:${element.type}:${element.id}`;

    seen.set(id, {
      id,
      label,
      category,
      address: osmAddress(tags),
      lat,
      lng,
      distanceMeters: Math.round(distance),
      bearingFromScene: Math.round(bearing),
      headingDelta: Number.isFinite(params.heading)
        ? Math.round(Math.abs((((bearing - (params.heading || 0) + 540) % 360) - 180)))
        : undefined,
      viewAlignment,
      spatialMatch: footprintHit
        ? "footprint_intersection"
        : viewAlignment === "inside_fragment_view" || viewAlignment === "near_fragment_view"
          ? "view_cone"
          : "centroid",
      relativeDirection,
      source: "osm",
      relation
    });
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      const aScore = a.relation === "visible-candidate" ? 0 : 1;
      const bScore = b.relation === "visible-candidate" ? 0 : 1;
      return aScore - bScore || (a.distanceMeters || 9999) - (b.distanceMeters || 9999);
    })
    .slice(0, limit);
}

function buildOverpassQuery(lat: number, lng: number, radius: number) {
  const tagFilters = osmTagKeys.map((key) => `node(around:${radius},${lat},${lng})["${key}"]["name"];way(around:${radius},${lat},${lng})["${key}"]["name"];relation(around:${radius},${lat},${lng})["${key}"]["name"];`).join("\n");
  return `
[out:json][timeout:6];
(
${tagFilters}
);
out center geom tags 40;
`.trim();
}

function categoryFromTags(tags: Record<string, string>) {
  for (const key of osmTagKeys) {
    if (tags[key]) return `${key}:${tags[key]}`;
  }
  return undefined;
}

function osmAddress(tags: Record<string, string>) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:district"],
    tags["addr:city"]
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}
