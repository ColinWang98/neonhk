"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction, type ReactNode } from "react";
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
  beforeStory?: ReactNode;
  afterStory?: ReactNode;
  onCaptionChange?: (caption: CaptionState | null) => void;
  onAudioGenerated?: (entry: TtsAudioGeneration) => void;
  onIntroPlayed?: () => void;
};

export function TtsControls({
  narratives,
  introText,
  includeIntro = false,
  persona,
  config,
  language = "en",
  fragmentId,
  cachedAudio,
  beforeStory,
  afterStory,
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
  const speechText = useMemo(() => {
    if (includeIntro && introText) {
      return `${introText.trim()}\n\n${storyText}`.trim();
    }
    return storyText;
  }, [includeIntro, introText, storyText]);

  const selectedProvider = normalizeFrontendTtsProvider(config.ttsProvider);
  const hasSavedAudio = Boolean(cachedAudio?.audioUrl);
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
          splitCaptionSegments(cachedAudio.speechText || cachedAudio.sourceText || speechText),
          requestId,
          requestIdRef,
          audioRef,
          onCaptionChange,
          setStatus,
          setProgress,
          setDurationLabel,
          includeIntro ? onIntroPlayed : undefined
        );
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
        splitCaptionSegments(data.speechText || data.sourceText || speechText),
        requestId,
        requestIdRef,
        audioRef,
        onCaptionChange,
        setStatus,
        setProgress,
        setDurationLabel,
        includeIntro ? onIntroPlayed : undefined
      );
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Story playback failed", error);
      setStatus("error");
      setMessage(zh ? "这段音频暂时放不出来，故事文字还可以看。" : "This audio is not playing right now. The story text is still readable.");
      onCaptionChange?.(null);
    }
  }, [cachedAudio, config, fragmentId, includeIntro, onAudioGenerated, onCaptionChange, onIntroPlayed, persona, selectedProvider, speechText, stop, zh]);

  useEffect(() => {
    stop();
    return stop;
  }, [fragmentId, persona?.id, stop, speechText]);

  return (
    <div className="story-player">
      <article className="story-copy" aria-label={zh ? "故事全文" : "Full story"} tabIndex={0}>
        {beforeStory}
        <h3>{zh ? "故事" : "Story"}</h3>
        {includeIntro && introText ? (
          <div className="opening-copy">
            <span>{zh ? "开场" : "Opening"}</span>
            <p>{introText.trim()}</p>
          </div>
        ) : null}
        <p>{storyText}</p>
        {afterStory}
      </article>
      <div className="player-footer">
        <div className="playback-row">
          <button
            type="button"
            disabled={!speechText || status === "loading" || status === "playing"}
            onClick={() => play()}
            className="reader-icon-button !border-signal !bg-signal !text-white"
            aria-label={zh ? "播放故事" : "Play story"}
            title={zh ? "播放故事" : "Play story"}
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={status !== "playing" && status !== "loading"}
            className="reader-icon-button"
            aria-label={zh ? "停止播放" : "Stop playback"}
            title={zh ? "停止播放" : "Stop playback"}
          >
            <Square className="h-4 w-4" />
          </button>
          <span className="playback-status" role="status">{statusLabel}</span>
          <span className="text-[13px] tabular-nums text-ink/60">{durationLabel}</span>
        </div>
        <progress value={progress} max={1} aria-label={zh ? "播放进度" : "Playback progress"} />
        {message ? <p className="player-error" role="alert">{message}</p> : null}
      </div>
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
  requestId: number,
  requestIdRef: MutableRefObject<number>,
  audioRef: MutableRefObject<HTMLAudioElement | null>,
  onCaptionChange: Props["onCaptionChange"],
  setStatus: Dispatch<SetStateAction<"idle" | "loading" | "playing" | "error">>,
  setProgress: Dispatch<SetStateAction<number>>,
  setDurationLabel: Dispatch<SetStateAction<string>>,
  onPlaybackComplete?: () => void
) {
  const captionTiming = buildCaptionTiming(captionSegments);
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
    if (requestId !== requestIdRef.current) return;
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
    onPlaybackComplete?.();
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
