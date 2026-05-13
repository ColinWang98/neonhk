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
  accent: "hong-kong-english" | "cantonese-leaning" | "neutral-british" | "neutral";
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
  name: string;
  type?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  bearingFromScene?: number;
  relativeDirection?: "ahead" | "left" | "right" | "behind" | "nearby";
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
  wikidataEntities?: LocalEntity[];
  sourceNotes?: SourceNote[];
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
  source: "vision_model" | "google_streetview" | "google_places" | "wikidata" | "wikipedia" | "osm" | "system";
  claimType: EvidenceClaimType;
  confidence: number;
  visibilityStatus: VisibilityStatus;
  allowedUse: AllowedNarrativeUse;
  uncertaintyCueRequired: boolean;
  privacySensitive: boolean;
  relatedSchemas: SchemaName[];
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
  reason: string;
};

export type NarrativeBlock = {
  schema: SchemaName;
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
  narratives?: SchemaNarratives;
  narrativePersonaId?: string;
  placeContext?: PlaceContext;
  panoramaPov?: PanoramaPov;
  evidencePacket?: EvidencePacket;
  personaFragmentPlans?: Record<string, PersonaFragmentPlan>;
  narrativeBlocks?: NarrativeBlock[];
  narrativeValidation?: NarrativeValidation;
  audioGenerations?: Record<string, TtsAudioGeneration>;
  status: FragmentStatus;
};

export type LogEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};
