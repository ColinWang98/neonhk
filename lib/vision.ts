import { createAiClient } from "@/lib/aiProvider";
import { fallbackVisionDescription } from "@/lib/privacyFilter";
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
  const ai = createAiClient(config, "vision");

  if (!ai || ai.model === "fallback") {
    return fallbackVisionDescription();
  }

  const imageUrl = cropImageUrl.startsWith("http")
    ? cropImageUrl
    : new URL(
        cropImageUrl,
        config.appUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      ).toString();

  const response = await ai.client.chat.completions.create({
    model: ai.model,
    ...ai.defaults,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: visionPrompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Vision model returned no content.");
  }

  return JSON.parse(extractJsonObject(content)) as VisionDescription;
}

export async function analyzeSceneSnapshot(params: {
  image: StreetImage;
  snapshotUrl?: string;
  config?: RuntimeApiConfig;
}): Promise<SceneVisualDescription> {
  if (!params.snapshotUrl) {
    return fallbackSceneDescription(params.image);
  }

  const ai = createAiClient(params.config || {}, "vision");

  if (!ai || ai.model === "fallback") {
    return fallbackSceneDescription(params.image);
  }

  const response = await ai.client.chat.completions.create({
    model: ai.model,
    ...ai.defaults,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: scenePrompt },
          { type: "text", text: JSON.stringify({ image: params.image }) },
          { type: "image_url", image_url: { url: params.snapshotUrl } }
        ]
      }
    ]
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error("Vision model returned no scene content.");
  }

  return JSON.parse(extractJsonObject(content)) as SceneVisualDescription;
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

export function fallbackSceneDescription(image: StreetImage): SceneVisualDescription {
  const source = image.provider === "google" ? "street-view panorama" : "street-level image";
  return {
    sceneType: source,
    spatialLayout: "A street-level scene selected from the map. The exact layout is not visually analyzed because no vision model result is available.",
    mainVisibleElements: ["street-level view", "public-space context", "nearby urban surfaces"],
    movementAndAccessCues: ["possible walking route", "possible edge or threshold", "orientation cues from the street image"],
    materialAndAtmosphereCues: ["outdoor urban materials", "street-view visual texture"],
    uncertainty: "This is a fallback description; detailed visual cues require a configured GLM vision model."
  };
}
