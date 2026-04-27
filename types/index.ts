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
