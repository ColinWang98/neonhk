import { generateGeminiJson, prepareGeminiImagePart, type GeminiPart } from "@/lib/gemini";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { SceneVisualDescription, StreetImage, VisionDescription } from "@/types";

const visionPrompt = `You are analyzing a user-selected crop from a street-level image.

Describe only what is visually observable.
Do not infer historical events, demographic identities, private information, ownership, or community facts.
Focus on spatial objects, visible traces, material qualities, boundaries, signs, access points, seating, surfaces, paths, and signs of use.
Read visible text carefully. If the crop shows a public institution, landmark, university, station, museum, hospital, government facility, or named building through visible signage, logos, or clearly readable text, include it as a publicEntityCandidate. Do not identify private people or private homes.

Return strict JSON with:
{
  "mainFeature": string,
  "fragmentCategory": string,
  "spatialContext": string,
  "visibleText": string[],
  "publicEntityCandidates": [
    {
      "name": string,
      "entityType": string,
      "evidence": string,
      "confidence": number
    }
  ],
  "visibleCues": string[],
  "possibleEverydayUses": string[],
  "privacyRisk": {
    "containsFace": boolean,
    "containsLicensePlate": boolean,
    "containsPrivateInterior": boolean,
    "riskLevel": "low" | "medium" | "high"
  },
  "uncertainty": string
}

If the crop contains identifiable people, license plates, private interiors, or sensitive information, mark privacyRisk.riskLevel as "medium" or "high".`;

const scenePrompt = `You are analyzing a full street-level panorama snapshot for a place-story prototype.

Describe only what is visually observable. Do not infer historical events, demographic identities, ownership, private information, or community facts.
Focus on spatial layout, visible public-space elements, movement/access cues, material qualities, surfaces, boundaries, signs, seating, paths, and signs of everyday use.

Return strict JSON with:
{
  "sceneType": string,
  "spatialLayout": string,
  "mainVisibleElements": string[],
  "movementAndAccessCues": string[],
  "materialAndAtmosphereCues": string[],
  "uncertainty": string
}`;

export async function analyzeFragment(
  cropImageUrl: string,
  config: RuntimeApiConfig = {}
): Promise<VisionDescription> {
  const imageUrl = cropImageUrl.startsWith("http")
    ? cropImageUrl
    : new URL(
        cropImageUrl,
        config.appUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      ).toString();

  const parts: GeminiPart[] = [
    { text: visionPrompt },
    await prepareGeminiImagePart(imageUrl, "Gemini fragment analysis")
  ];
  const raw = await generateGeminiJson({
    parts,
    temperature: 0.1,
    errorPrefix: "Gemini fragment analysis"
  });
  const vision = JSON.parse(extractJsonObject(raw)) as VisionDescription;

  return normalizeVisibleTextForEvidence(vision, config);
}

export async function analyzeSceneSnapshot(params: {
  image: StreetImage;
  snapshotUrl?: string;
  config?: RuntimeApiConfig;
}): Promise<SceneVisualDescription> {
  if (!params.snapshotUrl) {
    throw new Error("Scene analysis requires a panorama snapshot URL.");
  }

  const parts: GeminiPart[] = [
    { text: scenePrompt },
    {
      text: JSON.stringify({
        image: {
          provider: params.image.provider,
          lat: params.image.lat,
          lng: params.image.lng,
          panoId: params.image.panoId || params.image.id,
          capturedAt: params.image.capturedAt
        }
      })
    },
    await prepareGeminiImagePart(params.snapshotUrl, "Gemini scene analysis")
  ];
  const raw = await generateGeminiJson({
    parts,
    temperature: 0.1,
    errorPrefix: "Gemini scene analysis"
  });

  return JSON.parse(extractJsonObject(raw)) as SceneVisualDescription;
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Vision model returned non-JSON content.");
  }

  return match[0];
}

async function normalizeVisibleTextForEvidence(
  vision: VisionDescription,
  _config: RuntimeApiConfig
): Promise<VisionDescription> {
  void _config;
  const visibleText = (vision.visibleText || []).map((text) => text.trim()).filter(Boolean);
  const entities = vision.publicEntityCandidates || [];
  if (!visibleText.length && !entities.length) return vision;

  const needsEnglish = [...visibleText, ...entities.map((entity) => entity.name)].some((text) => /[^\x00-\x7F]/.test(text));
  if (!needsEnglish) {
    return {
      ...vision,
      visibleTextEnglish: visibleText,
      publicEntityCandidates: entities.map((entity) => ({ ...entity, nameEnglish: entity.name }))
    };
  }

  const raw = await generateGeminiJson({
    parts: [
      {
        text: JSON.stringify({
          task: "Translate OCR text and public place/entity names into concise English for backend evidence only. Do not add facts. Preserve proper nouns where appropriate.",
          visibleText,
          publicEntityNames: entities.map((entity) => entity.name),
          outputShape: {
            visibleTextEnglish: ["string"],
            publicEntityNamesEnglish: ["string"]
          }
        })
      }
    ],
    temperature: 0,
    errorPrefix: "Gemini OCR translation"
  });
  const parsed = JSON.parse(extractJsonObject(raw)) as {
    visibleTextEnglish?: string[];
    publicEntityNamesEnglish?: string[];
  };
  return {
    ...vision,
    visibleTextEnglish: normalizeStringList(parsed.visibleTextEnglish, visibleText),
    publicEntityCandidates: entities.map((entity, index) => ({
      ...entity,
      nameEnglish: parsed.publicEntityNamesEnglish?.[index]?.trim() || entity.name
    }))
  };
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value.map((item) => String(item || "").trim()).filter(Boolean);
  return next.length ? next : fallback;
}
