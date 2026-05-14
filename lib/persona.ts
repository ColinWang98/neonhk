import { createAiClient } from "@/lib/aiProvider";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
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
  const ai = createAiClient(params.config || {}, "text");

  if (!ai) {
    throw new Error("Persona generation requires a configured text model.");
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
            "Persona names and roles should be concise English. userIntro should be a short user-facing line about age, gender, and relationship to this Hong Kong street scene. All personas must be 40 or older. Backgrounds should be warm, specific, and human, with light Hong Kong bilingual phrasing where natural. Vary their relationship to Hong Kong: local resident, tourist/visitor, temporary resident, recent arrival, or return visitor. They can have cultural perspective, but express it through ordinary jobs, routines, food, transport, shopping, weather, family habits, and street manners."
        })
      }
    ]
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Persona model returned no content.");
  }

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
    const missing = [
      ["id", persona.id],
      ["name", persona.name],
      ["role", persona.role],
      ["userIntro", persona.userIntro],
      ["background", persona.background],
      ["interpretiveLens", persona.interpretiveLens],
      ["voiceHint", persona.voiceHint],
      ["voiceProfile", persona.voiceProfile],
      ["promptInstruction", persona.promptInstruction]
    ].filter(([, value]) => !value);

    if (missing.length) {
      throw new Error(`Persona ${index + 1} is missing required fields: ${missing.map(([key]) => key).join(", ")}.`);
    }

    return {
      ...persona,
      userIntro: cleanUserIntro(persona.userIntro) || persona.userIntro,
      voiceProfile: normalizeVoiceProfile(persona.voiceProfile)
    };
  });
}

function cleanUserIntro(intro?: string) {
  if (!intro) return undefined;
  return intro.replace(/\s+/g, " ").trim().split(" ").slice(0, 24).join(" ");
}

function normalizeVoiceProfile(profile: GeneratedPersona["voiceProfile"]) {
  if (!profile) {
    throw new Error("Persona voiceProfile is required.");
  }
  return {
    ...profile,
    age: profile.age === "young" ? "middle" : profile.age
  };
}
