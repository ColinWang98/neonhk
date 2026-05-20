import { getLocalContext } from "@/lib/localContext";
import { distanceMeters } from "@/lib/geoMath";
import { searchGoogleStreetView } from "@/lib/googleStreetView";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type {
  EvidencePacket,
  LocalEntity,
  NearbyContinuationRecommendation,
  PlaceContext,
  SchemaName,
  SourceNote
} from "@/types";

type NearbyContinuationInput = {
  sessionId?: string;
  fragmentId?: string;
  lat: number;
  lng: number;
  personaId?: string;
  activeSchemas?: SchemaName[];
  radiusMeters?: number;
  placeContext?: PlaceContext;
  evidencePacket?: EvidencePacket;
  config?: RuntimeApiConfig;
};

type CandidateSource = NearbyContinuationRecommendation["evidenceSources"][number];

type ContinuationCandidate = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  category?: string;
  evidenceSources: Set<CandidateSource>;
  sourceNotes: string[];
};

export async function recommendNearbyContinuations(input: NearbyContinuationInput) {
  const radiusMeters = Math.min(Math.max(input.radiusMeters || 800, 150), 1500);
  const placeContext =
    input.placeContext ||
    (await getLocalContext({
      lat: input.lat,
      lng: input.lng,
      radius: radiusMeters,
      config: input.config
    }).catch(() => undefined));

  if (!placeContext) return [];

  const candidates = rankCandidates(
    buildCandidates(placeContext, input.lat, input.lng),
    input.activeSchemas || inferSchemasFromEvidence(input.evidencePacket)
  )
    .filter((candidate) => (candidate.distanceMeters ?? radiusMeters + 1) <= radiusMeters)
    .slice(0, 8);

  const recommendations: NearbyContinuationRecommendation[] = [];
  for (const candidate of candidates) {
    if (recommendations.length >= 3) break;

    const hasStreetView = await hasNearbyStreetView(candidate, input.config);
    if (!hasStreetView) continue;

    candidate.evidenceSources.add("street_view");
    const activeSchemas = input.activeSchemas || [];
    const recommendedSchema = chooseRecommendedSchema(candidate, activeSchemas);
    const evidenceScore = scoreEvidence(candidate);
    const thematicRelevance = scoreTheme(candidate, activeSchemas);

    recommendations.push({
      placeId: candidate.placeId,
      name: candidate.name,
      lat: candidate.lat,
      lng: candidate.lng,
      distanceMeters: candidate.distanceMeters,
      category: candidate.category,
      recommendedSchema,
      evidenceSources: Array.from(candidate.evidenceSources),
      evidenceScore,
      thematicRelevance,
      streetViewAvailable: true,
      reason: buildReason(candidate, recommendedSchema),
      uncertainty: evidenceScore >= 0.72 && thematicRelevance >= 0.62 ? "medium" : "high"
    });
  }

  return recommendations;
}

function buildCandidates(placeContext: PlaceContext, originLat: number, originLng: number) {
  const candidates = new Map<string, ContinuationCandidate>();

  for (const place of placeContext.places || []) {
    addCandidate(candidates, {
      placeId: place.id || `google:${place.name}:${place.lat}:${place.lng}`,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      distanceMeters: place.distanceMeters,
      category: place.type,
      source: place.source === "osm" || place.source === "hk_landsd" || place.source === "hk_fehd" || place.source === "hk_amo"
        ? place.source
        : "google_places",
      originLat,
      originLng
    });
  }

  for (const publicCandidate of placeContext.publicDataCandidates || []) {
    addCandidate(candidates, {
      placeId: publicCandidate.id,
      name: publicCandidate.label,
      lat: publicCandidate.lat,
      lng: publicCandidate.lng,
      distanceMeters: publicCandidate.distanceMeters,
      category: publicCandidate.category,
      source: publicCandidate.source,
      originLat,
      originLng
    });
  }

  for (const entity of placeContext.wikidataEntities || []) {
    addCandidate(candidates, {
      placeId: entity.id,
      name: entity.label,
      lat: entity.lat,
      lng: entity.lng,
      distanceMeters: entity.distanceMeters,
      category: entity.description,
      source: "wikidata",
      sourceNote: entity.wikipediaUrl ? "wikipedia" : undefined,
      originLat,
      originLng
    });
  }

  attachWikipediaSignals(candidates, placeContext.sourceNotes || [], placeContext.wikidataEntities || []);

  return Array.from(candidates.values());
}

function addCandidate(
  candidates: Map<string, ContinuationCandidate>,
  item: {
    placeId: string;
    name?: string;
    lat?: number;
    lng?: number;
    distanceMeters?: number;
    category?: string;
    source: CandidateSource;
    sourceNote?: CandidateSource;
    originLat: number;
    originLng: number;
  }
) {
  if (!item.name || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
  const normalizedName = item.name.trim();
  if (!normalizedName) return;
  const key = normalizeCandidateKey(normalizedName, item.lat!, item.lng!);
  const existing = candidates.get(key);
  const computedDistance =
    Number.isFinite(item.distanceMeters) && item.distanceMeters !== undefined
      ? item.distanceMeters
      : distanceMeters(item.originLat, item.originLng, item.lat!, item.lng!);

  if (existing) {
    existing.evidenceSources.add(item.source);
    if (item.sourceNote) existing.evidenceSources.add(item.sourceNote);
    existing.category ||= item.category;
    existing.distanceMeters = Math.min(existing.distanceMeters || computedDistance, computedDistance);
    return;
  }

  candidates.set(key, {
    placeId: item.placeId,
    name: normalizedName,
    lat: item.lat!,
    lng: item.lng!,
    distanceMeters: computedDistance,
    category: item.category,
    evidenceSources: new Set([item.source, ...(item.sourceNote ? [item.sourceNote] : [])]),
    sourceNotes: []
  });
}

function attachWikipediaSignals(
  candidates: Map<string, ContinuationCandidate>,
  notes: SourceNote[],
  entities: LocalEntity[]
) {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const note of notes) {
    const entity = note.relatedEntityId ? entitiesById.get(note.relatedEntityId) : undefined;
    if (!entity?.lat || !entity.lng) continue;
    const key = normalizeCandidateKey(entity.label, entity.lat, entity.lng);
    const candidate = candidates.get(key);
    if (!candidate) continue;
    candidate.evidenceSources.add("wikipedia");
    candidate.sourceNotes.push(note.title);
  }
}

function rankCandidates(candidates: ContinuationCandidate[], activeSchemas: SchemaName[]) {
  return candidates
    .filter((candidate) => candidate.name.length > 1)
    .sort((a, b) => totalScore(b, activeSchemas) - totalScore(a, activeSchemas));
}

function totalScore(candidate: ContinuationCandidate, activeSchemas: SchemaName[]) {
  const proximity = 1 - Math.min(candidate.distanceMeters || 1000, 1000) / 1000;
  return (
    scoreEvidence(candidate) * 0.38 +
    scoreTheme(candidate, activeSchemas) * 0.3 +
    scoreEverydayRelevance(candidate) * 0.17 +
    proximity * 0.15
  );
}

function scoreEvidence(candidate: ContinuationCandidate) {
  let score = 0.18;
  if (candidate.evidenceSources.has("wikipedia")) score += 0.25;
  if (candidate.evidenceSources.has("wikidata")) score += 0.18;
  if (candidate.evidenceSources.has("google_places")) score += 0.16;
  if (candidate.evidenceSources.has("osm")) score += 0.13;
  if (candidate.evidenceSources.has("hk_landsd")) score += 0.13;
  if (candidate.evidenceSources.has("hk_fehd")) score += 0.14;
  if (candidate.evidenceSources.has("hk_amo")) score += 0.22;
  if (candidate.evidenceSources.has("street_view")) score += 0.1;
  return clamp01(score);
}

function scoreTheme(candidate: ContinuationCandidate, activeSchemas: SchemaName[]) {
  const text = `${candidate.name} ${candidate.category || ""}`.toLowerCase();
  const themes = new Set(activeSchemas);
  let score = 0.35;

  if (themes.has("Functional-Use") && /(station|stop|market|shop|store|school|clinic|terminal|pier|entrance|restaurant|cafe|mall|centre|center|road|street)/i.test(text)) {
    score += 0.22;
  }
  if (themes.has("Identity-Belonging") && /(community|school|temple|church|mosque|market|estate|park|centre|center|hall|library)/i.test(text)) {
    score += 0.2;
  }
  if (themes.has("Memory-Temporality") && (candidate.evidenceSources.has("wikipedia") || candidate.evidenceSources.has("wikidata") || candidate.evidenceSources.has("hk_amo") || /(historic|heritage|market|old|former|monument|building)/i.test(text))) {
    score += 0.25;
  }
  if (themes.has("Social-Cultural Resonance") && /(market|temple|church|mosque|restaurant|cafe|park|hall|museum|gallery|theatre|community|shop)/i.test(text)) {
    score += 0.22;
  }
  if (activeSchemas.length === 0) score += 0.08;

  return clamp01(score);
}

function scoreEverydayRelevance(candidate: ContinuationCandidate) {
  const text = `${candidate.name} ${candidate.category || ""}`.toLowerCase();
  if (/(market|shop|restaurant|cafe|school|clinic|station|stop|pier|park|community|library|estate|street|road)/i.test(text)) {
    return 0.82;
  }
  if (/(museum|gallery|historic|heritage|monument|theatre)/i.test(text)) return 0.68;
  return 0.45;
}

async function hasNearbyStreetView(candidate: ContinuationCandidate, config?: RuntimeApiConfig) {
  try {
    const images = await searchGoogleStreetView(candidate.lat, candidate.lng, 120, config);
    return images.length > 0;
  } catch {
    return false;
  }
}

function chooseRecommendedSchema(candidate: ContinuationCandidate, activeSchemas: SchemaName[]) {
  if (activeSchemas.includes("Memory-Temporality") && (candidate.evidenceSources.has("wikipedia") || candidate.evidenceSources.has("wikidata") || candidate.evidenceSources.has("hk_amo"))) {
    return "Memory-Temporality";
  }
  if (activeSchemas.includes("Social-Cultural Resonance") && scoreEverydayRelevance(candidate) > 0.6) {
    return "Social-Cultural Resonance";
  }
  if (activeSchemas.includes("Identity-Belonging")) return "Identity-Belonging";
  return activeSchemas[0] || "Functional-Use";
}

function buildReason(candidate: ContinuationCandidate, schema: SchemaName) {
  const schemaText =
    schema === "Memory-Temporality"
      ? "time, public memory, and urban change"
      : schema === "Social-Cultural Resonance"
        ? "daily public life and shared street culture"
        : schema === "Identity-Belonging"
          ? "how people recognize and belong to this area"
          : "how people move through and use the street";
  const sourceText = candidate.evidenceSources.has("wikipedia") || candidate.evidenceSources.has("wikidata") || candidate.evidenceSources.has("hk_amo")
    ? "It has richer public records"
    : "It has useful map and street-level context";
  return `${sourceText}, and it can extend the current reading toward ${schemaText} without treating nearby context as proof of the selected detail.`;
}

function inferSchemasFromEvidence(packet?: EvidencePacket) {
  const schemas = new Set<SchemaName>();
  for (const claim of packet?.claims || []) {
    for (const schema of claim.relatedSchemas || []) schemas.add(schema);
  }
  return Array.from(schemas);
}

function normalizeCandidateKey(name: string, lat: number, lng: number) {
  return `${name.toLowerCase().replace(/\s+/g, " ").trim()}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
