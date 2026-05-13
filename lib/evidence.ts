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

export function buildEvidencePacket(params: BuildEvidencePacketParams): EvidencePacket {
  const affordances = inferFragmentAffordances(params.visionDescription);
  const claims: EvidenceClaim[] = [
    ...visualClaims(params.visionDescription, affordances),
    ...panoClaims(params),
    ...nearbyPlaceClaims(params.placeContext),
    ...wikidataClaims(params.placeContext),
    ...wikipediaClaims(params.placeContext)
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
      "Treat Wikipedia and Wikidata as area context unless a visual claim confirms the same entity."
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

  vision.visibleCues.slice(0, 4).forEach((cue, index) => {
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
  return (placeContext?.places || []).slice(0, 5).map((place, index) => {
    const directness = place.relativeDirection === "ahead" && (place.distanceMeters || 999) < 35;
    return {
      id: `g${index + 1}`,
      text: `${place.name} is listed ${place.relativeDirection || "nearby"}${place.distanceMeters ? `, about ${Math.round(place.distanceMeters)} meters from the pano point` : ""}.`,
      source: "google_places",
      claimType: "nearby_candidate",
      confidence: directness ? 0.62 : 0.5,
      visibilityStatus: directness ? "possibly_visible" : "nearby_not_confirmed_visible",
      allowedUse: directness ? "cautious_possible" : "background_only",
      uncertaintyCueRequired: true,
      privacySensitive: false,
      relatedSchemas: ["Functional-Use", "Social-Cultural Resonance"]
    } satisfies EvidenceClaim;
  });
}

function wikidataClaims(placeContext?: PlaceContext): EvidenceClaim[] {
  return (placeContext?.wikidataEntities || []).slice(0, 4).map((entity, index) => ({
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
  return (placeContext?.sourceNotes || []).slice(0, 3).map((note, index) => ({
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
