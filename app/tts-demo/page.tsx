"use client";

import { Loader2, Square, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  runtimeConfigStorageKey,
  runtimeConfigToHeaders,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";

const demoText =
  "This fragment may suggest a small threshold in the street. It helps people notice where movement slows down, where access becomes more legible, and how ordinary urban details shape a shared rhythm. 呢個空間細節可以提醒我們，香港街道裡面的行走、停留同方向感，往往係由好細微的 cues 組成。";

const demoPersona = {
  id: "older-demo",
  name: "Older Street Observer",
  role: "A reflective narrator who notices slower movement and ordinary spatial cues.",
  interpretiveLens: "Reads fragments through pause, access, and daily repetition.",
  voiceHint: "Older reflective English narrator with light Hong Kong spatial sensitivity",
  promptInstruction: "Use careful English speech, short pauses, and cautious spatial interpretation.",
  voiceProfile: {
    accent: "hong-kong-english" as const,
    englishFluency: "fluent" as const,
    gender: "male" as const,
    age: "older" as const,
    pace: "slow" as const,
    tone: "reflective" as const,
    cantoneseRatio: 0
  }
};

export default function TtsDemoPage() {
  const [status, setStatus] = useState("Ready");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function play() {
    stop();
    setStatus("Preparing audio...");

    try {
      const config = readConfig();
      const provider =
        config.ttsProvider === "local-open-source" || config.ttsProvider === "minimax" || config.ttsProvider === "elevenlabs"
          ? config.ttsProvider
          : "elevenlabs";
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeConfigToHeaders(config) },
        body: JSON.stringify({
          text: demoText,
          persona: demoPersona,
          language: "zh-HK-en-mixed",
          format: provider === "local-open-source" ? "wav" : undefined,
          provider
        })
      });
      const data = await res.json();
      if (!res.ok || !data.audioUrl) {
        throw new Error("Voice preview is temporarily unavailable.");
      }

      const audio = new Audio(data.audioUrl);
      audioRef.current = audio;
      audio.onended = () => setStatus("Finished");
      audio.onerror = () => setStatus("Audio playback failed.");
      setStatus("Playing");
      await audio.play();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Voice preview failed.");
    }
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setStatus("Stopped");
  }

  return (
    <main className="flex h-screen items-center justify-center p-5 text-ink">
      <section className="surface-panel w-full max-w-2xl rounded-md p-7">
        <p className="fine-label">Voice Preview</p>
        <h1 className="mt-2 text-2xl font-semibold">HK Spatial Story Voice Preview</h1>
        <p className="mt-3 text-xs leading-5 text-ink/58">
          Uses the saved voice settings for a short playback check.
        </p>
        <p className="mt-4 text-sm leading-7 text-ink/72">{demoText}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={play}
            disabled={status === "Preparing audio..."}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90"
          >
            {status === "Preparing audio..." ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
            Play voice
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-paper px-4 text-sm text-ink transition hover:bg-field"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        </div>
        <p className="mt-4 text-xs text-ink/58">{status}</p>
      </section>
    </main>
  );
}

function readConfig(): RuntimeApiConfig {
  try {
    return JSON.parse(localStorage.getItem(runtimeConfigStorageKey) || "{}") as RuntimeApiConfig;
  } catch {
    return {};
  }
}
