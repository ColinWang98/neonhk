import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { StreetImage } from "@/types";

type StreetViewMetadata = {
  status: string;
  pano_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
  date?: string;
  copyright?: string;
  error_message?: string;
};

export async function searchGoogleStreetView(
  lat: number,
  lng: number,
  radius = 80,
  config: RuntimeApiConfig = {}
): Promise<StreetImage[]> {
  const key = config.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;

  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  const metadataUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metadataUrl.searchParams.set("location", `${lat},${lng}`);
  metadataUrl.searchParams.set("radius", String(radius));
  metadataUrl.searchParams.set("source", "outdoor");
  metadataUrl.searchParams.set("key", key);

  const res = await fetch(metadataUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Street View metadata: ${res.status}`);
  }

  const metadata = (await res.json()) as StreetViewMetadata;
  if (metadata.status !== "OK" || !metadata.pano_id || !metadata.location) {
    throw new Error(metadata.error_message || `No Google Street View panorama found nearby (${metadata.status}).`);
  }

  const fullUrl = buildStreetViewStaticUrl({
    key,
    panoId: metadata.pano_id,
    size: "640x640",
    heading: 0,
    pitch: 0,
    fov: 90
  });
  const thumbUrl = buildStreetViewStaticUrl({
    key,
    panoId: metadata.pano_id,
    size: "640x640",
    heading: 0,
    pitch: 0,
    fov: 90
  });

  return [
    {
      id: metadata.pano_id,
      panoId: metadata.pano_id,
      provider: "google",
      lat: metadata.location.lat,
      lng: metadata.location.lng,
      capturedAt: metadata.date,
      thumbUrl,
      fullUrl
    }
  ];
}

function buildStreetViewStaticUrl(params: {
  key: string;
  panoId: string;
  size: string;
  heading: number;
  pitch: number;
  fov: number;
}) {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", params.size);
  url.searchParams.set("pano", params.panoId);
  url.searchParams.set("heading", String(params.heading));
  url.searchParams.set("pitch", String(params.pitch));
  url.searchParams.set("fov", String(params.fov));
  url.searchParams.set("key", params.key);
  return url.toString();
}
