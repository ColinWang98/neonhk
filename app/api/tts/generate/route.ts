import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { adaptSpeechText } from "@/lib/speechStyle";
import type { GeneratedPersona, TtsProvider } from "@/types";

export const runtime = "nodejs";

type TtsRequest = {
  text: string;
  persona?: GeneratedPersona;
  language?: "zh-HK-en-mixed";
  format?: "wav";
  provider?: TtsProvider;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TtsRequest;
    const config = runtimeConfigFromHeaders(request.headers);
    const provider = normalizeProvider(body.provider || config.ttsProvider || process.env.TTS_PROVIDER);

    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }

    const speech = await adaptSpeechText({
      text: body.text,
      persona: body.persona,
      provider,
      config
    });

    if (provider === "elevenlabs") {
      const audioUrl = await generateElevenLabsAudio({ ...body, text: speech.speechText }, config);
      return NextResponse.json({
        provider: "elevenlabs",
        audioUrl,
        speechText: speech.speechText,
        speechAdaptation: speech.strategy,
        speechAdaptationNote: speech.note
      });
    }

    const endpoint = config.localTtsEndpoint || process.env.LOCAL_TTS_ENDPOINT || "http://127.0.0.1:7860/tts";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: speech.speechText,
        voiceProfile: body.persona?.voiceProfile,
        voiceHint:
          body.persona?.voiceHint ||
          config.voiceAccentPreset ||
          process.env.VOICE_ACCENT_PRESET ||
          "Hong Kong bilingual",
        language: body.language || "zh-HK-en-mixed",
        format: body.format || "wav"
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Local TTS failed: ${res.status}`);
    }

    return NextResponse.json({
      provider: "local-open-source",
      audioUrl: data.audioUrl,
      durationMs: data.durationMs,
      speechText: speech.speechText,
      speechAdaptation: speech.strategy,
      speechAdaptationNote: speech.note,
      voiceInstruction: data.voiceInstruction,
      referenceAudio: data.referenceAudio,
      preparedReferenceAudio: data.preparedReferenceAudio,
      referencePoolSize: data.referencePoolSize
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS generation failed." },
      { status: 500 }
    );
  }
}

function normalizeProvider(provider?: string): TtsProvider {
  if (provider === "local-open-source" || provider === "elevenlabs") {
    return provider;
  }
  return "elevenlabs";
}

async function generateElevenLabsAudio(body: TtsRequest, config: ReturnType<typeof runtimeConfigFromHeaders>) {
  const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  const voiceId = config.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID;
  const modelId = config.elevenLabsModel || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured.");
  }

  if (!voiceId) {
    throw new Error("ELEVENLABS_VOICE_ID is not configured.");
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text: body.text,
        model_id: modelId,
        voice_settings: voiceSettingsForPersona(body.persona)
      })
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${errorText}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  const outputDir = path.join(process.cwd(), "public", "generated", "tts");
  await mkdir(outputDir, { recursive: true });
  const filename = `${randomUUID()}.mp3`;
  await writeFile(path.join(outputDir, filename), audio);

  return `/generated/tts/${filename}`;
}

function voiceSettingsForPersona(persona?: GeneratedPersona) {
  const tone = persona?.voiceProfile?.tone;
  const age = persona?.voiceProfile?.age;

  return {
    stability: tone === "documentary" || age === "older" ? 0.62 : 0.48,
    similarity_boost: 0.75,
    style: tone === "casual" || age === "young" ? 0.28 : 0.14,
    use_speaker_boost: true
  };
}
