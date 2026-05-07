"use client";

import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiConfigButton } from "@/components/ApiConfigModal";
import { ErrorMessage } from "@/components/ErrorMessage";
import { SchemaNarrativePanel } from "@/components/SchemaNarrativePanel";
import { SelectedFragmentList } from "@/components/SelectedFragmentList";
import { StreetImageViewer } from "@/components/StreetImageViewer";
import { TtsControls } from "@/components/TtsControls";
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
  SchemaNarratives,
  ScreenBox,
  SelectedFragment,
  StorySession,
  StreetImage,
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
    addFragment,
    updateFragment
  } = useExplorerStore();
  const [apiConfig, setApiConfig] = useState<RuntimeApiConfig>(() => publicRuntimeConfig());
  const [personaStatus, setPersonaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const personaRequestIdRef = useRef(0);
  const storySessionIdRef = useRef<string | undefined>(storySession?.id);

  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);
  const activeFragment = useMemo(() => fragments[0], [fragments]);
  const readyFragment = activeFragment?.status === "ready" ? activeFragment : undefined;
  const currentStage = !selectedPersona ? "persona" : readyFragment ? "story" : "panorama";

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
        if (!res.ok) throw new Error(data.error || "Persona generation failed.");
        return data.personas as GeneratedPersona[];
      })
      .then((nextPersonas) => {
        if (personaRequestIdRef.current !== requestId) return;
        setPersonas(nextPersonas);
        setPersonaStatus("ready");
      })
      .catch((err) => {
        if (personaRequestIdRef.current !== requestId) return;
        setPersonaStatus("error");
        setError(err instanceof Error ? err.message : "Persona generation failed.");
      });
  }, [apiConfig, personaStatus, personas.length, runtimeHeaders, selectedImage, setPersonas, storageHydrated]);

  function saveApiConfig(nextConfig: RuntimeApiConfig) {
    setApiConfig(nextConfig);
    localStorage.setItem(runtimeConfigStorageKey, JSON.stringify(nextConfig));
  }

  function choosePersona(persona: GeneratedPersona) {
    setSelectedPersona(persona);
    if (storySession) {
      const nextSession = { ...storySession, selectedPersona: persona };
      setStorySession(nextSession);
      sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
      void saveStorySession(nextSession, runtimeHeaders);
    }
  }

  async function handleFragmentSelected(
    screenBox: ScreenBox,
    cropBox: ImageCropBox,
    sourceImageUrl?: string
  ) {
    if (!selectedImage) return;

    setProcessing(true);
    setError(null);
    const tempId = `pending-${Date.now()}`;
    const baseFragment: SelectedFragment = {
      id: tempId,
      imageId: selectedImage.id,
      selectedAt: new Date().toISOString(),
      screenBox,
      cropBox,
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
          personaId: selectedPersona?.id,
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
          cropBox
        })
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) throw new Error(cropData.error || "Cropping failed.");

      updateFragment(tempId, {
        id: cropData.fragmentId,
        cropImageUrl: cropData.cropImageUrl,
        cropBox: cropData.cropBox,
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
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Analysis failed.");

      const { blocked, ...visionDescription } = analyzeData as VisionDescription & { blocked?: boolean };
      if (blocked) {
        updateFragment(cropData.fragmentId, { visionDescription, status: "blocked" });
        return;
      }

      updateFragment(cropData.fragmentId, { visionDescription, status: "generating" });

      const narrativeRes = await fetch("/api/narrative/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeHeaders },
        body: JSON.stringify({
          fragmentId: cropData.fragmentId,
          sessionId: storySession?.id,
          visionDescription,
          persona: selectedPersona
        })
      });
      const narratives = (await narrativeRes.json()) as SchemaNarratives & { error?: string };
      if (!narrativeRes.ok) throw new Error(narratives.error || "Narrative generation failed.");

      updateFragment(cropData.fragmentId, { narratives, status: "ready" });
      if (storySession) {
        const nextFragmentIds = Array.from(new Set([cropData.fragmentId, ...storySession.fragmentIds]));
        const nextSession = {
          ...storySession,
          selectedPersona,
          fragmentIds: nextFragmentIds
        };
        setStorySession(nextSession);
        sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
        void saveStorySession(nextSession, runtimeHeaders);
      }
    } catch (err) {
      updateFragment(activeFragmentId, { status: "error" });
      setError(err instanceof Error ? err.message : "Fragment processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  if (!selectedImage) {
    return (
      <main className="flex h-screen items-center justify-center p-6 text-ink">
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
    <main className="flex h-screen flex-col p-5 text-ink">
      <header className="mb-5 flex flex-col gap-3 border-b border-ink/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-xs text-ink/58 transition hover:text-ink">
            <ArrowLeft className="h-3 w-3" />
            Map
          </Link>
          <p className="fine-label mb-2">Guided panorama reading</p>
          <h1 className="text-[2rem] font-semibold tracking-normal md:text-[2.4rem]">HK Spatial Story</h1>
          <p className="mt-2 text-sm leading-6 text-ink/62">
            {currentStage === "persona"
              ? "Step 2: choose a generated spatial persona."
              : currentStage === "panorama"
                ? "Step 3: rotate the panorama and select a place fragment."
                : "Step 4: read and listen to the schema story."}
          </p>
        </div>
        <ApiConfigButton config={apiConfig} onSave={saveApiConfig} />
      </header>

      {error ? (
        <div className="mb-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}

      {currentStage === "persona" ? (
        <section className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[360px_1fr]">
          <SceneSummary image={selectedImage} />
          <div className="surface-panel min-h-0 overflow-auto rounded-md p-5">
            <p className="fine-label">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold">Scene Personas</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/62">
              Generated from cautious visual interpretation of the selected street scene.
            </p>
            {personaStatus === "loading" ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-ink/65">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating personas; using defaults if cloud models are slow
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {personas.map((persona) => (
                  <button
                    type="button"
                    key={persona.id}
                    onClick={() => choosePersona(persona)}
                    className="rounded-md border border-ink/10 bg-paper p-5 text-left shadow-sm transition hover:border-brass/55 hover:bg-[#fbf7ed]"
                  >
                    <h3 className="text-sm font-semibold text-ink">{persona.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink/72">{persona.role}</p>
                    {persona.background ? (
                      <p className="mt-3 text-xs leading-5 text-ink/66">{persona.background}</p>
                    ) : null}
                    <p className="mt-3 text-xs leading-5 text-ink/58">{persona.interpretiveLens}</p>
                    <p className="mt-4 rounded bg-field px-2 py-1 text-[11px] text-ink/60">
                      {persona.voiceHint}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(720px,1fr)_360px]">
          <div className="grid min-h-0 grid-rows-[minmax(560px,1fr)_130px] gap-5">
            <StreetImageViewer
              image={selectedImage}
              busy={processing}
              googleMapsApiKey={apiConfig.googleMapsApiKey}
              onFragmentSelected={handleFragmentSelected}
            />
            <SelectedFragmentList fragments={fragments} />
          </div>
          <div className="grid min-h-0 grid-rows-[auto_minmax(240px,1fr)_auto] gap-5">
            <PersonaBadge persona={selectedPersona} onChange={() => setSelectedPersona(undefined)} />
            <SchemaNarrativePanel fragment={activeFragment} />
            <TtsControls narratives={readyFragment?.narratives} persona={selectedPersona} config={apiConfig} />
          </div>
        </section>
      )}
    </main>
  );
}

function SceneSummary({ image }: { image: StreetImage }) {
  return (
    <aside className="surface-panel rounded-md p-5">
      <div className="overflow-hidden rounded-md border border-ink/10 bg-field">
        <img src={image.thumbUrl} alt="Selected scene" className="aspect-square w-full object-cover" />
      </div>
      <p className="fine-label mt-5">Selected Scene</p>
      <h2 className="mt-1 text-sm font-semibold text-ink">{image.provider === "google" ? "Google Street View" : "Mapillary"}</h2>
      <p className="mt-2 text-sm text-ink/65">{image.lat.toFixed(5)}, {image.lng.toFixed(5)}</p>
    </aside>
  );
}

function PersonaBadge({
  persona,
  onChange
}: {
  persona?: GeneratedPersona;
  onChange: () => void;
}) {
  if (!persona) return null;
  return (
    <div className="surface-panel rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="fine-label">Persona</p>
          <h2 className="mt-1 text-sm font-semibold text-ink">{persona.name}</h2>
          <p className="mt-1 text-sm leading-6 text-ink/70">{persona.role}</p>
          {persona.background ? (
            <p className="mt-2 text-xs leading-5 text-ink/64">{persona.background}</p>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-ink/60">{persona.interpretiveLens}</p>
        </div>
        <button type="button" onClick={onChange} className="text-xs text-ink/55 hover:text-ink">
          Change
        </button>
      </div>
    </div>
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
