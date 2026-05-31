"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ImageIcon, Loader2, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { SelectedFragmentList } from "@/components/SelectedFragmentList";
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
  const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [openingStatus, setOpeningStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [storyStatus, setStoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nearbyStatus, setNearbyStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nearbyRecommendations, setNearbyRecommendations] = useState<NearbyContinuationRecommendation[]>([]);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [playedOpeningKeys, setPlayedOpeningKeys] = useState<Record<string, true>>({});
  const personaRequestIdRef = useRef(0);
  const openingRequestIdRef = useRef(0);
  const openingPersonaIdRef = useRef<string | undefined>(undefined);
  const storySessionIdRef = useRef<string | undefined>(storySession?.id);
  const storySessionRef = useRef<StorySession | undefined>(storySession);
  const selectedPersonaIdRef = useRef<string | undefined>(selectedPersona?.id);

  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);
  const activeFragment = useMemo(() => fragments[0], [fragments]);
  const readyFragment = activeFragment?.status === "ready" ? activeFragment : undefined;
  const storedOpening = selectedPersona ? storySession?.sceneOpeningGenerations?.[selectedPersona.id] : undefined;
  const activeOpening = storedOpening?.version === openingCacheVersion ? storedOpening : undefined;
  const activeOpeningKey = storySession?.id && selectedPersona?.id
    ? `${storySession.id}:${selectedPersona.id}`
    : undefined;
  const activeOpeningText = activeOpening?.openingText || "";
  const activeOpeningSegments = useMemo(
    () => activeOpening?.openingBlocks?.map((block) => block.text).filter(Boolean) || [],
    [activeOpening?.openingBlocks]
  );
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
  const showOpeningContext = Boolean(
    selectedPersona &&
    (!storyVoiceReady || openingStatus === "loading" || openingStatus === "error")
  );
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
        setError(uiLanguage === "zh" ? "这个场景暂时读不出来。可以换一个街景再试。" : "This scene could not be read clearly. Try another street view.");
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

  function choosePersona(persona: GeneratedPersona) {
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
        setError(uiLanguage === "zh" ? "这个讲述人暂时读不出这一带。可以换一个讲述人，或者直接重新框选。" : "This narrator could not read the wider area. Try another narrator or select a clearer detail.");
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

    fetch("/api/narrative/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runtimeHeaders },
        body: JSON.stringify({
          fragmentId,
          sessionId: storySession?.id,
          visionDescription,
          persona: selectedPersona,
          placeContext,
          image: selectedImage,
          cropImageUrl: readyFragment.cropImageUrl,
          panoramaPov: readyFragment.panoramaPov,
          existingEvidencePacket: readyFragment.evidencePacket,
          existingPersonaFragmentPlans: readyFragment.personaFragmentPlans,
          existingNarrativeGenerations: readyFragment.narrativeGenerations
        })
      })
      .then(async (res) => {
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
        return data as SchemaNarratives & {
          evidencePacket?: EvidencePacket;
          personaFragmentPlan?: PersonaFragmentPlan;
          narrativeBlocks?: NarrativeBlock[];
          narrativeValidation?: NarrativeValidation;
          narrativeGeneration?: NonNullable<SelectedFragment["narrativeGenerations"]>[string];
          narrativeGenerations?: SelectedFragment["narrativeGenerations"];
        };
      })
      .then((narratives) => {
        if (cancelled) return;
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
        setError(uiLanguage === "zh" ? "这段讲述没有组织好。可以换一个讲述人，或者重新框选一个更清楚的公共细节。" : "This story did not come together. Try another narrator, or select a clearer public detail.");
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
    if (nearbyStatus === "loading" || nearbyStatus === "ready") return;

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
    nearbyStatus,
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
      const res = await fetch(`/api/google/streetview/search?${params.toString()}`, {
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

    setProcessing(true);
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
      console.error("Fragment reading failed", err);
      updateFragment(activeFragmentId, { status: "error" });
      setError(uiLanguage === "zh" ? "这个细节暂时读不清楚。试试招牌、入口、公共设施或更完整的建筑局部。" : "This detail is hard to read. Try a sign, entrance, public fixture, or clearer building detail.");
    } finally {
      setProcessing(false);
    }
  }

  if (!selectedImage) {
    return (
      <main className="story-shell flex min-h-dvh items-center justify-center p-4 text-ink sm:p-6">
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

  return (
    <main className="story-shell flex min-h-dvh flex-col p-3 text-ink sm:p-5 lg:h-screen">
      <header className="surface-panel mb-4 flex flex-col gap-3 px-4 py-4 sm:mb-5 sm:px-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink/58 transition hover:text-ink">
            <ArrowLeft className="h-3 w-3" />
            {uiLanguage === "zh" ? "地图" : "Map"}
          </Link>
          <p className="fine-label mb-2">{uiLanguage === "zh" ? "街景阅读" : "Guided panorama reading"}</p>
          <h1 className="text-[1.75rem] font-semibold tracking-normal sm:text-[2rem] md:text-[2.4rem]">HK Spatial Story</h1>
          <p className="mt-2 text-sm leading-6 text-ink/62">
            {uiLanguage === "zh"
              ? currentStage === "narrator"
                ? "先选一个讲述人，从他的视角进入这条街。"
                : currentStage === "select"
                  ? "在全景图上框选一个你想听的细节。"
                  : "听这一段故事，也可以切换讲述人或回到其他白框。"
              : currentStage === "narrator"
                ? "Choose a narrator for this panorama."
                : currentStage === "select"
                  ? "Select one detail in the panorama for this narrator to read."
                  : "Listen to this story, or switch narrator and return to saved boxes."}
          </p>
          <StoryProgress stage={currentStage} language={uiLanguage} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 overflow-hidden soft-pill">
            {(["en", "zh"] as const).map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => setUiLanguage(language)}
                className={`px-3 text-xs font-semibold transition ${
                  uiLanguage === language ? "bg-[var(--leaf)] text-white" : "text-ink/65 hover:bg-[var(--paper-warm)]"
                }`}
              >
                {language === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}

      <section className="grid flex-1 gap-4 lg:min-h-0 lg:grid-rows-[minmax(640px,1fr)_auto] lg:gap-4">
        <div className="grid gap-4 lg:min-h-0 lg:grid-cols-[minmax(720px,1fr)_360px] lg:gap-5">
          <div className="grid min-h-[56vh] grid-rows-[minmax(420px,1fr)_auto] gap-3 sm:min-h-[62vh] sm:grid-rows-[minmax(500px,1fr)_auto] lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
            <StreetImageViewer
              image={selectedImage}
              busy={processing}
              googleMapsApiKey={apiConfig.googleMapsApiKey}
              language={uiLanguage}
              selectionEnabled={Boolean(selectedPersona)}
              selectionDisabledReason={uiLanguage === "zh" ? "先选择讲述人" : "Choose a narrator first"}
              targetPov={activeFragment?.panoramaPov}
              fragments={fragments.filter((fragment) => fragment.imageId === selectedImage.id)}
              activeFragmentId={activeFragment?.id}
              onFragmentClick={(fragment) => {
                selectFragment(fragment.id);
                setCaption(null);
              }}
              onFragmentSelected={handleFragmentSelected}
            />
            <LiveCaption caption={caption} language={uiLanguage} ready={Boolean(storyVoiceReady)} />
          </div>
          <div className="grid gap-3 lg:max-h-[calc(100dvh-190px)] lg:min-h-0 lg:auto-rows-min lg:content-start lg:overflow-y-auto lg:pr-1">
            <PersonaSwitcher
              personas={personas}
              selectedPersona={selectedPersona}
              personaStatus={personaStatus}
              sceneStatus={sceneStatus}
              storyStatus={storyStatus}
              fragment={activeFragment}
              language={uiLanguage}
              onSelect={choosePersona}
            />
            {showOpeningContext ? (
              <SceneOpeningPreview
                status={openingStatus}
                opening={activeOpening}
                language={uiLanguage}
              />
            ) : null}
            {activeFragment ? (
              <CurrentDetailCard
                fragment={activeFragment}
                persona={selectedPersona}
                language={uiLanguage}
              />
            ) : null}
            {!storyVoiceReady || !readyFragment || !activeNarratives ? (
                <FragmentFirstPanel
                  language={uiLanguage}
                  fragment={activeFragment}
                  processing={processing}
                  hasNarrator={Boolean(selectedPersona)}
                  storyStatus={storyStatus}
                />
            ) : (
              <TtsControls
                narratives={activeNarratives}
                persona={selectedPersona}
                config={apiConfig}
                language={uiLanguage}
                fragmentId={readyFragment.id}
                introText={activeOpeningText}
                introSegments={activeOpeningSegments}
                includeIntro={includeOpeningInStoryAudio}
                cachedAudio={findCachedAudio(readyFragment, selectedPersona, apiConfig, currentStoryText)}
                description={
                  includeOpeningInStoryAudio
                    ? uiLanguage === "zh"
                      ? "这次故事会带上讲述人对这一带的背景，然后直接讲你框选的细节。同一讲述人之后不重复这段背景。"
                      : "This story includes the narrator's wider context once, then moves straight into your selected detail."
                    : undefined
                }
                onCaptionChange={setCaption}
                onIntroPlayed={() => {
                  if (!activeOpeningKey) return;
                  setPlayedOpeningKeys((current) => {
                    const next: Record<string, true> = {
                      ...current,
                      [activeOpeningKey]: true
                    };
                    sessionStorage.setItem(playedOpeningStorageKey, JSON.stringify(next));
                    return next;
                  });
                }}
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
            )}
            {activeStoryReady ? (
              <NearbyContinuationPanel
                status={nearbyStatus}
                recommendations={nearbyRecommendations}
                error={nearbyError}
                language={uiLanguage}
                onOpen={openNearbyRecommendation}
                onRetry={retryNearbyRecommendations}
              />
            ) : null}
          </div>
        </div>
        <div className="min-h-[104px] lg:min-h-0">
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
  sceneStatus,
  storyStatus,
  fragment,
  language,
  onSelect
}: {
  personas: GeneratedPersona[];
  selectedPersona?: GeneratedPersona;
  personaStatus: "idle" | "loading" | "ready" | "error";
  sceneStatus: "idle" | "loading" | "ready" | "error";
  storyStatus: "idle" | "loading" | "ready" | "error";
  fragment?: SelectedFragment;
  language: "en" | "zh";
  onSelect: (persona: GeneratedPersona) => void;
}) {
  const zh = language === "zh";
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [selectedPersona?.id]);
  const showList = !selectedPersona || expanded;

  return (
    <div className="surface-panel min-h-0 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="fine-label">{selectedPersona ? (zh ? "讲述人" : "Narrator") : (zh ? "开始" : "Start")}</p>
          <h2 className="mt-1 text-sm font-semibold text-ink">
            {selectedPersona ? selectedPersona.name : (zh ? "选择讲述人" : "Choose narrator")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink/58">
            {selectedPersona?.userIntro ||
              fragment?.visionDescription?.mainFeature ||
              (zh ? "先从讲述人的角度进入这个街景。" : "Start with a narrator's view of this panorama.")}
          </p>
        </div>
        {selectedPersona && personas.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="soft-button h-8 shrink-0 px-3 text-xs font-semibold"
          >
            {expanded ? (zh ? "收起" : "Done") : (zh ? "切换" : "Change")}
          </button>
        ) : null}
      </div>
      {(personaStatus === "loading" || sceneStatus === "loading") && personas.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-ink/62">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{zh ? "正在准备讲述人" : "Preparing narrators"}</span>
        </div>
      ) : null}
      {storyStatus === "loading" && fragment?.status === "ready" && selectedPersona ? (
        <div className="cozy-card mt-4 flex items-center gap-2 px-3 py-2 text-xs text-ink/62">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{zh ? "正在准备故事" : "Preparing story"}</span>
        </div>
      ) : null}
      {showList ? (
        <div className="mt-3 grid max-h-[42vh] gap-2 overflow-auto pr-1 lg:max-h-[30vh]">
          {personas.map((persona) => {
            const selected = selectedPersona?.id === persona.id;
            return (
              <button
                type="button"
                key={persona.id}
                onClick={() => onSelect(persona)}
                className={`p-3 text-left transition ${
                  selected
                    ? "cozy-card cozy-card-active"
                    : "cozy-card hover:border-brass/45 hover:bg-[#fff3d8]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">{persona.name}</h3>
                  {selected ? <span className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-white">{zh ? "当前" : "Active"}</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-ink/68">{persona.userIntro}</p>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SceneOpeningPreview({
  status,
  opening,
  language
}: {
  status: "idle" | "loading" | "ready" | "error";
  opening?: SceneOpeningGeneration;
  language: "en" | "zh";
}) {
  const zh = language === "zh";
  if (status === "idle" && !opening) return null;
  const ready = Boolean(opening);
  return (
    <div className="cozy-card flex items-start gap-3 px-3 py-2.5">
      {status === "loading" && !ready ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink/45" />
      ) : ready ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
      ) : (
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink/42" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink">
          {ready
            ? zh ? "这一带已准备好" : "Wider place is ready"
            : status === "error"
              ? zh ? "这一带暂时读不出来" : "This area could not be read"
              : zh ? "正在阅读这一带" : "Reading this area"}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-ink/58">
          {ready
            ? zh
              ? "播放时会把这一带的背景自然接到你框选的细节里。"
              : "The story will naturally carry this wider context into your selected detail."
            : status === "error"
              ? zh
                ? "换一个讲述人，或者重新选一个更清楚的细节。"
                : "Try another narrator, or select a clearer detail."
              : zh
                ? "不用等待，也可以先框选细节。"
                : "You can keep moving and select a detail now."}
        </p>
      </div>
    </div>
  );
}

function GroundingSummaryCard({
  fragment,
  language,
  compact = false
}: {
  fragment: SelectedFragment;
  language: "en" | "zh";
  compact?: boolean;
}) {
  const zh = language === "zh";
  const hints = groundingHints(fragment);
  if (!hints.length) return null;

  return (
    <div className={`cozy-card ${compact ? "px-3 py-2.5" : "px-3 py-3"}`}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-ink">{zh ? "有这些线索" : "Story clues"}</p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/42">
              {zh ? `${hints.length}条` : `${hints.length} found`}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hints.slice(0, compact ? 2 : 3).map((hint) => (
              <span
                key={`${hint.kind}-${hint.label}`}
                title={hint.label}
                className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  hint.confidence === "high" ? "bg-[#eef7f4] text-signal" : "bg-field/80 text-ink/62"
                }`}
              >
                <span>{zh ? hint.zhKind : hint.kind}</span>
                <span className="max-w-[8rem] truncate font-medium opacity-75">{hint.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentDetailCard({
  fragment,
  persona,
  language
}: {
  fragment: SelectedFragment;
  persona?: GeneratedPersona;
  language: "en" | "zh";
}) {
  const zh = language === "zh";
  const hints = groundingHints(fragment);
  const visibleHints = hints.slice(0, 2);
  const hiddenHintCount = Math.max(0, hints.length - visibleHints.length);
  const statusText = fragmentStatusLabel(fragment.status, zh);
  const mainFeature = fragment.visionDescription?.mainFeature || (zh ? "街景细节" : "Street detail");

  return (
    <div className="cozy-card overflow-hidden p-3">
      <div className="flex gap-3">
        <div
          className={`flex h-20 w-24 shrink-0 items-center justify-center rounded-[14px] border-2 bg-field bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(54,43,25,0.08)] ${
            fragment.cropImageUrl ? "border-white/80" : "border-dashed border-ink/18"
          }`}
          style={fragment.cropImageUrl ? { backgroundImage: `url(${fragment.cropImageUrl})` } : undefined}
          aria-label={zh ? "当前框选画面" : "Current selected crop"}
        >
          {!fragment.cropImageUrl ? <ImageIcon className="h-5 w-5 text-ink/38" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="fine-label">{zh ? "当前白框" : "Current detail"}</p>
            <span className="rounded-full bg-field/80 px-2 py-0.5 text-[10px] font-semibold text-ink/60">
              {statusText}
            </span>
          </div>
          <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-ink">{mainFeature}</h2>
          <p className="mt-1 line-clamp-1 text-xs text-ink/55">
            {persona
              ? zh ? `讲述人：${persona.name}` : `Narrator: ${persona.name}`
              : zh ? "先选择讲述人" : "Choose a narrator first"}
          </p>
        </div>
      </div>
      {hints.length ? (
        <div className="mt-2 border-t border-ink/10 pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-ink/62">{zh ? "地点线索" : "Place clues"}</p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/38">
              {zh ? `${hints.length}条` : `${hints.length} clues`}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleHints.map((hint) => (
              <span
                key={`${hint.kind}-${hint.label}`}
                title={hint.label}
                className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  hint.confidence === "high" ? "bg-[#eef7f4] text-signal" : "bg-field/80 text-ink/62"
                }`}
              >
                <span>{zh ? hint.zhKind : hint.kind}</span>
                <span className="max-w-[9rem] truncate font-medium opacity-75">{hint.label}</span>
              </span>
            ))}
            {hiddenHintCount ? (
              <span className="inline-flex items-center rounded-full bg-field/70 px-2 py-1 text-[10px] font-semibold text-ink/45">
                +{hiddenHintCount}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-ink/10 pt-2 text-xs leading-5 text-ink/55">
          {zh ? "故事准备好后，这里会显示地点线索。" : "Place clues will appear here once the story is ready."}
        </p>
      )}
    </div>
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

function StoryProgress({
  stage,
  language
}: {
  stage: "narrator" | "select" | "listen";
  language: "en" | "zh";
}) {
  const zh = language === "zh";
  const steps = zh
    ? ["选择讲述人", "框选细节", "播放故事"]
    : ["Choose narrator", "Select detail", "Listen"];
  const activeIndex = stage === "narrator" ? 0 : stage === "select" ? 1 : 2;

  return (
    <div className="soft-pill mt-4 flex max-w-xl overflow-hidden text-xs text-ink/58">
      {steps.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        return (
          <div
            key={step}
            className={`flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2 sm:px-3 ${
              active ? "bg-[var(--leaf)] text-white" : done ? "bg-[#eef7df] text-ink" : "bg-transparent"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                active ? "bg-white text-ink" : done ? "bg-signal text-white" : "bg-[#f7ebc9] text-ink/55"
              }`}
            >
              {index + 1}
            </span>
            <span className="truncate font-medium">{step}</span>
          </div>
        );
      })}
    </div>
  );
}

function FragmentFirstPanel({
  language,
  fragment,
  processing,
  hasNarrator,
  storyStatus
}: {
  language: "en" | "zh";
  fragment?: SelectedFragment;
  processing: boolean;
  hasNarrator: boolean;
  storyStatus: "idle" | "loading" | "ready" | "error";
}) {
  const zh = language === "zh";
  const flow = fragmentFlowState(fragment, processing, storyStatus, zh, hasNarrator);
  return (
    <div className="surface-panel p-4">
      <p className="fine-label">{zh ? "下一步" : "Next"}</p>
      <h2 className="mt-1 text-sm font-semibold text-ink">
        {zh ? "框选一个片段" : "Select a fragment"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-ink/62">
        {hasNarrator
          ? zh
            ? "现在可以旋转全景图，把细节放进中间白框，或直接拖拽一个框。"
            : "Now rotate the panorama, place a detail in the center frame, or drag your own box."
          : zh
            ? "先选择一个讲述人。之后“开始框选”按钮才会打开。"
            : "Choose a narrator first. The Select fragment button will unlock after that."}
      </p>
      <div className="cozy-card mt-4 p-3">
        <div className="flex items-start gap-3">
          {flow.loading ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink/45" />
          ) : flow.done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
          ) : (
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink/42" />
          )}
          <div>
            <p className="text-sm font-semibold text-ink">{flow.title}</p>
            <p className="mt-1 text-xs leading-5 text-ink/60">{flow.detail}</p>
          </div>
        </div>
      </div>
    </div>
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
  status,
  recommendations,
  error,
  language,
  onOpen,
  onRetry
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
  const primaryRecommendation = recommendations[0];

  useEffect(() => {
    setExpanded(false);
  }, [primaryRecommendation?.placeId, status]);

  return (
    <div className="surface-panel p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="fine-label">{zh ? "附近延展" : "Explore Nearby"}</p>
          <h2 className="mt-1 text-sm font-semibold text-ink">
            {zh ? "继续理解这一带" : "Continue nearby"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink/58">
            {zh
              ? "和这个片段有关、附近还能继续看的地方。"
              : "Nearby places that can continue this thread."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin text-ink/45" /> : null}
          {recommendations.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="soft-button inline-flex h-8 w-8 items-center justify-center p-0"
              aria-label={expanded ? (zh ? "收起附近延展" : "Collapse nearby continuation") : zh ? "展开附近延展" : "Expand nearby continuation"}
            >
              <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
          ) : null}
        </div>
      </div>

      {status === "loading" ? (
        <div className="mt-3 rounded-[14px] border border-ink/10 bg-field/55 px-3 py-2 text-xs leading-5 text-ink/58">
          {zh ? "正在查找附近可继续探索的位置。" : "Finding nearby places to continue the story."}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="mt-3 rounded-[16px] border-2 border-red-200 bg-red-50 px-3 py-3 text-xs leading-5 text-red-800">
          <p>{error || (zh ? "附近延展暂时不可用。" : "Nearby continuation is unavailable.")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-red-800 shadow-sm"
          >
            {zh ? "再试一次" : "Try again"}
          </button>
        </div>
      ) : null}

      {status === "ready" && recommendations.length === 0 ? (
        <div className="mt-3 rounded-[16px] border-2 border-dashed border-ink/15 bg-field/55 px-3 py-4 text-sm leading-6 text-ink/58">
          <p>
            {zh
              ? "这次附近没有找到足够合适、可直接进入街景的延展点。你可以换一个细节，或稍后再试。"
              : "No good nearby continuation was found for this detail yet. Try another fragment, or check again in a moment."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="soft-button mt-3 inline-flex h-8 items-center justify-center px-3 text-xs font-semibold"
          >
            {zh ? "重新查找" : "Search again"}
          </button>
        </div>
      ) : null}

      {primaryRecommendation ? (
        <div className="mt-3 rounded-[16px] border border-ink/10 bg-field/55 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-ink">{primaryRecommendation.name}</h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-ink/58">
                <MapPin className="h-3 w-3" />
                {formatDistance(primaryRecommendation.distanceMeters, zh)}
                {primaryRecommendation.category ? <span className="truncate">· {primaryRecommendation.category}</span> : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(primaryRecommendation)}
              className="soft-button-primary inline-flex h-8 shrink-0 items-center justify-center px-3 text-xs font-semibold"
            >
              {zh ? "打开" : "Open"}
            </button>
          </div>
          <p className={`mt-2 text-xs leading-5 text-ink/68 ${expanded ? "" : "line-clamp-2"}`}>
            {primaryRecommendation.reason}
          </p>
          {!expanded && recommendations.length > 1 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 text-[11px] font-semibold text-signal transition hover:text-[var(--leaf-dark)]"
            >
              {zh ? `还有 ${recommendations.length - 1} 个地点` : `${recommendations.length - 1} more nearby`}
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded && recommendations.length > 1 ? (
        <div className="mt-3 grid gap-2">
          {recommendations.slice(1, 3).map((recommendation) => (
            <article key={recommendation.placeId} className="cozy-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{recommendation.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink/58">
                    <MapPin className="h-3 w-3" />
                    {formatDistance(recommendation.distanceMeters, zh)}
                    {recommendation.category ? <span className="truncate">· {recommendation.category}</span> : null}
                  </p>
                </div>
                <span className="rounded-full bg-[#eef7df] px-2 py-1 text-[10px] font-semibold text-signal">
                  {recommendation.recommendedSchema || "Street"}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/68">{recommendation.reason}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recommendation.evidenceSources.slice(0, 3).map((source) => (
                  <span key={source} className="inline-flex items-center gap-1 rounded-full bg-field/75 px-2 py-1 text-[10px] font-semibold text-ink/62">
                    <CheckCircle2 className="h-3 w-3 text-signal" />
                    {evidenceSourceLabel(source)}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onOpen(recommendation)}
                className="soft-button-primary mt-2 inline-flex h-8 items-center justify-center px-3 text-xs font-semibold"
              >
                {zh ? "打开街景" : "Open Street View"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {expanded && primaryRecommendation ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {primaryRecommendation.evidenceSources.slice(0, 3).map((source) => (
            <span key={source} className="inline-flex items-center gap-1 rounded-full bg-field/75 px-2 py-1 text-[10px] font-semibold text-ink/62">
              <CheckCircle2 className="h-3 w-3 text-signal" />
              {evidenceSourceLabel(source)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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

function evidenceSourceLabel(source: NearbyContinuationRecommendation["evidenceSources"][number]) {
  switch (source) {
    case "google_places":
      return "Google Places";
    case "hk_landsd":
      return "Public records";
    case "hk_fehd":
      return "Food licence";
    case "hk_amo":
      return "Heritage record";
    case "osm":
      return "OSM";
    case "wikidata":
      return "Wikidata";
    case "wikipedia":
      return "Wikipedia";
    case "street_view":
      return "Street View";
    case "news":
      return "Nearby news";
    default:
      return source;
  }
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
    <div className="notebook-panel min-h-[76px] px-4 py-3 text-brass sm:px-5">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-brass/65">
        <span>{zh ? "故事字幕" : "Story captions"}</span>
        <span>{caption ? `${caption.index + 1}/${caption.total}` : zh ? "待播放" : "Waiting"}</span>
      </div>
      <p className="line-clamp-3 text-[15px] font-medium leading-6 text-brass sm:line-clamp-2 sm:text-[17px] sm:leading-7">
        {caption?.text ||
          (ready
            ? zh
              ? "点击播放后，故事会像字幕一样逐句出现在这里。"
              : "Press Listen; the story will appear here one subtitle line at a time."
            : zh
              ? "生成故事后，字幕会显示在这里。"
              : "Once the story is ready, captions will appear here.")}
      </p>
    </div>
  );
}

const openingCacheVersion = 3;

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
  const storyFragments = fragments.filter((fragment) => fragment.cropImageUrl || fragment.narratives);
  const activeStory =
    storyFragments.find((fragment) => fragment.id === activeFragmentId) || storyFragments[0];

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`fixed right-0 top-1/2 z-[850] flex -translate-y-1/2 items-center gap-2 rounded-l-[18px] border-2 border-r-0 border-[rgba(39,90,66,0.35)] bg-[var(--leaf)] px-2 py-3 text-xs font-semibold text-white shadow-[0_4px_0_rgba(39,90,66,0.25),0_16px_30px_rgba(54,43,25,0.16)] transition hover:bg-[var(--leaf-dark)] ${
          open ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label={zh ? "打开保存的故事" : "Open saved stories"}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="[writing-mode:vertical-rl]">{zh ? "故事" : "Stories"}</span>
        <span className="rounded bg-white/16 px-1.5 py-0.5 text-[10px]">{storyFragments.length}</span>
      </button>

      <aside
        className={`surface-panel fixed inset-x-3 bottom-3 top-auto z-[860] flex max-h-[76dvh] flex-col overflow-hidden transition duration-300 sm:bottom-5 sm:left-auto sm:right-5 sm:top-24 sm:max-h-[calc(100dvh-7rem)] sm:w-[min(25rem,calc(100vw-1.5rem))] ${
          open ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+1.5rem)] opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-4">
          <div>
            <p className="fine-label">{zh ? "已保存" : "Saved"}</p>
            <h2 className="mt-1 text-sm font-semibold text-ink">{zh ? "街景故事" : "Street Stories"}</h2>
            <p className="mt-1 text-xs leading-5 text-ink/58">
              {zh ? `${storyFragments.length} 个已保存片段` : `${storyFragments.length} saved fragments`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="soft-button inline-flex h-9 w-9 items-center justify-center text-ink/58 hover:text-ink"
            aria-label={zh ? "关闭" : "Close"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {storyFragments.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-[16px] border-2 border-dashed border-ink/18 bg-field/45 px-5 text-center text-sm leading-6 text-ink/56">
              {zh ? "框选一个片段后，会自动保存在这里。" : "After a selected fragment is saved, it will appear here."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                {storyFragments.map((fragment, index) => {
                  const active = activeStory?.id === fragment.id;
                  const storyIds = new Set(Object.keys(fragment.narrativeGenerations || {}));
                  if (fragment.narratives && fragment.narrativePersonaId) storyIds.add(fragment.narrativePersonaId);
                  const storyCount = storyIds.size;
                  const audioCount = Object.keys(fragment.audioGenerations || {}).length;
                  return (
                    <button
                      type="button"
                      key={fragment.id}
                      onClick={() => onSelect(fragment)}
                      className={`p-3 text-left transition ${
                        active
                          ? "cozy-card cozy-card-active"
                          : "cozy-card hover:border-brass/40 hover:bg-[#fff3d8]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-ink">
                          {zh ? `片段 ${index + 1}` : `Fragment ${index + 1}`}
                        </span>
                        {active ? <span className="rounded-full bg-signal px-2 py-0.5 text-[10px] font-semibold text-white">{zh ? "当前" : "Active"}</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/62">
                        {fragment.visionDescription?.mainFeature || (zh ? "街景片段" : "Street fragment")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium text-ink/58">
                        <span className="rounded-full bg-field/75 px-2 py-1">{zh ? `${fragment.personas?.length || 0} 位讲述人` : `${fragment.personas?.length || 0} narrators`}</span>
                        <span className="rounded-full bg-field/75 px-2 py-1">{zh ? `${storyCount} 个故事` : `${storyCount} stories`}</span>
                        <span className="rounded-full bg-field/75 px-2 py-1">{zh ? `${audioCount} 段音频` : `${audioCount} audio`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeStory?.narratives?.spokenStory?.trim() ? (
                <div className="space-y-3 border-t border-ink/10 pt-4">
                  <GroundingSummaryCard fragment={activeStory} language={language} compact />
                  <article className="cozy-card p-4">
                    <h3 className="text-xs font-semibold text-brass">{zh ? "故事" : "Story"}</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink/74">
                      {storyTextForFragment(activeStory)}
                    </p>
                  </article>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function storyTextForFragment(fragment: SelectedFragment) {
  return fragment.narratives?.spokenStory?.trim() || "";
}

async function fetchPlaceContext(
  image: StreetImage,
  selectionMeta: FragmentSelectionMeta | undefined,
  runtimeHeaders: Record<string, string>,
  visionDescription?: VisionDescription
): Promise<PlaceContext | undefined> {
  if (image.provider !== "google") return undefined;

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
      headers: runtimeHeaders
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
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
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

function groundingHints(fragment: SelectedFragment) {
  const hints: Array<{
    kind: string;
    zhKind: string;
    label: string;
    confidence: "high" | "medium" | "low";
  }> = [];

  for (const entity of fragment.visionDescription?.publicEntityCandidates || []) {
    hints.push({
      kind: "Visual clue",
      zhKind: "画面线索",
      label: entity.nameEnglish || entity.name,
      confidence: entity.confidence >= 0.82 ? "high" : "medium"
    });
  }
  for (const candidate of fragment.placeContext?.publicDataCandidates || []) {
    if (candidate.spatialMatch === "footprint_intersection" || candidate.viewAlignment === "inside_fragment_view") {
      hints.push({
        kind: candidate.spatialMatch === "footprint_intersection" ? "Map outline" : "Public record",
        zhKind: candidate.spatialMatch === "footprint_intersection" ? "地图轮廓" : "公共记录",
        label: candidate.label,
        confidence: candidate.spatialMatch === "footprint_intersection" ? "high" : "medium"
      });
    }
  }
  for (const place of fragment.placeContext?.places || []) {
    if (place.viewAlignment === "inside_fragment_view" || place.viewAlignment === "near_fragment_view") {
      hints.push({
        kind: "Map clue",
        zhKind: "地图线索",
        label: place.name,
        confidence: place.viewAlignment === "inside_fragment_view" ? "medium" : "low"
      });
    }
  }

  const seen = new Set<string>();
  return hints.filter((hint) => {
    const key = `${hint.kind}:${hint.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
