import { viewAlignmentFromHeading } from "@/lib/geoMath";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { NearbyPlace, PlaceContext, PlaceReviewContextItem, TemporalRelevance } from "@/types";

type PlacesResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    primaryType?: string;
    types?: string[];
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
};

type PlaceDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  reviews?: Array<{
    name?: string;
    rating?: number;
    publishTime?: string;
    relativePublishTimeDescription?: string;
    text?: {
      text?: string;
      languageCode?: string;
    };
  }>;
};

type GeocodeResponse = {
  status?: string;
  results?: Array<{ formatted_address?: string }>;
  error_message?: string;
};

export async function getGooglePlaceContext(params: {
  lat: number;
  lng: number;
  heading?: number;
  headingHalfAngle?: number;
  radius?: number;
  config?: RuntimeApiConfig;
}): Promise<PlaceContext> {
  const key =
    params.config?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  const radius = Math.min(Math.max(params.radius || 90, 20), 200);
  const [address, places] = await Promise.all([
    reverseGeocode(params.lat, params.lng, key).catch(() => undefined),
    nearbyPlaces(params.lat, params.lng, radius, key).catch(() => [])
  ]);

  const rankedPlaces = places
    .map((place) => enrichPlace(place, params.lat, params.lng, params.heading, params.headingHalfAngle))
    .sort((a, b) => {
      return placeScore(b) - placeScore(a);
    })
    .slice(0, 8);

  return {
    address,
    heading: Number.isFinite(params.heading) ? normalizeDegrees(params.heading || 0) : undefined,
    places: rankedPlaces,
    uncertainty:
      "Nearby places come from Google Maps around the panorama coordinate. They may not be inside the selected crop, and should only be used as approximate local context."
  };
}

export async function getPlaceReviewContextForStory(params: {
  places?: NearbyPlace[];
  targetNames?: string[];
  config?: RuntimeApiConfig;
}): Promise<PlaceReviewContextItem[]> {
  const key =
    params.config?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  const targets = (params.targetNames || []).map(normalizeForMatch).filter(Boolean);
  if (!targets.length) return [];

  const reviewPlaces = (params.places || [])
    .filter((place) => place.id && reviewWorthyPlace(place))
    .filter((place) => targets.some((target) => placeMatchesTarget(place, target)))
    .sort((a, b) => reviewPlaceScore(b) - reviewPlaceScore(a))
    .slice(0, 2);

  const results = (
    await Promise.all(reviewPlaces.map((place) => fetchPlaceReviews(place, key).catch(() => [])))
  ).flat();

  return dedupeReviewContext(results)
    .sort((a, b) => reviewContextScore(b) - reviewContextScore(a))
    .slice(0, 3);
}

async function fetchPlaceReviews(place: NearbyPlace, key: string): Promise<PlaceReviewContextItem[]> {
  if (!place.id) return [];
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "id",
        "displayName",
        "reviews.rating",
        "reviews.publishTime",
        "reviews.relativePublishTimeDescription",
        "reviews.text"
      ].join(",")
    },
    cache: "no-store"
  });
  if (!res.ok) return [];
  const data = (await res.json()) as PlaceDetailsResponse;
  const placeName = data.displayName?.text || place.name;
  return (data.reviews || [])
    .map((review, index) => reviewToContextItem(review, index, place, placeName))
    .filter((item): item is PlaceReviewContextItem => Boolean(item));
}

function reviewToContextItem(
  review: NonNullable<PlaceDetailsResponse["reviews"]>[number],
  index: number,
  place: NearbyPlace,
  placeName: string
): PlaceReviewContextItem | undefined {
  const text = cleanReviewText(review.text?.text);
  if (!text || text.length < 35) return undefined;
  const themes = reviewThemes(text, place);
  const rating = Number(review.rating);
  if (Number.isFinite(rating) && rating < 3 && themes.length < 2) return undefined;
  if (themes.length === 0 && text.length < 80) return undefined;
  const summary = summarizeReviewThemes(placeName, themes, text);
  if (!summary) return undefined;
  return {
    id: `google_reviews:${place.id || stableId(placeName)}:${index}:${stableId(summary)}`,
    placeId: place.id,
    placeName,
    title: `${placeName} everyday review note`,
    summary,
    rating: Number.isFinite(rating) ? rating : undefined,
    publishedAt: review.publishTime,
    source: "google_reviews",
    sourceTitle: "Google Places reviews",
    sourceTier: "social",
    spatialMatch: place.viewAlignment === "inside_fragment_view" || place.relativeDirection === "ahead" ? "nearby_address" : "area_only",
    temporalRelevance: temporalRelevance(review.publishTime),
    localConcernLevel: "medium",
    matchedThemes: themes
  };
}

async function nearbyPlaces(lat: number, lng: number, radius: number, key: string): Promise<NearbyPlace[]> {
  const res = await fetchNearbyPlaces(lat, lng, radius, key);
  if (!res.ok) {
    const fallback = await fetchNearbyPlaces(lat, lng, radius, key, [
      "restaurant",
      "cafe",
      "store",
      "shopping_mall",
      "tourist_attraction"
    ]);
    if (!fallback.ok) {
      throw new Error(`Google Places context failed: ${fallback.status}`);
    }
    const data = (await fallback.json()) as PlacesResponse;
    return normalizePlacesResponse(data);
  }

  const data = (await res.json()) as PlacesResponse;
  return normalizePlacesResponse(data);
}

async function fetchNearbyPlaces(lat: number, lng: number, radius: number, key: string, includedTypes?: string[]) {
  return fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.primaryType",
        "places.types",
        "places.formattedAddress",
        "places.location"
      ].join(",")
    },
    body: JSON.stringify({
      ...(includedTypes ? { includedTypes } : {}),
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius
        }
      }
    })
  });
}

function normalizePlacesResponse(data: PlacesResponse): NearbyPlace[] {
  return (data.places || [])
    .map((place) => ({
      id: place.id,
      name: place.displayName?.text || "",
      type: place.primaryType || place.types?.[0],
      address: place.formattedAddress,
      lat: place.location?.latitude,
      lng: place.location?.longitude
    }))
    .filter((place) => place.name);
}

async function reverseGeocode(lat: number, lng: number, key: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  url.searchParams.set("region", "hk");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return undefined;

  const data = (await res.json()) as GeocodeResponse;
  if (data.status !== "OK") return undefined;
  return data.results?.[0]?.formatted_address;
}

function enrichPlace(place: NearbyPlace, lat: number, lng: number, heading?: number, headingHalfAngle?: number): NearbyPlace {
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return place;

  const bearing = bearingDegrees(lat, lng, place.lat || 0, place.lng || 0);
  const viewAlignment = viewAlignmentFromHeading(bearing, heading, headingHalfAngle);
  return {
    ...place,
    distanceMeters: Math.round(distanceMeters(lat, lng, place.lat || 0, place.lng || 0)),
    bearingFromScene: Math.round(bearing),
    headingDelta: Number.isFinite(heading) ? Math.round(Math.abs(shortestAngleDifference(bearing, heading || 0))) : undefined,
    viewAlignment,
    relativeDirection: relativeDirection(bearing, heading)
  };
}

function placeScore(place: NearbyPlace) {
  const alignmentScore =
    place.viewAlignment === "inside_fragment_view"
      ? 40
      : place.viewAlignment === "near_fragment_view"
        ? 22
        : place.relativeDirection === "ahead"
          ? 10
          : 0;
  const distanceScore = Math.max(0, 35 - Math.min(place.distanceMeters || 400, 400) / 10);
  const publicScore = /university|school|campus|hospital|station|museum|library|government|polytechnic|tourist_attraction|point_of_interest/i.test(
    `${place.name} ${place.type || ""}`
  )
    ? 14
    : 0;
  return alignmentScore + distanceScore + publicScore;
}

function reviewWorthyPlace(place: NearbyPlace) {
  const text = `${place.name} ${place.type || ""}`.toLowerCase();
  if (/restaurant|cafe|bakery|food|meal|store|shop|market|mall|university|school|campus|station|hotel|museum|tourist_attraction|point_of_interest/i.test(text)) {
    return true;
  }
  return (place.distanceMeters || 9999) <= 90 || place.relativeDirection === "ahead";
}

function placeMatchesTarget(place: NearbyPlace, normalizedTarget: string) {
  const name = normalizeForMatch(place.name);
  if (!name || !normalizedTarget) return false;
  return name.includes(normalizedTarget) ||
    normalizedTarget.includes(name) ||
    sharedMeaningfulTokens(name, normalizedTarget) >= 2 ||
    (normalizedTarget.includes("polyu") && /polytechnic|polyu/.test(name));
}

function normalizeForMatch(value?: string) {
  return (value || "")
    .toLowerCase()
    .replace(/\bthe\b/g, " ")
    .replace(/\bhong kong\b/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sharedMeaningfulTokens(a: string, b: string) {
  const stop = new Set(["hong", "kong", "the", "and", "of", "near", "around", "building"]);
  const aTokens = new Set(a.split(" ").filter((token) => token.length >= 3 && !stop.has(token)));
  return b.split(" ").filter((token) => aTokens.has(token)).length;
}

function reviewPlaceScore(place: NearbyPlace) {
  return placeScore(place) +
    (/restaurant|cafe|bakery|food|meal|store|shop|market/i.test(`${place.type || ""} ${place.name}`) ? 16 : 0) +
    (/university|school|campus|polytechnic/i.test(`${place.type || ""} ${place.name}`) ? 14 : 0);
}

function reviewThemes(text: string, place: NearbyPlace) {
  const lower = text.toLowerCase();
  const themes = new Set<string>();
  const checks: Array<[string, RegExp]> = [
    ["food", /food|taste|tasty|delicious|meal|lunch|dinner|breakfast|snack|egg waffle|tea|coffee|canteen|restaurant|menu|dish|portion|price|cheap|expensive/],
    ["queue", /queue|line|wait|waiting|crowd|busy|packed|rush|slow|fast/],
    ["service", /service|staff|friendly|rude|helpful|owner|cashier/],
    ["student life", /student|campus|class|course|study|project|exam|school|university|poly|polyu|canteen/],
    ["wayfinding", /location|entrance|exit|mtr|station|bus|walk|easy to find|hard to find|near/],
    ["comfort", /clean|seat|seating|air con|air-conditioning|rain|covered|quiet|noisy/],
    ["everyday errand", /buy|shopping|pharmacy|market|daily|regular|often|always|visit|local/]
  ];
  for (const [theme, pattern] of checks) {
    if (pattern.test(lower)) themes.add(theme);
  }
  if (/restaurant|cafe|bakery|food|meal/i.test(place.type || "")) themes.add("food");
  if (/university|school|campus|polytechnic/i.test(`${place.name} ${place.type || ""}`)) themes.add("student life");
  if (/station|transit|bus|subway/i.test(place.type || "")) themes.add("wayfinding");
  return Array.from(themes).slice(0, 4);
}

function summarizeReviewThemes(placeName: string, themes: string[], text: string) {
  if (!themes.length) return undefined;
  const themeText = listPhrase(themes);
  const concrete = concreteReviewPhrase(text);
  return `Public Google reviews for ${placeName} mention ${themeText}${concrete ? `, especially ${concrete}` : ""}. Treat this as everyday visitor talk, not as proof about the selected fragment.`;
}

function concreteReviewPhrase(text: string) {
  const lower = text.toLowerCase();
  if (/canteen|student|campus|class|project|exam|course/.test(lower)) return "student routines around campus";
  if (/egg waffle|snack|tea|coffee|lunch|dinner|meal|food|taste|delicious|portion|price/.test(lower)) return "food, price, and quick stops";
  if (/queue|line|wait|busy|crowd|packed|rush/.test(lower)) return "queues and busy timing";
  if (/staff|service|friendly|helpful|cashier/.test(lower)) return "service encounters";
  if (/mtr|station|bus|entrance|exit|walk|location/.test(lower)) return "finding the way in and out";
  return undefined;
}

function listPhrase(items: string[]) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function cleanReviewText(value?: string) {
  return value
    ?.replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]+/g, " ")
    .trim()
    .slice(0, 700);
}

function temporalRelevance(value?: string): TemporalRelevance {
  if (!value) return "unknown";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "unknown";
  const ageDays = (Date.now() - time) / (24 * 60 * 60 * 1000);
  if (ageDays <= 180) return "recent";
  if (ageDays <= 900) return "historical";
  return "unknown";
}

function relativeDirection(bearing: number, heading?: number): NearbyPlace["relativeDirection"] {
  if (!Number.isFinite(heading)) return "nearby";
  const diff = Math.abs(shortestAngleDifference(bearing, heading || 0));
  if (diff <= 45) return "ahead";
  if (diff >= 135) return "behind";
  return shortestAngleDifference(bearing, heading || 0) > 0 ? "right" : "left";
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLng = toRadians(lng2 - lng1);
  const y = Math.sin(deltaLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

function dedupeReviewContext(items: PlaceReviewContextItem[]) {
  const seen = new Map<string, PlaceReviewContextItem>();
  for (const item of items) {
    const key = `${item.placeName.toLowerCase()}:${item.summary.toLowerCase()}`;
    const previous = seen.get(key);
    if (!previous || reviewContextScore(item) > reviewContextScore(previous)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

function reviewContextScore(item: PlaceReviewContextItem) {
  return (item.rating || 3) * 0.12 + item.matchedThemes.length * 0.18 + (item.temporalRelevance === "recent" ? 0.08 : 0);
}

function stableId(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
