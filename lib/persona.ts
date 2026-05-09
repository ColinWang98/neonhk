import { createAiClient } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, SceneVisualDescription, StreetImage } from "@/types";

const personaPrompt = `Generate three scene-grounded fictional interpretive personas for a Hong Kong street-view scene.

Use only the provided sceneVisualDescription and spatially cautious interpretation. Do not invent historical facts, demographic identities, private information, ownership, events, or community stories.

Each persona should help a user notice a different relationship between place fragments and everyday spatial experience. They may carry cultural judgement and local sensibility, but their voice should feel like a regular person talking on the street.

The persona background should feel like a vivid but clearly fictional guide character, not a factual claim about the photographed place. Give each persona a grounded Hong Kong life texture: age range, occupation or past occupation, daily habits, food preferences, leisure interests, and a way of speaking. Keep cultural interpretation internalized through everyday details rather than literary, symbolic, or grand language. Use a natural mix of genders and ages when appropriate. Do not say the person actually lives at, owns, represents, or historically belongs to the selected street.

Return strict JSON:
{
  "personas": [
    {
      "id": string,
      "name": string,
      "role": string,
      "background": string,
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
            "Persona names and roles should be concise English. Backgrounds should be warm, specific, and human, with light Hong Kong bilingual phrasing where natural. They can have cultural perspective, but express it through ordinary jobs, routines, food, transport, shopping, weather, family habits, and street manners."
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
      name: "Mr. Lau Wai-kin",
      role: "A retired primary-school teacher who notices entrances, edges, and small rules of movement.",
      background:
        "Fictional guide: 56, born and raised in Hong Kong, taught primary school for three decades, likes morning tea, pork chop rice, and watching horse racing with old colleagues. He speaks carefully, with a teacher's habit of pointing out what people may miss.",
      interpretiveLens: `Reads this ${source} through access, boundaries, and how people may understand where to enter, pause, or pass.`,
      voiceHint: "Hong Kong bilingual, mature male, teacherly warmth",
      voiceProfile: {
        accent: "hong-kong-english",
        englishFluency: "fluent",
        gender: "male",
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
      name: "Auntie Mei",
      role: "A former wet-market stall assistant who reads streets through routine, waiting, and repeated movement.",
      background:
        "Fictional guide: 64, spent much of her working life around shopfronts, kerbs, queues, and early-morning deliveries. She enjoys hot milk tea, egg tarts, and slow walks after dinner. Her comments are practical, observant, and slightly nostalgic.",
      interpretiveLens: `Reads this ${source} through daily routes, repeated use, waiting, wear, and ordinary maintenance.`,
      voiceHint: "Cantonese leaning, older female, reflective street rhythm",
      voiceProfile: {
        accent: "cantonese-leaning",
        englishFluency: "conversational",
        gender: "female",
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
      name: "Jason Tang",
      role: "A young community arts producer who notices how public space feels shared, readable, and socially comfortable.",
      background:
        "Fictional guide: 29, grew up between housing estates and MTR exits, works on small neighbourhood exhibitions, likes cha chaan teng set lunches, indie bookshops, and late tram rides. He speaks with quick curiosity and gentle humour.",
      interpretiveLens: `Reads this ${source} through public order, shared norms, navigation, and small cues that organize collective use.`,
      voiceHint: "Young Hong Kong English male, warm, curious, lightly playful",
      voiceProfile: {
        accent: "neutral-british",
        englishFluency: "fluent",
        gender: "male",
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
    background:
      persona.background ||
      fallback[index]?.background ||
      "Fictional guide with a grounded Hong Kong everyday perspective.",
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
