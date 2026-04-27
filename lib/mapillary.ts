import { makeBbox } from "@/lib/coordinateUtils";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { StreetImage } from "@/types";

type MapillaryImage = {
  id: string;
  geometry?: {
    coordinates?: [number, number];
  };
  thumb_1024_url?: string;
  thumb_2048_url?: string;
  computed_compass_angle?: number;
  captured_at?: string;
};

export async function searchMapillaryImages(
  lat: number,
  lng: number,
  radius = 100,
  config: RuntimeApiConfig = {}
): Promise<StreetImage[]> {
  const token =
    config.mapillaryAccessToken ||
    process.env.MAPILLARY_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN;

  if (!token) {
    throw new Error("MAPILLARY_ACCESS_TOKEN is not configured.");
  }

  const fields = [
    "id",
    "geometry",
    "thumb_1024_url",
    "thumb_2048_url",
    "computed_compass_angle",
    "captured_at"
  ].join(",");

  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);
  url.searchParams.set("bbox", makeBbox(lat, lng, radius));
  url.searchParams.set("limit", "60");

  const res = await fetch(url, { next: { revalidate: 60 } });

  if (!res.ok) {
    throw new Error(`Failed to fetch Mapillary images: ${res.status}`);
  }

  const data = (await res.json()) as { data?: MapillaryImage[] };

  return (data.data || [])
    .filter((item) => item.geometry?.coordinates && item.thumb_1024_url)
    .map((item) => ({
      id: item.id,
      provider: "mapillary" as const,
      lat: item.geometry!.coordinates![1],
      lng: item.geometry!.coordinates![0],
      compassAngle: item.computed_compass_angle,
      capturedAt: item.captured_at,
      thumbUrl: item.thumb_1024_url!,
      fullUrl: item.thumb_2048_url || item.thumb_1024_url
    }));
}
