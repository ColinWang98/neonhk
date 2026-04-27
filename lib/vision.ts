import OpenAI from "openai";
import { fallbackVisionDescription } from "@/lib/privacyFilter";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { VisionDescription } from "@/types";

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

export async function analyzeFragment(
  cropImageUrl: string,
  config: RuntimeApiConfig = {}
): Promise<VisionDescription> {
  const apiKey = config.aiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = config.aiBaseUrl || process.env.AI_BASE_URL;
  const model = config.visionModel || process.env.VISION_MODEL || "gpt-4o-mini";

  if (!apiKey || model === "fallback" || baseURL?.includes("deepseek.com")) {
    return fallbackVisionDescription();
  }

  const client = new OpenAI({ apiKey, baseURL });
  const imageUrl = cropImageUrl.startsWith("http")
    ? cropImageUrl
    : new URL(
        cropImageUrl,
        config.appUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      ).toString();

  const response = await client.chat.completions.create({
    model,
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

  return JSON.parse(content) as VisionDescription;
}
