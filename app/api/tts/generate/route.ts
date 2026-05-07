import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { runtimeConfigFromHeaders } from "@/lib/runtimeConfig";
import { adaptSpeechText } from "@/lib/speechStyle";
import { getSupabaseAdmin } from "@/lib/supabase";
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

    if (provider === "minimax") {
      const result = await generateMiniMaxAudio({ ...body, text: speech.speechText }, config);
      return NextResponse.json({
        provider: "minimax",
        audioUrl: result.audioUrl,
        durationMs: result.durationMs,
        speechText: speech.speechText,
        speechAdaptation: speech.strategy,
        speechAdaptationNote: speech.note,
        voiceInstruction: result.voiceInstruction
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
  if (provider === "local-open-source" || provider === "elevenlabs" || provider === "minimax") {
    return provider;
  }
  return "minimax";
}

async function generateElevenLabsAudio(body: TtsRequest, config: ReturnType<typeof runtimeConfigFromHeaders>) {
  const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  const voiceId = config.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID;
  const modelId = config.elevenLabsModel || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  if (!apiKey) {
    throw new Error("Audio narration is optional and ELEVENLABS_API_KEY is not configured.");
  }

  if (!voiceId) {
    throw new Error("Audio narration is optional and ELEVENLABS_VOICE_ID is not configured.");
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
        voice_settings: voiceSettingsForPersona(body.persona),
        seed: voiceSeedForPersona(body.persona)
      })
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${errorText}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  return saveGeneratedAudio(audio, "audio/mpeg", "mp3", config);
}

async function generateMiniMaxAudio(body: TtsRequest, config: ReturnType<typeof runtimeConfigFromHeaders>) {
  const apiKey = config.minimaxApiKey || process.env.MINIMAX_API_KEY;
  const groupId = config.minimaxGroupId || process.env.MINIMAX_GROUP_ID;
  const endpoint =
    config.minimaxEndpoint || process.env.MINIMAX_TTS_ENDPOINT || "https://api.minimaxi.com/v1/t2a_v2";
  const model = config.minimaxModel || process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd";
  const voiceId = minimaxVoiceIdForPersona(body.persona, config);

  if (!apiKey) {
    throw new Error("Audio narration is optional and MINIMAX_API_KEY is not configured.");
  }

  const url = new URL(endpoint);
  if (groupId && !url.searchParams.has("GroupId")) {
    url.searchParams.set("GroupId", groupId);
  }

  const voiceSetting = minimaxVoiceSettingForPersona(body.persona, voiceId);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      text: body.text,
      stream: false,
      language_boost: minimaxLanguageBoost(body.persona),
      output_format: "hex",
      voice_setting: voiceSetting,
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1
      }
    })
  });

  const data = await res.json();
  if (!res.ok || data.base_resp?.status_code) {
    throw new Error(
      `MiniMax TTS failed: ${res.status} ${data.base_resp?.status_msg || data.error || JSON.stringify(data)}`
    );
  }

  const hexAudio = data.data?.audio || data.audio;
  const audioUrl = data.data?.audio_url || data.audio_url;
  if (hexAudio) {
    const audio = Buffer.from(hexAudio, "hex");
    return {
      audioUrl: await saveGeneratedAudio(audio, "audio/mpeg", "mp3", config),
      durationMs: data.extra_info?.audio_length,
      voiceInstruction: voiceSetting
    };
  }

  if (audioUrl) {
    return {
      audioUrl,
      durationMs: data.extra_info?.audio_length,
      voiceInstruction: voiceSetting
    };
  }

  throw new Error("MiniMax TTS returned no audio.");
}

async function saveGeneratedAudio(
  audio: Buffer,
  contentType: string,
  extension: string,
  config: ReturnType<typeof runtimeConfigFromHeaders>
) {
  const filename = `${randomUUID()}.${extension}`;
  const publicPath = `generated/tts/${filename}`;
  const supabase = getSupabaseAdmin(config);
  const bucket = process.env.SUPABASE_TTS_BUCKET || process.env.SUPABASE_CROP_BUCKET || "fragment-crops";

  if (supabase) {
    const { error } = await supabase.storage.from(bucket).upload(publicPath, audio, {
      contentType,
      upsert: true
    });
    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(publicPath);
      return data.publicUrl;
    }
    console.warn("[tts.audio] supabase_upload_failed", { bucket, message: error.message });
  }

  if (process.env.VERCEL) {
    return `data:${contentType};base64,${audio.toString("base64")}`;
  }

  const outputDir = path.join(process.cwd(), "public", "generated", "tts");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, filename), audio);
  return `/generated/tts/${filename}`;
}

function voiceSettingsForPersona(persona?: GeneratedPersona) {
  const tone = persona?.voiceProfile?.tone;
  const age = persona?.voiceProfile?.age;
  const pace = persona?.voiceProfile?.pace;

  return {
    stability: tone === "documentary" || age === "older" || pace === "slow" ? 0.66 : 0.5,
    similarity_boost: 0.78,
    style: tone === "casual" || age === "young" ? 0.32 : tone === "reflective" ? 0.18 : 0.12,
    use_speaker_boost: true
  };
}

function voiceSeedForPersona(persona?: GeneratedPersona) {
  if (!persona?.id) return undefined;
  let hash = 0;
  for (const char of persona.id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 1_000_000;
}

function minimaxVoiceIdForPersona(
  persona: GeneratedPersona | undefined,
  config: ReturnType<typeof runtimeConfigFromHeaders>
) {
  const configured = config.minimaxVoiceId || process.env.MINIMAX_TTS_VOICE_ID;
  if (configured) return configured;

  const profile = persona?.voiceProfile;
  if (profile?.gender === "female" && profile.age === "young") {
    return process.env.MINIMAX_VOICE_YOUNG_FEMALE || "female-shaonv";
  }
  if (profile?.gender === "female") {
    return process.env.MINIMAX_VOICE_MIDDLE_FEMALE || "female-yujie";
  }
  if (profile?.age === "older") {
    return process.env.MINIMAX_VOICE_OLDER_MALE || "male-qn-qingse";
  }
  return process.env.MINIMAX_VOICE_MALE || "male-qn-qingse";
}

function minimaxVoiceSettingForPersona(persona: GeneratedPersona | undefined, voiceId: string) {
  const profile = persona?.voiceProfile;
  const pace = profile?.pace === "slow" ? 0.86 : profile?.pace === "fast" ? 1.12 : 1;
  const pitch =
    profile?.age === "older" ? -2 : profile?.age === "young" ? 1 : profile?.gender === "female" ? 1 : 0;

  return {
    voice_id: voiceId,
    speed: pace,
    vol: 1,
    pitch,
    emotion: minimaxEmotion(profile?.tone)
  };
}

function minimaxEmotion(tone?: string) {
  if (tone === "warm" || tone === "casual") return "happy";
  if (tone === "reflective") return "neutral";
  return "neutral";
}

function minimaxLanguageBoost(persona?: GeneratedPersona) {
  const profile = persona?.voiceProfile;
  if (profile?.accent === "cantonese-leaning" || (profile?.cantoneseRatio || 0) > 0.2) {
    return "Chinese,Yue";
  }
  if (profile?.accent === "neutral-british") {
    return "English";
  }
  return "auto";
}
