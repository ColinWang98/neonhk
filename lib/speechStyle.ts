import OpenAI from "openai";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, TtsProvider } from "@/types";

type AdaptSpeechTextParams = {
  text: string;
  persona?: GeneratedPersona;
  provider: TtsProvider;
  config?: RuntimeApiConfig;
};

type SpeechAdaptation = {
  speechText: string;
  strategy: "llm" | "local-rules";
  note?: string;
};

const speechStylePrompt = `You adapt a spatial narrative into a text that is natural for text-to-speech.

Rules:
- Preserve the original meaning. Do not add new place facts, identities, histories, events, or private information.
- Prefer English speech text. If the source contains Chinese or Cantonese, translate its meaning into natural English.
- Use the persona only to adjust voice, rhythm, and phrasing.
- Add readable punctuation for speech: short sentences, commas, ellipses, and paragraph breaks.
- Use at most two light English discourse markers, such as "well", "you know", or "I mean".
- Do not over-act. Do not write stage directions.
- Output strict JSON: {"speechText": string}`;

const defaultElevenLabsVoicePrompt =
  "Voice direction: calm, premium documentary narrator for a Hong Kong spatial story. Use clear English, measured pacing, short pauses, restrained warmth, and a reflective but not theatrical tone. Sound observant and grounded, as if guiding someone through a real street scene.";

export async function adaptSpeechText(params: AdaptSpeechTextParams): Promise<SpeechAdaptation> {
  const input = params.text.trim();
  if (!input) {
    return { speechText: "", strategy: "local-rules" };
  }

  const apiKey = params.config?.aiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = params.config?.aiBaseUrl || process.env.AI_BASE_URL || "https://api.deepseek.com";
  const model = params.config?.llmModel || process.env.LLM_MODEL || "deepseek-chat";

  if (apiKey) {
    try {
      const client = new OpenAI({ apiKey, baseURL });
      const response = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
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
        ]
      });
      const raw = response.choices[0]?.message.content;
      const parsed = raw ? (JSON.parse(extractJsonObject(raw)) as { speechText?: string }) : {};
      const speechText = parsed.speechText?.trim();
      if (speechText) {
        return {
          speechText: limitRunawayPauses(speechText),
          strategy: "llm"
        };
      }
    } catch {
      // Keep TTS usable when the chat model is unavailable.
    }
  }

  return {
    speechText: applyLocalSpeechRules(input, params.persona),
    strategy: "local-rules",
    note: apiKey ? "Speech adaptation model failed; used local rules." : "No LLM key; used local speech rules."
  };
}

function speechGuidance(persona?: GeneratedPersona, provider?: TtsProvider, config?: RuntimeApiConfig) {
  const configuredPrompt =
    provider === "elevenlabs"
      ? config?.voiceAccentPreset || process.env.ELEVENLABS_VOICE_PROMPT || defaultElevenLabsVoicePrompt
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

function applyLocalSpeechRules(text: string, persona?: GeneratedPersona) {
  const profile = persona?.voiceProfile;
  let speech = text
    .replace(/\r/g, "")
    .replace(/[。！？]/g, ". ")
    .replace(/[，、]/g, ", ")
    .replace(/[；]/g, "; ")
    .replace(/\s+/g, " ")
    .trim();

  speech = removeCjkForEnglishReference(speech);
  speech = removeEmptyPunctuationFragments(speech);
  speech = splitLongSentences(speech, profile?.age === "young" ? 120 : 150);

  if (profile?.age === "older" || profile?.pace === "slow") {
    speech = speech.replace(/\. /g, "... ");
  } else if (profile?.tone === "casual" || profile?.age === "young") {
    speech = addLightDiscourseMarker(speech, profile.age);
  }

  if (profile?.tone === "reflective" && !speech.includes("...")) {
    speech = speech.replace(/, /, "... ");
  }

  return limitRunawayPauses(speech);
}

function removeCjkForEnglishReference(text: string) {
  const withoutCjkRuns = text.replace(/[\u3400-\u9fff\u3040-\u30ff\uff00-\uffef]+/g, " ");
  return withoutCjkRuns.replace(/\s+/g, " ").trim();
}

function removeEmptyPunctuationFragments(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+([,.!?;:])/g, "$1").trim())
    .filter((sentence) => /[a-z0-9]/i.test(sentence))
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[,;:]\s*([.!?])/g, "$1")
    .trim();
}

function splitLongSentences(text: string, maxLength: number) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      if (sentence.length <= maxLength) return sentence;
      return sentence.replace(/,\s+/g, ", ... ");
    })
    .join(" ");
}

function addLightDiscourseMarker(text: string, age?: string) {
  if (/^(well|you know|i mean),/i.test(text)) return text;
  return age === "young" ? `You know, ${text}` : `Well, ${text}`;
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
