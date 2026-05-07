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

export type TtsProvider = "local-open-source" | "elevenlabs";

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

export type SelectedFragment = {
  id: string;
  imageId: string;
  selectedAt: string;
  screenBox: ScreenBox;
  cropBox: ImageCropBox;
  cropImageUrl?: string;
  visionDescription?: VisionDescription;
  narratives?: SchemaNarratives;
  status: FragmentStatus;
};

export type LogEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};
