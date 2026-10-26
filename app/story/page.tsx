"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, History, ImageIcon, Loader2, Maximize2, Minimize2, PanelBottom, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReaderDialog } from "@/components/ReaderDialog";
import { StreetImageViewer, type FragmentSelectionMeta } from "@/components/StreetImageViewer";
import { TtsControls, type CaptionState } from "@/components/TtsControls";
import { buildGoogleStreetViewStaticUrl } from "@/lib/googleStaticUrl";
import { narrativeCacheVersion } from "@/lib/narrativeCache";
import {
  publicRuntimeConfig,
  runtimeConfigToHeaders,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";
import { useExplorerStore } from "@/lib/store";
import type {
  GeneratedPersona,
  ImageCropBox,
  PlaceContext,
  EvidencePacket,
  NarrativeBlock,
  NarrativeValidation,
  NearbyContinuationRecommendation,
  PersonaFragmentPlan,
  SceneOpeningGeneration,
  SchemaName,
  SchemaNarratives,
  ScreenBox,
  SelectedFragment,
  StorySession,
  StreetImage,
  TtsAudioGeneration,
  TtsProvider,
  VisionDescription
} from "@/types";

const selectedImageStorageKey = "hk-spatial-story.selected-image";
const storySessionStorageKey = "hk-spatial-story.session";
const playedOpeningStorageKey = "hk-spatial-story.played-openings";

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
    restoreFragments,
    addFragment,
    updateFragment,
    selectFragment
  } = useExplorerStore();
  const apiConfig = useMemo<RuntimeApiConfig>(() => publicRuntimeConfig(), []);
  const [personaStatus, setPersonaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<CaptionState | null>(null);
  const [uiLanguage, setUiLanguage] = useState<"en" | "zh">("en");
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [storyDrawerOpen, setStoryDrawerOpen] = useState(false);
  const [narratorDialogOpen, setNarratorDialogOpen] = useState(false);
  const [sheetState, setSheetState] = useState<"collapsed" | "half" | "full">("half");
  const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [openingStatus, setOpeningStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [storyStatus, setStoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nearbyStatus, setNearbyStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nearbyRetry, setNearbyRetry] = useState(0);
  const [nearbyRecommendations, setNearbyRecommendations] = useState<NearbyContinuationRecommendation[]>([]);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [playedOpeningKeys, setPlayedOpeningKeys] = useState<Record<string, true>>({});
  const personaRequestIdRef = useRef(0);
  const openingRequestIdRef = useRef(0);
  const openingPersonaIdRef = useRef<string | undefined>(undefined);
  const storySessionIdRef = useRef<string | undefined>(storySession?.id);
  const storySessionRef = useRef<StorySession | undefined>(storySession);
  const selectedPersonaIdRef = useRef<string | undefined>(selectedPersona?.id);
  const fragmentProcessingRef = useRef(false);

  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);
  const activeFragment = useMemo(() => fragments[0], [fragments]);
  const readyFragment = activeFragment?.status === "ready" ? activeFragment : undefined;
  const storedOpening = selectedPersona ? storySession?.sceneOpeningGenerations?.[selectedPersona.id] : undefined;
  const activeOpening = storedOpening?.version === openingCacheVersion ? storedOpening : undefined;
  const activeOpeningKey = storySession?.id && selectedPersona?.id
    ? `${storySession.id}:${selectedPersona.id}`
    : undefined;
  const activeOpeningText = activeOpening?.openingText || "";
  const activeStoryReady = Boolean(
    readyFragment?.narratives?.spokenStory?.trim() &&
    selectedPersona?.id &&
    readyFragment.narrativePersonaId === selectedPersona.id
  );
  const activeNarratives = activeStoryReady ? readyFragment?.narratives : undefined;
  const includeOpeningInStoryAudio = Boolean(
    activeStoryReady &&
    selectedPersona?.id &&
    activeOpeningKey &&
    activeOpeningText &&
    !playedOpeningKeys[activeOpeningKey]
  );
  const storyVoiceReady = Boolean(activeStoryReady);
  const currentStage = !selectedPersona
    ? "narrator"
    : storyVoiceReady
      ? "listen"
      : "select";
  const currentStoryText = useMemo(
    () =>
      storyTextForAudio(
        activeNarratives,
        includeOpeningInStoryAudio ? activeOpeningText : undefined
      ),
    [activeNarratives, activeOpeningText, includeOpeningInStoryAudio]
  );
  const activeSchemasForRecommendation = useMemo(
    () => getActiveSchemasForRecommendation(readyFragment, selectedPersona),
    [readyFragment, selectedPersona]
  );

  useEffect(() => {
    storySessionRef.current = storySession;
    storySessionIdRef.current = storySession?.id;
  }, [storySession]);

  useEffect(() => {
    selectedPersonaIdRef.current = selectedPersona?.id;
  }, [selectedPersona?.id]);

  useEffect(() => {
    if (!selectedImage) {
      const savedImage = readSessionJson<StreetImage>(selectedImageStorageKey);
      if (savedImage) {
        setSelectedImage(savedImage);
      }
    }

    if (!storySession) {
      const savedSession = readSessionJson<StorySession>(storySessionStorageKey);
      if (savedSession) {
        setStorySession(savedSession);
      }
    }

    const savedPlayedOpenings = readSessionJson<Record<string, true>>(playedOpeningStorageKey);
    if (savedPlayedOpenings) {
      setPlayedOpeningKeys(savedPlayedOpenings);
    }

    setStorageHydrated(true);
  }, [selectedImage, setSelectedImage, setStorySession, storySession]);

  useEffect(() => {
    setCaption(null);
    setStoryStatus(
      activeFragment?.narratives &&
        selectedPersona?.id &&
        activeFragment.narrativePersonaId === selectedPersona.id
        ? "ready"
        : "idle"
    );
  }, [
    activeFragment?.id,
    activeFragment?.narrativePersonaId,
    activeFragment?.narratives,
    selectedPersona?.id
  ]);

  useEffect(() => {
    if (
      !storageHydrated ||
      !selectedImage ||
      !storySession?.id ||
      sceneStatus === "loading" ||
      sceneStatus === "error" ||
      personaStatus === "loading" ||
      personaStatus === "error"
    ) {
      return;
    }

    if (selectedImage.provider === "open3dhk" && !selectedImage.fullUrl) return;

    if (storySession.personas?.length && storySession.sceneVisualDescription && storySession.placeContext) {
      setPersonas(storySession.personas);
      setPersonaStatus("ready");
      setSceneStatus("ready");
      const currentSelected = selectedPersonaIdRef.current
        ? storySession.personas.find((persona) => persona.id === selectedPersonaIdRef.current)
        : undefined;
      const sessionSelected = storySession.selectedPersona
        ? storySession.personas.find((persona) => persona.id === storySession.selectedPersona?.id) ||
          storySession.selectedPersona
        : undefined;
      const selected = currentSelected || sessionSelected;
      if (selected && selected.id !== selectedPersona?.id) {
        setSelectedPersona(selected);
      } else if (!selected && selectedPersona) {
        setSelectedPersona(undefined);
      }
      return;
    }

    const requestId = personaRequestIdRef.current + 1;
    personaRequestIdRef.current = requestId;
    setSceneStatus("loading");
    setPersonaStatus("loading");
    setError(null);

    const snapshotUrl = getSceneSnapshotUrl(selectedImage, apiConfig);
    Promise.all([
      fetchPlaceContext(selectedImage, undefined, runtimeHeaders),
      fetch("/api/persona/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeHeaders },
        body: JSON.stringify({
          image: selectedImage,
          sessionId: storySession.id,
          snapshotUrl
        })
      })
    ])
      .then(async ([placeContext, personaRes]) => {
        const personaData = await personaRes.json();
        if (!personaRes.ok) {
          throw new Error(personaData.error || "Narrators could not be prepared. Please try another scene.");
        }
        return {
          placeContext,
          personas: personaData.personas as GeneratedPersona[],
          sceneVisualDescription: personaData.sceneVisualDescription
        };
      })
      .then(({ placeContext, personas: nextPersonas, sceneVisualDescription }) => {
        if (personaRequestIdRef.current !== requestId) return;
        const selected = storySession.selectedPersona
          ? nextPersonas.find((persona) => persona.id === storySession.selectedPersona?.id) || storySession.selectedPersona
          : undefined;
        setPersonas(nextPersonas);
        if (selected) setSelectedPersona(selected);
        else setSelectedPersona(undefined);
        setSceneStatus("ready");
        setPersonaStatus("ready");
        const nextSession = {
          ...storySession,
          selectedPersona: selected || undefined,
          personas: nextPersonas,
          sceneVisualDescription,
          placeContext
        };
        setStorySession(nextSession);
        sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
        void saveStorySession(nextSession, runtimeHeaders);
      })
      .catch((err) => {
        if (personaRequestIdRef.current !== requestId) return;
        console.error("Narrator preparation failed", err);
        setSceneStatus("error");
        setPersonaStatus("error");
        setError(uiLanguage === "zh" ? "讲述人暂时未能准备完成，请稍后重试。" : "Narrators could not be prepared. Please try again later.");
      });
  }, [
    apiConfig,
    personaStatus,
    runtimeHeaders,
    sceneStatus,
    selectedImage,
    setPersonas,
    setSelectedPersona,
    setStorySession,
    storageHydrated,
    storySession,
    selectedPersona,
    uiLanguage
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
          restoreFragments(loadedFragments, fragmentProcessingRef.current);
        }
      })
      .catch(() => {
        // Saved fragments are optional; new story creation should not be blocked.
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeHeaders, restoreFragments, storageHydrated, storySession?.id]);

  function choosePersona(persona: GeneratedPersona) {
    setSheetState("half");
    setSelectedPersona(persona);
    setCaption(null);
    openingPersonaIdRef.current = undefined;
    setOpeningStatus(storySession?.sceneOpeningGenerations?.[persona.id]?.version === openingCacheVersion ? "ready" : "loading");
    setStoryStatus(activeFragment?.status === "ready" ? "loading" : "idle");
    if (storySession) {
      const nextSession = { ...storySession, selectedPersona: persona };
      setStorySession(nextSession);
      sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
      void saveStorySession(nextSession, runtimeHeaders);
    }
  }

  useEffect(() => {
    if (!storageHydrated || !selectedImage || !storySession?.id || !selectedPersona) return;
    const cachedOpening = storySession.sceneOpeningGenerations?.[selectedPersona.id];
    const cacheReady = cachedOpening?.version === openingCacheVersion;
    if (cacheReady) {
      setOpeningStatus("ready");
      return;
    }
    if (!storySession.sceneVisualDescription && sceneStatus === "loading") return;
    if (openingStatus === "loading" && openingPersonaIdRef.current === selectedPersona.id) return;
    if (openingStatus === "error" && openingPersonaIdRef.current === selectedPersona.id) return;

    const requestId = openingRequestIdRef.current + 1;
    openingRequestIdRef.current = requestId;
    openingPersonaIdRef.current = selectedPersona.id;
    setOpeningStatus("loading");
    setError(null);

    fetch("/api/scene/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
      body: JSON.stringify({
        sessionId: storySession.id,
        image: selectedImage,
        persona: selectedPersona,
        sceneVisualDescription: storySession.sceneVisualDescription,
        placeContext: storySession.placeContext,
        existingOpenings: storySession.sceneOpeningGenerations,
        storySession
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Opening could not be prepared. Please try another narrator.");
        return data as SceneOpeningGeneration;
      })
      .then((opening) => {
        if (openingRequestIdRef.current !== requestId) return;
        const nextSession = {
          ...storySession,
          selectedPersona,
          sceneOpeningGenerations: {
            ...(storySession.sceneOpeningGenerations || {}),
            [selectedPersona.id]: {
              ...opening,
              version: openingCacheVersion
            }
          }
        };
        setStorySession(nextSession);
        sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
        void saveStorySession(nextSession, runtimeHeaders);
        setOpeningStatus("ready");
      })
      .catch((err) => {
        if (openingRequestIdRef.current !== requestId) return;
        console.error("Narrator context failed", err);
        setOpeningStatus("error");
        setError(uiLanguage === "zh" ? "这一带的开场暂时未能准备完成。" : "The opening could not be prepared right now.");
      });
  }, [
    openingStatus,
    runtimeHeaders,
    sceneStatus,
    selectedImage,
    selectedPersona,
    setStorySession,
    storageHydrated,
    storySession,
    uiLanguage
  ]);

  useEffect(() => {
    if (!readyFragment?.visionDescription || !selectedPersona) return;
    const cachedGeneration = readyFragment.narrativeGenerations?.[selectedPersona.id];
    if (cachedGeneration?.version === narrativeCacheVersion) {
      if (
        readyFragment.narrativePersonaId !== selectedPersona.id ||
        readyFragment.narratives !== cachedGeneration.narratives
      ) {
        updateFragment(readyFragment.id, {
          narratives: cachedGeneration.narratives,
          narrativePersonaId: selectedPersona.id,
          evidencePacket: cachedGeneration.evidencePacket || readyFragment.evidencePacket,
          personaFragmentPlans: cachedGeneration.personaFragmentPlan
            ? {
                ...(readyFragment.personaFragmentPlans || {}),
                [selectedPersona.id]: cachedGeneration.personaFragmentPlan
              }
            : readyFragment.personaFragmentPlans,
          narrativeBlocks: cachedGeneration.narrativeBlocks,
          narrativeValidation: cachedGeneration.narrativeValidation,
          status: "ready"
        });
      }
      setStoryStatus("ready");
      return;
    }
    if (
      readyFragment.narrativePersonaId === selectedPersona.id &&
      readyFragment.narratives &&
      readyFragment.narrativeGenerations?.[selectedPersona.id]?.version === narrativeCacheVersion
    ) {
      updateFragment(readyFragment.id, {
        narrativeGenerations: {
          ...(readyFragment.narrativeGenerations || {}),
          [selectedPersona.id]: {
            personaId: selectedPersona.id,
            version: narrativeCacheVersion,
            narratives: readyFragment.narratives,
            evidencePacket: readyFragment.evidencePacket,
            personaFragmentPlan: readyFragment.personaFragmentPlans?.[selectedPersona.id],
            narrativeBlocks: readyFragment.narrativeBlocks,
            narrativeValidation: readyFragment.narrativeValidation,
            createdAt: new Date().toISOString()
          }
        }
      });
      setStoryStatus("ready");
      return;
    }

    let cancelled = false;
    const fragmentId = readyFragment.id;
    const visionDescription = readyFragment.visionDescription;
    const placeContext = readyFragment.placeContext;
    setCaption(null);
    setStoryStatus("loading");

    const contextPromise = placeContext
      ? Promise.resolve(placeContext)
      : selectedImage
        ? fetchPlaceContext(selectedImage, readyFragment.panoramaPov, runtimeHeaders, visionDescription)
        : Promise.resolve(undefined);

    contextPromise
      .then(async (resolvedContext) => {
        if (cancelled) return;
        const res = await fetch("/api/narrative/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...runtimeHeaders },
          body: JSON.stringify({
            fragmentId,
            sessionId: storySession?.id,
            visionDescription,
            persona: selectedPersona,
            placeContext: resolvedContext,
            image: selectedImage,
            cropImageUrl: readyFragment.cropImageUrl,
            panoramaPov: readyFragment.panoramaPov,
            existingEvidencePacket: readyFragment.evidencePacket,
            existingPersonaFragmentPlans: readyFragment.personaFragmentPlans,
            existingNarrativeGenerations: readyFragment.narrativeGenerations
          })
        });
        const data = await res.json();
        if (!res.ok) {
          const warnings = Array.isArray(data.validation?.warnings)
            ? data.validation.warnings.filter(Boolean).slice(0, 3).join(" ")
            : "";
          throw new Error(
            warnings
              ? `${data.error || "Story could not be prepared."} ${warnings}`
              : data.error || "Story could not be prepared. Please try again."
          );
        }
        return { ...data, placeContext: resolvedContext } as SchemaNarratives & {
          placeContext?: PlaceContext;
          evidencePacket?: EvidencePacket;
          personaFragmentPlan?: PersonaFragmentPlan;
          narrativeBlocks?: NarrativeBlock[];
          narrativeValidation?: NarrativeValidation;
          narrativeGeneration?: NonNullable<SelectedFragment["narrativeGenerations"]>[string];
          narrativeGenerations?: SelectedFragment["narrativeGenerations"];
        };
      })
      .then((narratives) => {
        if (cancelled || !narratives) return;
        const storyPersona = selectedPersona;
        const schemaNarratives = pickSchemaNarratives(narratives);
        const narrativeGeneration =
          narratives.narrativeGeneration || {
            personaId: storyPersona.id,
            version: narrativeCacheVersion,
            narratives: schemaNarratives,
            evidencePacket: narratives.evidencePacket,
            personaFragmentPlan: narratives.personaFragmentPlan,
            narrativeBlocks: narratives.narrativeBlocks,
            narrativeValidation: narratives.narrativeValidation,
            createdAt: new Date().toISOString()
          };
        updateFragment(fragmentId, {
          placeContext: narratives.placeContext,
          narratives: schemaNarratives,
          narrativePersonaId: storyPersona.id,
          evidencePacket: narratives.evidencePacket,
          personaFragmentPlans: narratives.personaFragmentPlan
            ? {
                ...(readyFragment.personaFragmentPlans || {}),
                [storyPersona.id]: narratives.personaFragmentPlan
              }
            : readyFragment.personaFragmentPlans,
          narrativeGenerations: narratives.narrativeGenerations || {
            ...(readyFragment.narrativeGenerations || {}),
            [storyPersona.id]: narrativeGeneration
          },
          narrativeBlocks: narratives.narrativeBlocks,
          narrativeValidation: narratives.narrativeValidation,
          status: "ready"
        });
        const currentSession = storySessionRef.current;
        if (currentSession && currentSession.selectedPersona?.id !== storyPersona.id) {
          const nextSession = {
            ...currentSession,
            selectedPersona: storyPersona
          };
          setStorySession(nextSession);
          sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
          void saveStorySession(nextSession, runtimeHeaders);
        }
        setStoryStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Story preparation failed", err);
        setStoryStatus("error");
        setError(uiLanguage === "zh" ? "故事暂时未能准备完成，请稍后重试。" : "The story could not be prepared. Please try again later.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    readyFragment?.id,
    readyFragment?.cropImageUrl,
    readyFragment?.evidencePacket,
    readyFragment?.narrativePersonaId,
    readyFragment?.narrativeGenerations,
    readyFragment?.narrativeBlocks,
    readyFragment?.narrativeValidation,
    readyFragment?.narratives,
    readyFragment?.panoramaPov,
    readyFragment?.personaFragmentPlans,
    readyFragment?.placeContext,
    readyFragment?.visionDescription,
    runtimeHeaders,
    selectedImage,
    selectedPersona,
    setCaption,
    setStorySession,
    storySession?.id,
    uiLanguage,
    updateFragment
  ]);

  useEffect(() => {
    setNearbyRecommendations([]);
    setNearbyError(null);
    setNearbyStatus("idle");
  }, [readyFragment?.id, selectedPersona?.id]);

  useEffect(() => {
    if (!activeStoryReady || !selectedImage || !selectedPersona || !storySession?.id) return;
    const fragment = readyFragment;
    if (!fragment) return;

    let cancelled = false;
    setNearbyStatus("loading");
    setNearbyError(null);

    fetch("/api/recommend/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
      body: JSON.stringify({
        sessionId: storySession.id,
        fragmentId: fragment.id,
        lat: selectedImage.lat,
        lng: selectedImage.lng,
        personaId: selectedPersona.id,
        activeSchemas: activeSchemasForRecommendation,
        radiusMeters: 800,
        placeContext: fragment.placeContext,
        evidencePacket: fragment.evidencePacket
      })
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          recommendations?: NearbyContinuationRecommendation[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Nearby places could not be prepared.");
        return data.recommendations || [];
      })
      .then((recommendations) => {
        if (cancelled) return;
        setNearbyRecommendations(recommendations);
        setNearbyStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Nearby continuation failed", err);
        setNearbyStatus("error");
        setNearbyError(uiLanguage === "zh" ? "附近延展地点暂时没有准备好。" : "Nearby continuation is not ready yet.");
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSchemasForRecommendation,
    nearbyRetry,
    readyFragment?.id,
    readyFragment,
    activeStoryReady,
    readyFragment?.placeContext,
    readyFragment?.evidencePacket,
    runtimeHeaders,
    selectedImage,
    selectedPersona,
    storySession?.id,
    uiLanguage
  ]);

  async function openNearbyRecommendation(recommendation: NearbyContinuationRecommendation) {
    if (!selectedImage || !storySession) return;

    setNearbyStatus("loading");
    setError(null);
    try {
      const params = new URLSearchParams({
        lat: String(recommendation.lat),
        lng: String(recommendation.lng),
        radius: "480"
      });
      const searchPath = selectedImage.provider === "open3dhk" ? "/api/open3dhk/search" : "/api/google/streetview/search";
      const res = await fetch(`${searchPath}?${params.toString()}`, {
        headers: runtimeHeaders
      });
      const data = (await res.json()) as { images?: StreetImage[]; error?: string };
      if (!res.ok || !data.images?.[0]) {
        throw new Error(data.error || "Street View is not available for this place.");
      }

      const image = data.images[0];
      const now = new Date().toISOString();
      const nextSessionId = crypto.randomUUID();
      const baseJourney =
        storySession.journey?.length
          ? storySession.journey
          : [
              {
                sessionId: storySession.id,
                imageId: selectedImage.id,
                lat: selectedImage.lat,
                lng: selectedImage.lng,
                fragmentId: readyFragment?.id,
                createdAt: storySession.createdAt
              }
            ];
      const nextSession: StorySession = {
        id: nextSessionId,
        provider: image.provider,
        imageId: image.id,
        panoId: image.panoId,
        lat: image.lat,
        lng: image.lng,
        fragmentIds: [],
        journey: [
          ...baseJourney,
          {
            sessionId: nextSessionId,
            imageId: image.id,
            lat: image.lat,
            lng: image.lng,
            recommendationPlaceId: recommendation.placeId,
            name: recommendation.name,
            createdAt: now
          }
        ],
        createdAt: now
      };

      setSelectedImage(image);
      setStorySession(nextSession);
      setPersonas([]);
      setSelectedPersona(undefined);
      setFragments([]);
      setCaption(null);
      setSceneStatus("idle");
      setPersonaStatus("idle");
      setOpeningStatus("idle");
      setStoryStatus("idle");
      setNearbyRecommendations([]);
      setNearbyError(null);
      setNearbyStatus("idle");
      sessionStorage.setItem(selectedImageStorageKey, JSON.stringify(image));
      sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
      void saveStorySession(nextSession, runtimeHeaders);
      void logClientEvent(
        "nearby_continuation_opened",
        {
          fromSessionId: storySession.id,
          fromFragmentId: readyFragment?.id,
          toSessionId: nextSessionId,
          recommendation
        },
        runtimeHeaders
      );
    } catch (err) {
      console.error("Street View continuation failed", err);
      setNearbyStatus("error");
      setNearbyError(uiLanguage === "zh" ? "这个推荐地点暂时打不开街景。" : "Street View is not available for this recommended place.");
    }
  }

  function retryNearbyRecommendations() {
    setNearbyRecommendations([]);
    setNearbyError(null);
    setNearbyStatus("idle");
    setNearbyRetry((attempt) => attempt + 1);
  }

  async function handleFragmentSelected(
    screenBox: ScreenBox,
    cropBox: ImageCropBox,
    sourceImageUrl?: string,
    selectionMeta?: FragmentSelectionMeta
  ) {
    if (!selectedImage) return;
    if (!selectedPersona) {
      setError(uiLanguage === "zh" ? "请先选择讲述人，再框选片段。" : "Choose a narrator before selecting a fragment.");
      return;
    }

    fragmentProcessingRef.current = true;
    setProcessing(true);
    setSheetState("half");
    setError(null);
    setStoryStatus("idle");
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
    let processingStage: "saving" | "reading" = "saving";

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
      if (!cropRes.ok) throw new Error(cropData.error || "Fragment could not be saved.");

      updateFragment(tempId, {
        id: cropData.fragmentId,
        cropImageUrl: cropData.cropImageUrl,
        cropBox: cropData.cropBox,
        panoramaPov: selectionMeta,
        status: "analyzing"
      });
      activeFragmentId = cropData.fragmentId;
      processingStage = "reading";

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
      if (!analyzeRes.ok) {
        const detail = typeof analyzeData?.error === "string" ? analyzeData.error : undefined;
        throw new Error(detail || "Fragment could not be read. Please try another area.");
      }

      const { blocked, ...visionDescription } = analyzeData as VisionDescription & { blocked?: boolean };
      if (blocked) {
        updateFragment(cropData.fragmentId, { visionDescription, status: "blocked" });
        return;
      }

      updateFragment(cropData.fragmentId, { visionDescription, status: "generating" });
      const placeContext = await fetchPlaceContext(selectedImage, selectionMeta, runtimeHeaders, visionDescription);

      updateFragment(cropData.fragmentId, {
        placeContext,
        panoramaPov: selectionMeta,
        status: "ready"
      });
      if (storySession) {
        const nextFragmentIds = Array.from(new Set([cropData.fragmentId, ...storySession.fragmentIds]));
        const nextSession = {
          ...storySession,
          fragmentIds: nextFragmentIds
        };
        setStorySession(nextSession);
        sessionStorage.setItem(storySessionStorageKey, JSON.stringify(nextSession));
        void saveStorySession(nextSession, runtimeHeaders);
      }
    } catch (err) {
      console.error("Fragment processing failed", { stage: processingStage, error: err });
      updateFragment(activeFragmentId, { status: "error" });
      const timedOut = err instanceof Error && /timed out|timeout/i.test(err.message);
      setError(processingStage === "saving"
        ? uiLanguage === "zh" ? "片段未能保存，请稍后重试。" : "This detail could not be saved. Please try again later."
        : timedOut
          ? uiLanguage === "zh" ? "读取片段超时，请重试。" : "Reading this detail took too long. Please try again."
          : uiLanguage === "zh" ? "片段暂时未能读取，请稍后重试。" : "This detail could not be read. Please try again later.");
    } finally {
      fragmentProcessingRef.current = false;
      setProcessing(false);
    }
  }

  if (!selectedImage) {
    return (
      <main className="editorial-shell flex min-h-dvh items-center justify-center p-4 text-ink sm:p-6">
        <div className="surface-panel max-w-md p-7 text-center">
          <p className="fine-label">Start Required</p>
          <h1 className="text-xl font-semibold">No scene selected</h1>
          <p className="mt-2 text-sm text-ink/65">Start from the map to choose a Hong Kong street scene.</p>
          <Link href="/" className="soft-button-primary mt-4 inline-flex px-5 py-2 text-sm font-semibold">
            Back to map
          </Link>
        </div>
      </main>
    );
  }
  const readerContext = (
    <>
      <PersonaSwitcher
        personas={personas}
        selectedPersona={selectedPersona}
        personaStatus={personaStatus}
        sceneStatus={sceneStatus}
        language={uiLanguage}
        onSelect={choosePersona}
        open={narratorDialogOpen}
        onOpenChange={setNarratorDialogOpen}
      />
      {activeFragment ? <CurrentDetailCard fragment={activeFragment} language={uiLanguage} /> : null}
      {error ? <div className="reader-error" role="alert">{error}</div> : null}
    </>
  );

  return (
    <main className="editorial-shell story-layout">
      <header className="editorial-masthead">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="reader-icon-button" aria-label={uiLanguage === "zh" ? "返回地图" : "Back to map"} title={uiLanguage === "zh" ? "返回地图" : "Back to map"}>
            <ArrowLeft size={20} />
          </Link>
          <div className="editorial-brand">
            <h1>HK Spatial Story</h1>
            <p>Hong Kong / 香港街景</p>
          </div>
        </div>
        <StoryProgress stage={currentStage} language={uiLanguage} />
        <div className="masthead-tools">
          <div className="language-switch" aria-label={uiLanguage === "zh" ? "语言" : "Language"}>
            {(["en", "zh"] as const).map((language) => (
              <button key={language} type="button" aria-pressed={uiLanguage === language} onClick={() => setUiLanguage(language)}>
                {language === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="story-workspace">
        <div className="panorama-column">
          <StreetImageViewer
            image={selectedImage}
            busy={processing}
            googleMapsApiKey={apiConfig.googleMapsApiKey}
            onSceneSnapshot={(snapshot) => {
              if (selectedImage && !selectedImage.fullUrl) {
                const image = { ...selectedImage, thumbUrl: snapshot, fullUrl: snapshot };
                setSelectedImage(image);
                sessionStorage.setItem(selectedImageStorageKey, JSON.stringify(image));
              }
            }}
            language={uiLanguage}
            selectionEnabled={Boolean(selectedPersona)}
            selectionDisabledReason={uiLanguage === "zh" ? "先选择讲述人" : "Choose a narrator first"}
            onSelectionStart={() => setSheetState("collapsed")}
            targetPov={activeFragment?.panoramaPov}
            fragments={fragments.filter((fragment) => fragment.imageId === selectedImage.id)}
            activeFragmentId={activeFragment?.id}
            onFragmentClick={(fragment) => {
              selectFragment(fragment.id);
              setCaption(null);
              setSheetState("collapsed");
            }}
            onFragmentSelected={handleFragmentSelected}
          />
          <LiveCaption caption={caption} language={uiLanguage} ready={Boolean(storyVoiceReady)} />
        </div>

        <aside className="story-reader" data-sheet={sheetState} data-caption={Boolean(caption)} aria-label={uiLanguage === "zh" ? "故事阅读" : "Story reader"}>
          <div className="sheet-heading">
            <p>{selectedPersona?.name || (uiLanguage === "zh" ? "街景故事" : "Street story")}</p>
            <div className="sheet-controls">
              <button type="button" className="reader-icon-button" disabled={!personas.length} aria-label={uiLanguage === "zh" ? "选择讲述人" : "Choose narrator"} title={uiLanguage === "zh" ? "选择讲述人" : "Choose narrator"} onClick={() => setNarratorDialogOpen(true)}><Users size={18} /></button>
              <button type="button" className="reader-icon-button" aria-pressed={sheetState === "collapsed"} aria-label={uiLanguage === "zh" ? "收起面板" : "Collapse panel"} title={uiLanguage === "zh" ? "收起面板" : "Collapse panel"} onClick={() => setSheetState("collapsed")}><Minimize2 size={18} /></button>
              <button type="button" className="reader-icon-button" aria-pressed={sheetState === "half"} aria-label={uiLanguage === "zh" ? "半屏面板" : "Half panel"} title={uiLanguage === "zh" ? "半屏面板" : "Half panel"} onClick={() => setSheetState("half")}><PanelBottom size={18} /></button>
              <button type="button" className="reader-icon-button" aria-pressed={sheetState === "full"} aria-label={uiLanguage === "zh" ? "展开面板" : "Expand panel"} title={uiLanguage === "zh" ? "展开面板" : "Expand panel"} onClick={() => setSheetState("full")}><Maximize2 size={18} /></button>
              <button type="button" className="reader-icon-button" aria-label={uiLanguage === "zh" ? "已保存故事" : "Saved stories"} title={uiLanguage === "zh" ? "已保存故事" : "Saved stories"} onClick={() => setStoryDrawerOpen(true)}><History size={18} /></button>
            </div>
          </div>
          <div className="reading-panel-main">
            {!storyVoiceReady || !readyFragment || !activeNarratives ? (
              <div className="reader-scroll">
                {readerContext}
              <FragmentFirstPanel
                language={uiLanguage}
                fragment={activeFragment}
                processing={processing}
                hasNarrator={Boolean(selectedPersona)}
                storyStatus={storyStatus}
                openingStatus={openingStatus}
                sceneStatus={sceneStatus}
                personaStatus={personaStatus}
                hasError={Boolean(error)}
              />
              </div>
            ) : (
              <TtsControls
                narratives={activeNarratives}
                persona={selectedPersona}
                config={apiConfig}
                language={uiLanguage}
                fragmentId={readyFragment.id}
                introText={activeOpeningText}
                includeIntro={includeOpeningInStoryAudio}
                cachedAudio={findCachedAudio(readyFragment, selectedPersona, apiConfig, currentStoryText)}
                beforeStory={readerContext}
                afterStory={activeStoryReady ? (
                  <NearbyContinuationPanel
                    status={nearbyStatus}
                    recommendations={nearbyRecommendations}
                    error={nearbyError}
                    language={uiLanguage}
                    onOpen={openNearbyRecommendation}
                    onRetry={retryNearbyRecommendations}
                  />
                ) : null}
                onCaptionChange={setCaption}
                onIntroPlayed={() => {
                  if (!activeOpeningKey) return;
                  setPlayedOpeningKeys((current) => {
                    const next: Record<string, true> = { ...current, [activeOpeningKey]: true };
                    sessionStorage.setItem(playedOpeningStorageKey, JSON.stringify(next));
                    return next;
                  });
                }}
                onAudioGenerated={(entry) => {
                  if (!readyFragment) return;
                  updateFragment(readyFragment.id, {
                    audioGenerations: { ...(readyFragment.audioGenerations || {}), [entry.cacheKey]: entry }
                  });
                }}
              />
            )}
          </div>
        </aside>
        <StoryArchiveDrawer
          open={storyDrawerOpen}
          fragments={fragments}
          activeFragmentId={activeFragment?.id}
          language={uiLanguage}
          onOpenChange={setStoryDrawerOpen}
          onSelect={(fragment) => {
            selectFragment(fragment.id);
            setCaption(null);
            setSheetState("collapsed");
            setStoryDrawerOpen(false);
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
  sceneStatus,
  language,
  onSelect,
  open,
  onOpenChange
}: {
  personas: GeneratedPersona[];
  selectedPersona?: GeneratedPersona;
  personaStatus: "idle" | "loading" | "ready" | "error";
  sceneStatus: "idle" | "loading" | "ready" | "error";
  language: "en" | "zh";
  onSelect: (persona: GeneratedPersona) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const zh = language === "zh";
  const selectedPersonaId = selectedPersona?.id;
  useEffect(() => {
    onOpenChange(!selectedPersonaId && personas.length > 0);
  }, [selectedPersonaId, personas.length, onOpenChange]);
  const loading = personaStatus === "loading" || sceneStatus === "loading";

  return (
    <>
      <section className="narrator-summary">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="fine-label">{zh ? "讲述人" : "Narrator"}</span>
            <h2>{selectedPersona?.name || (zh ? "选择一个视角" : "Choose a perspective")}</h2>
          </div>
          <button
            type="button"
            className="reader-icon-button"
            onClick={() => onOpenChange(true)}
            disabled={personas.length === 0 || loading}
            aria-label={zh ? "选择讲述人" : "Choose narrator"}
            title={zh ? "选择讲述人" : "Choose narrator"}
          ><Users size={20} /></button>
        </div>
        {selectedPersona?.userIntro ? <p>{selectedPersona.userIntro}</p> : null}
      </section>
      <ReaderDialog open={open} onClose={() => onOpenChange(false)} title={zh ? "选择讲述人" : "Choose narrator"} closeLabel={zh ? "关闭" : "Close"}>
        {personas.map((persona) => (
          <button
            type="button"
            key={persona.id}
            className="narrator-option"
            aria-pressed={selectedPersona?.id === persona.id}
            onClick={() => { onOpenChange(false); onSelect(persona); }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3>{persona.name}</h3>
              {selectedPersona?.id === persona.id ? <CheckCircle2 size={18} className="shrink-0 text-signal" /> : null}
            </div>
            <p>{persona.userIntro}</p>
          </button>
        ))}
      </ReaderDialog>
    </>
  );
}

function CurrentDetailCard({ fragment, language }: {
  fragment: SelectedFragment;
  language: "en" | "zh";
}) {
  const zh = language === "zh";
  const mainFeature = fragment.visionDescription?.mainFeature || (zh ? "街景细节" : "Street detail");
  return (
    <section className="current-detail" aria-label={zh ? "当前片段" : "Current fragment"}>
      {fragment.cropImageUrl ? (
        <img src={fragment.cropImageUrl} alt={zh ? "当前框选画面" : "Selected street detail"} />
      ) : (
        <div className="crop-placeholder flex items-center justify-center"><ImageIcon size={20} className="text-ink/40" /></div>
      )}
      <div className="min-w-0">
        <span className="fine-label">{zh ? "当前片段" : "Current detail"}</span>
        <h2>{mainFeature}</h2>
      </div>
    </section>
  );
}

function fragmentStatusLabel(status: SelectedFragment["status"], zh: boolean) {
  const labels: Record<SelectedFragment["status"], { en: string; zh: string }> = {
    cropping: { en: "Saving", zh: "保存中" },
    analyzing: { en: "Reading", zh: "读取中" },
    generating: { en: "Preparing", zh: "准备中" },
    ready: { en: "Ready", zh: "已完成" },
    blocked: { en: "Blocked", zh: "不适合" },
    error: { en: "Retry", zh: "需重试" }
  };
  const item = labels[status];
  return zh ? item.zh : item.en;
}

function StoryProgress({ stage, language }: {
  stage: "narrator" | "select" | "listen";
  language: "en" | "zh";
}) {
  const steps = language === "zh" ? ["讲述人", "框选", "收听"] : ["Narrator", "Select", "Listen"];
  const activeIndex = stage === "narrator" ? 0 : stage === "select" ? 1 : 2;
  return (
    <ol className="reader-progress" aria-label={language === "zh" ? "当前进度" : "Current progress"}>
      {steps.map((step, index) => (
        <li key={step} aria-current={index === activeIndex ? "step" : undefined}>
          <span className="step-number">{index + 1}.</span><span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function FragmentFirstPanel({
  language, fragment, processing, hasNarrator, storyStatus, openingStatus,
  sceneStatus, personaStatus, hasError
}: {
  language: "en" | "zh";
  fragment?: SelectedFragment;
  processing: boolean;
  hasNarrator: boolean;
  storyStatus: "idle" | "loading" | "ready" | "error";
  openingStatus: "idle" | "loading" | "ready" | "error";
  sceneStatus: "idle" | "loading" | "ready" | "error";
  personaStatus: "idle" | "loading" | "ready" | "error";
  hasError: boolean;
}) {
  const zh = language === "zh";
  if (hasError) return null;
  const flow = fragmentFlowState(fragment, processing, storyStatus, zh, hasNarrator);
  const preparingNarrators = !hasNarrator && (sceneStatus === "loading" || personaStatus === "loading");
  const readingArea = hasNarrator && !fragment && openingStatus === "loading";
  const title = preparingNarrators
    ? zh ? "正在准备讲述人" : "Preparing narrators"
    : readingArea ? zh ? "正在阅读这一带" : "Reading this area"
    : flow.title;
  const loading = preparingNarrators || readingArea || flow.loading;
  return (
    <section className="empty-story" role="status">
      <div className="flex items-center gap-2">
        {loading ? <Loader2 size={18} className="shrink-0 animate-spin text-signal" /> : null}
        <h2>{title}</h2>
      </div>
      {!loading && fragment?.status === "blocked" ? <p>{flow.detail}</p> : null}
    </section>
  );
}

function fragmentFlowState(
  fragment: SelectedFragment | undefined,
  processing: boolean,
  storyStatus: "idle" | "loading" | "ready" | "error",
  zh: boolean,
  hasNarrator: boolean
) {
  if (!hasNarrator) {
    return {
      title: zh ? "先选择讲述人" : "Choose a narrator first",
      detail: zh
        ? "这个讲述人的身份会决定接下来怎样理解你框选的细节。"
        : "The narrator's relationship to this place shapes how the selected detail is read.",
      loading: false,
      done: false
    };
  }
  if (!fragment) {
    return {
      title: zh ? "等待框选" : "Waiting for a fragment",
      detail: zh
        ? "准备好后在全景图里拖出一个白框。讲述会从这一带自然落到这个细节。"
        : "Drag one box in the panorama when ready. The story will move from the wider place into this detail.",
      loading: false,
      done: false
    };
  }
  if (fragment.status === "cropping") {
    return {
      title: zh ? "正在保存这个框" : "Saving the selected area",
      detail: zh ? "先把你框住的画面切出来。" : "The selected area is being cropped from the panorama.",
      loading: true,
      done: false
    };
  }
  if (fragment.status === "analyzing") {
    return {
      title: zh ? "正在读取这个细节" : "Reading this detail",
      detail: zh ? "先看清楚框里有什么，再去找附近线索。" : "The crop is being read before nearby clues are checked.",
      loading: true,
      done: false
    };
  }
  if (fragment.status === "generating") {
    return {
      title: zh ? "正在找地图和公开线索" : "Finding map and public clues",
      detail: zh ? "这里只找和这个视角自然相关的线索，不会硬套景点故事。" : "Only clues naturally related to this view are used.",
      loading: true,
      done: false
    };
  }
  if (fragment.status === "blocked") {
    return {
      title: zh ? "这个片段不适合讲述" : "This fragment is not suitable",
      detail: zh ? "可能涉及隐私或太难可靠判断。可以重新框选公共物件、招牌、入口或街道设施。" : "It may be private or too uncertain. Try a public sign, entrance, storefront, or street fixture.",
      loading: false,
      done: false
    };
  }
  if (fragment.status === "error" || storyStatus === "error") {
    return {
      title: zh ? "这一轮没有完成" : "This run did not complete",
      detail: zh ? "可以换一个讲述人，或者重新框选一个更清楚的公共细节。" : "Try another narrator, or select a clearer public detail.",
      loading: false,
      done: false
    };
  }
  if (storyStatus === "loading") {
    return {
      title: zh ? "正在准备这个讲述人的故事" : "Preparing this narrator's story",
      detail: zh ? "正在把画面、地点线索和讲述人的生活经验放进同一段话里。" : "The image, place clues, and narrator's everyday angle are being shaped into one story.",
      loading: true,
      done: false
    };
  }
  if (storyStatus === "ready") {
    return {
      title: zh ? "故事已准备好" : "Story is ready",
      detail: zh ? "用右侧的播放区听。字幕会跟着同一段讲述往前走。" : "Use the voice panel to listen. Captions follow the same spoken story.",
      loading: false,
      done: true
    };
  }
  return {
    title: zh ? "地点线索已准备好" : "Place clues are ready",
    detail: zh ? "接下来会准备这个讲述人的故事。" : "Next, the narrator-specific story will be prepared.",
    loading: processing,
    done: false
  };
}

function NearbyContinuationPanel({
  status, recommendations, error, language, onOpen, onRetry
}: {
  status: "idle" | "loading" | "ready" | "error";
  recommendations: NearbyContinuationRecommendation[];
  error: string | null;
  language: "en" | "zh";
  onOpen: (recommendation: NearbyContinuationRecommendation) => void;
  onRetry: () => void;
}) {
  const zh = language === "zh";
  const [expanded, setExpanded] = useState(false);
  const primaryPlaceId = recommendations[0]?.placeId;
  useEffect(() => { setExpanded(false); }, [primaryPlaceId, status]);
  if (status === "idle") return null;
  return (
    <section className="nearby-continuation" aria-label={zh ? "附近延展" : "Continue nearby"}>
      <div className="flex items-center justify-between gap-2">
        <h4>{zh ? "附近延展" : "Continue nearby"}</h4>
        {recommendations.length > 0 ? (
          <button type="button" className="reader-icon-button" aria-expanded={expanded} aria-label={zh ? "地点详情" : "Place details"} title={zh ? "地点详情" : "Place details"} onClick={() => setExpanded((value) => !value)}>
            <ChevronDown size={18} className={expanded ? "rotate-180" : ""} />
          </button>
        ) : null}
      </div>
      {status === "loading" ? <p role="status" className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{zh ? "正在查找附近地点" : "Finding nearby places"}</p> : null}
      {status === "error" || (status === "ready" && !recommendations.length) ? (
        <div className="flex items-start gap-2 py-2">
          <p className="flex-1">{status === "error" ? error || (zh ? "附近地点暂时不可用。" : "Nearby places are unavailable.") : zh ? "附近没有合适的延展地点。" : "No nearby continuation found."}</p>
          <button type="button" className="soft-button min-h-11 px-3 text-[13px]" onClick={onRetry}>{zh ? "重试" : "Retry"}</button>
        </div>
      ) : null}
      {recommendations.slice(0, expanded ? 3 : 1).map((place) => (
        <div key={place.placeId} className="nearby-place">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4>{place.name}</h4>
              <p className="mt-1">{formatDistance(place.distanceMeters, zh)}</p>
            </div>
            <button type="button" className="reader-icon-button" onClick={() => onOpen(place)} aria-label={zh ? `打开 ${place.name} 的街景` : `Open Street View at ${place.name}`} title={zh ? "打开街景" : "Open Street View"}><ArrowUpRight size={20} /></button>
          </div>
          {expanded ? <p className="mt-2">{place.reason}</p> : null}
        </div>
      ))}
    </section>
  );
}

function getActiveSchemasForRecommendation(
  fragment: SelectedFragment | undefined,
  persona: GeneratedPersona | undefined
): SchemaName[] {
  if (!fragment) return [];
  const planSchemas = persona?.id ? fragment.personaFragmentPlans?.[persona.id]?.activeSchemas : undefined;
  if (planSchemas?.length) return planSchemas;
  const blockSchemas = fragment.narrativeBlocks?.map((block) => block.schema).filter(Boolean) || [];
  return Array.from(new Set(blockSchemas));
}

function formatDistance(distance: number | undefined, zh: boolean) {
  if (!Number.isFinite(distance)) return zh ? "附近" : "nearby";
  if ((distance || 0) < 1000) return zh ? `${Math.round(distance || 0)}米` : `${Math.round(distance || 0)}m away`;
  const km = ((distance || 0) / 1000).toFixed(1);
  return zh ? `${km}公里` : `${km}km away`;
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
    <div className="live-caption" data-empty={!caption}>
      <div className="caption-meta">
        <span>{zh ? "故事字幕" : "Story captions"}</span>
        <span>{caption ? `${caption.index + 1}/${caption.total}` : ready ? (zh ? "待播放" : "Ready") : ""}</span>
      </div>
      <p className="caption-text">{caption?.text || ""}</p>
    </div>
  );
}

const openingCacheVersion = 3;

function StoryArchiveDrawer({
  open, fragments, activeFragmentId, language, onOpenChange, onSelect
}: {
  open: boolean;
  fragments: SelectedFragment[];
  activeFragmentId?: string;
  language: "en" | "zh";
  onOpenChange: (open: boolean) => void;
  onSelect: (fragment: SelectedFragment) => void;
}) {
  const zh = language === "zh";
  const storyFragments = fragments.filter((fragment) => fragment.cropImageUrl || fragment.narratives);
  return (
    <>
        <button type="button" className="archive-tab" style={{ visibility: open ? "hidden" : "visible" }} onClick={() => onOpenChange(true)} aria-label={zh ? "已保存故事" : "Saved stories"} title={zh ? "已保存故事" : "Saved stories"}>
          <History size={16} />{zh ? "故事" : "Stories"}<span>{storyFragments.length}</span>
        </button>
      <ReaderDialog open={open} archive onClose={() => onOpenChange(false)} title={zh ? "已保存故事" : "Saved stories"} closeLabel={zh ? "关闭" : "Close"}>
        {!storyFragments.length ? (
          <p className="py-8 text-sm text-ink/60">{zh ? "还没有保存的片段。" : "No saved fragments yet."}</p>
        ) : storyFragments.map((fragment) => {
          const storyIds = new Set(Object.keys(fragment.narrativeGenerations || {}));
          if (fragment.narratives && fragment.narrativePersonaId) storyIds.add(fragment.narrativePersonaId);
          const audioCount = Object.keys(fragment.audioGenerations || {}).length;
          return (
            <button type="button" key={fragment.id} className="archive-entry" aria-pressed={fragment.id === activeFragmentId} onClick={() => onSelect(fragment)}>
              <div className="flex items-start gap-3">
                {fragment.cropImageUrl ? <img src={fragment.cropImageUrl} alt="" className="h-14 w-16 shrink-0 rounded-sm object-cover" /> : null}
                <div className="min-w-0">
                  <h3>{fragment.visionDescription?.mainFeature || (zh ? "街景片段" : "Street fragment")}</h3>
                  <p>{storyIds.size ? (zh ? `${storyIds.size} 个故事` : `${storyIds.size} stories`) : fragmentStatusLabel(fragment.status, zh)}{audioCount ? (zh ? " / 有音频" : " / Audio saved") : ""}</p>
                </div>
              </div>
            </button>
          );
        })}
      </ReaderDialog>
    </>
  );
}

async function fetchPlaceContext(
  image: StreetImage,
  selectionMeta: FragmentSelectionMeta | undefined,
  runtimeHeaders: Record<string, string>,
  visionDescription?: VisionDescription
): Promise<PlaceContext | undefined> {
  if (image.provider === "mapillary") return undefined;

  const params = new URLSearchParams({
    lat: String(image.lat),
    lng: String(image.lng),
    radius: selectionMeta ? "190" : "150"
  });
  const fragmentHeading = fragmentCenterHeading(selectionMeta);
  if (Number.isFinite(fragmentHeading)) {
    params.set("heading", String(fragmentHeading));
  }
  const headingHalfAngle = fragmentHeadingHalfAngle(selectionMeta, fragmentHeading);
  if (Number.isFinite(headingHalfAngle)) {
    params.set("headingHalfAngle", String(headingHalfAngle));
  }
  for (const query of localContextQueriesFromVision(visionDescription)) {
    params.append("q", query);
  }

  try {
    const res = await fetch(`/api/local-context?${params.toString()}`, {
      headers: runtimeHeaders,
      signal: AbortSignal.timeout(20000)
    });
    const data = (await res.json()) as { context?: PlaceContext; error?: string };
    if (!res.ok) return undefined;
    return data.context;
  } catch {
    return undefined;
  }
}

function localContextQueriesFromVision(visionDescription?: VisionDescription) {
  const queries = new Set<string>();
  for (const entity of visionDescription?.publicEntityCandidates || []) {
    if (entity.nameEnglish?.trim()) queries.add(entity.nameEnglish.trim());
    if (entity.name?.trim()) queries.add(entity.name.trim());
  }
  for (const text of [...(visionDescription?.visibleTextEnglish || []), ...(visionDescription?.visibleText || [])]) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length >= 4 && /university|polytechnic|school|college|station|hospital|museum|library|centre|center|building/i.test(cleaned)) {
      queries.add(cleaned);
    }
  }
  return Array.from(queries).slice(0, 4);
}

function fragmentCenterHeading(selectionMeta: FragmentSelectionMeta | undefined) {
  const corners = selectionMeta?.boxCorners?.filter((corner) => Number.isFinite(corner.heading)) || [];
  if (corners.length) {
    const sum = corners.reduce(
      (current, corner) => {
        const radians = (corner.heading * Math.PI) / 180;
        return {
          x: current.x + Math.cos(radians),
          y: current.y + Math.sin(radians)
        };
      },
      { x: 0, y: 0 }
    );
    if (sum.x !== 0 || sum.y !== 0) {
      return ((Math.atan2(sum.y, sum.x) * 180) / Math.PI + 360) % 360;
    }
  }
  return Number.isFinite(selectionMeta?.heading) ? selectionMeta?.heading : undefined;
}

function fragmentHeadingHalfAngle(selectionMeta: FragmentSelectionMeta | undefined, centerHeading?: number) {
  const corners = selectionMeta?.boxCorners?.filter((corner) => Number.isFinite(corner.heading)) || [];
  if (!corners.length || !Number.isFinite(centerHeading)) return undefined;
  const deltas = corners.map((corner) => Math.abs(shortestHeadingDelta(corner.heading, centerHeading || 0)));
  return Math.min(Math.max(Math.max(...deltas, 6), 8), 60);
}

function shortestHeadingDelta(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180;
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

function findCachedAudio(
  fragment: SelectedFragment | undefined,
  persona: GeneratedPersona | undefined,
  config: RuntimeApiConfig,
  storyText: string
) {
  const generations = Object.values(fragment?.audioGenerations || {});
  if (generations.length === 0) return undefined;

  const provider = normalizeTtsProvider(config.ttsProvider);
  return generations
    .filter((entry) => entry.provider === provider)
    .filter((entry) => !persona?.id || entry.personaId === persona.id)
    .filter((entry) => entry.sourceText === storyText)
    .filter((entry) => cachedAudioCoversSource(entry, storyText))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function cachedAudioCoversSource(entry: TtsAudioGeneration, storyText: string) {
  const sourceUnits = audioTextUnits(storyText);
  if (sourceUnits < 45) return true;
  const spokenUnits = audioTextUnits(entry.speechText || entry.sourceText || "");
  return spokenUnits >= sourceUnits * 0.82;
}

function audioTextUnits(text: string) {
  const chineseChars = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const englishWords = text.match(/[A-Za-z0-9']+/g)?.length || 0;
  const numbers = text.match(/\d+(?:[.,]\d+)*/g)?.length || 0;
  return englishWords + chineseChars * 0.65 + numbers * 0.5;
}

function storyTextForAudio(
  narratives: SchemaNarratives | undefined,
  introText?: string
) {
  const storyText = narratives?.spokenStory?.trim() || "";
  if (!storyText) return "";
  if (introText?.trim()) {
    return `${introText.trim()}\n\n${storyText}`;
  }
  return storyText;
}


function pickSchemaNarratives(narratives: SchemaNarratives): SchemaNarratives {
  return {
    spokenStory: narratives.spokenStory,
    subtitleBlocks: narratives.subtitleBlocks,
    functionalUse: narratives.functionalUse,
    identityBelonging: narratives.identityBelonging,
    memoryTemporality: narratives.memoryTemporality,
    socialCulturalResonance: narratives.socialCulturalResonance,
    storyBeats: narratives.storyBeats
  };
}

function normalizeTtsProvider(provider?: string): TtsProvider {
  if (provider === "local-open-source" || provider === "elevenlabs" || provider === "minimax") {
    return provider;
  }
  return "minimax";
}

function readSessionJson<T>(key: string): T | undefined {
  const raw = sessionStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    sessionStorage.removeItem(key);
    return undefined;
  }
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
