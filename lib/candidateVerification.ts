import { generateGeminiJson, geminiModel, prepareGeminiImagePart, stripJsonFence, type GeminiPart } from "@/lib/gemini";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type {
  AllowedNarrativeUse,
  CandidateVerification,
  CandidateVerificationMatch,
  NearbyPlace,
  PanoramaPov,
  PlaceContext,
  PublicDataCandidate,
  StreetImage,
  VisibilityStatus,
  VisionDescription
} from "@/types";

type CandidateInput = {
  candidateId: string;
  label: string;
  source: CandidateVerificationMatch["source"];
  category?: string;
  address?: string;
  distanceMeters?: number;
  headingDelta?: number;
  viewAlignment?: string;
  spatialMatch?: string;
  relativeDirection?: string;
};

type VerifyParams = {
  cropImageUrl?: string;
  image?: StreetImage;
  panoramaPov?: PanoramaPov;
  visionDescription: VisionDescription;
  placeContext?: PlaceContext;
  config?: RuntimeApiConfig;
};

const verificationPrompt = `You verify whether map candidates plausibly match a user-selected Street View crop.

You are not writing a story. You are only judging visual-map correspondence.

Use:
- the selected crop image
- optional whole panorama image
- the vision summary
- map/public candidates with distance, heading, view alignment, and footprint metadata

Rules:
- Return JSON only.
- Prefer concrete public-place names when visual and map evidence support them.
- Do not require OCR. Building type, scale, facade, campus/station/hospital cues, direction, footprint, and distance can support a cautious match.
- Do not overclaim. If there is no readable sign, use likely or possible, not certain.
- A public institution or landmark can be "likely" when the crop visually fits and the candidate is close plus inside/near the viewing cone or footprint.
- A shop or small business needs stronger visual evidence. Without sign text or a clear storefront match, keep it possible or nearby_only.
- Reject candidates that visually do not fit the crop.
- Do not identify private people, homes, or private routines.

Use these allowedUse values:
- direct_fact: only if readable text or a very clear visual sign confirms the candidate.
- cautious_possible: likely/possible visual-map match without exact visual text confirmation.
- background_only: nearby_only or area-level context.
- do_not_use: rejected candidate.

Return this JSON shape:
{
  "matches": [
    {
      "candidateId": string,
      "label": string,
      "source": "google_places" | "osm" | "hk_landsd" | "wikidata" | "wikipedia",
      "category": string,
      "matchLevel": "likely" | "possible" | "nearby_only" | "reject",
      "confidence": number,
      "allowedUse": "direct_fact" | "cautious_possible" | "background_only" | "do_not_use",
      "visibilityStatus": "visible_confirmed" | "possibly_visible" | "nearby_not_confirmed_visible" | "area_level_only" | "unknown",
      "visualEvidence": [string],
      "mapEvidence": [string],
      "reason": string,
      "suggestedWording": string
    }
  ],
  "warnings": [string]
}`;

export async function verifyCandidateMatches(params: VerifyParams): Promise<CandidateVerification> {
  const candidates = collectCandidates(params.placeContext);
  if (!params.cropImageUrl || candidates.length === 0) {
    return skipped("No crop image or map candidates available.");
  }

  return verifyWithGemini(params, candidates);
}

async function verifyWithGemini(params: VerifyParams, candidates: CandidateInput[]): Promise<CandidateVerification> {
  const model = geminiModel();
  const cropImage = await prepareGeminiImagePart(params.cropImageUrl || "", "Gemini candidate verification");
  const wholeImageUrl = params.image?.fullUrl || params.image?.thumbUrl;
  const parts: GeminiPart[] = [
    { text: verificationPrompt },
    {
      text: JSON.stringify({
        task: "Verify which map candidate, if any, matches the selected crop.",
        pano: {
          id: params.image?.panoId || params.image?.id,
          lat: params.image?.lat,
          lng: params.image?.lng,
          heading: params.panoramaPov?.heading ?? params.placeContext?.heading,
          pitch: params.panoramaPov?.pitch,
          fov: params.panoramaPov?.fov
        },
        visionSummary: {
          mainFeature: params.visionDescription.mainFeature,
          fragmentCategory: params.visionDescription.fragmentCategory,
          spatialContext: params.visionDescription.spatialContext,
          visibleText: params.visionDescription.visibleTextEnglish || params.visionDescription.visibleText || [],
          publicEntityCandidates: params.visionDescription.publicEntityCandidates || [],
          visibleCues: params.visionDescription.visibleCues
        },
        mapCandidates: candidates
      })
    },
    cropImage
  ];

  if (wholeImageUrl) {
    parts.push(await prepareGeminiImagePart(wholeImageUrl, "Gemini candidate verification"));
  }

  const raw = await generateGeminiJson({
    parts,
    model,
    temperature: 0.1,
    errorPrefix: "Gemini candidate verification"
  });

  return normalizeVerificationOutput(raw, candidates, "gemini", model);
}

function normalizeVerificationOutput(
  raw: string,
  candidates: CandidateInput[],
  provider: string,
  model: string
): CandidateVerification {
  const parsed = JSON.parse(stripJsonFence(raw)) as { matches?: Partial<CandidateVerificationMatch>[]; warnings?: string[] };
  const known = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const matches = (parsed.matches || [])
    .map((match) => normalizeMatch(match, known))
    .filter((match): match is CandidateVerificationMatch => Boolean(match));

  return {
    status: "verified",
    provider,
    model,
    matches: matches.filter((match) => match.matchLevel !== "reject"),
    rejected: matches.filter((match) => match.matchLevel === "reject"),
    warnings: normalizeStringArray(parsed.warnings).slice(0, 5),
    createdAt: new Date().toISOString()
  };
}

function collectCandidates(placeContext?: PlaceContext): CandidateInput[] {
  const candidates: CandidateInput[] = [];
  (placeContext?.places || []).slice(0, 8).forEach((place, index) => {
    candidates.push(candidateFromPlace(place, `g${index + 1}`));
  });
  (placeContext?.publicDataCandidates || []).slice(0, 8).forEach((candidate, index) => {
    candidates.push(candidateFromPublicData(candidate, `${candidate.source === "osm" ? "osm" : "hk"}${index + 1}`));
  });
  (placeContext?.wikidataEntities || []).slice(0, 4).forEach((entity, index) => {
    candidates.push({
      candidateId: `wd${index + 1}`,
      label: entity.label,
      source: "wikidata",
      category: entity.description,
      distanceMeters: entity.distanceMeters,
      relativeDirection: entity.relation
    });
  });
  return candidates
    .filter((candidate) => candidate.label)
    .sort((a, b) => candidatePriority(b) - candidatePriority(a))
    .slice(0, 12);
}

function candidateFromPlace(place: NearbyPlace, candidateId: string): CandidateInput {
  return {
    candidateId,
    label: place.name,
    source: place.source === "osm" || place.source === "hk_landsd" ? place.source : "google_places",
    category: place.type,
    address: place.address,
    distanceMeters: place.distanceMeters,
    headingDelta: place.headingDelta,
    viewAlignment: place.viewAlignment,
    spatialMatch: place.spatialMatch,
    relativeDirection: place.relativeDirection
  };
}

function candidateFromPublicData(candidate: PublicDataCandidate, candidateId: string): CandidateInput {
  return {
    candidateId,
    label: candidate.label,
    source: candidate.source,
    category: candidate.category,
    address: candidate.address,
    distanceMeters: candidate.distanceMeters,
    headingDelta: candidate.headingDelta,
    viewAlignment: candidate.viewAlignment,
    spatialMatch: candidate.spatialMatch,
    relativeDirection: candidate.relativeDirection || candidate.relation
  };
}

function candidatePriority(candidate: CandidateInput) {
  const alignment =
    candidate.spatialMatch === "footprint_intersection"
      ? 60
      : candidate.viewAlignment === "inside_fragment_view"
        ? 45
        : candidate.viewAlignment === "near_fragment_view"
          ? 28
          : candidate.relativeDirection === "ahead"
            ? 16
            : 0;
  const distance = Math.max(0, 30 - Math.min(candidate.distanceMeters || 300, 300) / 10);
  const publicPlace = /university|school|campus|hospital|station|museum|library|government|polytechnic|public/i.test(
    `${candidate.label} ${candidate.category || ""}`
  ) ? 18 : 0;
  return alignment + distance + publicPlace;
}

function normalizeMatch(
  value: Partial<CandidateVerificationMatch>,
  known: Map<string, CandidateInput>
): CandidateVerificationMatch | undefined {
  const id = String(value.candidateId || "").trim();
  const candidate = known.get(id);
  if (!candidate) return undefined;

  const matchLevel = normalizeMatchLevel(value.matchLevel);
  const allowedUse = normalizeAllowedUse(value.allowedUse, matchLevel);
  const visibilityStatus = normalizeVisibilityStatus(value.visibilityStatus, matchLevel);

  return {
    candidateId: id,
    label: candidate.label,
    source: candidate.source,
    category: candidate.category,
    matchLevel,
    confidence: clampConfidence(value.confidence),
    allowedUse,
    visibilityStatus,
    visualEvidence: normalizeStringArray(value.visualEvidence).slice(0, 4),
    mapEvidence: normalizeStringArray(value.mapEvidence).slice(0, 4),
    reason: String(value.reason || "").trim().slice(0, 420),
    suggestedWording: String(value.suggestedWording || "").trim().slice(0, 260) || undefined
  };
}

function normalizeMatchLevel(value?: string): CandidateVerificationMatch["matchLevel"] {
  if (value === "likely" || value === "possible" || value === "nearby_only" || value === "reject") return value;
  return "possible";
}

function normalizeAllowedUse(value: unknown, matchLevel: CandidateVerificationMatch["matchLevel"]): AllowedNarrativeUse {
  if (value === "direct_fact" || value === "cautious_possible" || value === "background_only" || value === "do_not_use") {
    return value;
  }
  if (matchLevel === "reject") return "do_not_use";
  if (matchLevel === "nearby_only") return "background_only";
  return "cautious_possible";
}

function normalizeVisibilityStatus(value: unknown, matchLevel: CandidateVerificationMatch["matchLevel"]): VisibilityStatus {
  if (
    value === "visible_confirmed" ||
    value === "possibly_visible" ||
    value === "nearby_not_confirmed_visible" ||
    value === "area_level_only" ||
    value === "unknown"
  ) {
    return value;
  }
  if (matchLevel === "likely" || matchLevel === "possible") return "possibly_visible";
  if (matchLevel === "nearby_only") return "nearby_not_confirmed_visible";
  return "unknown";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function clampConfidence(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.55;
  return Math.max(0, Math.min(1, num));
}

function skipped(reason: string): CandidateVerification {
  return {
    status: "skipped",
    matches: [],
    rejected: [],
    warnings: [reason],
    createdAt: new Date().toISOString()
  };
}
