import type {
  ContextCandidate,
  LocalEntity,
  NearbyPlace,
  PlaceContext,
  PublicDataCandidate,
  PublicNewsItem,
  SourceNote
} from "@/types";

type BuildSpatialRagParams = {
  lat: number;
  lng: number;
  heading?: number;
  places?: NearbyPlace[];
  publicDataCandidates?: PublicDataCandidate[];
  wikidataEntities?: LocalEntity[];
  sourceNotes?: SourceNote[];
  publicNewsContext?: PublicNewsItem[];
  limit?: number;
};

export function buildSpatialRagContext(params: BuildSpatialRagParams): Pick<PlaceContext, "ragCandidates" | "ragSummary"> {
  const candidates = [
    ...(params.places || []).map(placeCandidate),
    ...(params.publicDataCandidates || []).map(publicDataCandidate),
    ...(params.wikidataEntities || []).map(wikidataCandidate),
    ...(params.sourceNotes || []).map(wikipediaCandidate),
    ...(params.publicNewsContext || []).map(newsCandidate)
  ]
    .filter((candidate): candidate is ContextCandidate => Boolean(candidate))
    .filter((candidate) => candidate.visibilityConfidence !== "reject" && candidate.allowedUse !== "do_not_use");

  const ranked = dedupeCandidates(candidates)
    .map((candidate) => ({
      ...candidate,
      retrievalScore: retrievalScore(candidate)
    }))
    .sort((a, b) => (b.retrievalScore || 0) - (a.retrievalScore || 0))
    .slice(0, params.limit || 18);

  return {
    ragCandidates: ranked,
    ragSummary: summarizeRag(ranked)
  };
}

function placeCandidate(place: NearbyPlace): ContextCandidate | undefined {
  if (!place.name?.trim()) return undefined;
  const gate = gateSpatialCandidate(place, isPublicLandmark(place.type || place.name));
  return {
    id: place.id || `google_places:${stableId(place.name)}`,
    label: place.name.trim(),
    category: place.type,
    address: place.address,
    distanceMeters: place.distanceMeters,
    relativeDirection: place.relativeDirection,
    source: place.source || "google_places",
    spatialMatch: place.spatialMatch,
    visibilityConfidence: gate.visibilityConfidence,
    allowedUse: gate.allowedUse,
    matchReason: spatialReason(place)
  };
}

function publicDataCandidate(candidate: PublicDataCandidate): ContextCandidate | undefined {
  if (!candidate.label?.trim()) return undefined;
  const gate = gateSpatialCandidate(candidate, isPublicLandmark(candidate.category || candidate.label));
  return {
    id: candidate.id,
    label: candidate.label.trim(),
    category: candidate.category,
    address: candidate.address,
    distanceMeters: candidate.distanceMeters,
    relativeDirection: candidate.relativeDirection,
    source: candidate.source,
    spatialMatch: candidate.spatialMatch,
    visibilityConfidence: gate.visibilityConfidence,
    allowedUse: gate.allowedUse,
    matchReason: spatialReason(candidate)
  };
}

function wikidataCandidate(entity: LocalEntity): ContextCandidate | undefined {
  if (!entity.label?.trim()) return undefined;
  return {
    id: `wikidata:${entity.id}`,
    label: entity.label.trim(),
    category: entity.description,
    distanceMeters: entity.distanceMeters,
    source: "wikidata",
    url: entity.wikipediaUrl,
    visibilityConfidence: entity.relation === "visible-candidate" ? "possible" : "area_background",
    allowedUse: entity.relation === "visible-candidate" ? "cautious_possible" : "background_only",
    matchReason:
      entity.relation === "visible-candidate"
        ? "Wikidata entity is near the pano point and roughly aligned with the viewing direction."
        : "Wikidata entity is nearby area context, not direct visual evidence."
  };
}

function wikipediaCandidate(note: SourceNote): ContextCandidate | undefined {
  if (!note.title?.trim()) return undefined;
  return {
    id: `wikipedia:${stableId(note.title)}`,
    label: note.title.trim(),
    category: "wikipedia_summary",
    source: "wikipedia",
    url: note.url,
    visibilityConfidence: note.relation === "visible-candidate" ? "possible" : "area_background",
    allowedUse: "background_only",
    matchReason:
      note.relation === "visible-candidate"
        ? "Wikipedia summary is related to a nearby entity aligned with the view, but still background context."
        : "Wikipedia summary is area-level public context."
  };
}

function newsCandidate(item: PublicNewsItem): ContextCandidate | undefined {
  if (!item.title?.trim()) return undefined;
  return {
    id: `${item.source}:${stableId(item.title)}`,
    label: item.title.trim(),
    category: "local_concern",
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    sourceTitle: item.sourceTitle,
    sourceTier: item.sourceTier,
    spatialMatch: item.spatialMatch,
    temporalRelevance: item.temporalRelevance,
    localConcernLevel: item.localConcernLevel,
    visibilityConfidence: "area_background",
    allowedUse: "background_only",
    matchReason: "News and official notices are retrieved as local concern background, not as evidence about the selected object."
  };
}

function gateSpatialCandidate(
  candidate: {
    relativeDirection?: string;
    distanceMeters?: number;
    headingDelta?: number;
    viewAlignment?: string;
    spatialMatch?: string;
  },
  publicLandmark: boolean
): Pick<ContextCandidate, "visibilityConfidence" | "allowedUse"> {
  if (candidate.spatialMatch === "footprint_intersection") {
    return candidate.distanceMeters === undefined || candidate.distanceMeters <= (publicLandmark ? 300 : 200)
      ? { visibilityConfidence: "visible_likely", allowedUse: "cautious_possible" }
      : { visibilityConfidence: "nearby_only", allowedUse: "background_only" };
  }
  if (candidate.viewAlignment === "inside_fragment_view") {
    return candidate.distanceMeters === undefined || candidate.distanceMeters <= (publicLandmark ? 260 : 150)
      ? { visibilityConfidence: "possible", allowedUse: "cautious_possible" }
      : { visibilityConfidence: "nearby_only", allowedUse: "background_only" };
  }
  if (candidate.viewAlignment === "near_fragment_view" && publicLandmark) {
    return candidate.distanceMeters === undefined || candidate.distanceMeters <= 220
      ? { visibilityConfidence: "possible", allowedUse: "cautious_possible" }
      : { visibilityConfidence: "nearby_only", allowedUse: "background_only" };
  }
  if (candidate.relativeDirection === "ahead" && (candidate.distanceMeters || 9999) <= (publicLandmark ? 180 : 90)) {
    return { visibilityConfidence: "possible", allowedUse: "cautious_possible" };
  }
  return { visibilityConfidence: "nearby_only", allowedUse: "background_only" };
}

function retrievalScore(candidate: ContextCandidate) {
  const sourceScore = {
    google_places: 0.58,
    osm: 0.64,
    hk_landsd: 0.72,
    wikidata: 0.55,
    wikipedia: 0.52,
    gov_press_release: 0.48,
    rthk: 0.42,
    gdelt: 0.34,
    social: 0.18
  }[candidate.source];
  const visibilityScore = {
    visible_likely: 0.32,
    possible: 0.22,
    nearby_only: 0.1,
    area_background: 0.05,
    reject: -1
  }[candidate.visibilityConfidence];
  const distanceScore = candidate.distanceMeters === undefined
    ? 0
    : Math.max(0, 0.18 - Math.min(candidate.distanceMeters, 400) / 4000);
  const publicScore = isPublicLandmark(`${candidate.label} ${candidate.category || ""}`) ? 0.08 : 0;
  const temporalScore = candidate.temporalRelevance === "current" ? 0.05 : candidate.temporalRelevance === "recent" ? 0.03 : 0;
  return Number((sourceScore + visibilityScore + distanceScore + publicScore + temporalScore).toFixed(3));
}

function dedupeCandidates(candidates: ContextCandidate[]) {
  const seen = new Map<string, ContextCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.label.toLowerCase()}:${candidate.category || ""}`;
    const previous = seen.get(key);
    if (!previous || retrievalScore(candidate) > retrievalScore(previous)) {
      seen.set(key, candidate);
    }
  }
  return Array.from(seen.values());
}

function summarizeRag(candidates: ContextCandidate[]) {
  const visible = candidates.filter((candidate) => candidate.visibilityConfidence === "visible_likely" || candidate.visibilityConfidence === "possible").length;
  const background = candidates.filter((candidate) => candidate.allowedUse === "background_only").length;
  const news = candidates.filter((candidate) => ["gov_press_release", "rthk", "gdelt"].includes(candidate.source)).length;
  return `Spatial RAG retrieved ${candidates.length} candidates: ${visible} possible visual/map matches, ${background} background-only items, and ${news} local concern items.`;
}

function spatialReason(candidate: {
  distanceMeters?: number;
  relativeDirection?: string;
  viewAlignment?: string;
  spatialMatch?: string;
  headingDelta?: number;
}) {
  const bits: string[] = [];
  if (candidate.spatialMatch === "footprint_intersection") bits.push("mapped footprint intersects the selected sight line");
  if (candidate.viewAlignment === "inside_fragment_view") bits.push("inside the approximate selected viewing cone");
  if (candidate.viewAlignment === "near_fragment_view") bits.push("near the approximate selected viewing cone");
  if (candidate.relativeDirection) bits.push(`located ${candidate.relativeDirection}`);
  if (Number.isFinite(candidate.distanceMeters)) bits.push(`about ${Math.round(candidate.distanceMeters || 0)} meters away`);
  if (Number.isFinite(candidate.headingDelta)) bits.push(`about ${Math.round(candidate.headingDelta || 0)} degrees from the selected viewing direction`);
  return bits.length ? bits.join(", ") : "near the panorama coordinate";
}

function isPublicLandmark(value?: string) {
  return /university|college|school|campus|hospital|station|museum|library|government|public|polytechnic|theatre|civic|town hall|market|park/i.test(value || "");
}

function stableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "candidate";
}
