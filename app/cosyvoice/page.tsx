"use client";

import {
  Activity,
  AudioLines,
  CheckCircle2,
  FileAudio,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Square,
  Wand2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VoiceProfile } from "@/types";

type ReferenceFile = {
  label: string;
  path: string;
  source: string;
  ageGender?: string;
  bytes: number;
};

type HealthState = {
  reachable: boolean;
  endpoint: string;
  modelDir?: string;
  cosyvoiceRepo?: string;
  referenceAudio?: string;
  modelLoaded?: boolean;
  error?: string;
};

type GeneratedAudio = {
  audioUrl: string;
  durationMs?: number;
  referenceAudio?: string;
  preparedReferenceAudio?: string;
  referencePoolSize?: number;
  voiceInstruction?: string;
};

const defaultText =
  "哎呀，这个街角我一看就晓得咋走。先看清楚招牌，再往边上一站，别挡住后头的人。";

const defaultProfile: VoiceProfile = {
  accent: "shanxi",
  englishFluency: "conversational",
  gender: "female",
  age: "middle",
  pace: "normal",
  tone: "documentary",
  cantoneseRatio: 0
};

const ageOptions = [
  { value: "young", label: "Young" },
  { value: "middle", label: "Middle" },
  { value: "older", label: "Older" }
] as const;

const genderOptions = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" }
] as const;

const accentOptions = [
  { value: "shanxi", label: "Shanxi dialect" },
  { value: "neutral", label: "Neutral" },
  { value: "hong-kong-english", label: "HK English" },
  { value: "cantonese-leaning", label: "Cantonese leaning" },
  { value: "neutral-british", label: "Neutral British" }
] as const;

const toneOptions = [
  { value: "documentary", label: "Documentary" },
  { value: "reflective", label: "Reflective" },
  { value: "casual", label: "Casual" },
  { value: "warm", label: "Warm" }
] as const;

export default function CosyVoicePage() {
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:7860");
  const [text, setText] = useState(defaultText);
  const [voiceHint, setVoiceHint] = useState("");
  const [profile, setProfile] = useState<VoiceProfile>(defaultProfile);
  const [referenceMode, setReferenceMode] = useState<"auto" | "manual">("auto");
  const [referenceAudioPath, setReferenceAudioPath] = useState("");
  const [references, setReferences] = useState<ReferenceFile[]>([]);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audio, setAudio] = useState<GeneratedAudio | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredReferences = useMemo(() => {
    const ageGender = `${profile.age}_${profile.gender}`;
    return references.filter((reference) => reference.ageGender === ageGender).slice(0, 12);
  }, [profile.age, profile.gender, references]);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch(`/api/cosyvoice/health?endpoint=${encodeURIComponent(endpoint)}`, { cache: "no-store" });
      const data = (await res.json()) as HealthState;
      setHealth(data);
    } catch (error) {
      setHealth({
        reachable: false,
        endpoint,
        error: error instanceof Error ? error.message : "Health check failed."
      });
    }
  }, [endpoint]);

  async function loadReferences() {
    const res = await fetch("/api/cosyvoice/references", { cache: "no-store" });
    const data = (await res.json()) as { references?: ReferenceFile[] };
    setReferences(data.references || []);
  }

  useEffect(() => {
    refreshHealth();
    loadReferences();
    const timer = window.setInterval(refreshHealth, 8000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  async function generate() {
    stop();
    setIsGenerating(true);
    setStatus("Preparing voice preview...");

    try {
      const res = await fetch("/api/cosyvoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          text,
          voiceHint: voiceHint || undefined,
          voiceProfile: profile,
          language: "zh-HK-en-mixed",
          format: "wav",
          referenceAudioPath: referenceMode === "manual" ? referenceAudioPath : undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.audioUrl) {
        throw new Error("Voice preview is temporarily unavailable.");
      }

      setAudio(data);
      setStatus(`Ready: ${formatDuration(data.durationMs)}.`);
      await play(data.audioUrl);
      refreshHealth();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Voice preview failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function play(url?: string) {
    const audioUrl = url || audio?.audioUrl;
    if (!audioUrl) return;
    stop();
    const nextAudio = new Audio(audioUrl);
    audioRef.current = nextAudio;
    nextAudio.onended = () => setStatus("Finished.");
    nextAudio.onerror = () => setStatus("Audio playback failed.");
    await nextAudio.play();
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
  }

  function updateProfile<Key extends keyof VoiceProfile>(key: Key, value: VoiceProfile[Key]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="min-h-screen bg-[#f6f3ec] text-ink">
      <header className="border-b border-ink/10 bg-paper/80 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="fine-label">Local Voice</p>
            <h1 className="mt-1 text-2xl font-semibold">Voice Studio</h1>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-ink/12 bg-white px-3 py-2 text-xs text-ink/65">
            <span className={`h-2 w-2 rounded-full ${health?.reachable ? "bg-emerald-500" : "bg-red-500"}`} />
            {health?.reachable ? "Local service online" : "Local service offline"}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-5">
          <Panel icon={<AudioLines className="h-4 w-4" />} label="Script" title="Text Input">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-40 w-full resize-y rounded-md border border-ink/12 bg-white p-4 text-sm leading-7 outline-none transition focus:border-signal"
            />
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_12rem]">
              <input
                value={voiceHint}
                onChange={(event) => setVoiceHint(event.target.value)}
                placeholder="Optional custom voice instruction"
                className="h-10 rounded-md border border-ink/12 bg-white px-3 text-sm outline-none transition focus:border-signal"
              />
              <button
                type="button"
                onClick={() => setText(defaultText)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/12 bg-paper px-3 text-sm transition hover:bg-field"
              >
                <RefreshCw className="h-4 w-4" />
                Reset text
              </button>
            </div>
          </Panel>

          <Panel icon={<SlidersHorizontal className="h-4 w-4" />} label="Voice" title="Persona Controls">
            <div className="grid gap-4 md:grid-cols-2">
              <SegmentedControl
                label="Age"
                value={profile.age}
                options={ageOptions}
                onChange={(value) => updateProfile("age", value)}
              />
              <SegmentedControl
                label="Gender"
                value={profile.gender}
                options={genderOptions}
                onChange={(value) => updateProfile("gender", value)}
              />
              <SelectControl
                label="Accent"
                value={profile.accent}
                options={accentOptions}
                onChange={(value) => updateProfile("accent", value)}
              />
              <SelectControl
                label="Tone"
                value={profile.tone}
                options={toneOptions}
                onChange={(value) => updateProfile("tone", value)}
              />
              <SelectControl
                label="English Fluency"
                value={profile.englishFluency}
                options={[
                  { value: "limited", label: "Limited" },
                  { value: "conversational", label: "Conversational" },
                  { value: "fluent", label: "Fluent" }
                ]}
                onChange={(value) => updateProfile("englishFluency", value)}
              />
              <SelectControl
                label="Pace"
                value={profile.pace}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" }
                ]}
                onChange={(value) => updateProfile("pace", value)}
              />
              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-ink/62">Cantonese Ratio</label>
                  <span className="text-xs text-ink/58">{Math.round(profile.cantoneseRatio * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={profile.cantoneseRatio}
                  onChange={(event) => updateProfile("cantoneseRatio", Number(event.target.value))}
                  className="w-full accent-signal"
                />
              </div>
            </div>
          </Panel>
        </section>

        <aside className="space-y-5">
          <Panel icon={<FileAudio className="h-4 w-4" />} label="Reference" title="Voice Reference">
            <SegmentedControl
              label="Reference Mode"
              value={referenceMode}
              options={[
                { value: "auto", label: "Auto pool" },
                { value: "manual", label: "Manual path" }
              ]}
              onChange={(value) => setReferenceMode(value)}
            />
            {referenceMode === "manual" ? (
              <input
                value={referenceAudioPath}
                onChange={(event) => setReferenceAudioPath(event.target.value)}
                placeholder="/absolute/path/to/reference.wav"
                className="mt-3 h-10 w-full rounded-md border border-ink/12 bg-white px-3 text-sm outline-none transition focus:border-signal"
              />
            ) : (
              <div className="mt-3 rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs font-medium text-ink/62">Matching pool: {profile.age}_{profile.gender}</p>
                <div className="mt-2 max-h-36 space-y-1 overflow-auto pr-1">
                  {filteredReferences.length ? (
                    filteredReferences.map((reference) => (
                      <button
                        key={reference.path}
                        type="button"
                        onClick={() => {
                          setReferenceMode("manual");
                          setReferenceAudioPath(reference.path);
                        }}
                        className="block w-full truncate rounded px-2 py-1 text-left text-xs text-ink/65 hover:bg-field"
                        title={reference.path}
                      >
                        {reference.label}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-ink/52">No matching local reference files found.</p>
                  )}
                </div>
              </div>
            )}
          </Panel>

          <Panel icon={<Settings2 className="h-4 w-4" />} label="Runtime" title="Sidecar Connection">
            <div className="flex gap-2">
              <input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-ink/12 bg-white px-3 text-sm outline-none transition focus:border-signal"
              />
              <button
                type="button"
                onClick={refreshHealth}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-ink/12 bg-paper transition hover:bg-field"
                aria-label="Refresh health"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-xs text-ink/62">
              <RuntimeRow label="Runtime" value={health?.modelDir} />
              <RuntimeRow label="Path" value={health?.cosyvoiceRepo} />
              <RuntimeRow label="Loaded" value={health?.modelLoaded ? "Yes" : "No"} />
              {health?.error ? <RuntimeRow label="Error" value={health.error} /> : null}
            </dl>
          </Panel>

          <Panel icon={<Wand2 className="h-4 w-4" />} label="Generate" title="Output">
            <button
              type="button"
              onClick={generate}
              disabled={isGenerating || !text.trim()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Prepare and play
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => play()}
                disabled={!audio?.audioUrl}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/12 bg-paper text-sm transition hover:bg-field disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Play className="h-4 w-4" />
                Replay
              </button>
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/12 bg-paper text-sm transition hover:bg-field"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink/62">{status}</p>
            {audio ? (
              <div className="mt-3 rounded-md border border-ink/10 bg-white p-3 text-xs leading-5 text-ink/62">
                <a href={audio.audioUrl} target="_blank" className="inline-flex items-center gap-2 font-medium text-signal hover:underline">
                  <CheckCircle2 className="h-4 w-4" />
                  Open WAV
                </a>
                <p className="mt-2 truncate" title={audio.referenceAudio}>
                  Reference: {audio.referenceAudio?.split("/").slice(-3).join("/") || "auto"}
                </p>
                {audio.preparedReferenceAudio ? (
                  <p className="mt-1 truncate" title={audio.preparedReferenceAudio}>
                    Prepared WAV: {audio.preparedReferenceAudio.split("/").slice(-3).join("/")}
                  </p>
                ) : null}
                {audio.voiceInstruction ? <p className="mt-1 line-clamp-3">Instruction: {audio.voiceInstruction}</p> : null}
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function Panel({
  icon,
  label,
  title,
  children
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel rounded-md p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink/10 bg-white text-signal">
          {icon}
        </div>
        <div>
          <p className="fine-label">{label}</p>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function SegmentedControl<Option extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: Option;
  options: readonly { value: Option; label: string }[];
  onChange: (value: Option) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-ink/62">{label}</label>
      <div className="grid grid-cols-2 gap-1 rounded-md border border-ink/10 bg-field p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 rounded text-xs font-medium transition ${
              value === option.value ? "bg-white text-ink shadow-sm" : "text-ink/58 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectControl<Option extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: Option;
  options: readonly { value: Option; label: string }[];
  onChange: (value: Option) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-ink/62">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Option)}
        className="h-10 w-full rounded-md border border-ink/12 bg-white px-3 text-sm outline-none transition focus:border-signal"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RuntimeRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3">
      <dt className="flex items-center gap-1 text-ink/45">
        <Activity className="h-3 w-3" />
        {label}
      </dt>
      <dd className="truncate" title={value}>
        {value || "-"}
      </dd>
    </div>
  );
}

function formatDuration(durationMs?: number) {
  if (!durationMs) return "audio";
  return `${(durationMs / 1000).toFixed(1)}s audio`;
}
