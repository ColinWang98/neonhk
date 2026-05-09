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
  audioGenerations?: Record<string, TtsAudioGeneration>;
  status: FragmentStatus;
};

export type LogEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};
