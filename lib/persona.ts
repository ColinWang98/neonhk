import { createAiClient } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, SceneVisualDescription, StreetImage } from "@/types";

const personaPrompt = `Generate three scene-grounded interpretive personas for a Hong Kong street-view scene.

Use only the provided sceneVisualDescription and spatially cautious interpretation. Do not invent historical facts, demographic identities, private information, ownership, events, or community stories.

Each persona should help a user notice a different relationship between place fragments and everyday spatial experience.

Return strict JSON:
{
  "personas": [
    {
      "id": string,
      "name": string,
      "role": string,
      "interpretiveLens": string,
      "voiceHint": string,
      "voiceProfile": {
        "accent": "hong-kong-english" | "cantonese-leaning" | "neutral-british" | "neutral",
        "englishFluency": "limited" | "conversational" | "fluent",
        "gender": "male" | "female",
        "age": "young" | "middle" | "older",
        "pace": "slow" | "normal" | "fast",
        "tone": "reflective" | "casual" | "documentary" | "warm",
        "cantoneseRatio": number
      },
      "promptInstruction": string
    }
  ]
}`;

export async function generatePersonas(params: {
  image: StreetImage;
  sceneVisualDescription?: SceneVisualDescription;
  config?: RuntimeApiConfig;
}): Promise<GeneratedPersona[]> {
  const ai = createAiClient(params.config || {}, "text");

  if (!ai) {
    return fallbackPersonas(params.image);
  }

  const response = await ai.client.chat.completions.create({
    model: ai.model,
    ...ai.defaults,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: personaPrompt },
      {
        role: "user",
        content: JSON.stringify({
          image: params.image,
          sceneVisualDescription: params.sceneVisualDescription,
          languageStyle:
            "Persona names and roles should be concise English. Interpretive lens can use light Hong Kong bilingual phrasing where natural."
        })
      }
    ]
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Persona model returned no content.");
  }

  const parsed = JSON.parse(extractJsonObject(raw)) as { personas?: GeneratedPersona[] };
  return normalizePersonas(parsed.personas, params.image);
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Persona model returned non-JSON content.");
  }

  return match[0];
}

export function fallbackPersonas(image: StreetImage): GeneratedPersona[] {
  const source = image.provider === "google" ? "panorama" : "street image";
  return [
    {
      id: "threshold-reader",
      name: "Threshold Reader",
      role: "A cautious observer of entrances, edges, and transitions.",
      interpretiveLens: `Reads this ${source} through access, boundaries, and how people may understand where to enter, pause, or pass.`,
      voiceHint: "Hong Kong bilingual, calm, spatially attentive",
      voiceProfile: {
        accent: "hong-kong-english",
        englishFluency: "fluent",
        gender: "female",
        age: "middle",
        pace: "normal",
        tone: "documentary",
        cantoneseRatio: 0.2
      },
      promptInstruction:
        "Write as a careful Hong Kong spatial observer who notices thresholds, access points, railings, pavement edges, and signs without inventing social facts."
    },
    {
      id: "routine-listener",
      name: "Routine Listener",
      role: "A listener for everyday repetition, maintenance, and movement.",
      interpretiveLens: `Reads this ${source} through daily routes, repeated use, waiting, wear, and ordinary maintenance.`,
      voiceHint: "Cantonese leaning, reflective, everyday rhythm",
      voiceProfile: {
        accent: "cantonese-leaning",
        englishFluency: "conversational",
        gender: "male",
        age: "older",
        pace: "slow",
        tone: "reflective",
        cantoneseRatio: 0.35
      },
      promptInstruction:
        "Write with attention to repeated use, maintenance, and visible traces of routine, using cautious bilingual Hong Kong phrasing."
    },
    {
      id: "public-order-guide",
      name: "Public Order Guide",
      role: "A guide to how shared space is organized and made legible.",
      interpretiveLens: `Reads this ${source} through public order, shared norms, navigation, and small cues that organize collective use.`,
      voiceHint: "English narrator with Hong Kong place sensitivity",
      voiceProfile: {
        accent: "neutral-british",
        englishFluency: "fluent",
        gender: "female",
        age: "young",
        pace: "normal",
        tone: "warm",
        cantoneseRatio: 0.1
      },
      promptInstruction:
        "Write as a public-space guide who explains visible cues of order, navigation, and shared use without claiming unverifiable cultural history."
    }
  ];
}

function normalizePersonas(personas: GeneratedPersona[] | undefined, image: StreetImage) {
  const fallback = fallbackPersonas(image);
  if (!personas?.length) return fallback;

  return personas.slice(0, 3).map((persona, index) => ({
    id: persona.id || fallback[index]?.id || `persona-${index + 1}`,
    name: persona.name || fallback[index]?.name || `Persona ${index + 1}`,
    role: persona.role || fallback[index]?.role || "A cautious spatial observer.",
    interpretiveLens:
      persona.interpretiveLens ||
      fallback[index]?.interpretiveLens ||
      "Reads visible spatial cues with caution.",
    voiceHint: persona.voiceHint || fallback[index]?.voiceHint || "Hong Kong bilingual",
    voiceProfile: persona.voiceProfile || fallback[index]?.voiceProfile,
    promptInstruction:
      persona.promptInstruction ||
      fallback[index]?.promptInstruction ||
      "Use only observable cues and cautious interpretation."
  }));
}
