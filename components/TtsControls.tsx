"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { runtimeConfigToHeaders, type RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, SchemaNarratives } from "@/types";

type Props = {
  narratives?: SchemaNarratives;
  persona?: GeneratedPersona;
  config: RuntimeApiConfig;
};

export function TtsControls({ narratives, persona, config }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const storyText = useMemo(() => {
    if (!narratives) return "";
    return [
      narratives.functionalUse.text,
      narratives.identityBelonging.text,
      narratives.memoryTemporality.text,
      narratives.socialCulturalResonance.text
    ].join("\n\n");
  }, [narratives]);

  async function play() {
    if (!storyText) return;
    stop();
    setMessage(null);

    setStatus("loading");
    try {
      const provider = config.ttsProvider === "local-open-source" ? "local-open-source" : "elevenlabs";
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeConfigToHeaders(config) },
        body: JSON.stringify({
          text: storyText,
          persona,
          language: "zh-HK-en-mixed",
          format: provider === "local-open-source" ? "wav" : undefined,
          provider
        })
      });
      const data = await res.json();
      if (!res.ok || !data.audioUrl) {
        throw new Error(data.error || "TTS returned no audio URL.");
      }
      setMessage(
        data.speechAdaptation
          ? `Speech adapted with ${data.speechAdaptation}${data.referenceAudio ? `; reference: ${data.referenceAudio.split("/").pop()}` : ""}${data.referencePoolSize ? ` from ${data.referencePoolSize} candidates` : ""}.`
          : null
      );
      const audio = new Audio(data.audioUrl);
      audioRef.current = audio;
      audio.onended = () => setStatus("idle");
      audio.onerror = () => {
        setStatus("error");
        setMessage("Audio playback failed.");
      };
      setStatus("playing");
      await audio.play();
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "TTS failed.";
      setMessage(
        message.includes("Audio narration is optional")
          ? "Audio narration is optional on this deployment. The story text remains available."
          : message
      );
    }
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setStatus("idle");
  }

  return (
    <div className="surface-panel rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="fine-label">Audio</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">Story Voice</h3>
          <p className="mt-1 text-xs text-ink/60">
            {config.ttsProvider === "local-open-source"
              ? "Local open-source TTS sidecar."
              : "ElevenLabs cloud TTS."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!storyText || status === "loading"}
            onClick={play}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Play
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        </div>
      </div>
      {message ? <p className="mt-3 text-xs leading-5 text-amber-800">{message}</p> : null}
    </div>
  );
}
