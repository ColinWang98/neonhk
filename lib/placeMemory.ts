import { generateEmbeddings } from "@/lib/embeddings";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  AllowedNarrativeUse,
  ContextCandidate,
  EvidenceClaim,
  EvidencePacket,
  SourceTier,
  VisibilityStatus
} from "@/types";

type PlaceMemoryRow = {
  id: string;
  session_id?: string | null;
  fragment_id?: string | null;
  lat: number;
  lng: number;
  heading?: number | null;
  source: string;
  source_tier?: SourceTier | null;
  claim_type?: string | null;
  allowed_use: AllowedNarrativeUse;
  visibility_status?: VisibilityStatus | null;
  confidence: number;
  label?: string | null;
  category?: string | null;
  text: string;
  url?: string | null;
  published_at?: string | null;
  metadata?: Record<string, unknown> | null;
  similarity?: number | null;
  distance_meters?: number | null;
  expires_at?: string | null;
};

type MemoryInsert = {
  dedupe_key: string;
  session_id?: string;
  fragment_id?: string;
  lat: number;
  lng: number;
  heading?: number;
  source: string;
  source_tier?: SourceTier;
  claim_type?: string;
  allowed_use: AllowedNarrativeUse;
  visibility_status?: VisibilityStatus;
  confidence: number;
  label?: string;
  category?: string;
  text: string;
  url?: string;
  published_at?: string;
  metadata?: Record<string, unknown>;
  embedding?: string | null;
  expires_at?: string;
};

export async function retrievePlaceMemoryCandidates(params: {
  lat: number;
  lng: number;
  heading?: number;
  radius?: number;
  queryTerms?: string[];
  config?: RuntimeApiConfig;
  limit?: number;
}): Promise<ContextCandidate[]> {
  const supabase = getSupabaseAdmin(params.config || {});
  if (!supabase) return [];

  const queryText = buildMemoryQueryText(params.queryTerms);
  const embedding = queryText ? await generateEmbeddings([queryText], params.config).then((vectors) => vectors?.[0]).catch((error) => {
    console.warn("[place.memory] embedding_query_failed", { message: error instanceof Error ? error.message : String(error) });
    return undefined;
  }) : undefined;

  const radius = params.radius || 300;
  const limit = params.limit || 8;
  const rows = embedding
    ? await retrieveByVector({ lat: params.lat, lng: params.lng, radius, embedding, limit, config: params.config })
    : await retrieveByBoundingBox({ lat: params.lat, lng: params.lng, radius, limit, config: params.config });

  return dedupeMemoryCandidates(
    rows
      .filter((row) => !row.expires_at || Date.parse(row.expires_at) > Date.now())
      .map((row) => rowToContextCandidate(row, params.lat, params.lng, params.heading))
      .filter((candidate): candidate is ContextCandidate => Boolean(candidate))
  ).slice(0, limit);
}

export async function rememberEvidencePacket(params: {
  sessionId?: string;
  fragmentId: string;
  evidencePacket: EvidencePacket;
  config?: RuntimeApiConfig;
}) {
  const supabase = getSupabaseAdmin(params.config || {});
  const lat = params.evidencePacket.pano.lat;
  const lng = params.evidencePacket.pano.lng;
  if (!supabase || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const claims = reusableClaims(params.evidencePacket.claims).slice(0, 10);
  if (!claims.length) return;

  const texts = claims.map((claim) => memoryTextForClaim(claim));
  const vectors = await generateEmbeddings(texts, params.config).catch((error) => {
    console.warn("[place.memory] embedding_write_failed", { message: error instanceof Error ? error.message : String(error) });
    return undefined;
  });

  const rows: MemoryInsert[] = claims.map((claim, index) => {
    const label = claimLabel(claim);
    return {
      dedupe_key: dedupeKey(params.evidencePacket, claim, label),
      session_id: params.sessionId,
      fragment_id: params.fragmentId,
      lat: lat || 0,
      lng: lng || 0,
      heading: params.evidencePacket.pano.heading,
      source: claim.source,
      source_tier: claim.sourceTier,
      claim_type: claim.claimType,
      allowed_use: claim.allowedUse,
      visibility_status: claim.visibilityStatus,
      confidence: claim.confidence,
      label,
      category: claim.claimType,
      text: texts[index],
      url: claim.url,
      published_at: claim.publishedAt,
      metadata: {
        packetId: params.evidencePacket.packetId,
        claimId: claim.id,
        fragmentCategory: params.evidencePacket.fragment.fragmentCategory,
        spatialMatch: claim.spatialMatch,
        temporalRelevance: claim.temporalRelevance,
        localConcernLevel: claim.localConcernLevel,
        relatedSchemas: claim.relatedSchemas
      },
      embedding: vectors?.[index] ? vectorLiteral(vectors[index]) : null,
      expires_at: expiresAtForClaim(claim)
    };
  });

  const { error } = await supabase
    .from("place_memory_items")
    .upsert(rows, { onConflict: "dedupe_key" });
  if (error) {
    console.warn("[place.memory] upsert_failed", { message: error.message });
  }
}

async function retrieveByVector(params: {
  lat: number;
  lng: number;
  radius: number;
  embedding: number[];
  limit: number;
  config?: RuntimeApiConfig;
}): Promise<PlaceMemoryRow[]> {
  const supabase = getSupabaseAdmin(params.config || {});
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("match_place_memory_items", {
    query_embedding: vectorLiteral(params.embedding),
    match_lat: params.lat,
    match_lng: params.lng,
    radius_meters: params.radius,
    match_count: params.limit
  });
  if (error) {
    console.warn("[place.memory] vector_retrieve_failed", { message: error.message });
    return retrieveByBoundingBox(params);
  }
  return (data || []) as PlaceMemoryRow[];
}

async function retrieveByBoundingBox(params: {
  lat: number;
  lng: number;
  radius: number;
  limit: number;
  config?: RuntimeApiConfig;
}): Promise<PlaceMemoryRow[]> {
  const supabase = getSupabaseAdmin(params.config || {});
  if (!supabase) return [];
  const box = boundingBox(params.lat, params.lng, params.radius);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("place_memory_items")
    .select("id, session_id, fragment_id, lat, lng, heading, source, source_tier, claim_type, allowed_use, visibility_status, confidence, label, category, text, url, published_at, metadata, expires_at")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("confidence", { ascending: false })
    .limit(params.limit * 2);
  if (error) {
    console.warn("[place.memory] bbox_retrieve_failed", { message: error.message });
    return [];
  }
  return ((data || []) as PlaceMemoryRow[])
    .map((row) => ({
      ...row,
      distance_meters: distanceMeters(params.lat, params.lng, row.lat, row.lng)
    }))
    .filter((row) => (row.distance_meters || 0) <= params.radius)
    .sort((a, b) => memorySortScore(b) - memorySortScore(a))
    .slice(0, params.limit);
}

function rowToContextCandidate(
  row: PlaceMemoryRow,
  lat: number,
  lng: number,
  heading?: number
): ContextCandidate | undefined {
  if (!row.text?.trim()) return undefined;
  const distance = row.distance_meters ?? distanceMeters(lat, lng, row.lat, row.lng);
  const bearing = bearingDegrees(lat, lng, row.lat, row.lng);
  const headingDelta = Number.isFinite(heading) ? Math.abs(shortestHeadingDelta(bearing, heading || 0)) : undefined;
  const strongDirection = headingDelta === undefined || headingDelta <= 40;
  const strongMemory =
    row.confidence >= 0.68 &&
    (row.allowed_use === "direct_fact" || row.allowed_use === "cautious_possible") &&
    strongDirection &&
    distance <= 260 &&
    !isNewsSource(row.source);

  return {
    id: `place_memory:${row.id}`,
    label: (row.label || row.text).slice(0, 140),
    category: row.category || row.claim_type || undefined,
    distanceMeters: distance,
    relativeDirection: relativeDirectionFromHeading(headingDelta),
    publishedAt: row.published_at || undefined,
    url: row.url || undefined,
    sourceTitle: row.source,
    sourceTier: row.source_tier || "public_database",
    spatialMatch: strongMemory ? "nearby_address" : "area_only",
    temporalRelevance: row.metadata?.temporalRelevance as ContextCandidate["temporalRelevance"] || undefined,
    localConcernLevel: row.metadata?.localConcernLevel as ContextCandidate["localConcernLevel"] || undefined,
    retrievalScore: Number(memorySortScore(row).toFixed(3)),
    matchReason: [
      "Retrieved from prior evidence memory near this panorama coordinate",
      Number.isFinite(distance) ? `about ${Math.round(distance)} meters away` : "",
      Number.isFinite(headingDelta) ? `about ${Math.round(headingDelta || 0)} degrees from the selected direction` : "",
      row.similarity !== undefined && row.similarity !== null ? `semantic similarity ${row.similarity.toFixed(2)}` : ""
    ].filter(Boolean).join(", "),
    source: "place_memory",
    visibilityConfidence: strongMemory ? "possible" : "area_background",
    allowedUse: strongMemory ? "cautious_possible" : "background_only"
  };
}

function reusableClaims(claims: EvidenceClaim[]) {
  return claims
    .filter((claim) => !claim.privacySensitive && claim.allowedUse !== "do_not_use")
    .filter((claim) => !isNewsSource(claim.source))
    .filter((claim) =>
      claim.source === "candidate_verifier" ||
      claim.source === "hk_landsd" ||
      claim.source === "hk_fehd" ||
      claim.source === "hk_amo" ||
      claim.source === "osm" ||
      claim.source === "google_places" ||
      claim.source === "wikidata" ||
      claim.source === "wikipedia" ||
      (claim.source === "vision_model" && (claim.id.startsWith("txt") || claim.id.startsWith("ent")))
    )
    .filter((claim) => claim.confidence >= 0.58);
}

function memoryTextForClaim(claim: EvidenceClaim) {
  const label = claimLabel(claim);
  return [label, claim.text, claim.sourceTitle].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
}

function claimLabel(claim: EvidenceClaim) {
  const quoted = claim.text.match(/"([^"]+)"/)?.[1]?.trim();
  if (quoted) return quoted;
  const prefix = claim.text.match(/^(.+?) (?:is listed|is a Wikidata entity|is a visual-map verifier|is retrieved|near|around|reported)/i)?.[1]?.trim();
  if (prefix) return prefix;
  return claim.sourceTitle || claim.text.split(/[,.]/)[0]?.trim().slice(0, 120) || claim.id;
}

function dedupeKey(packet: EvidencePacket, claim: EvidenceClaim, label: string) {
  const lat = Number(packet.pano.lat || 0).toFixed(4);
  const lng = Number(packet.pano.lng || 0).toFixed(4);
  return `${claim.source}:${claim.id}:${normalizeKey(label)}:${lat}:${lng}`;
}

function expiresAtForClaim(claim: EvidenceClaim) {
  const days =
    claim.source === "candidate_verifier" || claim.source === "vision_model" ? 90 :
    claim.source === "wikipedia" || claim.source === "wikidata" ? 180 :
    claim.source === "hk_amo" || claim.source === "hk_landsd" || claim.source === "hk_fehd" ? 365 :
    180;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildMemoryQueryText(terms: string[] = []) {
  return terms
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter((term) => term.length >= 3)
    .slice(0, 10)
    .join(". ");
}

function vectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  };
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lng1 * Math.PI) / 180;
  const lambda2 = (lng2 * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function shortestHeadingDelta(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

function relativeDirectionFromHeading(delta?: number): ContextCandidate["relativeDirection"] {
  if (!Number.isFinite(delta)) return "nearby";
  const value = delta || 0;
  if (Math.abs(value) <= 45) return "ahead";
  if (value > 45 && value < 135) return "right";
  if (value < -45 && value > -135) return "left";
  return "nearby";
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function memorySortScore(row: PlaceMemoryRow) {
  const similarity = row.similarity === undefined || row.similarity === null ? 0.4 : row.similarity;
  const distanceScore = row.distance_meters === undefined || row.distance_meters === null
    ? 0
    : Math.max(0, 0.2 - Math.min(row.distance_meters, 400) / 3000);
  return row.confidence * 0.5 + similarity * 0.35 + distanceScore;
}

function isNewsSource(source: string) {
  return source === "gov_press_release" || source === "rthk" || source === "gdelt" || source === "social";
}

function dedupeMemoryCandidates(candidates: ContextCandidate[]) {
  const seen = new Map<string, ContextCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.label.toLowerCase()}:${candidate.category || ""}`;
    const previous = seen.get(key);
    if (!previous || (candidate.retrievalScore || 0) > (previous.retrievalScore || 0)) {
      seen.set(key, candidate);
    }
  }
  return Array.from(seen.values()).sort((a, b) => (b.retrievalScore || 0) - (a.retrievalScore || 0));
}
