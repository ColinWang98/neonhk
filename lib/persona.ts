import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import { generateTextJson } from "@/lib/textModel";
import type { GeneratedPersona, SceneVisualDescription, StreetImage } from "@/types";

const personaPrompt = `Generate three scene-grounded fictional interpretive personas for a Hong Kong street-view scene.

Use only the provided sceneVisualDescription and spatially cautious interpretation. Do not invent historical facts, demographic identities, private information, ownership, events, or community stories.

Each persona should help a user notice a different relationship between place fragments and everyday spatial experience. They may carry cultural judgement and local sensibility, but their voice should feel like a regular person talking on the street.

Age and residency constraints:
- Generate only personas aged 40 or above.
- Do not generate young adult personas.
- Keep identities diverse through relationship to Hong Kong rather than age: include a mix such as local resident, visitor/tourist, temporary resident, return visitor, or short-term worker.
- Across the three personas, prefer one local resident, one visitor/tourist, and one temporary resident or recent arrival when this fits the scene.

The persona background should feel like a vivid but clearly fictional guide character, not a factual claim about the photographed place. Give each persona a grounded life texture: age, relationship to Hong Kong, occupation or past occupation, daily habits, food preferences, leisure interests, and a way of speaking. Keep cultural interpretation internalized through everyday details rather than literary, symbolic, or grand language. Use a natural mix of genders when appropriate. Do not say the person actually lives at, owns, represents, or historically belongs to the selected street.

For each persona, also generate userIntro. This is the only short biography shown to the user. It must be 12-20 words, plain and non-literary, and mainly state:
- approximate age
- gender
- relationship to this place or this Hong Kong street scene, such as local resident, visitor, temporary resident, return visitor, nearby worker
Do not include long personality details, food preferences, hobbies, abstract interpretation, or cultural analysis in userIntro.

Schema requirements:
- Every persona object must include every field shown below.
- Do not omit voiceHint, promptInstruction, or voiceProfile.
- voiceHint should be one plain sentence about how the person speaks.
- promptInstruction should be one plain sentence about how this persona should talk about visible street details.
- If unsure, use a simple generic value instead of omitting the field.

Return strict JSON:
{
  "personas": [
    {
      "id": string,
      "name": string,
      "role": string,
      "userIntro": string,
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
  void params.config;

  const raw = await generateTextJson({
    messages: [
      { role: "system", content: personaPrompt },
      {
        role: "user",
        content: JSON.stringify({
          image: params.image,
          sceneVisualDescription: params.sceneVisualDescription,
          languageStyle:
            "Persona names and roles should be concise English. userIntro should be a short user-facing line about age, gender, and relationship to this Hong Kong street scene. All personas must be 40 or older. Backgrounds should be warm, specific, and human, with light Hong Kong bilingual phrasing where natural. Vary their relationship to Hong Kong: local resident, tourist/visitor, temporary resident, recent arrival, or return visitor. They can have cultural perspective, but express it through ordinary jobs, routines, food, transport, shopping, weather, family habits, and street manners."
        })
      }
    ],
    temperature: 0.35,
    maxOutputTokens: 2400,
    errorPrefix: "DeepSeek persona generation"
  });

  const parsed = JSON.parse(extractJsonObject(raw)) as { personas?: GeneratedPersona[] };
  return normalizePersonas(parsed.personas);
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

function normalizePersonas(personas: GeneratedPersona[] | undefined) {
  if (!personas?.length) {
    throw new Error("Persona model returned no personas.");
  }

  return personas.slice(0, 3).map((persona, index) => {
    const voiceProfile = normalizeVoiceProfile(persona.voiceProfile);
    const role = cleanText(persona.role) || defaultRole(index);
    const next: GeneratedPersona = {
      ...persona,
      id: cleanId(persona.id, role, index),
      name: cleanText(persona.name) || `Narrator ${index + 1}`,
      role,
      userIntro: cleanUserIntro(persona.userIntro) || defaultUserIntro(role, voiceProfile),
      background: cleanText(persona.background) || defaultBackground(role),
      interpretiveLens: cleanText(persona.interpretiveLens) || "Everyday movement, signs, access, waiting, and street manners.",
      voiceHint: cleanText(persona.voiceHint) || defaultVoiceHint(role, voiceProfile),
      voiceProfile,
      promptInstruction: cleanText(persona.promptInstruction) || defaultPromptInstruction(role)
    };
    return next;
  });
}

function cleanText(value?: string) {
  return value?.replace(/\s+/g, " ").trim();
}

function cleanId(id: string | undefined, role: string, index: number) {
  const cleaned = id?.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (cleaned) return cleaned;
  const roleSlug = role.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
  return `persona_${index + 1}_${roleSlug || "narrator"}`;
}

function cleanUserIntro(intro?: string) {
  if (!intro) return undefined;
  return intro.replace(/\s+/g, " ").trim().split(" ").slice(0, 24).join(" ");
}

function normalizeVoiceProfile(profile: GeneratedPersona["voiceProfile"]) {
  return {
    accent: normalizeEnum(profile?.accent, ["hong-kong-english", "cantonese-leaning", "neutral-british", "neutral"], "neutral"),
    englishFluency: normalizeEnum(profile?.englishFluency, ["limited", "conversational", "fluent"], "conversational"),
    gender: normalizeEnum(profile?.gender, ["male", "female"], "female"),
    age: normalizeEnum(profile?.age === "young" ? "middle" : profile?.age, ["middle", "older"], "middle"),
    pace: normalizeEnum(profile?.pace, ["slow", "normal", "fast"], "normal"),
    tone: normalizeEnum(profile?.tone, ["reflective", "casual", "documentary", "warm"], "casual"),
    cantoneseRatio: normalizeRatio(profile?.cantoneseRatio)
  };
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function normalizeRatio(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.12;
  return Math.max(0, Math.min(1, num));
}

function defaultRole(index: number) {
  return ["Local resident", "Visitor", "Temporary resident"][index] || "Street-level narrator";
}

function defaultUserIntro(role: string, profile: GeneratedPersona["voiceProfile"]) {
  const age = profile?.age === "older" ? "older" : "middle-aged";
  const gender = profile?.gender === "male" ? "man" : "woman";
  return `A ${age} ${gender} with a ${role.toLowerCase()} view of this Hong Kong street.`;
}

function defaultBackground(role: string) {
  return `A fictional narrator over 40 who reads Hong Kong streets through ordinary routines, movement, signs, and small public rules. Role: ${role}.`;
}

function defaultVoiceHint(role: string, profile: GeneratedPersona["voiceProfile"]) {
  const pace = profile?.pace || "normal";
  return `Speaks in a ${pace}, casual way, using plain observations and light Hong Kong everyday phrasing.`;
}

function defaultPromptInstruction(role: string) {
  return `Speak as a ${role.toLowerCase()}, focusing on visible details, practical movement, and cautious personal comparison.`;
}
