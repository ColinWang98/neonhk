import { createHmac, timingSafeEqual } from "node:crypto";
import type { StreetImage } from "@/types";

// These are the authentication and search calls used by LandsD's MMS SDK.
const api = "https://services1.map.gov.hk/api/mms";
const shareCode = "27d88cc930e04197b6097d3e67404728";
let authentication: { key: string; expires: number; token: string; layerIds: string[] } | undefined;

function apiKey() {
  const key = process.env.OPEN3DHK_API_KEY?.trim();
  if (!key) throw new Error("OPEN3DHK_API_KEY is not configured.");
  return key;
}

async function apiJson(path: string, key: string, token?: string, body?: unknown) {
  const url = new URL(`${api}${path}`);
  url.searchParams.set("key", key);
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json;charset=UTF-8", ...(token ? { token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Streetscape 360 service returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.code !== 0 || !result.data) {
    throw new Error(`Streetscape 360 request was rejected (${result.code ?? "unknown"}). Check the API key's service permissions.`);
  }
  return result.data;
}

async function authenticate() {
  const key = apiKey();
  if (authentication?.key === key && authentication.expires > Date.now()) return authentication;
  const workspace = await apiJson(`/sys/workspace/share/check/link?shareCode=${shareCode}`, key);
  if (!workspace.token || !workspace.workspaceId) throw new Error("Streetscape 360 authentication returned no workspace.");
  const layers = await apiJson(`/sys/layer/listByWorkspace?workspaceId=${encodeURIComponent(workspace.workspaceId)}`, key, workspace.token);
  const layerIds = layers.filter((layer: { category: string }) => layer.category === "PANORAMA")
    .map((layer: { layerId: string }) => layer.layerId);
  if (!layerIds.length) throw new Error("Streetscape 360 returned no panorama layers.");
  authentication = { key, token: workspace.token, layerIds, expires: Date.now() + 10 * 60 * 1000 };
  return authentication;
}

type Pano = {
  panoId: string | number;
  panoName: string;
  url: string;
  geom: string;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  z?: number;
};

export async function searchOpen3dhk(lat: number, lng: number, radius: number, panoId?: string): Promise<StreetImage[]> {
  const auth = await authenticate();
  const delta = radius / 111320;
  const longitudeDelta = delta / Math.cos(lat * Math.PI / 180);
  const locationUrl = new URL("https://3d.map.gov.hk/geoserver/cite/wfs");
  locationUrl.search = new URLSearchParams({
    service: "WFS", version: "1.0.0", request: "GetFeature", typeName: "cite:VMMS_PT",
    outputFormat: "application/json", srsName: "EPSG:4326", maxFeatures: "2000", propertyName: "geom",
    bbox: `${lng - longitudeDelta},${lat - delta},${lng + longitudeDelta},${lat + delta},EPSG:4326`
  }).toString();
  const response = await fetch(locationUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Streetscape 360 location search returned HTTP ${response.status}.`);
  const locations = await response.json();
  const features = locations.features as Array<{ geometry: { coordinates: number[] }; properties: { dateStr?: string } }>;
  if (!Array.isArray(features)) throw new Error("Streetscape 360 location search returned invalid data.");
  const nearest = features.sort((a, b) => distance(lat, lng, a.geometry.coordinates) - distance(lat, lng, b.geometry.coordinates))[0];
  if (!nearest) return [];
  const [x, y, z] = nearest.geometry.coordinates;
  const panos = await apiJson("/sys/pano/search/nearby", auth.key, auth.token, { layerId: auth.layerIds, x, y, z });
  if (!Array.isArray(panos)) throw new Error("Streetscape 360 returned invalid panorama data.");
  return (panos as Pano[]).map((pano) => {
    const coordinates = JSON.parse(pano.geom).coordinates as number[];
    return { pano, coordinates, meters: distance(lat, lng, coordinates) };
  }).filter(({ pano, meters }) => meters <= radius && (!panoId || String(pano.panoId) === panoId))
    .sort((a, b) => a.meters - b.meters).slice(0, 8).map(({ pano, coordinates }) => {
      const source = new URL(pano.url, `${api}/`);
      // The SDK resolves root-relative paths against its API host, not the site's origin.
      if (pano.url.startsWith("/")) source.href = `${api}${pano.url}`;
      source.search = "";
      const folderUrl = signAsset(source.href);
      return {
        id: `open3dhk:${pano.panoId}`, panoId: String(pano.panoId), provider: "open3dhk",
        lat: coordinates[1], lng: coordinates[0], thumbUrl: "",
        open3dhk: { folderUrl, panoName: String(pano.panoName), rotationX: pano.rotationX || 0,
          rotationY: pano.rotationY || 0, rotationZ: pano.rotationZ || 0, x: 0, y: 0, z: pano.z || coordinates[2] || 0 }
      };
    });
}

function distance(lat: number, lng: number, coordinates: number[]) {
  const radians = Math.PI / 180;
  const a = Math.sin((coordinates[1] - lat) * radians / 2) ** 2 +
    Math.cos(lat * radians) * Math.cos(coordinates[1] * radians) * Math.sin((coordinates[0] - lng) * radians / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkedAssetUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["services1.map.gov.hk", "data.map.gov.hk"].includes(url.hostname) ||
      !/^\/api\/(mms\/|3d-mms-data\/)/.test(url.pathname) || url.username || url.password || url.port) {
    throw new Error("Streetscape 360 returned an unsupported imagery URL.");
  }
  return url;
}

function signAsset(value: string) {
  const url = checkedAssetUrl(value);
  const payload = Buffer.from(JSON.stringify({ url: url.href, expires: Date.now() + 6 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", apiKey()).update(payload).digest("base64url");
  const name = url.pathname.split("/").pop() || "panorama";
  return `/api/open3dhk/asset/${payload}.${signature}/${encodeURIComponent(name)}`;
}

export async function fetchOpen3dhkAsset(parts: string[], range: string | null) {
  const [payload, signature] = (parts[0] || "").split(".");
  if (!payload || !signature || payload.length > 4096) throw new Error("Invalid Streetscape imagery reference.");
  const expected = createHmac("sha256", apiKey()).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid Streetscape imagery signature.");
  const signed = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (signed.expires < Date.now()) throw new Error("Streetscape imagery reference expired. Reopen this scene from the map.");
  const url = checkedAssetUrl(signed.url);
  const suffix = parts.slice(2).join("/");
  if (suffix) {
    if (!/^r[0-2]\/[\w-]+_(px|nx|py|ny|pz|nz)_r[0-2]_[01]_[01]\.pano$/.test(suffix)) throw new Error("Invalid Streetscape tile path.");
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${suffix}`;
  }
  if (range) {
    const match = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!match || Number(match[2]) < Number(match[1]) || Number(match[2]) - Number(match[1]) > 16 * 1024 * 1024) {
      throw new Error("Invalid imagery byte range.");
    }
  }
  const auth = await authenticate();
  url.searchParams.set("key", auth.key);
  url.searchParams.set("token", auth.token);
  const response = await fetch(url, {
    headers: { token: auth.token, ...(range ? { Range: range } : {}) },
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000)
  });
  if (range && response.ok && response.status !== 206) {
    await response.body?.cancel();
    throw new Error("Streetscape imagery did not honour the requested byte range.");
  }
  return response;
}
