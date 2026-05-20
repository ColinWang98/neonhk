import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import { generateTextJson } from "@/lib/textModel";
import type { GeneratedPersona, TtsProvider } from "@/types";

type AdaptSpeechTextParams = {
  text: string;
  persona?: GeneratedPersona;
  provider: TtsProvider;
  config?: RuntimeApiConfig;
};

type SpeechAdaptation = {
  speechText: string;
  strategy: "deepseek" | "local-rules";
  note?: string;
};

const speechStylePrompt = `You adapt a spatial narrative into a text that is natural for text-to-speech.

Rules:
- Preserve the original meaning. Do not add new place facts, identities, histories, events, or private information.
- Prefer English speech text. If the source contains Chinese or Cantonese, translate its meaning into natural English.
- Use the persona only to adjust voice, rhythm, and phrasing.
- Make the result sound spoken, not written: short sentences, simple words, contractions, and a little breathing room.
- Avoid em dashes and long dash punctuation. Do not use "—" or "–".
- Avoid semicolons and long complex sentences. Break long thoughts into short spoken lines.
- Turn stiff analytical phrases into conversational ones. For example, "this fragment may suggest" becomes "this makes me think", or "I would notice".
- Keep cultural interpretation if it is present, but translate it into everyday speech. Replace terms like "identity", "belonging", "resonance", "temporality", "collective use", or "public order" with personal understanding: feeling welcome, knowing where to wait, remembering a similar shopfront, noticing how people queue, shopping in the rain, or finding your way.
- Make it sound like a person talking beside the panorama, not a docent or researcher.
- Add readable punctuation for speech: short sentences, commas, ellipses, and paragraph breaks.
- Use one to three light English discourse markers when natural, such as "okay", "you know", "I mean", "right", or "honestly".
- Do not over-act. Do not write stage directions.
- Output strict JSON: {"speechText": string}`;

const defaultElevenLabsVoicePrompt =
  "Voice direction: natural Hong Kong street-story narrator. Use clear English, relaxed pacing, short pauses, restrained warmth, and everyday phrasing. Sound like a person guiding a friend through a real street scene, not a formal documentary host.";

export function buildElevenLabsVoicePrompt(persona?: GeneratedPersona, config?: RuntimeApiConfig) {
  const basePrompt = config?.voiceAccentPreset || process.env.ELEVENLABS_VOICE_PROMPT || defaultElevenLabsVoicePrompt;
  if (!persona?.voiceProfile) {
    return basePrompt;
  }

  const profile = persona.voiceProfile;
  const ageDirection = {
    young: "younger adult energy, slightly brighter delivery, nimble phrasing, but still composed",
    middle: "mature adult clarity, steady pace, balanced confidence, observant and grounded",
    older: "older reflective presence, slower pacing, longer pauses, gentle authority, careful emphasis"
  }[profile.age];

  const toneDirection = {
    reflective: "thoughtful, intimate, and attentive to time, traces, and everyday repetition",
    casual: "conversational, relaxed, lightly spontaneous, with natural but minimal discourse markers",
    documentary: "clear, precise, calm, and observational, like a restrained field documentary narrator",
    warm: "accessible, welcoming, soft-edged, and socially comfortable"
  }[profile.tone];

  const accentDirection = {
    "hong-kong-english": "clear English with a subtle Hong Kong English rhythm, never caricatured",
    "cantonese-leaning": "English-first narration with a light Hong Kong bilingual cadence; avoid heavy Cantonese pronunciation unless text requires it",
    shanxi: "Mandarin-first narration with a natural Shanxi local rhythm; avoid turning it into a comic accent",
    "neutral-british": "neutral British-leaning English, polished but not formal",
    neutral: "neutral international English, clean articulation"
  }[profile.accent];

  const fluencyDirection = {
    limited: "simple sentence shapes and careful pacing, without making the voice sound incompetent",
    conversational: "natural conversational English, clear and easy to follow",
    fluent: "fluent English narration with smooth transitions and controlled emphasis"
  }[profile.englishFluency];

  return [
    basePrompt,
    `Persona: ${persona.name}. Role: ${persona.role}`,
    `Interpretive lens: ${persona.interpretiveLens}`,
    `Voice profile: ${profile.age} ${profile.gender}; ${ageDirection}; ${toneDirection}; ${profile.pace} pace; ${accentDirection}; ${fluencyDirection}.`,
    "Keep the voice grounded in observable street-space details and ordinary routines. Do not sound theatrical, promotional, comedic, academic, or exaggerated."
  ].join(" ");
}

export async function adaptSpeechText(params: AdaptSpeechTextParams): Promise<SpeechAdaptation> {
  const input = params.text.trim();
  if (!input) {
    return { speechText: "", strategy: "local-rules" };
  }

  const raw = await generateTextJson({
    messages: [
      { role: "system", content: speechStylePrompt },
      {
        role: "user",
        content: JSON.stringify({
          provider: params.provider,
          persona: params.persona,
          targetVoice: speechGuidance(params.persona, params.provider, params.config),
          text: input
        })
      }
    ],
    temperature: 0.2,
    errorPrefix: "DeepSeek speech adaptation"
  });
  const parsed = JSON.parse(extractJsonObject(raw)) as { speechText?: string };
  const speechText = parsed.speechText?.trim();
  if (!speechText) {
    throw new Error("DeepSeek speech adaptation returned no speechText.");
  }

  return {
    speechText: limitRunawayPauses(speechText),
    strategy: "deepseek"
  };
}

function speechGuidance(persona?: GeneratedPersona, provider?: TtsProvider, config?: RuntimeApiConfig) {
  const configuredPrompt =
    provider === "elevenlabs"
      ? buildElevenLabsVoicePrompt(persona, config)
      : config?.voiceAccentPreset || process.env.VOICE_ACCENT_PRESET;
  const profile = persona?.voiceProfile;
  if (!profile) {
    return configuredPrompt || "calm English narrator, medium pace, light pauses";
  }

  const ageGuidance =
    profile.age === "older"
      ? "slower, reflective, with slightly longer pauses"
      : profile.age === "young"
        ? "brighter, shorter phrases, a little more conversational"
        : "steady, clear, observant";

  const toneGuidance = {
    reflective: "thoughtful and observant",
    casual: "relaxed and conversational",
    documentary: "clear and grounded",
    warm: "warm and accessible"
  }[profile.tone];

  return `${configuredPrompt || "Voice direction: calm English narrator."} Persona adjustment: ${profile.age} ${profile.gender} voice; ${ageGuidance}; ${toneGuidance}; ${profile.pace} pace; ${profile.accent} accent style; English fluency ${profile.englishFluency}`;
}

function limitRunawayPauses(text: string) {
  return text.replace(/\.{4,}/g, "...").replace(/(\.\.\.\s*){3,}/g, "... ");
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Speech adaptation model returned non-JSON content.");
  }

  return match[0];
}
