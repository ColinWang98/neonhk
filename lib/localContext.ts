import { getGooglePlaceContext } from "@/lib/googlePlaceContext";
import { getHongKongLocationSearchCandidates, getNearbyHongKongPublicDataCandidates } from "@/lib/hkPublicData";
import { getNearbyOsmCandidates } from "@/lib/osm";
import { getPublicNewsContext } from "@/lib/publicNews";
import { getNearbyWikidataEntities } from "@/lib/wikidata";
import { getWikipediaSummary } from "@/lib/wikipedia";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { NearbyPlace, PlaceContext, PublicDataCandidate, SourceNote } from "@/types";

const localContextLimits = {
  osmCandidates: 10,
  publicDataCandidates: 8,
  locationSearchCandidates: 6,
  wikidataEntities: 6,
  wikidataArticles: 3,
  publicCandidateTotal: 10,
  publicPlaces: 6,
  placesTotal: 12
};

export async function getLocalContext(params: {
  lat: number;
  lng: number;
  heading?: number;
  headingHalfAngle?: number;
  radius?: number;
  queries?: string[];
  config?: RuntimeApiConfig;
}): Promise<PlaceContext> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const [googleContext, osmCandidates, landsdCandidates, wikidataEntities] = await Promise.all([
      getGooglePlaceContext(params).catch(() => undefined),
      getNearbyOsmCandidates({
        lat: params.lat,
        lng: params.lng,
        heading: params.heading,
        headingHalfAngle: params.headingHalfAngle,
        radius: params.radius,
        limit: localContextLimits.osmCandidates,
        signal: controller.signal
      }).catch(() => []),
      getNearbyHongKongPublicDataCandidates({
        lat: params.lat,
        lng: params.lng,
        heading: params.heading,
        headingHalfAngle: params.headingHalfAngle,
        radius: params.radius,
        limit: localContextLimits.publicDataCandidates,
        signal: controller.signal
      }).catch(() => []),
      getNearbyWikidataEntities({
        lat: params.lat,
        lng: params.lng,
        heading: params.heading,
        radiusKm: Math.min(Math.max((params.radius || 150) / 1000, 0.1), 0.5),
        limit: localContextLimits.wikidataEntities,
        signal: controller.signal
      }).catch(() => [])
    ]);

    const entitiesWithArticles = wikidataEntities.filter((entity) => entity.wikipediaUrl).slice(0, localContextLimits.wikidataArticles);
    const locationSearchCandidates = await getHongKongLocationSearchCandidates({
      lat: params.lat,
      lng: params.lng,
      heading: params.heading,
      headingHalfAngle: params.headingHalfAngle,
      radius: params.radius,
      limit: localContextLimits.locationSearchCandidates,
      queries: locationSearchQueries(googleContext, params.queries),
      signal: controller.signal
    }).catch(() => []);
    const publicDataCandidates = rankPublicCandidates([...osmCandidates, ...landsdCandidates, ...locationSearchCandidates])
      .slice(0, localContextLimits.publicCandidateTotal);
    const publicPlaces = publicDataCandidates.slice(0, localContextLimits.publicPlaces).map(publicCandidateToNearbyPlace);
    const [sourceNotes, publicNewsContext] = await Promise.all([
      Promise.all(
        entitiesWithArticles.map((entity) =>
          getWikipediaSummary(entity.wikipediaUrl || "", entity.id, entity.relation, controller.signal).catch(
            () => undefined
          )
        )
      ).then((notes) => notes.filter((note): note is SourceNote => Boolean(note))),
      getPublicNewsContext({
        lat: params.lat,
        lng: params.lng,
        address: googleContext?.address,
        places: [...(googleContext?.places || []), ...publicPlaces],
        radius: params.radius,
        signal: controller.signal
      }).catch(() => [])
    ]);

    return {
      address: googleContext?.address,
      heading: googleContext?.heading ?? (Number.isFinite(params.heading) ? normalizeDegrees(params.heading || 0) : undefined),
      places: [...(googleContext?.places || []), ...publicPlaces].slice(0, localContextLimits.placesTotal),
      publicDataCandidates,
      publicNewsContext,
      wikidataEntities,
      sourceNotes,
      uncertainty:
        "Google Maps places, OpenStreetMap features, Hong Kong CSDI public-data candidates, Wikidata entities, Wikipedia notes, and nearby public news are approximate context around the panorama coordinate. They may be near the street view point rather than inside the selected crop, so stories must connect them cautiously."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function rankPublicCandidates(candidates: PublicDataCandidate[]) {
  const seen = new Map<string, PublicDataCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.label.toLowerCase()}:${candidate.category || ""}`;
    const previous = seen.get(key);
    if (!previous || scoreCandidate(candidate) > scoreCandidate(previous)) {
      seen.set(key, candidate);
    }
  }
  return Array.from(seen.values()).sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
}

function scoreCandidate(candidate: PublicDataCandidate) {
  const relationScore = candidate.relation === "visible-candidate" ? 40 : 0;
  const sourceScore = candidate.source === "hk_landsd" ? 8 : 6;
  const distanceScore = Math.max(0, 30 - Math.min(candidate.distanceMeters || 300, 300) / 10);
  const directionScore =
    candidate.spatialMatch === "footprint_intersection"
      ? 45
      : candidate.viewAlignment === "inside_fragment_view"
      ? 28
      : candidate.viewAlignment === "near_fragment_view"
        ? 16
        : candidate.relativeDirection === "ahead"
          ? 12
          : candidate.relativeDirection === "nearby"
            ? 4
            : 0;
  const publicBuildingScore = /university|school|campus|hospital|station|museum|library|government|polytechnic|building/i.test(
    `${candidate.label} ${candidate.category || ""}`
  )
    ? 10
    : 0;
  return relationScore + sourceScore + distanceScore + directionScore + publicBuildingScore;
}

function publicCandidateToNearbyPlace(candidate: PublicDataCandidate): NearbyPlace {
  return {
    id: candidate.id,
    name: candidate.label,
    type: candidate.category,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    distanceMeters: candidate.distanceMeters,
    bearingFromScene: candidate.bearingFromScene,
    headingDelta: candidate.headingDelta,
    viewAlignment: candidate.viewAlignment,
    spatialMatch: candidate.spatialMatch,
    relativeDirection: candidate.relativeDirection,
    source: candidate.source
  };
}

function locationSearchQueries(googleContext: PlaceContext | undefined, extraQueries: string[] = []) {
  const queries = new Set<string>();
  for (const query of extraQueries) {
    if (query.trim().length >= 3) queries.add(query.trim());
  }
  if (googleContext?.address) queries.add(shortenAddress(googleContext.address));
  for (const place of googleContext?.places?.slice(0, 2) || []) {
    if (place.name) queries.add(place.name);
  }
  return Array.from(queries);
}

function shortenAddress(address: string) {
  return address
    .replace(/,\s*Hong Kong\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
