const TILE_ROOT = "https://data.map.gov.hk/api/3d-data/3dtiles/f2/";
const PROXY_ROOT = "/api/open3dhk/tiles/";

function tileUrl(path: string[]) {
  if (!path.length || path.length > 30 || path.some((part) => !/^[\w+.-]{1,180}$/.test(part) || part === "." || part === "..")) {
    throw new Error("Invalid 3D tile path");
  }
  if (!/\.(json|b3dm|i3dm|pnts|cmpt|glb|gltf|bin|png|jpe?g|webp|ktx2|dds)$/i.test(path.at(-1)!)) {
    throw new Error("Invalid 3D tile format");
  }
  return new URL(path.map(encodeURIComponent).join("/"), TILE_ROOT);
}

export function rewriteTileResources(value: unknown, base: URL): unknown {
  if (Array.isArray(value)) return value.map((entry) => rewriteTileResources(entry, base));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if ((key === "uri" || key === "url") && typeof entry === "string" && !entry.startsWith("data:")) {
      const resource = new URL(entry, base);
      if (!resource.href.startsWith(TILE_ROOT)) throw new Error("Unexpected 3D tile resource");
      const path = resource.pathname.slice(new URL(TILE_ROOT).pathname.length).split("/").map(decodeURIComponent);
      tileUrl(path);
      return [key, PROXY_ROOT + path.map(encodeURIComponent).join("/")];
    }
    return [key, rewriteTileResources(entry, base)];
  }));
}

export async function fetchOpen3dhkTile(path: string[]) {
  const url = tileUrl(path);
  const key = process.env.OPEN3DHK_API_KEY;
  if (!key) return Response.json({ error: "3D map access is not configured." }, { status: 503 });
  url.searchParams.set("key", key);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    return Response.json({ error: response.status === 401 || response.status === 403 ? "3D map access was refused." : "3D map data could not be loaded." }, { status: response.status === 404 ? 404 : 502 });
  }
  const headers = { "Cache-Control": "public, max-age=3600, s-maxage=86400", "X-Content-Type-Options": "nosniff" };
  if (/\.(json|gltf)$/i.test(url.pathname)) {
    return Response.json(rewriteTileResources(await response.json(), url), { headers });
  }
  return new Response(response.body, { headers: { ...headers, "Content-Type": response.headers.get("Content-Type") || "application/octet-stream" } });
}
