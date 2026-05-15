"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { runtimeConfigToHeaders, type RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, NarrativeBlock, SchemaNarratives, TtsAudioGeneration } from "@/types";

export type CaptionState = {
  text: string;
  index: number;
  total: number;
  active: boolean;
};

type Props = {
  narratives?: SchemaNarratives;
  narrativeBlocks?: NarrativeBlock[];
  introText?: string;
  introSegments?: string[];
  includeIntro?: boolean;
  persona?: GeneratedPersona;
  config: RuntimeApiConfig;
  language?: "en" | "zh";
  fragmentId?: string;
  cachedAudio?: TtsAudioGeneration;
  fineLabel?: string;
  title?: string;
  description?: string;
  onCaptionChange?: (caption: CaptionState | null) => void;
  onAudioGenerated?: (entry: TtsAudioGeneration) => void;
  onIntroPlayed?: () => void;
};

export function TtsControls({
  narratives,
  narrativeBlocks,
  introText,
  introSegments,
  includeIntro = false,
  persona,
  config,
  language = "en",
  fragmentId,
  cachedAudio,
  fineLabel,
  title,
  description,
  onCaptionChange,
  onAudioGenerated,
  onIntroPlayed
}: Props) {
  const zh = language === "zh";
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [durationLabel, setDurationLabel] = useState("0:00");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);
  const storyText = useMemo(() => {
    if (narrativeBlocks?.length) {
      return narrativeBlocks.map((block) => block.text.trim()).filter(Boolean).join("\n\n");
    }
    if (!narratives) return "";
    return [
      narratives.functionalUse.text,
      narratives.identityBelonging.text,
      narratives.memoryTemporality.text,
      narratives.socialCulturalResonance.text
    ].join("\n\n");
  }, [narrativeBlocks, narratives]);
  const captionSegments = useMemo(() => {
    const storySegments = narrativeBlocks?.length
      ? narrativeBlocks.map((block) => block.text.trim()).filter(Boolean)
      : splitCaptionSegments(storyText);
    if (includeIntro && introText) {
      const intro = introSegments?.length ? introSegments : splitCaptionSegments(introText);
      return [...intro, ...storySegments];
    }
    return storySegments;
  }, [includeIntro, introSegments, introText, narrativeBlocks, storyText]);
  const speechText = useMemo(() => {
    if (includeIntro && introText) {
      return `${introText.trim()}\n\n${storyText}`.trim();
    }
    return storyText;
  }, [includeIntro, introText, storyText]);

  const previewText = storyText || introText || "";
  const selectedProvider = normalizeFrontendTtsProvider(config.ttsProvider);
  const voiceGenerationPaused = !cachedAudio?.audioUrl && (!selectedProvider || selectedProvider === "minimax");

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setProgress(0);
    onCaptionChange?.(null);
    setStatus("idle");
  }, [onCaptionChange]);

  const play = useCallback(async () => {
    if (!speechText) return;
    if (voiceGenerationPaused) {
      setMessage(
        zh
          ? "语音生成已暂时暂停，先调整好故事内容后再开启。"
          : "Voice generation is paused while the story text is being tuned."
      );
      return;
    }
    stop();
    const requestId = requestIdRef.current;
    setMessage(null);
    setProgress(0);

    setStatus("loading");
    try {
      if (cachedAudio?.audioUrl) {
        await playAudioUrl(
          cachedAudio.audioUrl,
          captionSegments,
          requestId,
          requestIdRef,
          audioRef,
          onCaptionChange,
          setStatus,
          setProgress,
          setDurationLabel
        );
        if (includeIntro) onIntroPlayed?.();
        return;
      }

      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeConfigToHeaders(config) },
        body: JSON.stringify({
          text: speechText,
          persona,
          fragmentId,
          language: "zh-HK-en-mixed",
          format: selectedProvider === "local-open-source" ? "wav" : undefined,
          provider: selectedProvider
        })
      });
      const data = await res.json();
      if (requestId !== requestIdRef.current) return;
      if (!res.ok || !data.audioUrl) {
        throw new Error("Narration is temporarily unavailable.");
      }
      setMessage(null);
      onAudioGenerated?.({
        cacheKey: data.cacheKey,
        provider: data.provider,
        audioUrl: data.audioUrl,
        durationMs: data.durationMs,
        speechText: data.speechText,
        sourceText: data.sourceText || speechText,
        personaId: data.personaId || persona?.id,
        voiceId: data.voiceId,
        createdAt: data.createdAt || new Date().toISOString()
      });
      await playAudioUrl(
        data.audioUrl,
        captionSegments,
        requestId,
        requestIdRef,
        audioRef,
        onCaptionChange,
        setStatus,
        setProgress,
        setDurationLabel
      );
      if (includeIntro) onIntroPlayed?.();
    } catch {
      if (requestId !== requestIdRef.current) return;
      setStatus("error");
      setMessage(
        zh
          ? "旁白暂时不可用，故事文字仍可阅读。"
          : "Narration is temporarily unavailable. The story remains readable."
      );
      onCaptionChange?.(null);
    }
  }, [cachedAudio, captionSegments, config, fragmentId, includeIntro, onAudioGenerated, onCaptionChange, onIntroPlayed, persona, selectedProvider, speechText, stop, voiceGenerationPaused, zh]);

  useEffect(() => {
    stop();
    return stop;
  }, [persona?.id, stop, speechText]);

  return (
    <div className="surface-panel rounded-md p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="fine-label">{fineLabel || (zh ? "音频" : "Audio")}</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">{title || (zh ? "故事旁白" : "Story Voice")}</h3>
          <p className="mt-1 text-xs text-ink/60">
            {description || (zh ? "播放当前讲述人的旁白。" : "Listen to the current narrator.")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            disabled={!speechText || status === "loading" || voiceGenerationPaused}
            onClick={() => play()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Play
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-ink/10 bg-paper p-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-ink/50">
          <span>
            {status === "playing"
              ? zh ? "播放中" : "Playing"
              : status === "loading"
                ? zh ? "准备中" : "Preparing"
                : voiceGenerationPaused
                  ? zh ? "已暂停" : "Paused"
                : zh ? "就绪" : "Ready"}
          </span>
          <span>{durationLabel}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-field">
          <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-ink/70">
          {previewText || (zh ? "故事准备好后可播放旁白。" : "Once the story is ready, narration can be played.")}
        </p>
      </div>
      {voiceGenerationPaused ? (
        <p className="mt-3 text-xs leading-5 text-amber-800">
          {zh
            ? "语音生成已暂时暂停。已有缓存音频仍可播放。"
            : "Voice generation is paused for now. Existing cached audio can still be played."}
        </p>
      ) : message ? <p className="mt-3 text-xs leading-5 text-amber-800">{message}</p> : null}
    </div>
  );
}

function normalizeFrontendTtsProvider(provider?: string) {
  if (provider === "local-open-source" || provider === "elevenlabs" || provider === "minimax") {
    return provider;
  }
  return undefined;
}

async function playAudioUrl(
  audioUrl: string,
  captionSegments: string[],
  requestId: number,
  requestIdRef: MutableRefObject<number>,
  audioRef: MutableRefObject<HTMLAudioElement | null>,
  onCaptionChange: Props["onCaptionChange"],
  setStatus: Dispatch<SetStateAction<"idle" | "loading" | "playing" | "error">>,
  setProgress: Dispatch<SetStateAction<number>>,
  setDurationLabel: Dispatch<SetStateAction<string>>
) {
  const audio = new Audio(audioUrl);
  if (requestId !== requestIdRef.current) {
    audio.pause();
    return;
  }
  audioRef.current = audio;
  audio.onloadedmetadata = () => {
    setDurationLabel(formatTime(audio.duration || 0));
  };
  audio.ontimeupdate = () => {
    const duration = audio.duration || 0;
    const ratio = duration > 0 ? audio.currentTime / duration : 0;
    setProgress(Math.min(1, Math.max(0, ratio)));
    const index = captionIndexForTime(audio.currentTime, duration, captionSegments.length);
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
    const lastIndex = Math.max(0, captionSegments.length - 1);
    if (captionSegments[lastIndex]) {
      onCaptionChange?.({
        text: captionSegments[lastIndex],
        index: lastIndex,
        total: captionSegments.length,
        active: false
      });
    }
  };
  audio.onerror = () => {
    setStatus("error");
    onCaptionChange?.(null);
  };
  setStatus("playing");
  if (captionSegments[0]) {
    onCaptionChange?.({ text: captionSegments[0], index: 0, total: captionSegments.length, active: true });
  }
  await audio.play();
}

function splitCaptionSegments(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|(?<=,)\s+(?=(?:and|but|so|then|because|maybe|I|you|we|it|this|that)\b)/i)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<string[]>((segments, sentence) => {
      const last = segments[segments.length - 1];
      if (last && last.length + sentence.length < 115) {
        segments[segments.length - 1] = `${last} ${sentence}`;
      } else {
        segments.push(sentence);
      }
      return segments;
    }, []);
}

function captionIndexForTime(currentTime: number, duration: number, total: number) {
  if (total <= 1 || !Number.isFinite(duration) || duration <= 0) return 0;
  if (currentTime >= duration) return total - 1;

  const usableDuration = Math.max(0.1, duration - 0.2);
  const segmentDuration = usableDuration / total;
  return Math.min(total - 1, Math.max(0, Math.floor(currentTime / segmentDuration)));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}
