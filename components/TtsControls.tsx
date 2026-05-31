"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { runtimeConfigToHeaders, type RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, SchemaNarratives, TtsAudioGeneration } from "@/types";

export type CaptionState = {
  text: string;
  index: number;
  total: number;
  active: boolean;
};

type Props = {
  narratives?: SchemaNarratives;
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
  const spokenStory = narratives?.spokenStory?.trim() || "";
  const storyText = useMemo(() => {
    return spokenStory;
  }, [spokenStory]);
  const captionSegments = useMemo(() => {
    const storySegments = splitCaptionSegments(storyText);
    if (includeIntro && introText) {
      const intro = introSegments?.length ? introSegments : splitCaptionSegments(introText);
      return [...intro, ...storySegments];
    }
    return storySegments;
  }, [includeIntro, introSegments, introText, storyText]);
  const captionTiming = useMemo(() => buildCaptionTiming(captionSegments), [captionSegments]);
  const speechText = useMemo(() => {
    if (includeIntro && introText) {
      return `${introText.trim()}\n\n${storyText}`.trim();
    }
    return storyText;
  }, [includeIntro, introText, storyText]);

  const previewText = speechText || storyText || introText || "";
  const selectedProvider = normalizeFrontendTtsProvider(config.ttsProvider);
  const hasSavedAudio = Boolean(cachedAudio?.audioUrl);
  const defaultFineLabel = zh ? "听故事" : "Listen";
  const defaultTitle = zh ? "播放这一段" : "Play this story";
  const defaultDescription = hasSavedAudio
    ? zh
      ? "已有保存的音频，直接播放。"
      : "Saved audio is ready."
    : zh
      ? "听当前讲述人怎么讲这个细节。"
      : "Hear how this narrator reads the selected detail.";
  const statusLabel =
    status === "playing"
      ? zh ? "播放中" : "Playing"
      : status === "loading"
        ? zh ? "准备中" : "Preparing"
        : status === "error"
          ? zh ? "播放失败" : "Playback failed"
          : hasSavedAudio
            ? zh ? "已有音频" : "Saved audio"
            : zh ? "可播放" : "Ready to play";

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
          captionTiming,
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
        throw new Error(data.error || "Narration is temporarily unavailable.");
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
        captionTiming,
        requestId,
        requestIdRef,
        audioRef,
        onCaptionChange,
        setStatus,
        setProgress,
        setDurationLabel
      );
      if (includeIntro) onIntroPlayed?.();
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Story playback failed", error);
      setStatus("error");
      setMessage(zh ? "这段音频暂时放不出来，故事文字还可以看。" : "This audio is not playing right now. The story text is still readable.");
      onCaptionChange?.(null);
    }
  }, [cachedAudio, captionSegments, captionTiming, config, fragmentId, includeIntro, onAudioGenerated, onCaptionChange, onIntroPlayed, persona, selectedProvider, speechText, stop, zh]);

  useEffect(() => {
    stop();
    return stop;
  }, [persona?.id, stop, speechText]);

  return (
    <div className="surface-panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="fine-label">{fineLabel || defaultFineLabel}</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">{title || defaultTitle}</h3>
          <p className="mt-1 text-xs text-ink/60">
            {description || defaultDescription}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            disabled={!speechText || status === "loading"}
            onClick={() => play()}
            className="soft-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {zh ? "播放" : "Listen"}
          </button>
          <button
            type="button"
            onClick={stop}
            className="soft-button inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold"
          >
            <Square className="h-4 w-4" />
            {zh ? "停止" : "Stop"}
          </button>
        </div>
      </div>
      <div className="cozy-card mt-4 p-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-ink/50">
          <span>{statusLabel}</span>
          <span>{durationLabel}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-field/70">
          <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-3 border-t border-ink/10 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">
            {zh ? "故事文字" : "Story text"}
          </p>
          <p className="mt-1 line-clamp-4 text-xs leading-5 text-ink/70">
            {previewText || (zh ? "故事准备好后可播放旁白。" : "Once the story is ready, narration can be played.")}
          </p>
        </div>
      </div>
      {message ? <p className="mt-3 text-xs leading-5 text-amber-800">{message}</p> : null}
    </div>
  );
}

function normalizeFrontendTtsProvider(provider?: string) {
  if (provider === "local-open-source" || provider === "elevenlabs" || provider === "minimax") {
    return provider;
  }
  return "minimax";
}

async function playAudioUrl(
  audioUrl: string,
  captionSegments: string[],
  captionTiming: number[],
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
    const index = captionIndexForTime(audio.currentTime, duration, captionTiming);
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

function buildCaptionTiming(captionSegments: string[]) {
  if (captionSegments.length === 0) return [];
  const weights = captionSegments.map(estimatedSpeechWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || captionSegments.length;
  let cumulative = 0;
  return weights.map((weight) => {
    cumulative += weight / total;
    return cumulative;
  });
}

function estimatedSpeechWeight(segment: string) {
  const chineseChars = segment.match(/[\u3400-\u9fff]/g)?.length || 0;
  const englishWords = segment.match(/[A-Za-z0-9']+/g)?.length || 0;
  const punctuationPauses = segment.match(/[,.!?;:，。！？；：]/g)?.length || 0;
  const otherChars = segment.replace(/[\u3400-\u9fffA-Za-z0-9'\s,.!?;:，。！？；：]/g, "").length;
  return Math.max(1, englishWords + chineseChars * 1.35 + otherChars * 0.5 + punctuationPauses * 0.35);
}

function captionIndexForTime(currentTime: number, duration: number, captionTiming: number[]) {
  const total = captionTiming.length;
  if (total <= 1 || !Number.isFinite(duration) || duration <= 0) return 0;
  if (currentTime >= duration) return total - 1;

  const usableDuration = Math.max(0.1, duration - 0.2);
  const ratio = Math.min(1, Math.max(0, currentTime / usableDuration));
  const index = captionTiming.findIndex((boundary) => ratio <= boundary);
  return index === -1 ? total - 1 : index;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}
