import type { ChatCompletion } from "openai/resources/chat/completions";
import { createAiClient, normalizeQwenVisionModel, type AiProvider } from "@/lib/aiProvider";
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

  const vision = await callVisionWithFallback({
    config,
    imageUrl,
    prompt: visionPrompt,
    purpose: "fragment"
  }) as VisionDescription;

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

async function callVisionWithFallback(params: {
  config: RuntimeApiConfig;
  imageUrl: string;
  prompt: string;
  metadata?: unknown;
  purpose: "scene" | "fragment";
}) {
  const primaryProvider = params.config.visionProvider === "glm" ? "glm" : "qwen";
  const providers: AiProvider[] = primaryProvider === "qwen" ? ["qwen", "glm"] : ["glm", "qwen"];
  let lastError: unknown;

  for (const provider of providers) {
    const model =
      params.purpose === "scene" && provider === "qwen"
        ? normalizeQwenVisionModel(params.config.sceneVisionModel || process.env.SCENE_VISION_MODEL || "qwen3-vl-flash")
        : undefined;
    const ai = createAiClient(params.config, "vision", { provider, model });
    if (!ai || ai.model === "fallback") continue;

    try {
      const visionImageUrl = await prepareVisionImageUrl(params.imageUrl, ai.provider);
      const request = {
        model: ai.model,
        ...ai.defaults,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: params.prompt },
              ...(params.metadata ? [{ type: "text" as const, text: JSON.stringify(params.metadata) }] : []),
              { type: "image_url", image_url: { url: visionImageUrl } }
            ]
          }
        ],
        ...(ai.provider === "qwen" && params.purpose === "fragment"
          ? { vl_high_resolution_images: true }
          : {})
      };
      const response = await ai.client.chat.completions.create(
        request as Parameters<typeof ai.client.chat.completions.create>[0]
      ) as ChatCompletion;

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error(`Vision model ${ai.provider}/${ai.model} returned no content.`);
      }

      return JSON.parse(extractJsonObject(content));
    } catch (error) {
      lastError = error;
      console.warn("[vision.model] failed", {
        provider: ai.provider,
        model: ai.model,
        purpose: params.purpose,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (params.purpose === "fragment") {
    throw normalizeVisionError(lastError);
  }
  throw lastError instanceof Error ? lastError : new Error("Vision model failed.");
}

async function prepareVisionImageUrl(imageUrl: string, provider: string) {
  if ((provider !== "glm" && provider !== "qwen") || !imageUrl.startsWith("http")) {
    return imageUrl;
  }

  const res = await fetch(imageUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch image for ${provider} vision: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  console.info("[vision.image] prepared_base64", {
    provider,
    bytes: buffer.length
  });

  const base64 = buffer.toString("base64");
  return provider === "qwen" ? `data:${contentType};base64,${base64}` : base64;
}

function normalizeVisionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Vision model failed.");
  if (message.includes("429") || message.toLowerCase().includes("rate")) {
    return new Error(`Vision model rate limited: ${message}`);
  }
  return error instanceof Error ? error : new Error(message);
}

async function normalizeVisibleTextForEvidence(
  vision: VisionDescription,
  config: RuntimeApiConfig
): Promise<VisionDescription> {
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

  const ai = createAiClient(config, "text");
  if (!ai) {
    return vision;
  }

  try {
    const response = await ai.client.chat.completions.create({
      model: ai.model,
      ...ai.defaults,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            task: "Translate OCR text and public place/entity names into concise English for backend evidence only. Do not add facts. Preserve proper nouns where appropriate.",
            visibleText,
            publicEntityNames: entities.map((entity) => entity.name),
            outputShape: {
              visibleTextEnglish: ["string"],
              publicEntityNamesEnglish: ["string"]
            }
          })
        }
      ]
    });
    const raw = response.choices[0]?.message.content;
    if (!raw) return vision;
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
  } catch {
    return vision;
  }
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value.map((item) => String(item || "").trim()).filter(Boolean);
  return next.length ? next : fallback;
}
