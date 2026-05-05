export function buildGoogleStreetViewStaticUrl(params: {
  key: string;
  panoId: string;
  width: number;
  height: number;
  heading?: number;
  pitch?: number;
  fov?: number;
}) {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", `${params.width}x${params.height}`);
  url.searchParams.set("pano", params.panoId);
  url.searchParams.set("heading", String(Math.round(params.heading || 0)));
  url.searchParams.set("pitch", String(Math.round(params.pitch || 0)));
  url.searchParams.set("fov", String(params.fov || 90));
  url.searchParams.set("key", params.key);
  return url.toString();
}
