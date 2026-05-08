import type { ChatCompletion } from "openai/resources/chat/completions";
import { createAiClient, type AiProvider } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { SceneVisualDescription, StreetImage, VisionDescription } from "@/types";

const visionPrompt = `You are analyzing a user-selected crop from a street-level image.

Describe only what is visually observable.
Do not infer historical events, demographic identities, private information, ownership, or community facts.
Focus on spatial objects, visible traces, material qualities, boundaries, signs, access points, seating, surfaces, paths, and signs of use.

Return strict JSON with:
{
  "mainFeature": string,
  "fragmentCategory": string,
  "spatialContext": string,
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

  return callVisionWithFallback({
    config,
    imageUrl,
    prompt: visionPrompt,
    purpose: "fragment"
  }) as Promise<VisionDescription>;
}

export async function analyzeSceneSnapshot(params: {
  image: StreetImage;
  snapshotUrl?: string;
  config?: RuntimeApiConfig;
}): Promise<SceneVisualDescription> {
  if (!params.snapshotUrl) {
    return fallbackSceneDescription(params.image);
  }

  try {
    return (await callVisionWithFallback({
      config: params.config || {},
      imageUrl: params.snapshotUrl,
      prompt: scenePrompt,
      metadata: params.image,
      purpose: "scene"
    })) as SceneVisualDescription;
  } catch {
    return fallbackSceneDescription(params.image);
  }
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
        ? params.config.sceneVisionModel || process.env.SCENE_VISION_MODEL || "qwen3.6-flash"
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

export function fallbackSceneDescription(image: StreetImage): SceneVisualDescription {
  const source = image.provider === "google" ? "street-view panorama" : "street-level image";
  return {
    sceneType: source,
    spatialLayout: "A street-level scene selected from the map. The exact layout is not visually analyzed because no vision model result is available.",
    mainVisibleElements: ["street-level view", "public-space context", "nearby urban surfaces"],
    movementAndAccessCues: ["possible walking route", "possible edge or threshold", "orientation cues from the street image"],
    materialAndAtmosphereCues: ["outdoor urban materials", "street-view visual texture"],
    uncertainty: "This is a fallback description; detailed visual cues require a configured vision model."
  };
}
