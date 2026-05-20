import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type CosyVoiceGenerateRequest = {
  endpoint?: string;
  text: string;
  voiceHint?: string;
  voiceProfile?: {
    accent: "hong-kong-english" | "cantonese-leaning" | "shanxi" | "neutral-british" | "neutral";
    englishFluency: "limited" | "conversational" | "fluent";
    gender: "male" | "female";
    age: "young" | "middle" | "older";
    pace: "slow" | "normal" | "fast";
    tone: "reflective" | "casual" | "documentary" | "warm";
    cantoneseRatio: number;
  };
  language?: "zh-HK-en-mixed";
  format?: "wav";
  referenceAudioPath?: string;
  referenceText?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CosyVoiceGenerateRequest;
    const endpoint = normalizeEndpoint(body.endpoint);

    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }

    const res = await fetch(`${endpoint}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: body.text,
        voiceHint: body.voiceHint,
        voiceProfile: body.voiceProfile,
        language: body.language || "zh-HK-en-mixed",
        format: body.format || "wav",
        referenceAudioPath: body.referenceAudioPath || undefined,
        referenceText: body.referenceText
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || `CosyVoice failed with ${res.status}.`, endpoint },
        { status: res.status }
      );
    }

    return NextResponse.json({ endpoint, ...data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CosyVoice generation failed." },
      { status: 500 }
    );
  }
}

function normalizeEndpoint(value?: string) {
  return (value || process.env.LOCAL_TTS_BASE_URL || "http://127.0.0.1:7860").replace(/\/tts\/?$/, "").replace(/\/$/, "");
}
