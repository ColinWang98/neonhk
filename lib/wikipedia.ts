import type { SourceNote } from "@/types";

type WikipediaSummary = {
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

export async function getWikipediaSummary(
  articleUrl: string,
  relatedEntityId: string,
  relation: SourceNote["relation"],
  signal?: AbortSignal
): Promise<SourceNote | undefined> {
  const parsed = parseWikipediaArticleUrl(articleUrl);
  if (!parsed) return undefined;

  const apiUrl = new URL(`https://${parsed.host}/api/rest_v1/page/summary/${encodeURIComponent(parsed.title)}`);
  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": wikimediaUserAgent(),
      "Api-User-Agent": wikimediaUserAgent()
    },
    signal
  });

  if (!res.ok) return undefined;

  const data = (await res.json()) as WikipediaSummary;
  const extract = trimExtract(data.extract);
  if (!data.title || !extract) return undefined;

  return {
    title: data.title,
    extract,
    url: data.content_urls?.desktop?.page || articleUrl,
    relatedEntityId,
    relation,
    source: "wikipedia"
  };
}

function parseWikipediaArticleUrl(articleUrl: string) {
  try {
    const url = new URL(articleUrl);
    if (!url.hostname.endsWith(".wikipedia.org")) return undefined;
    const marker = "/wiki/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return undefined;

    return {
      host: url.hostname,
      title: decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
    };
  } catch {
    return undefined;
  }
}

function trimExtract(extract?: string) {
  if (!extract) return undefined;
  const normalized = extract.replace(/\s+/g, " ").trim();
  if (normalized.length <= 360) return normalized;
  return `${normalized.slice(0, 357).replace(/\s+\S*$/, "")}...`;
}

export function wikimediaUserAgent() {
  return process.env.WIKIMEDIA_USER_AGENT || "HKSpatialStory/1.0 (https://neonhk.vercel.app/)";
}
