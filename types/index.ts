export type StreetImage = {
  id: string;
  provider: "mapillary" | "google";
  lat: number;
  lng: number;
  compassAngle?: number;
  capturedAt?: string;
  thumbUrl: string;
  fullUrl?: string;
  panoId?: string;
};

export type GeneratedPersona = {
  id: string;
  name: string;
  role: string;
  userIntro?: string;
  background?: string;
  interpretiveLens: string;
  voiceHint: string;
  voiceProfile?: VoiceProfile;
  promptInstruction: string;
};

export type VoiceProfile = {
  accent: "hong-kong-english" | "cantonese-leaning" | "shanxi" | "neutral-british" | "neutral";
  englishFluency: "limited" | "conversational" | "fluent";
  gender: "male" | "female";
  age: "young" | "middle" | "older";
  pace: "slow" | "normal" | "fast";
  tone: "reflective" | "casual" | "documentary" | "warm";
  cantoneseRatio: number;
};

export type SceneVisualDescription = {
  sceneType: string;
  spatialLayout: string;
  mainVisibleElements: string[];
  movementAndAccessCues: string[];
  materialAndAtmosphereCues: string[];
  uncertainty: string;
};

export type NearbyPlace = {
  id?: string;
  name: string;
  type?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  bearingFromScene?: number;
  headingDelta?: number;
  viewAlignment?: "inside_fragment_view" | "near_fragment_view" | "outside_fragment_view" | "unknown";
  spatialMatch?: "footprint_intersection" | "view_cone" | "centroid" | "nearby";
  relativeDirection?: "ahead" | "left" | "right" | "behind" | "nearby";
  source?: "google_places" | "osm" | "hk_landsd" | "hk_fehd" | "hk_amo";
};

export type PublicDataCandidate = {
  id: string;
  label: string;
  category?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  bearingFromScene?: number;
  headingDelta?: number;
  viewAlignment?: "inside_fragment_view" | "near_fragment_view" | "outside_fragment_view" | "unknown";
  spatialMatch?: "footprint_intersection" | "view_cone" | "centroid" | "nearby";
  relativeDirection?: "ahead" | "left" | "right" | "behind" | "nearby";
  url?: string;
  sourceTitle?: string;
  sourceTier?: SourceTier;
  source: "osm" | "hk_landsd" | "hk_fehd" | "hk_amo";
  relation: "nearby" | "visible-candidate";
};

export type SourceTier = "official" | "public_database" | "major_news" | "local_media" | "social" | "model";

export type SpatialMatch = "exact_address" | "nearby_address" | "area_only" | "unknown";

export type TemporalRelevance = "current" | "recent" | "historical" | "unknown";

export type LocalConcernLevel = "high" | "medium" | "low";

export type ContextCandidate = {
  id: string;
  label: string;
  category?: string;
  distanceMeters?: number;
  relativeDirection?: "ahead" | "left" | "right" | "behind" | "nearby";
  address?: string;
  publishedAt?: string;
  url?: string;
  sourceTitle?: string;
  sourceTier?: SourceTier;
  spatialMatch?: SpatialMatch | "footprint_intersection" | "view_cone" | "centroid" | "nearby";
  temporalRelevance?: TemporalRelevance;
  localConcernLevel?: LocalConcernLevel;
  retrievalScore?: number;
  matchReason?: string;
  source:
    | "google_places"
    | "osm"
    | "hk_landsd"
    | "hk_fehd"
    | "hk_amo"
    | "wikidata"
    | "wikipedia"
    | "gov_press_release"
    | "rthk"
    | "gdelt"
    | "social"
    | "google_reviews"
    | "place_memory";
  visibilityConfidence: "visible_likely" | "possible" | "nearby_only" | "area_background" | "reject";
  allowedUse: AllowedNarrativeUse;
};

export type CandidateVerificationMatch = {
  candidateId: string;
  label: string;
  source:
    | "google_places"
    | "osm"
    | "hk_landsd"
    | "hk_fehd"
    | "hk_amo"
    | "wikidata"
    | "wikipedia";
  category?: string;
  matchLevel: "likely" | "possible" | "nearby_only" | "reject";
  confidence: number;
  allowedUse: AllowedNarrativeUse;
  visibilityStatus: VisibilityStatus;
  visualEvidence: string[];
  mapEvidence: string[];
  reason: string;
  suggestedWording?: string;
};

export type CandidateVerification = {
  status: "verified" | "skipped";
  provider?: string;
  model?: string;
  matches: CandidateVerificationMatch[];
  rejected: CandidateVerificationMatch[];
  warnings: string[];
  createdAt: string;
};

export type PublicNewsItem = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source: "gov_press_release" | "rthk" | "gdelt";
  sourceTitle?: string;
  sourceTier: SourceTier;
  spatialMatch: SpatialMatch;
  temporalRelevance: TemporalRelevance;
  localConcernLevel: LocalConcernLevel;
  matchedTerms: string[];
};

export type PlaceReviewContextItem = {
  id: string;
  placeId?: string;
  placeName: string;
  title: string;
  summary: string;
  rating?: number;
  publishedAt?: string;
  source: "google_reviews";
  sourceTitle: "Google Places reviews";
  sourceTier: "social";
  spatialMatch: SpatialMatch;
  temporalRelevance: TemporalRelevance;
  localConcernLevel: LocalConcernLevel;
  matchedThemes: string[];
};

export type NearbyContinuationRecommendation = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  category?: string;
  recommendedSchema?: SchemaName;
  evidenceSources: Array<"wikipedia" | "wikidata" | "google_places" | "osm" | "hk_landsd" | "hk_fehd" | "hk_amo" | "street_view" | "news">;
  evidenceScore: number;
  thematicRelevance: number;
  streetViewAvailable: boolean;
  reason: string;
  uncertainty: "low" | "medium" | "high";
};

export type ExplorationJourneyStep = {
  sessionId: string;
  imageId: string;
  lat: number;
  lng: number;
  fragmentId?: string;
  recommendationPlaceId?: string;
  name?: string;
  createdAt: string;
};

export type LocalEntity = {
  id: string;
  label: string;
  description?: string;
  distanceMeters?: number;
  lat?: number;
  lng?: number;
  wikipediaUrl?: string;
  wikipediaTitle?: string;
  source: "wikidata";
  relation: "nearby" | "visible-candidate";
};

export type SourceNote = {
  title: string;
  extract: string;
  url: string;
  relatedEntityId?: string;
  relation: "nearby" | "visible-candidate";
  source: "wikipedia";
};

export type PlaceContext = {
  address?: string;
  heading?: number;
  places: NearbyPlace[];
  publicDataCandidates?: PublicDataCandidate[];
  publicNewsContext?: PublicNewsItem[];
  placeReviewContext?: PlaceReviewContextItem[];
  wikidataEntities?: LocalEntity[];
  sourceNotes?: SourceNote[];
  ragCandidates?: ContextCandidate[];
  ragSummary?: string;
  uncertainty: string;
};

export type TtsProvider = "local-open-source" | "elevenlabs" | "minimax";

export type StorySession = {
  id: string;
  provider: StreetImage["provider"];
  imageId: string;
  panoId?: string;
  lat: number;
  lng: number;
  selectedPersona?: GeneratedPersona;
  personas?: GeneratedPersona[];
  sceneVisualDescription?: SceneVisualDescription;
  placeContext?: PlaceContext;
  sceneOpeningGenerations?: Record<string, SceneOpeningGeneration>;
  journey?: ExplorationJourneyStep[];
  fragmentIds: string[];
  createdAt: string;
};

export type ScreenBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageCropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrivacyRisk = {
  containsFace: boolean;
  containsLicensePlate: boolean;
  containsPrivateInterior: boolean;
  riskLevel: "low" | "medium" | "high";
};

export type VisionDescription = {
  mainFeature: string;
  fragmentCategory: string;
  spatialContext: string;
  visibleText?: string[];
  visibleTextEnglish?: string[];
  publicEntityCandidates?: Array<{
    name: string;
    nameEnglish?: string;
    entityType?: string;
    evidence: string;
    confidence: number;
  }>;
  visibleCues: string[];
  possibleEverydayUses: string[];
  privacyRisk: PrivacyRisk;
  uncertainty: string;
};

export type SchemaNarratives = {
  functionalUse: {
    title: "Functional-Use";
    text: string;
  };
  identityBelonging: {
    title: "Identity-Belonging";
    text: string;
  };
  memoryTemporality: {
    title: "Memory-Temporality";
    text: string;
  };
  socialCulturalResonance: {
    title: "Social-Cultural Resonance";
    text: string;
  };
  storyBeats?: NarrativeBlock[];
};

export type SchemaName =
  | "Functional-Use"
  | "Identity-Belonging"
  | "Memory-Temporality"
  | "Social-Cultural Resonance";

export type EvidenceClaimType =
  | "visual_observation"
  | "pano_metadata"
  | "nearby_candidate"
  | "retrieved_area_context"
  | "official_notice"
  | "news_context"
  | "social_context"
  | "model_inference"
  | "blocked_sensitive";

export type AllowedNarrativeUse =
  | "direct_fact"
  | "cautious_possible"
  | "background_only"
  | "interpretation_only"
  | "do_not_use";

export type VisibilityStatus =
  | "visible_confirmed"
  | "possibly_visible"
  | "nearby_not_confirmed_visible"
  | "area_level_only"
  | "unknown";

export type EvidenceClaim = {
  id: string;
  text: string;
  source:
    | "vision_model"
    | "google_streetview"
    | "google_places"
    | "wikidata"
    | "wikipedia"
    | "osm"
    | "hk_landsd"
    | "hk_fehd"
    | "hk_amo"
    | "gov_press_release"
    | "rthk"
    | "gdelt"
    | "social"
    | "google_reviews"
    | "candidate_verifier"
    | "place_memory"
    | "system";
  claimType: EvidenceClaimType;
  confidence: number;
  visibilityStatus: VisibilityStatus;
  allowedUse: AllowedNarrativeUse;
  uncertaintyCueRequired: boolean;
  privacySensitive: boolean;
  relatedSchemas: SchemaName[];
  url?: string;
  publishedAt?: string;
  sourceTitle?: string;
  sourceTier?: SourceTier;
  spatialMatch?: SpatialMatch;
  temporalRelevance?: TemporalRelevance;
  localConcernLevel?: LocalConcernLevel;
};

export type EvidencePacket = {
  packetId: string;
  fragmentId: string;
  sessionId?: string;
  pano: {
    panoId?: string;
    lat?: number;
    lng?: number;
    heading?: number;
    pitch?: number;
    fov?: number;
    captureDate?: string | null;
    provider: StreetImage["provider"] | "unknown";
  };
  fragment: {
    cropImageUrl?: string;
    mainFeature: string;
    fragmentCategory: string;
    spatialContext: string;
    privacyRisk: PrivacyRisk["riskLevel"];
    uncertainty: "low" | "medium" | "high";
  };
  claims: EvidenceClaim[];
  globalRules: string[];
  storyAffordances: {
    supportsFunctionalUse: boolean;
    supportsIdentityBelonging: boolean;
    supportsMemoryTemporality: boolean;
    supportsSocialCulturalResonance: boolean;
    reason: string;
  };
  blockedTopics: string[];
  candidateVerification?: CandidateVerification;
  retrieval?: {
    strategy: "spatial-rag-v1";
    candidates: ContextCandidate[];
    summary?: string;
  };
};

export type NarrativeEvidenceView = {
  fragment: EvidencePacket["fragment"];
  primaryClaims: EvidenceClaim[];
  optionalNearbyClaims: EvidenceClaim[];
  suppressedClaimIds: string[];
  forbiddenVisibleNames: string[];
  guidance: string[];
};

export type StoryFactPlan = {
  likelyVisibleIdentity?: {
    label: string;
    confidence: "high" | "medium-high" | "medium";
    claimId: string;
    wording: string;
  };
  anchorFacts: Array<{
    claimId: string;
    text: string;
    priority: "must_use" | "should_use";
  }>;
  supportingFacts: Array<{
    claimId: string;
    text: string;
    priority: "optional";
  }>;
  avoidFacts: Array<{
    claimId?: string;
    label: string;
    reason: string;
  }>;
  guidance: string[];
};

export type FragmentAffordance =
  | "commercial"
  | "residential"
  | "mobility"
  | "wayfinding"
  | "public_facility"
  | "civic"
  | "cultural"
  | "heritage"
  | "green_space"
  | "social_gathering"
  | "infrastructure"
  | "safety_risk"
  | "private_sensitive";

export type PersonaFragmentPlan = {
  planId: string;
  fragmentId: string;
  personaId?: string;
  fitScore: number;
  fitLevel: "high" | "medium" | "low" | "not_applicable";
  narrativeMode: "full_interpretation" | "brief_comment" | "question_or_observation" | "disabled";
  activeSchemas: SchemaName[];
  personaCanSpeakAbout: string[];
  personaMustAvoid: string[];
  recommendedStance:
    | "confident_observation"
    | "cautious_interpretation"
    | "outsider_questioning"
    | "practical_commentary"
    | "public_context_explanation";
  sourceClaimIds: string[];
  affordances: FragmentAffordance[];
  localConcernLevel: LocalConcernLevel;
  reason: string;
};

export type NarrativeBlock = {
  schema: SchemaName;
  title?: string;
  text: string;
  claimType: "direct_observation" | "cautious_interpretation" | "persona_interpretation" | "background_context";
  groundedIn: string[];
  confidence: "low" | "medium" | "high";
  uncertaintyCue?: string;
};

export type NarrativeValidation = {
  status: "passed" | "warning" | "failed";
  warnings: string[];
  requiresRegeneration: boolean;
  validator?: "system" | "gemini" | "deepseek";
  model?: string;
  deterministicWarnings?: string[];
  aiWarnings?: string[];
  aiDecision?: Record<string, unknown>;
};

export type AgentRunSummary = {
  runId: string;
  agentName: string;
  status: "queued" | "running" | "succeeded" | "failed";
  durationMs?: number;
  errorMessage?: string;
};

export type NarrativeGeneration = {
  personaId: string;
  version?: number;
  narratives: SchemaNarratives;
  evidencePacket?: EvidencePacket;
  personaFragmentPlan?: PersonaFragmentPlan;
  narrativeBlocks?: NarrativeBlock[];
  narrativeValidation?: NarrativeValidation;
  agentRuns?: AgentRunSummary[];
  createdAt: string;
};

export type SceneOpeningBlock = {
  text: string;
  groundedIn: Array<"visual_scene" | "pano_location" | "nearby_context" | "persona_background">;
};

export type SceneOpeningValidation = {
  status: "passed" | "warning";
  warnings: string[];
};

export type SceneOpeningGeneration = {
  personaId: string;
  version?: number;
  openingText: string;
  openingBlocks: SceneOpeningBlock[];
  groundingSummary: string;
  openingValidation: SceneOpeningValidation;
  audioGeneration?: TtsAudioGeneration;
  createdAt: string;
};

export type FragmentStatus =
  | "cropping"
  | "analyzing"
  | "generating"
  | "ready"
  | "blocked"
  | "error";

export type PanoramaPov = {
  heading?: number;
  pitch?: number;
  fov?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  boxCorners?: {
    heading: number;
    pitch: number;
  }[];
};

export type TtsAudioGeneration = {
  cacheKey: string;
  provider: TtsProvider;
  audioUrl: string;
  durationMs?: number;
  speechText?: string;
  sourceText?: string;
  personaId?: string;
  voiceId?: string;
  createdAt: string;
};

export type SelectedFragment = {
  id: string;
  imageId: string;
  selectedAt: string;
  screenBox: ScreenBox;
  cropBox: ImageCropBox;
  cropImageUrl?: string;
  visionDescription?: VisionDescription;
  personas?: GeneratedPersona[];
  narratives?: SchemaNarratives;
  narrativePersonaId?: string;
  placeContext?: PlaceContext;
  panoramaPov?: PanoramaPov;
  evidencePacket?: EvidencePacket;
  personaFragmentPlans?: Record<string, PersonaFragmentPlan>;
  narrativeGenerations?: Record<string, NarrativeGeneration>;
  narrativeBlocks?: NarrativeBlock[];
  narrativeValidation?: NarrativeValidation;
  audioGenerations?: Record<string, TtsAudioGeneration>;
  status: FragmentStatus;
};

export type LogEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};
