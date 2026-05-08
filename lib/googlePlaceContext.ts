import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { NearbyPlace, PlaceContext } from "@/types";

type PlacesResponse = {
  places?: Array<{
    displayName?: { text?: string };
    primaryType?: string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
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
    .map((place) => enrichPlace(place, params.lat, params.lng, params.heading))
    .sort((a, b) => {
      const aDirectionScore = a.relativeDirection === "ahead" ? 0 : a.relativeDirection === "nearby" ? 1 : 2;
      const bDirectionScore = b.relativeDirection === "ahead" ? 0 : b.relativeDirection === "nearby" ? 1 : 2;
      return aDirectionScore - bDirectionScore || (a.distanceMeters || 9999) - (b.distanceMeters || 9999);
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

async function nearbyPlaces(lat: number, lng: number, radius: number, key: string): Promise<NearbyPlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.displayName",
        "places.primaryType",
        "places.formattedAddress",
        "places.location"
      ].join(",")
    },
    body: JSON.stringify({
      includedTypes: ["restaurant", "cafe", "store"],
      maxResultCount: 10,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius
        }
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Google Places context failed: ${res.status}`);
  }

  const data = (await res.json()) as PlacesResponse;
  return (data.places || [])
    .map((place) => ({
      name: place.displayName?.text || "",
      type: place.primaryType,
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

function enrichPlace(place: NearbyPlace, lat: number, lng: number, heading?: number): NearbyPlace {
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return place;

  const bearing = bearingDegrees(lat, lng, place.lat || 0, place.lng || 0);
  return {
    ...place,
    distanceMeters: Math.round(distanceMeters(lat, lng, place.lat || 0, place.lng || 0)),
    bearingFromScene: Math.round(bearing),
    relativeDirection: relativeDirection(bearing, heading)
  };
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
