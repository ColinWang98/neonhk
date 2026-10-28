import { distanceMeters } from "@/lib/geoMath";
import { wikimediaUserAgent } from "@/lib/wikipedia";
import type { CommonsMedia, SourceNote } from "@/types";

type NearbyParams = { lat: number; lng: number; radius?: number; queries?: string[]; signal?: AbortSignal };
type WikiPage = {
  pageid: number;
  title: string;
  extract?: string;
  fullurl?: string;
  coordinates?: Array<{ lat: number; lon: number; primary?: boolean }>;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};
type WikiResponse = {
  error?: { info?: string };
  query?: {
    geosearch?: Array<{ pageid: number; title: string; dist: number }>;
    pages?: WikiPage[];
  };
};

export async function getNearbyWikivoyageNotes(params: NearbyParams): Promise<SourceNote[]> {
  // Guide coordinates represent districts, not shop locations or administrative boundaries.
  const nearby = await queryWiki("en.wikivoyage.org", {
    list: "geosearch", gscoord: `${params.lat}|${params.lng}`,
    gsradius: "10000", gslimit: "5", gsnamespace: "0", gsprimary: "primary"
  }, params.signal);
  const guide = (nearby.query?.geosearch || []).sort((a, b) => a.dist - b.dist)[0];
  if (!guide || guide.dist > 5000) return [];

  const result = await queryWiki("en.wikivoyage.org", {
    pageids: String(guide.pageid), prop: "extracts|info", inprop: "url",
    explaintext: "1", exchars: "1400", exlimit: "1"
  }, params.signal);
  const page = result.query?.pages?.find((item) => item.pageid === guide.pageid);
  if (!page?.extract?.trim() || !page.fullurl) return [];
  return [{
    title: page.title,
    extract: compact(page.extract, 1400),
    url: page.fullurl,
    relation: "nearby",
    source: "wikivoyage",
    distanceMeters: Math.round(guide.dist),
    attribution: `Wikivoyage contributors, ${page.title}`,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/"
  }];
}

export async function getNearbyCommonsMedia(params: NearbyParams): Promise<CommonsMedia[]> {
  const radius = Math.min(500, Math.max(100, params.radius || 300));
  const result = await queryWiki("commons.wikimedia.org", {
    generator: "geosearch", ggscoord: `${params.lat}|${params.lng}`,
    ggsradius: String(radius), ggslimit: "10", ggsnamespace: "6", ggsprimary: "primary",
    prop: "imageinfo|coordinates", coprimary: "primary", iiprop: "url|mime|extmetadata",
    iiurlwidth: "640", iiextmetadatalanguage: "en",
    iiextmetadatafilter: "ImageDescription|Artist|Credit|LicenseShortName|LicenseUrl|DateTimeOriginal|Restrictions"
  }, params.signal);
  const terms = (params.queries || []).join(" ").toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const media = (result.query?.pages || []).flatMap((page): CommonsMedia[] => {
    const info = page.imageinfo?.[0];
    const coordinates = page.coordinates?.find((item) => item.primary);
    const metadata = info?.extmetadata || {};
    const value = (key: string) => metadataText(metadata[key]?.value || "");
    const attribution = value("Artist");
    const license = value("LicenseShortName");
    const licenseUrl = value("LicenseUrl");
    if (!coordinates || !info?.mime?.startsWith("image/") || !info.url || !info.descriptionurl ||
        !attribution || !license || !licenseUrl || value("Restrictions")) return [];
    const distance = distanceMeters(params.lat, params.lng, coordinates.lat, coordinates.lon);
    if (distance > radius) return [];
    return [{
      id: `commons:${page.pageid}`,
      title: page.title.replace(/^File:/, ""),
      description: compact(value("ImageDescription"), 500),
      url: info.descriptionurl,
      imageUrl: info.url,
      thumbnailUrl: info.thumburl,
      lat: coordinates.lat,
      lng: coordinates.lon,
      distanceMeters: Math.round(distance),
      capturedAt: captureDate(value("DateTimeOriginal")),
      attribution: compact([attribution, value("Credit")].filter(Boolean).join(". "), 500),
      license,
      licenseUrl,
      source: "wikimedia_commons"
    }];
  });
  const score = (item: CommonsMedia) => {
    const text = `${item.title} ${item.description}`.toLowerCase();
    return terms.filter((term) => text.includes(term)).length * 100 - item.distanceMeters;
  };
  return media.sort((a, b) => score(b) - score(a)).slice(0, 2);
}

async function queryWiki(host: "en.wikivoyage.org" | "commons.wikimedia.org", params: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(`https://${host}/w/api.php`);
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": wikimediaUserAgent(), "Api-User-Agent": wikimediaUserAgent() },
    signal,
    next: { revalidate: 86400 }
  });
  if (!response.ok) throw new Error(`${host} returned HTTP ${response.status}.`);
  const data = await response.json() as WikiResponse;
  if (data.error) throw new Error(`${host}: ${data.error.info || "query failed"}`);
  return data;
}

function compact(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function metadataText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
    const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[entity] || ""
  ).replace(/\s+/g, " ").trim();
}

function captureDate(value: string): string | undefined {
  // Only explicit capture dates count. Upload timestamps and dates in filenames do not.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$)/);
  return match && Number.isFinite(Date.parse(match[1])) ? match[1] : undefined;
}
