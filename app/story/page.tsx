"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiConfigButton } from "@/components/ApiConfigModal";
import { ErrorMessage } from "@/components/ErrorMessage";
import { SelectedFragmentList } from "@/components/SelectedFragmentList";
import { StreetImageViewer, type FragmentSelectionMeta } from "@/components/StreetImageViewer";
import { TtsControls, type CaptionState } from "@/components/TtsControls";
import { buildGoogleStreetViewStaticUrl } from "@/lib/googleStaticUrl";
import {
  publicRuntimeConfig,
  runtimeConfigStorageKey,
  runtimeConfigToHeaders,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";
import { useExplorerStore } from "@/lib/store";
import type {
  GeneratedPersona,
  ImageCropBox,
  PlaceContext,
  SchemaNarratives,
  ScreenBox,
  SelectedFragment,
  StorySession,
  StreetImage,
  TtsProvider,
  VisionDescription
} from "@/types";

const selectedImageStorageKey = "hk-spatial-story.selected-image";
const storySessionStorageKey = "hk-spatial-story.session";

export default function StoryPage() {
  const {
    selectedImage,
    storySession,
    personas,
    selectedPersona,
    fragments,
    setSelectedImage,
    setStorySession,
    setPersonas,
    setSelectedPersona,
    setFragments,
    addFragment,
    updateFragment,
    selectFragment
  } = useExplorerStore();
  const [apiConfig, setApiConfig] = useState<RuntimeApiConfig>(() => publicRuntimeConfig());
  const [personaStatus, setPersonaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<CaptionState | null>(null);
  const [uiLanguage, setUiLanguage] = useState<"en" | "zh">("en");
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [storyDrawerOpen, setStoryDrawerOpen] = useState(false);
  const personaRequestIdRef = useRef(0);
  const storySessionIdRef = useRef<string | undefined>(storySession?.id);

  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);
  const activeFragment = useMemo(() => fragments[0], [fragments]);
  const readyFragment = activeFragment?.status === "ready" ? activeFragment : undefined;
  const currentStage = readyFragment?.narratives ? "story" : activeFragment ? "narrator" : "panorama";

  useEffect(() => {
    storySessionIdRef.current = storySession?.id;
  }, [storySession?.id]);

  useEffect(() => {
    const savedConfig = localStorage.getItem(runtimeConfigStorageKey);
    if (savedConfig) {
      try {
        setApiConfig({ ...publicRuntimeConfig(), ...(JSON.parse(savedConfig) as RuntimeApiConfig) });
      } catch {
        localStorage.removeItem(runtimeConfigStorageKey);
      }
    }

    if (!selectedImage) {
      const savedImage = sessionStorage.getItem(selectedImageStorageKey);
      if (savedImage) {
        setSelectedImage(JSON.parse(savedImage) as StreetImage);
      }
    }

    if (!storySession) {
      const savedSession = sessionStorage.getItem(storySessionStorageKey);
      if (savedSession) {
        setStorySession(JSON.parse(savedSession) as StorySession);
      }
    }

    setStorageHydrated(true);
  }, [selectedImage, setSelectedImage, setStorySession, storySession]);

  useEffect(() => {
    if (!storageHydrated || !selectedImage || personas.length > 0 || personaStatus === "loading") return;

    if (storySession?.personas?.length) {
      setPersonas(storySession.personas);
      setPersonaStatus("ready");
      if (!selectedPersona && storySession.selectedPersona) {
        setSelectedPersona(storySession.selectedPersona);
      }
      return;
    }

    const requestId = personaRequestIdRef.current + 1;
    personaRequestIdRef.current = requestId;
    setPersonaStatus("loading");
    setError(null);

    const snapshotUrl = getSceneSnapshotUrl(selectedImage, apiConfig);
    const sessionId = storySessionIdRef.current;
    fetch("/api/persona/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
      body: JSON.stringify({ image: selectedImage, sessionId, snapshotUrl })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error("Narrators could not be prepared. Please try another scene.");
        return data.personas as GeneratedPersona[];
      })
      .then((nextPersonas) => {
        if (personaRequestIdRef.current !== requestId) return;
        setPersonas(nextPersonas);
        setPersonaStatus("ready");
        if (storySessionIdRef.current && storySession) {
          const nextSession = { ...storySession, personas: nextPersonas };
          setStorySession(nextSession);
          sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
          void saveStorySession(nextSession, runtimeHeaders);
        }
      })
      .catch((err) => {
        if (personaRequestIdRef.current !== requestId) return;
        setPersonaStatus("error");
        setError(err instanceof Error ? err.message : "Narrators could not be prepared. Please try another scene.");
      });
  }, [
    apiConfig,
    personaStatus,
    personas.length,
    runtimeHeaders,
    selectedImage,
    selectedPersona,
    setPersonas,
    setSelectedPersona,
    setStorySession,
    storageHydrated,
    storySession
  ]);

  useEffect(() => {
    if (!storageHydrated || !storySession?.id) return;

    let cancelled = false;
    fetch(`/api/fragments?sessionId=${encodeURIComponent(storySession.id)}`, {
      headers: runtimeHeaders
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fragment loading failed.");
        return data.fragments as SelectedFragment[];
      })
      .then((loadedFragments) => {
        if (!cancelled && loadedFragments.length > 0) {
          setFragments(loadedFragments);
        }
      })
      .catch(() => {
        // Saved fragments are optional; new story creation should not be blocked.
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeHeaders, setFragments, storageHydrated, storySession?.id]);

  function saveApiConfig(nextConfig: RuntimeApiConfig) {
    setApiConfig(nextConfig);
    localStorage.setItem(runtimeConfigStorageKey, JSON.stringify(nextConfig));
  }

  function choosePersona(persona: GeneratedPersona) {
    setSelectedPersona(persona);
    setCaption(null);
    if (storySession) {
      const nextSession = { ...storySession, personas, selectedPersona: persona };
      setStorySession(nextSession);
      sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
      void saveStorySession(nextSession, runtimeHeaders);
    }
  }

  useEffect(() => {
    if (!readyFragment?.visionDescription || !selectedPersona) return;
    if (readyFragment.narrativePersonaId === selectedPersona.id && readyFragment.narratives) return;

    let cancelled = false;
    const fragmentId = readyFragment.id;
    const visionDescription = readyFragment.visionDescription;
    const placeContext = readyFragment.placeContext;
    setCaption(null);

    fetch("/api/narrative/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
      body: JSON.stringify({
        fragmentId,
        sessionId: storySession?.id,
        visionDescription,
        persona: selectedPersona,
        placeContext
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error("Story could not be prepared. Please try again.");
        return data as SchemaNarratives;
      })
      .then((narratives) => {
        if (cancelled) return;
        updateFragment(fragmentId, {
          narratives,
          narrativePersonaId: selectedPersona.id,
          audioGenerations: {},
          status: "ready"
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Story could not be prepared. Please try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    readyFragment?.id,
    readyFragment?.narrativePersonaId,
    readyFragment?.narratives,
    readyFragment?.placeContext,
    readyFragment?.visionDescription,
    runtimeHeaders,
    selectedPersona,
    setCaption,
    storySession?.id,
    updateFragment
  ]);

  async function handleFragmentSelected(
    screenBox: ScreenBox,
    cropBox: ImageCropBox,
    sourceImageUrl?: string,
    selectionMeta?: FragmentSelectionMeta
  ) {
    if (!selectedImage) return;

    setProcessing(true);
    setError(null);
    setSelectedPersona(undefined);
    setCaption(null);
    const tempId = `pending-${Date.now()}`;
    const baseFragment: SelectedFragment = {
      id: tempId,
      imageId: selectedImage.id,
      selectedAt: new Date().toISOString(),
      screenBox,
      cropBox,
      panoramaPov: selectionMeta,
      status: "cropping"
    };
    addFragment(baseFragment);
    let activeFragmentId = tempId;

    try {
      await logClientEvent(
        "fragment_selected",
        {
          imageId: selectedImage.id,
          sessionId: storySession?.id,
          screenBox,
          cropBox
        },
        runtimeHeaders
      );

      const cropRes = await fetch("/api/fragment/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeHeaders },
        body: JSON.stringify({
          imageId: selectedImage.id,
          sessionId: storySession?.id,
          imageUrl: sourceImageUrl || selectedImage.fullUrl || selectedImage.thumbUrl,
          screenBox,
          cropBox,
          panoramaPov: selectionMeta
        })
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) throw new Error("Fragment could not be saved. Please try again.");

      updateFragment(tempId, {
        id: cropData.fragmentId,
        cropImageUrl: cropData.cropImageUrl,
        cropBox: cropData.cropBox,
        panoramaPov: selectionMeta,
        status: "analyzing"
      });
      activeFragmentId = cropData.fragmentId;

      const analyzeRes = await fetch("/api/fragment/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeHeaders },
        body: JSON.stringify({
          fragmentId: cropData.fragmentId,
          sessionId: storySession?.id,
          cropImageUrl: cropData.cropImageUrl
        })
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error("Fragment could not be read. Please try another area.");

      const { blocked, ...visionDescription } = analyzeData as VisionDescription & { blocked?: boolean };
      if (blocked) {
        updateFragment(cropData.fragmentId, { visionDescription, status: "blocked" });
        return;
      }

      updateFragment(cropData.fragmentId, { visionDescription, status: "generating" });
      const placeContext = await fetchPlaceContext(selectedImage, selectionMeta, runtimeHeaders);

      updateFragment(cropData.fragmentId, {
        placeContext,
        panoramaPov: selectionMeta,
        status: "ready"
      });
      if (storySession) {
        const nextFragmentIds = Array.from(new Set([cropData.fragmentId, ...storySession.fragmentIds]));
        const nextSession = {
          ...storySession,
          personas,
          fragmentIds: nextFragmentIds
        };
        setStorySession(nextSession);
        sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
        void saveStorySession(nextSession, runtimeHeaders);
      }
    } catch (err) {
      updateFragment(activeFragmentId, { status: "error" });
      setError(err instanceof Error ? err.message : "Fragment could not be completed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  if (!selectedImage) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4 text-ink sm:p-6">
        <div className="surface-panel max-w-md rounded-md p-7 text-center">
          <p className="fine-label">Start Required</p>
          <h1 className="text-xl font-semibold">No scene selected</h1>
          <p className="mt-2 text-sm text-ink/65">Start from the map to choose a Hong Kong street scene.</p>
          <Link href="/" className="mt-4 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/90">
            Back to map
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col p-3 text-ink sm:p-5 lg:h-screen">
      <header className="mb-4 flex flex-col gap-3 border-b border-ink/10 pb-4 sm:mb-5 sm:pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-xs text-ink/58 transition hover:text-ink">
            <ArrowLeft className="h-3 w-3" />
            Map
          </Link>
          <p className="fine-label mb-2">Guided panorama reading</p>
          <h1 className="text-[1.75rem] font-semibold tracking-normal sm:text-[2rem] md:text-[2.4rem]">HK Spatial Story</h1>
          <p className="mt-2 text-sm leading-6 text-ink/62">
            {currentStage === "panorama"
              ? "Step 2: rotate the panorama and select a place fragment."
              : currentStage === "narrator"
                ? "Step 3: choose a narrator for this selected fragment."
                : "Step 3: switch narrator, read, and listen."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 overflow-hidden rounded-md border border-ink/15 bg-paper">
            {(["en", "zh"] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => setUiLanguage(language)}
                className={`px-3 text-xs font-medium transition ${
                  uiLanguage === language ? "bg-ink text-white" : "text-ink/65 hover:bg-field"
                }`}
              >
                {language === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
          <ApiConfigButton config={apiConfig} onSave={saveApiConfig} />
        </div>
      </header>

      {error ? (
        <div className="mb-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}

      <section className="grid flex-1 gap-4 lg:min-h-0 lg:grid-rows-[minmax(660px,1fr)_minmax(220px,0.26fr)] lg:gap-5">
        <div className="grid gap-4 lg:min-h-0 lg:grid-cols-[minmax(720px,1fr)_340px] lg:gap-5">
          <div className="grid min-h-[56vh] grid-rows-[minmax(420px,1fr)_auto] gap-3 sm:min-h-[62vh] sm:grid-rows-[minmax(500px,1fr)_auto] lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
            <StreetImageViewer
              image={selectedImage}
              busy={processing}
              googleMapsApiKey={apiConfig.googleMapsApiKey}
              language={uiLanguage}
              targetPov={activeFragment?.panoramaPov}
              fragments={fragments.filter((fragment) => fragment.imageId === selectedImage.id)}
              activeFragmentId={activeFragment?.id}
              onFragmentClick={(fragment) => {
                selectFragment(fragment.id);
                setCaption(null);
              }}
              onFragmentSelected={handleFragmentSelected}
            />
            <LiveCaption caption={caption} language={uiLanguage} ready={Boolean(readyFragment?.narratives)} />
          </div>
          <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-5">
            {activeFragment ? (
              <PersonaSwitcher
                personas={personas}
                selectedPersona={selectedPersona}
                personaStatus={personaStatus}
                fragment={activeFragment}
                language={uiLanguage}
                onSelect={choosePersona}
              />
            ) : (
              <FragmentFirstPanel language={uiLanguage} />
            )}
            <TtsControls
              narratives={readyFragment?.narratives}
              persona={selectedPersona}
              config={apiConfig}
              language={uiLanguage}
              fragmentId={readyFragment?.id}
              cachedAudio={findCachedAudio(readyFragment, selectedPersona, apiConfig)}
              onCaptionChange={setCaption}
              onAudioGenerated={(entry) => {
                if (!readyFragment) return;
                updateFragment(readyFragment.id, {
                  audioGenerations: {
                    ...(readyFragment.audioGenerations || {}),
                    [entry.cacheKey]: entry
                  }
                });
              }}
            />
          </div>
        </div>
        <div className="min-h-[260px] lg:min-h-0">
          <SelectedFragmentList
            fragments={fragments}
            language={uiLanguage}
            activeFragmentId={activeFragment?.id}
            onSelect={(fragment) => {
              selectFragment(fragment.id);
              setCaption(null);
            }}
          />
        </div>
        <StoryArchiveDrawer
          open={storyDrawerOpen}
          fragments={fragments}
          activeFragmentId={activeFragment?.id}
          language={uiLanguage}
          onOpenChange={setStoryDrawerOpen}
          onSelect={(fragment) => {
            selectFragment(fragment.id);
            setCaption(null);
          }}
        />
      </section>
    </main>
  );
}

function PersonaSwitcher({
  personas,
  selectedPersona,
  personaStatus,
  fragment,
  language,
  onSelect
}: {
  personas: GeneratedPersona[];
  selectedPersona?: GeneratedPersona;
  personaStatus: "idle" | "loading" | "ready" | "error";
  fragment: SelectedFragment;
  language: "en" | "zh";
  onSelect: (persona: GeneratedPersona) => void;
}) {
  const zh = language === "zh";
  return (
    <div className="surface-panel min-h-0 overflow-hidden rounded-md p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="fine-label">{zh ? "第三步" : "Step 3"}</p>
          <h2 className="mt-1 text-sm font-semibold text-ink">
            {zh ? "选择讲述人" : "Choose narrator"}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/58">
            {fragment.visionDescription?.mainFeature || (zh ? "已选中的街景片段" : "Selected street fragment")}
          </p>
        </div>
      </div>
      {personaStatus === "loading" && personas.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-ink/62">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{zh ? "正在准备讲述人" : "Preparing narrators"}</span>
        </div>
      ) : null}
      <div className="mt-3 grid max-h-[42vh] gap-2 overflow-auto pr-1 lg:max-h-[36vh]">
        {personas.map((persona) => {
          const selected = selectedPersona?.id === persona.id;
          return (
            <button
              type="button"
              key={persona.id}
              onClick={() => onSelect(persona)}
              className={`rounded-md border p-3 text-left transition ${
                selected
                  ? "border-signal bg-[#eef7f4]"
                  : "border-ink/10 bg-paper hover:border-brass/45 hover:bg-[#fbf7ed]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{persona.name}</h3>
                {selected ? <span className="rounded bg-signal px-2 py-0.5 text-[11px] text-white">{zh ? "当前" : "Active"}</span> : null}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/68">{shortPersonaIntro(persona)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FragmentFirstPanel({ language }: { language: "en" | "zh" }) {
  const zh = language === "zh";
  return (
    <div className="surface-panel rounded-md p-4">
      <p className="fine-label">{zh ? "第二步" : "Step 2"}</p>
      <h2 className="mt-1 text-sm font-semibold text-ink">
        {zh ? "先框选一个片段" : "Select a fragment first"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-ink/62">
        {zh
          ? "旋转全景图，点“开始框选”，在你想听故事的位置拖出一个框。讲述人会在下一步出现。"
          : "Rotate the panorama, press Select fragment, and drag a box over the detail you want to hear about. Narrators appear after that."}
      </p>
    </div>
  );
}

function shortPersonaIntro(persona: GeneratedPersona) {
  const source = persona.background || persona.role || persona.interpretiveLens;
  return source
    .replace(/^Fictional guide:\s*/i, "")
    .replace(/\s+/g, " ")
    .split(".")
    .slice(0, 2)
    .join(".")
    .trim();
}

function LiveCaption({
  caption,
  language,
  ready
}: {
  caption: CaptionState | null;
  language: "en" | "zh";
  ready: boolean;
}) {
  const zh = language === "zh";
  return (
    <div className="min-h-[76px] rounded-md border border-brass/25 bg-paper px-4 py-3 text-brass shadow-[0_12px_30px_rgba(82,61,38,0.12)] sm:px-5">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-brass/65">
        <span>{zh ? "实时字幕" : "Live Subtitle"}</span>
        <span>{caption ? `${caption.index + 1}/${caption.total}` : "Idle"}</span>
      </div>
      <p className="line-clamp-3 text-[15px] font-medium leading-6 text-brass sm:line-clamp-2 sm:text-[17px] sm:leading-7">
        {caption?.text ||
          (ready
            ? zh
              ? "点击播放后，叙事会像视频字幕一样在这里逐条出现。"
              : "Press Play; the story will appear here one subtitle line at a time."
            : zh
              ? "生成故事后，字幕会显示在这里。"
              : "Once the story is ready, captions will appear here.")}
      </p>
    </div>
  );
}

const storyKeys = [
  "functionalUse",
  "identityBelonging",
  "memoryTemporality",
  "socialCulturalResonance"
] as const;

const storyLabels = {
  en: ["Everyday use", "Feeling of entry", "Time and routine", "Shared space"],
  zh: ["日常使用", "进入感", "时间与惯常", "共享空间"]
} as const;

function StoryArchiveDrawer({
  open,
  fragments,
  activeFragmentId,
  language,
  onOpenChange,
  onSelect
}: {
  open: boolean;
  fragments: SelectedFragment[];
  activeFragmentId?: string;
  language: "en" | "zh";
  onOpenChange: (open: boolean) => void;
  onSelect: (fragment: SelectedFragment) => void;
}) {
  const zh = language === "zh";
  const storyFragments = fragments.filter((fragment) => fragment.narratives);
  const activeStory =
    storyFragments.find((fragment) => fragment.id === activeFragmentId) || storyFragments[0];

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`fixed right-0 top-1/2 z-[850] flex -translate-y-1/2 items-center gap-2 rounded-l-md border border-r-0 border-ink/12 bg-ink px-2 py-3 text-xs font-medium text-white shadow-xl transition hover:bg-ink/90 ${
          open ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label={zh ? "打开保存的故事" : "Open saved stories"}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="[writing-mode:vertical-rl]">{zh ? "故事" : "Stories"}</span>
        <span className="rounded bg-white/16 px-1.5 py-0.5 text-[10px]">{storyFragments.length}</span>
      </button>

      <aside
        className={`fixed bottom-3 right-3 top-20 z-[860] flex w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-md border border-ink/12 bg-paper shadow-2xl transition duration-300 sm:bottom-5 sm:right-5 sm:top-24 ${
          open ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+1.5rem)] opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-4">
          <div>
            <p className="fine-label">{zh ? "已保存" : "Saved"}</p>
            <h2 className="mt-1 text-sm font-semibold text-ink">{zh ? "街景故事" : "Street Stories"}</h2>
            <p className="mt-1 text-xs leading-5 text-ink/58">
              {zh ? `${storyFragments.length} 个片段有故事记录` : `${storyFragments.length} fragments with story notes`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-2 text-ink/58 transition hover:bg-field hover:text-ink"
            aria-label={zh ? "关闭" : "Close"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {storyFragments.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-ink/18 bg-field/55 px-5 text-center text-sm leading-6 text-ink/56">
              {zh ? "框选一个片段并完成故事后，会自动保存在这里。" : "After a selected fragment has a story, it will be saved here."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                {storyFragments.map((fragment, index) => {
                  const active = activeStory?.id === fragment.id;
                  return (
                    <button
                      type="button"
                      key={fragment.id}
                      onClick={() => onSelect(fragment)}
                      className={`rounded-md border p-3 text-left transition ${
                        active
                          ? "border-signal bg-[#eef7f4]"
                          : "border-ink/10 bg-white hover:border-brass/40 hover:bg-[#fbf7ed]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-ink">
                          {zh ? `片段 ${index + 1}` : `Fragment ${index + 1}`}
                        </span>
                        {active ? <span className="rounded bg-signal px-2 py-0.5 text-[10px] text-white">{zh ? "当前" : "Active"}</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/62">
                        {fragment.visionDescription?.mainFeature || (zh ? "街景片段" : "Street fragment")}
                      </p>
                    </button>
                  );
                })}
              </div>

              {activeStory?.narratives ? (
                <div className="space-y-3 border-t border-ink/10 pt-4">
                  {storyKeys.map((key, index) => (
                    <article key={key} className="rounded-md border border-ink/10 bg-white p-4">
                      <h3 className="text-xs font-semibold text-brass">
                        {zh ? storyLabels.zh[index] : storyLabels.en[index]}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-ink/74">{activeStory.narratives![key].text}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function getSceneSnapshotUrl(image: StreetImage, config: RuntimeApiConfig) {
  if (image.provider === "google" && config.googleMapsApiKey) {
    return buildGoogleStreetViewStaticUrl({
      key: config.googleMapsApiKey,
      panoId: image.panoId || image.id,
      width: 640,
      height: 640
    });
  }

  return image.fullUrl || image.thumbUrl;
}

async function fetchPlaceContext(
  image: StreetImage,
  selectionMeta: FragmentSelectionMeta | undefined,
  runtimeHeaders: Record<string, string>
): Promise<PlaceContext | undefined> {
  if (image.provider !== "google") return undefined;

  const params = new URLSearchParams({
    lat: String(image.lat),
    lng: String(image.lng),
    radius: "120"
  });
  if (Number.isFinite(selectionMeta?.heading)) {
    params.set("heading", String(selectionMeta?.heading));
  }

  try {
    const res = await fetch(`/api/local-context?${params.toString()}`, {
      headers: runtimeHeaders
    });
    const data = (await res.json()) as { context?: PlaceContext; error?: string };
    if (!res.ok) return undefined;
    return data.context;
  } catch {
    return undefined;
  }
}

function findCachedAudio(
  fragment: SelectedFragment | undefined,
  persona: GeneratedPersona | undefined,
  config: RuntimeApiConfig
) {
  const generations = Object.values(fragment?.audioGenerations || {});
  if (generations.length === 0) return undefined;

  const provider = normalizeTtsProvider(config.ttsProvider);
  return generations
    .filter((entry) => entry.provider === provider)
    .filter((entry) => !persona?.id || entry.personaId === persona.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function normalizeTtsProvider(provider?: string): TtsProvider {
  if (provider === "local-open-source" || provider === "elevenlabs" || provider === "minimax") {
    return provider;
  }
  return "minimax";
}

async function logClientEvent(
  eventType: string,
  payload: Record<string, unknown>,
  runtimeHeaders: Record<string, string>
) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
      body: JSON.stringify({ eventType, payload })
    });
  } catch {
    // Logging should never block the story flow.
  }
}

async function saveStorySession(session: StorySession, runtimeHeaders: Record<string, string>) {
  try {
    await fetch("/api/story/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
      body: JSON.stringify({ session })
    });
  } catch {
    // Saving should not block the story flow.
  }
}
