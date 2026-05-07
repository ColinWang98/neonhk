"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runtimeConfigToHeaders, type RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, SchemaNarratives } from "@/types";

export type CaptionState = {
  text: string;
  index: number;
  total: number;
  active: boolean;
};

type Props = {
  narratives?: SchemaNarratives;
  persona?: GeneratedPersona;
  config: RuntimeApiConfig;
  onCaptionChange?: (caption: CaptionState | null) => void;
};

export function TtsControls({ narratives, persona, config, onCaptionChange }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [durationLabel, setDurationLabel] = useState("0:00");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayedKeyRef = useRef<string | null>(null);
  const storyText = useMemo(() => {
    if (!narratives) return "";
    return [
      narratives.functionalUse.text,
      narratives.identityBelonging.text,
      narratives.memoryTemporality.text,
      narratives.socialCulturalResonance.text
    ].join("\n\n");
  }, [narratives]);
  const captionSegments = useMemo(() => splitCaptionSegments(storyText), [storyText]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setProgress(0);
    onCaptionChange?.(null);
    setStatus("idle");
  }, [onCaptionChange]);

  const play = useCallback(async (options?: { automatic?: boolean }) => {
    if (!storyText) return;
    stop();
    setMessage(null);
    setProgress(0);

    setStatus("loading");
    try {
      const provider =
        config.ttsProvider === "local-open-source" ||
        config.ttsProvider === "minimax" ||
        config.ttsProvider === "elevenlabs"
          ? config.ttsProvider
          : undefined;
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
      audio.onloadedmetadata = () => {
        setDurationLabel(formatTime(audio.duration || 0));
      };
      audio.ontimeupdate = () => {
        const duration = audio.duration || 0;
        const ratio = duration > 0 ? audio.currentTime / duration : 0;
        setProgress(Math.min(1, Math.max(0, ratio)));
        const index = Math.min(
          captionSegments.length - 1,
          Math.max(0, Math.floor(ratio * captionSegments.length))
        );
        if (captionSegments[index]) {
          onCaptionChange?.({
            text: captionSegments[index],
            index,
            total: captionSegments.length,
            active: true
          });
        }
      };
      audio.onended = () => {
        setStatus("idle");
        setProgress(1);
        onCaptionChange?.(null);
      };
      audio.onerror = () => {
        setStatus("error");
        setMessage("Audio playback failed.");
        onCaptionChange?.(null);
      };
      setStatus("playing");
      if (captionSegments[0]) {
        onCaptionChange?.({ text: captionSegments[0], index: 0, total: captionSegments.length, active: true });
      }
      await audio.play();
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "TTS failed.";
      setMessage(
        options?.automatic && message.includes("play()")
          ? "Audio is ready. Browser autoplay was blocked; press Play to listen."
          : message.includes("Audio narration is optional")
          ? "Audio narration is optional on this deployment. The story text remains available."
          : message
      );
      onCaptionChange?.(null);
    }
  }, [captionSegments, config, onCaptionChange, persona, stop, storyText]);

  useEffect(() => {
    if (!storyText) return;
    const key = `${persona?.id || "no-persona"}:${storyText.slice(0, 80)}`;
    if (autoPlayedKeyRef.current === key) return;
    autoPlayedKeyRef.current = key;
    void play({ automatic: true });
  }, [persona?.id, play, storyText]);

  return (
    <div className="surface-panel rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="fine-label">Audio / 音频</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">Story Voice / 故事旁白</h3>
          <p className="mt-1 text-xs text-ink/60">
            {config.ttsProvider === "local-open-source"
              ? "Local open-source TTS sidecar."
              : config.ttsProvider === "minimax"
                ? "MiniMax cloud TTS."
                : config.ttsProvider === "elevenlabs"
                  ? "ElevenLabs cloud TTS."
                  : "Server-configured cloud TTS."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={!storyText || status === "loading"}
            onClick={() => play()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Play
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-ink/10 bg-paper p-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-ink/50">
          <span>{status === "playing" ? "Playing" : status === "loading" ? "Generating" : "Ready"}</span>
          <span>{durationLabel}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-field">
          <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-3 line-clamp-3 text-xs leading-5 text-ink/70">
          {captionSegments[0] || "Generate a story to enable narration."}
        </p>
      </div>
      {message ? <p className="mt-3 text-xs leading-5 text-amber-800">{message}</p> : null}
    </div>
  );
}

function splitCaptionSegments(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<string[]>((segments, sentence) => {
      const last = segments[segments.length - 1];
      if (last && last.length + sentence.length < 180) {
        segments[segments.length - 1] = `${last} ${sentence}`;
      } else {
        segments.push(sentence);
      }
      return segments;
    }, []);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}
