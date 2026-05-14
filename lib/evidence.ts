import type {
  EvidenceClaim,
  EvidencePacket,
  FragmentAffordance,
  PanoramaPov,
  PlaceContext,
  StreetImage,
  VisionDescription
} from "@/types";

type BuildEvidencePacketParams = {
  fragmentId: string;
  sessionId?: string;
  image?: StreetImage;
  cropImageUrl?: string;
  visionDescription: VisionDescription;
  placeContext?: PlaceContext;
  panoramaPov?: PanoramaPov;
};

const evidenceLimits = {
  visibleCues: 3,
  googlePlaces: 6,
  publicData: 6,
  wikidata: 3,
  wikipedia: 2,
  publicNews: 3
};

export function buildEvidencePacket(params: BuildEvidencePacketParams): EvidencePacket {
  const affordances = inferFragmentAffordances(params.visionDescription);
  const claims: EvidenceClaim[] = [
    ...visualClaims(params.visionDescription, affordances),
    ...panoClaims(params),
    ...nearbyPlaceClaims(params.placeContext),
    ...publicDataClaims(params.placeContext),
    ...wikidataClaims(params.placeContext),
    ...wikipediaClaims(params.placeContext),
    ...publicNewsClaims(params.placeContext)
  ];

  if (params.visionDescription.privacyRisk.riskLevel !== "low") {
    claims.push({
      id: "s1",
      text: "The selected fragment has a non-low privacy risk and should not be expanded into personal stories.",
      source: "system",
      claimType: "blocked_sensitive",
      confidence: 1,
      visibilityStatus: "unknown",
      allowedUse: "do_not_use",
      uncertaintyCueRequired: false,
      privacySensitive: true,
      relatedSchemas: []
    });
  }

  return {
    packetId: `evp_${params.fragmentId}`,
    fragmentId: params.fragmentId,
    sessionId: params.sessionId,
    pano: {
      panoId: params.image?.panoId || params.image?.id,
      lat: params.image?.lat,
      lng: params.image?.lng,
      heading: params.panoramaPov?.heading ?? params.placeContext?.heading,
      pitch: params.panoramaPov?.pitch,
      fov: params.panoramaPov?.fov,
      captureDate: params.image?.capturedAt || null,
      provider: params.image?.provider || "unknown"
    },
    fragment: {
      cropImageUrl: params.cropImageUrl,
      mainFeature: params.visionDescription.mainFeature,
      fragmentCategory: params.visionDescription.fragmentCategory,
      spatialContext: params.visionDescription.spatialContext,
      privacyRisk: params.visionDescription.privacyRisk.riskLevel,
      uncertainty: classifyUncertainty(params.visionDescription)
    },
    claims,
    globalRules: [
      "Do not state that a nearby candidate is visible unless visibilityStatus is visible_confirmed.",
      "Do not invent personal memories about the photographed place.",
      "Do not identify private individuals or private routines.",
      "Use uncertainty language for cautious_possible and background_only claims.",
      "Separate visual observations from social interpretations.",
      "Treat Wikipedia and Wikidata as area context unless a visual claim confirms the same entity.",
      "Treat news and official notices as local concern background, not as proof about the selected fragment."
    ],
    storyAffordances: buildStoryAffordances(params.visionDescription, affordances, claims),
    blockedTopics: blockedTopics(params.visionDescription)
  };
}

export function inferFragmentAffordances(vision: VisionDescription): FragmentAffordance[] {
  const text = [
    vision.mainFeature,
    vision.fragmentCategory,
    vision.spatialContext,
    ...(vision.visibleText || []),
    ...(vision.publicEntityCandidates || []).map((entity) => `${entity.name} ${entity.entityType || ""}`),
    ...vision.visibleCues,
    ...vision.possibleEverydayUses
  ].join(" ").toLowerCase();
  const affordances = new Set<FragmentAffordance>();

  if (matchAny(text, ["shop", "store", "retail", "cafe", "restaurant", "stall", "sign", "shutter", "commercial"])) {
    affordances.add("commercial");
  }
  if (matchAny(text, ["sign", "arrow", "street name", "direction", "wayfinding", "number", "map"])) {
    affordances.add("wayfinding");
  }
  if (matchAny(text, ["road", "pavement", "sidewalk", "walkway", "crossing", "kerb", "curb", "path", "railing", "stairs", "entrance"])) {
    affordances.add("mobility");
  }
  if (matchAny(text, ["bench", "seat", "queue", "people", "waiting", "plaza", "public", "park"])) {
    affordances.add("social_gathering");
  }
  if (matchAny(text, ["hydrant", "lamp", "utility", "pipe", "drain", "rail", "barrier", "infrastructure"])) {
    affordances.add("infrastructure");
  }
  if (matchAny(text, ["temple", "church", "shrine", "heritage", "monument", "historic"])) {
    affordances.add("heritage");
    affordances.add("cultural");
  }
  if (matchAny(text, ["university", "college", "school", "campus", "hospital", "station", "museum", "library", "government", "public", "polytechnic"])) {
    affordances.add("public_facility");
    affordances.add("civic");
    affordances.add("wayfinding");
  }
  if (matchAny(text, ["tree", "plant", "green", "park", "garden"])) {
    affordances.add("green_space");
  }
  if (matchAny(text, ["residential", "balcony", "apartment", "home", "private interior"])) {
    affordances.add("residential");
  }
  if (vision.privacyRisk.riskLevel !== "low") {
    affordances.add("private_sensitive");
    affordances.add("safety_risk");
  }

  if (affordances.size === 0) {
    affordances.add("infrastructure");
  }
  return Array.from(affordances);
}

function visualClaims(vision: VisionDescription, affordances: FragmentAffordance[]): EvidenceClaim[] {
  const schemas = schemasForAffordances(affordances);
  const claims: EvidenceClaim[] = [
    {
      id: "v1",
      text: `The crop appears to show ${vision.mainFeature}.`,
      source: "vision_model",
      claimType: "visual_observation",
      confidence: 0.82,
      visibilityStatus: "visible_confirmed",
      allowedUse: "direct_fact",
      uncertaintyCueRequired: true,
      privacySensitive: false,
      relatedSchemas: schemas
    },
    {
      id: "v2",
      text: `The fragment is categorized as ${vision.fragmentCategory} in ${vision.spatialContext}.`,
      source: "vision_model",
      claimType: "model_inference",
      confidence: 0.68,
      visibilityStatus: "possibly_visible",
      allowedUse: "cautious_possible",
      uncertaintyCueRequired: true,
      privacySensitive: false,
      relatedSchemas: schemas
    }
  ];

  vision.visibleCues.slice(0, evidenceLimits.visibleCues).forEach((cue, index) => {
    claims.push({
      id: `v${index + 3}`,
      text: `Visible cue: ${cue}.`,
      source: "vision_model",
      claimType: "visual_observation",
      confidence: 0.76,
      visibilityStatus: "visible_confirmed",
      allowedUse: "direct_fact",
      uncertaintyCueRequired: false,
      privacySensitive: false,
      relatedSchemas: schemas
    });
  });

  (vision.visibleText || []).slice(0, 3).forEach((text, index) => {
    claims.push({
      id: `txt${index + 1}`,
      text: `Readable text in the selected crop: "${text}".`,
      source: "vision_model",
      claimType: "visual_observation",
      confidence: 0.82,
      visibilityStatus: "visible_confirmed",
      allowedUse: "direct_fact",
      uncertaintyCueRequired: false,
      privacySensitive: false,
      relatedSchemas: ["Functional-Use", "Identity-Belonging", "Social-Cultural Resonance"]
    });
  });

  (vision.publicEntityCandidates || []).slice(0, 2).forEach((entity, index) => {
    const confidence = Math.max(0, Math.min(1, entity.confidence || 0.7));
    claims.push({
      id: `ent${index + 1}`,
      text: `The crop may show the public entity "${entity.name}"${entity.entityType ? ` (${entity.entityType})` : ""}, based on ${entity.evidence}.`,
      source: "vision_model",
      claimType: "visual_observation",
      confidence,
      visibilityStatus: confidence >= 0.82 ? "visible_confirmed" : "possibly_visible",
      allowedUse: confidence >= 0.82 ? "direct_fact" : "cautious_possible",
      uncertaintyCueRequired: confidence < 0.82,
      privacySensitive: false,
      relatedSchemas: ["Functional-Use", "Identity-Belonging", "Memory-Temporality", "Social-Cultural Resonance"]
    });
  });

  return claims;
}

function panoClaims(params: BuildEvidencePacketParams): EvidenceClaim[] {
  if (!params.image) return [];
  return [
    {
      id: "p1",
      text: `The selected panorama point is around ${params.image.lat.toFixed(5)}, ${params.image.lng.toFixed(5)}.`,
      source: "google_streetview",
      claimType: "pano_metadata",
      confidence: 0.9,
      visibilityStatus: "unknown",
      allowedUse: "background_only",
      uncertaintyCueRequired: false,
      privacySensitive: false,
      relatedSchemas: ["Functional-Use", "Identity-Belonging"]
    }
  ];
}

function nearbyPlaceClaims(placeContext?: PlaceContext): EvidenceClaim[] {
  return (placeContext?.places || [])
    .filter((place) => !place.source || place.source === "google_places")
    .slice(0, evidenceLimits.googlePlaces)
    .map((place, index) => {
    const publicLandmark = isPublicLandmarkCategory(place.type || place.name);
    const directness = isViewAlignedCandidate(place, publicLandmark);
    return {
      id: `g${index + 1}`,
      text: `${place.name} is listed ${place.relativeDirection || "nearby"}${place.distanceMeters ? `, about ${Math.round(place.distanceMeters)} meters from the pano point` : ""}${Number.isFinite(place.headingDelta) ? ` and about ${Math.round(place.headingDelta || 0)} degrees from the selected viewing direction` : ""}${place.viewAlignment === "inside_fragment_view" ? ", inside the selected fragment's approximate viewing cone" : place.viewAlignment === "near_fragment_view" ? ", near the selected fragment's viewing cone" : ""}${place.type ? `, with category ${place.type}` : ""}.`,
      source: "google_places",
      claimType: "nearby_candidate",
      confidence: directness ? (publicLandmark ? 0.78 : 0.7) : 0.5,
      visibilityStatus: directness ? "possibly_visible" : "nearby_not_confirmed_visible",
      allowedUse: directness ? "cautious_possible" : "background_only",
      uncertaintyCueRequired: true,
      privacySensitive: false,
      relatedSchemas: publicLandmark
        ? ["Functional-Use", "Identity-Belonging", "Memory-Temporality", "Social-Cultural Resonance"]
        : ["Functional-Use", "Social-Cultural Resonance"]
    } satisfies EvidenceClaim;
  });
}

function publicDataClaims(placeContext?: PlaceContext): EvidenceClaim[] {
  return (placeContext?.publicDataCandidates || []).slice(0, evidenceLimits.publicData).map((candidate, index) => {
    const publicLandmark = isPublicLandmarkCategory(candidate.category || candidate.label);
    const directness = isViewAlignedCandidate(candidate, publicLandmark);
    return {
      id: `${candidate.source === "osm" ? "osm" : "hk"}${index + 1}`,
      text: `${candidate.label} is listed by ${candidate.source === "osm" ? "OpenStreetMap" : "Hong Kong public open data"} ${candidate.relativeDirection || "nearby"}${candidate.distanceMeters ? `, about ${Math.round(candidate.distanceMeters)} meters from the pano point` : ""}${Number.isFinite(candidate.headingDelta) ? ` and about ${Math.round(candidate.headingDelta || 0)} degrees from the selected viewing direction` : ""}${candidate.spatialMatch === "footprint_intersection" ? ", and its mapped building footprint intersects the selected sight line" : candidate.viewAlignment === "inside_fragment_view" ? ", inside the selected fragment's approximate viewing cone" : candidate.viewAlignment === "near_fragment_view" ? ", near the selected fragment's viewing cone" : ""}${candidate.category ? `, with category ${candidate.category}` : ""}.`,
      source: candidate.source,
      claimType: "nearby_candidate",
      confidence: candidate.spatialMatch === "footprint_intersection" ? 0.86 : directness ? (publicLandmark ? 0.74 : 0.66) : 0.46,
      visibilityStatus: directness ? "possibly_visible" : "nearby_not_confirmed_visible",
      allowedUse: directness ? "cautious_possible" : "background_only",
      uncertaintyCueRequired: true,
      privacySensitive: false,
      relatedSchemas: publicLandmark
        ? ["Functional-Use", "Identity-Belonging", "Memory-Temporality", "Social-Cultural Resonance"]
        : ["Functional-Use", "Social-Cultural Resonance"]
    } satisfies EvidenceClaim;
  });
}

function isPublicLandmarkCategory(value?: string) {
  return /university|college|school|campus|hospital|station|museum|library|government|public|polytechnic|theatre|civic|town hall/i.test(value || "");
}

function isViewAlignedCandidate(
  candidate: { relativeDirection?: string; distanceMeters?: number; headingDelta?: number; viewAlignment?: string; spatialMatch?: string },
  publicLandmark = false
) {
  const distance = candidate.distanceMeters ?? 9999;
  const headingDelta = candidate.headingDelta ?? 999;
  if (candidate.spatialMatch === "footprint_intersection") {
    return distance <= (publicLandmark ? 260 : 180);
  }
  if (candidate.viewAlignment === "inside_fragment_view") {
    return distance <= (publicLandmark ? 220 : 130);
  }
  if (candidate.viewAlignment === "near_fragment_view" && publicLandmark) {
    return distance <= 180;
  }
  if (candidate.relativeDirection !== "ahead") return false;
  if (publicLandmark) return distance <= 180 && headingDelta <= 45;
  return distance <= 80 && headingDelta <= 18;
}

function wikidataClaims(placeContext?: PlaceContext): EvidenceClaim[] {
  return (placeContext?.wikidataEntities || []).slice(0, evidenceLimits.wikidata).map((entity, index) => ({
    id: `wd${index + 1}`,
    text: `${entity.label} is a Wikidata entity ${entity.relation === "visible-candidate" ? "possibly related to the viewing direction" : "near this area"}.`,
    source: "wikidata",
    claimType: "retrieved_area_context",
    confidence: entity.relation === "visible-candidate" ? 0.58 : 0.48,
    visibilityStatus: entity.relation === "visible-candidate" ? "possibly_visible" : "area_level_only",
    allowedUse: entity.relation === "visible-candidate" ? "cautious_possible" : "background_only",
    uncertaintyCueRequired: true,
    privacySensitive: false,
    relatedSchemas: ["Memory-Temporality", "Social-Cultural Resonance"]
  }));
}

function wikipediaClaims(placeContext?: PlaceContext): EvidenceClaim[] {
  return (placeContext?.sourceNotes || []).slice(0, evidenceLimits.wikipedia).map((note, index) => ({
    id: `w${index + 1}`,
    text: `A nearby Wikipedia note describes ${note.title}: ${truncate(note.extract, 180)}`,
    source: "wikipedia",
    claimType: "retrieved_area_context",
    confidence: 0.62,
    visibilityStatus: "area_level_only",
    allowedUse: "background_only",
    uncertaintyCueRequired: true,
    privacySensitive: false,
    relatedSchemas: ["Memory-Temporality", "Social-Cultural Resonance"]
  }));
}

function publicNewsClaims(placeContext?: PlaceContext): EvidenceClaim[] {
  return (placeContext?.publicNewsContext || []).slice(0, evidenceLimits.publicNews).map((item, index) => ({
    id: `n${index + 1}`,
    text: `${item.sourceTitle || sourceLabel(item.source)} reported ${datePhrase(item.publishedAt)}: ${item.title}${item.description ? ` - ${truncate(item.description, 150)}` : ""}`,
    source: item.source,
    claimType: item.source === "gov_press_release" ? "official_notice" : "news_context",
    confidence: item.sourceTier === "official" ? 0.7 : item.source === "rthk" ? 0.62 : 0.52,
    visibilityStatus: "area_level_only",
    allowedUse: "background_only",
    uncertaintyCueRequired: true,
    privacySensitive: false,
    relatedSchemas: ["Memory-Temporality", "Social-Cultural Resonance"],
    url: item.url,
    publishedAt: item.publishedAt,
    sourceTitle: item.sourceTitle,
    sourceTier: item.sourceTier,
    spatialMatch: item.spatialMatch,
    temporalRelevance: item.temporalRelevance,
    localConcernLevel: item.localConcernLevel
  } satisfies EvidenceClaim));
}

function buildStoryAffordances(
  vision: VisionDescription,
  affordances: FragmentAffordance[],
  claims: EvidenceClaim[]
) {
  const hasTimeContext = claims.some((claim) =>
    claim.relatedSchemas.includes("Memory-Temporality") && claim.allowedUse !== "do_not_use"
  );
  const supportsIdentity = affordances.some((item) =>
    ["commercial", "wayfinding", "public_facility", "cultural", "social_gathering", "mobility"].includes(item)
  );
  const supportsSocial = affordances.some((item) =>
    ["commercial", "public_facility", "cultural", "social_gathering", "infrastructure"].includes(item)
  );
  return {
    supportsFunctionalUse: vision.privacyRisk.riskLevel !== "high",
    supportsIdentityBelonging: supportsIdentity && vision.privacyRisk.riskLevel !== "high",
    supportsMemoryTemporality: hasTimeContext || vision.visibleCues.some((cue) => /wear|old|rust|mark|paint|repair|weather/i.test(cue)),
    supportsSocialCulturalResonance: supportsSocial && vision.privacyRisk.riskLevel !== "high",
    reason:
      "Affordances are derived from visible fragment cues and nearby context, with area-level context restricted to cautious background use."
  };
}

function schemasForAffordances(affordances: FragmentAffordance[]): EvidenceClaim["relatedSchemas"] {
  const schemas = new Set<EvidenceClaim["relatedSchemas"][number]>(["Functional-Use"]);
  if (affordances.some((item) => ["commercial", "wayfinding", "public_facility", "social_gathering", "mobility"].includes(item))) {
    schemas.add("Identity-Belonging");
  }
  if (affordances.some((item) => ["commercial", "social_gathering", "cultural", "infrastructure"].includes(item))) {
    schemas.add("Social-Cultural Resonance");
  }
  return Array.from(schemas);
}

function classifyUncertainty(vision: VisionDescription): "low" | "medium" | "high" {
  if (vision.privacyRisk.riskLevel === "high") return "high";
  if (/uncertain|cannot|can't|not clear|ambiguous|may|possible/i.test(vision.uncertainty)) return "medium";
  return "low";
}

function blockedTopics(vision: VisionDescription) {
  const topics = ["specific personal identity", "private routines", "unverified historical memory"];
  if (vision.privacyRisk.containsFace) topics.push("identifiable people");
  if (vision.privacyRisk.containsLicensePlate) topics.push("license plate details");
  if (vision.privacyRisk.containsPrivateInterior) topics.push("private interior details");
  return topics;
}

function matchAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function truncate(text: string, max: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function sourceLabel(source: string) {
  if (source === "gov_press_release") return "A Hong Kong Government notice";
  if (source === "rthk") return "RTHK local news";
  if (source === "gdelt") return "A news index";
  return "A public source";
}

function datePhrase(value?: string) {
  const date = value ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) return "at an unknown date";
  return `on ${date.toISOString().slice(0, 10)}`;
}
