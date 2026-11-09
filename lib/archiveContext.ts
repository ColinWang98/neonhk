import { isHongKongCoordinate } from "@/lib/locationKnowledge";
import type { ArchiveContextItem } from "@/types";

type ArchiveSearchDocument = Record<string, unknown>;

export async function getArchiveContext(params: {
  lat: number;
  lng: number;
  placeNames: string[];
  signal?: AbortSignal;
}): Promise<ArchiveContextItem[]> {
  if (!isHongKongCoordinate(params.lat, params.lng)) return [];
  const terms = archivePlaceTerms(params.placeNames);
  if (!terms.length) return [];

  const url = new URL("https://archive.org/advancedsearch.php");
  const phrases = terms.map((term) => `"${term.replace(/[\\"]/g, " ")}"`).join(" OR ");
  url.searchParams.set("q", `(${phrases}) AND ("Hong Kong" OR "香港") AND (mediatype:texts OR mediatype:movies OR mediatype:audio OR mediatype:image) AND licenseurl:* AND NOT access-restricted-item:true`);
  for (const field of ["identifier", "title", "description", "creator", "coverage", "subject", "date", "licenseurl", "mediatype", "access-restricted-item"]) {
    url.searchParams.append("fl[]", field);
  }
  url.searchParams.set("rows", "12");
  url.searchParams.set("output", "json");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "HKSpatialStory/1.0 (https://neonhk.vercel.app/)" },
    signal: params.signal,
    next: { revalidate: 86400 }
  });
  if (!response.ok) throw new Error(`Internet Archive search failed (${response.status}).`);
  const data = await response.json() as { error?: unknown; response?: { docs?: ArchiveSearchDocument[] } };
  if (data.error || !Array.isArray(data.response?.docs)) throw new Error("Internet Archive search returned an invalid response.");

  const seen = new Set<string>();
  return data.response.docs.flatMap((doc): ArchiveContextItem[] => {
    const id = fieldText(doc.identifier);
    const title = fieldText(doc.title);
    const description = fieldText(doc.description);
    const creator = fieldText(doc.creator);
    const mediaType = fieldText(doc.mediatype);
    const license = archiveLicense(doc.licenseurl);
    const placeScope = `${title} ${fieldText(doc.coverage)} ${fieldText(doc.subject)}`;
    const scope = `${placeScope} ${description}`;
    const matchedPlace = terms.find((term) => containsPlace(placeScope, term));
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(id) || seen.has(id) || !title || !description || !creator || !license || !matchedPlace) return [];
    if (!/hong\s+kong|香港/i.test(scope) || !["texts", "movies", "audio", "image"].includes(mediaType)) return [];
    if (["true", "1"].includes(fieldText(doc["access-restricted-item"]).toLowerCase())) return [];
    seen.add(id);
    const date = fieldText(doc.date);
    return [{
      id: `internet_archive:${id}`,
      source: "internet_archive",
      title: title.slice(0, 240),
      description: description.slice(0, 900),
      url: `https://archive.org/details/${id}`,
      matchedPlace,
      mediaType,
      // This is the catalogued source date, never an upload or capture date.
      sourceDate: /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date) ? date
        : /^\d{4}-\d{2}-\d{2}T/.test(date) ? date.slice(0, 4) : undefined,
      attribution: creator.slice(0, 300),
      ...license
    }];
  }).slice(0, 2);
}

function archivePlaceTerms(names: string[]) {
  const generic = /^(?:hong kong(?: island)?|hong kong sar(?: china)?|kowloon|new territories|china|香港(?:島|岛)?|九龍|九龙|新界)$/i;
  return [...new Set(names.map((name) => name.replace(/\s+/g, " ").trim())
    .filter((name) => name.length >= (/[\u3400-\u9fff]/.test(name) ? 2 : 3) && name.length <= 100 && !generic.test(name) && !/^\d+$/.test(name)))].slice(0, 2);
}

function containsPlace(text: string, place: string) {
  if (/[^\x00-\x7f]/.test(place)) return text.toLowerCase().includes(place.toLowerCase());
  const normalize = (value: string) => ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  return normalize(text).includes(normalize(place));
}

function archiveLicense(value: unknown): Pick<ArchiveContextItem, "license" | "licenseUrl"> | undefined {
  const values = Array.isArray(value) ? value : [value];
  // Multiple or ambiguous rights statements need manual review, not an automatic import.
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  let url: URL;
  try { url = new URL(values[0]); } catch { return undefined; }
  if (!["http:", "https:"].includes(url.protocol) || !["creativecommons.org", "www.creativecommons.org"].includes(url.hostname)) return undefined;
  const path = url.pathname.replace(/\/$/, "");
  if (path === "/publicdomain/zero/1.0") return { license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
  const match = path.match(/^\/licenses\/(by|by-sa)\/(4\.0)$/);
  return match ? { license: `CC ${match[1].toUpperCase()} ${match[2]}`, licenseUrl: `https://creativecommons.org/licenses/${match[1]}/${match[2]}/` } : undefined;
}

function fieldText(value: unknown): string {
  const text = Array.isArray(value) ? value.filter((item) => typeof item === "string").join("; ") : typeof value === "string" || typeof value === "boolean" ? String(value) : "";
  return text.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
