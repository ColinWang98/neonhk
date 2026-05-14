import type { LocalConcernLevel, PublicNewsItem, SpatialMatch, TemporalRelevance } from "@/types";

type NewsSearchParams = {
  lat: number;
  lng: number;
  address?: string;
  places?: Array<{ name: string; address?: string }>;
  radius?: number;
  signal?: AbortSignal;
};

type PressReleaseItem = {
  title?: string;
  content?: string;
  publishDate?: string;
  publishedDate?: string;
  date?: string;
  url?: string;
  link?: string;
};

type GdeltArticle = {
  title?: string;
  seendate?: string;
  url?: string;
  sourcecountry?: string;
  domain?: string;
  language?: string;
};

type GdeltResponse = {
  articles?: GdeltArticle[];
};

const govOfficials = ["devb", "td", "landsd", "had", "lcsp", "cedd", "hd", "hyab"];
const rthkFeeds = [
  "https://news.rthk.hk/rthk/en/rss/local.xml",
  "https://news.rthk.hk/rthk/ch/rss/local.xml"
];

export async function getPublicNewsContext(params: NewsSearchParams): Promise<PublicNewsItem[]> {
  const terms = newsTerms(params);
  if (terms.length === 0) return [];

  const [gov, rthk, gdelt] = await Promise.all([
    getGovPressReleaseNews(terms, params.signal).catch(() => []),
    getRthkNews(terms, params.signal).catch(() => []),
    getGdeltNews(terms, params.signal).catch(() => [])
  ]);

  return dedupeNews([...gov, ...rthk, ...gdelt])
    .sort((a, b) => scoreNews(b) - scoreNews(a))
    .slice(0, 8);
}

function newsTerms(params: NewsSearchParams) {
  const terms = new Set<string>();
  if (params.address) {
    const cleaned = cleanTerm(params.address.replace(/,\s*Hong Kong\s*$/i, ""));
    if (cleaned) terms.add(cleaned);
    for (const segment of cleaned.split(",")) {
      const short = cleanTerm(segment);
      if (short.length >= 4) terms.add(short);
    }
  }
  for (const place of params.places?.slice(0, 4) || []) {
    const name = cleanTerm(place.name);
    if (name.length >= 3) terms.add(name);
  }
  terms.add("Hong Kong");
  return Array.from(terms).slice(0, 8);
}

async function getGovPressReleaseNews(terms: string[], signal?: AbortSignal): Promise<PublicNewsItem[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - 18);
  const to = new Date();
  const results = (
    await Promise.all(
      govOfficials.map((official) => searchGovPressRelease(official, from, to, signal).catch(() => []))
    )
  ).flat();

  return results
    .map((item, index) => normalizeGovPressRelease(item, index, terms))
    .filter((item): item is PublicNewsItem => Boolean(item));
}

async function searchGovPressRelease(
  official: string,
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<PressReleaseItem[]> {
  const url = new URL("https://api.data.gov.hk/v1/pressrelease/search");
  url.searchParams.set("startDate", toDateParam(from));
  url.searchParams.set("endDate", toDateParam(to));
  url.searchParams.set("official", official);
  url.searchParams.set("lang", "en");
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data)) return data as PressReleaseItem[];
  if (Array.isArray(data?.results)) return data.results as PressReleaseItem[];
  if (Array.isArray(data?.pressReleases)) return data.pressReleases as PressReleaseItem[];
  return [];
}

function normalizeGovPressRelease(
  item: PressReleaseItem,
  index: number,
  terms: string[]
): PublicNewsItem | undefined {
  const title = item.title?.trim();
  if (!title) return undefined;
  const body = [title, item.content].filter(Boolean).join(" ");
  const matchedTerms = matchTerms(body, terms);
  if (!matchedTerms.length) return undefined;
  const publishedAt = item.publishDate || item.publishedDate || item.date;
  return {
    id: `gov:${stableId(title)}:${index}`,
    title,
    description: trimText(item.content, 220),
    url: item.url || item.link,
    publishedAt,
    source: "gov_press_release",
    sourceTitle: "Hong Kong Government press release",
    sourceTier: "official",
    spatialMatch: spatialMatchForTerms(matchedTerms),
    temporalRelevance: temporalRelevance(publishedAt),
    localConcernLevel: "high",
    matchedTerms
  };
}

async function getRthkNews(terms: string[], signal?: AbortSignal): Promise<PublicNewsItem[]> {
  const results = (
    await Promise.all(rthkFeeds.map((feed) => fetchRss(feed, signal).catch(() => [])))
  ).flat();
  return results
    .map((item, index) => normalizeRssItem(item, index, terms))
    .filter((item): item is PublicNewsItem => Boolean(item));
}

async function fetchRss(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, signal });
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => ({
    title: decodeXml(tag(match[0], "title")),
    description: decodeXml(tag(match[0], "description")),
    link: decodeXml(tag(match[0], "link")),
    date: decodeXml(tag(match[0], "pubDate"))
  }));
}

function normalizeRssItem(
  item: { title?: string; description?: string; link?: string; date?: string },
  index: number,
  terms: string[]
): PublicNewsItem | undefined {
  const title = item.title?.trim();
  if (!title) return undefined;
  const body = [title, item.description].filter(Boolean).join(" ");
  const matchedTerms = matchTerms(body, terms);
  if (!matchedTerms.length) return undefined;
  return {
    id: `rthk:${stableId(title)}:${index}`,
    title,
    description: trimText(item.description, 220),
    url: item.link,
    publishedAt: item.date,
    source: "rthk",
    sourceTitle: "RTHK local news",
    sourceTier: "major_news",
    spatialMatch: "area_only",
    temporalRelevance: temporalRelevance(item.date),
    localConcernLevel: "high",
    matchedTerms
  };
}

async function getGdeltNews(terms: string[], signal?: AbortSignal): Promise<PublicNewsItem[]> {
  const queryTerms = terms.filter((term) => term.toLowerCase() !== "hong kong").slice(0, 3);
  if (!queryTerms.length) return [];
  const query = `(${queryTerms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ")}) sourceCountry:HK`;
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "8");
  url.searchParams.set("sort", "HybridRel");
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) return [];
  const data = (await res.json()) as GdeltResponse;
  return (data.articles || []).map((article, index) => ({
    id: `gdelt:${stableId(article.title || article.url || "article")}:${index}`,
    title: article.title || "Hong Kong news item",
    url: article.url,
    publishedAt: article.seendate,
    source: "gdelt",
    sourceTitle: article.domain || "GDELT news index",
    sourceTier: "major_news",
    spatialMatch: "area_only" as SpatialMatch,
    temporalRelevance: temporalRelevance(article.seendate),
    localConcernLevel: "medium" as LocalConcernLevel,
    matchedTerms: matchTerms(article.title || "", terms)
  }));
}

function dedupeNews(items: PublicNewsItem[]) {
  const seen = new Map<string, PublicNewsItem>();
  for (const item of items) {
    const key = `${item.source}:${item.url || item.title.toLowerCase()}`;
    const previous = seen.get(key);
    if (!previous || scoreNews(item) > scoreNews(previous)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

function scoreNews(item: PublicNewsItem) {
  const tier = item.sourceTier === "official" ? 25 : item.sourceTier === "major_news" ? 15 : 8;
  const match = item.spatialMatch === "nearby_address" ? 20 : item.spatialMatch === "area_only" ? 8 : 0;
  const temporal = item.temporalRelevance === "current" ? 16 : item.temporalRelevance === "recent" ? 10 : item.temporalRelevance === "historical" ? 4 : 0;
  return tier + match + temporal + item.matchedTerms.length * 4;
}

function matchTerms(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.filter((term) => term.length >= 3 && lower.includes(term.toLowerCase())).slice(0, 5);
}

function spatialMatchForTerms(terms: string[]): SpatialMatch {
  return terms.some((term) => /\d/.test(term)) ? "nearby_address" : "area_only";
}

function temporalRelevance(value?: string): TemporalRelevance {
  const date = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(date)) return "unknown";
  const ageDays = (Date.now() - date) / 86400000;
  if (ageDays <= 120) return "current";
  if (ageDays <= 730) return "recent";
  return "historical";
}

function toDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cleanTerm(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function trimText(value: string | undefined, max: number) {
  if (!value) return undefined;
  const normalized = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3).replace(/\s+\S*$/, "")}...` : normalized;
}

function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeXml(value?: string) {
  return value
    ?.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "news";
}
