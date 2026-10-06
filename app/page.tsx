"use client";

import dynamic from "next/dynamic";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorMessage } from "@/components/ErrorMessage";
import { LoadingState } from "@/components/LoadingState";
import { buildGoogleStreetViewStaticUrl } from "@/lib/googleStaticUrl";
import {
  publicRuntimeConfig,
  runtimeConfigToHeaders,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";
import { useExplorerStore } from "@/lib/store";
import type { StorySession, StreetImage } from "@/types";

type ImageProvider = "mapillary" | "google";

const LeafletMap = dynamic(
  () => import("@/components/LeafletMap").then((module) => module.LeafletMap),
  { ssr: false }
);

const selectedImageStorageKey = "hk-spatial-story.selected-image";
const storySessionStorageKey = "hk-spatial-story.session";

export default function Home() {
  const router = useRouter();
  const {
    images,
    selectedImage,
    setImages,
    setSelectedImage,
    setStorySession,
    setPersonas,
    setSelectedPersona,
    resetFragments
  } = useExplorerStore();
  const [searchText, setSearchText] = useState("22.303, 114.172");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiConfig = useMemo<RuntimeApiConfig>(() => publicRuntimeConfig(), []);
  const [imageProvider, setImageProvider] = useState<ImageProvider>("google");
  const [savedSessions, setSavedSessions] = useState<StorySession[]>([]);

  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedSessions() {
      try {
        const res = await fetch("/api/story/sessions", { headers: runtimeHeaders });
        const data = (await res.json()) as { sessions?: StorySession[] };
        if (!cancelled && res.ok) {
          setSavedSessions(data.sessions || []);
        }
      } catch {
        if (!cancelled) setSavedSessions([]);
      }
    }

    void loadSavedSessions();
    return () => {
      cancelled = true;
    };
  }, [runtimeHeaders]);

  async function searchAt(lat: number, lng: number) {
    setIsSearching(true);
    setError(null);

    try {
      await logClientEvent("map_location_selected", { lat, lng }, runtimeHeaders);
      const endpoint =
        imageProvider === "google"
          ? `/api/google/streetview/search?lat=${lat}&lng=${lng}&radius=80`
          : `/api/mapillary/search?lat=${lat}&lng=${lng}&radius=120`;
      const res = await fetch(endpoint, { headers: runtimeHeaders });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `${providerLabel(imageProvider)} search failed.`);
      }

      setImages(data.images);
      setSelectedImage(data.images[0]);
      await logClientEvent(
        "street_images_loaded",
        { provider: imageProvider, lat, lng, count: data.images.length },
        runtimeHeaders
      );
    } catch (err) {
      console.error("Street-view search failed", err);
      setError(searchErrorMessage(err, imageProvider));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseLatLng(searchText);
    if (!parsed) {
      setError("Enter coordinates as lat, lng.");
      return;
    }
    await searchAt(parsed.lat, parsed.lng);
  }

  function enterStory() {
    if (!selectedImage) return;

    const session: StorySession = {
      id: crypto.randomUUID(),
      provider: selectedImage.provider,
      imageId: selectedImage.id,
      panoId: selectedImage.panoId,
      lat: selectedImage.lat,
      lng: selectedImage.lng,
      personas: [],
      fragmentIds: [],
      createdAt: new Date().toISOString()
    };

    setStorySession(session);
    setPersonas([]);
    setSelectedPersona(undefined);
    resetFragments();
    sessionStorage.setItem(selectedImageStorageKey, JSON.stringify(selectedImage));
    sessionStorage.setItem(storySessionStorageKey, JSON.stringify(session));
    void saveStorySession(session, runtimeHeaders);
    router.push("/story");
  }

  async function enterSavedStory(session: StorySession) {
    const image = storySessionToImage(session, apiConfig);
    if (!image) {
      setError("This saved story cannot be reopened without its original provider data.");
      return;
    }

    setSelectedImage(image);
    setStorySession(session);
    setPersonas(session.personas || (session.selectedPersona ? [session.selectedPersona] : []));
    setSelectedPersona(session.selectedPersona);
    resetFragments();
    sessionStorage.setItem(selectedImageStorageKey, JSON.stringify(image));
    sessionStorage.setItem(storySessionStorageKey, JSON.stringify(session));
    router.push("/story");
  }

  return (
    <main className="editorial-shell map-shell">
      <header className="editorial-masthead">
        <div className="editorial-brand">
          <h1>HK Spatial Story</h1>
          <p>Hong Kong / 香港街景</p>
        </div>
        <div className="map-tools">
          <select
            aria-label="Street view source"
            value={imageProvider}
            onChange={(event) => {
              setImageProvider(event.target.value as ImageProvider);
              setImages([]);
              setSelectedImage(undefined);
            }}
            className="soft-button h-11 px-3 text-sm text-ink"
          >
            <option value="google">Google Street View</option>
            <option value="mapillary">Mapillary</option>
          </select>
          <form onSubmit={handleSearchSubmit} className="coordinate-search">
            <input
              aria-label="Coordinates"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by lat, lng"
            />
            <button
              type="submit"
              className="reader-icon-button !border-signal !bg-signal !text-white"
              aria-label="Search coordinates"
              title="Search coordinates"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      {error ? (
        <div className="mt-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}

      <section className="map-workspace">
        <div className="quiet-panel relative min-h-[58vh] overflow-hidden bg-field lg:min-h-0">
          <LeafletMap
            images={images}
            selectedImage={selectedImage}
            provider={imageProvider}
            savedSessions={savedSessions}
            onLocationClick={searchAt}
            onImageSelect={(image) => {
              setSelectedImage(image);
              void logClientEvent(
                "street_image_selected",
                { provider: image.provider, imageId: image.id },
                runtimeHeaders
              );
            }}
            onSavedSessionSelect={enterSavedStory}
          />
          {isSearching ? (
            <div className="absolute bottom-3 left-3 z-[600] rounded border border-ink/10 bg-paper/95 px-3 py-2">
              <LoadingState label="Finding street views" />
            </div>
          ) : null}
        </div>

        <aside className="map-preview">
          <h2 className="editorial-title">{selectedImage ? "Selected street view" : "Choose a street view"}</h2>
            {selectedImage ? (
              <>
                  <img
                    src={selectedImage.thumbUrl}
                    alt="Selected street scene"
                  />
                <div className="space-y-1 text-sm text-ink/75">
                  <p className="font-medium text-ink">{providerLabel(selectedImage.provider)}</p>
                  <p className="inline-flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-brass" />
                    {selectedImage.lat.toFixed(5)}, {selectedImage.lng.toFixed(5)}
                  </p>
                  <p className="text-[13px] text-ink/55">
                    {selectedImage.capturedAt
                      ? `Captured ${new Date(selectedImage.capturedAt).toLocaleDateString()}`
                      : "Street-view point selected"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={enterStory}
                  className="soft-button-primary preview-action inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold"
                >
                  Read this place
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="map-empty">
                <MapPin size={24} className="text-signal" />
                <p>No street view selected.</p>
              </div>
            )}
        </aside>
      </section>
    </main>
  );
}

function parseLatLng(input: string) {
  const parts = input.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null;
  return { lat: parts[0], lng: parts[1] };
}

function searchErrorMessage(error: unknown, provider: ImageProvider) {
  const message = error instanceof Error ? error.message : "";
  if (/api_key|key|not configured|unauthorized|forbidden/i.test(message)) {
    return provider === "google"
      ? "Street View search is not available here right now. Try Mapillary, or use the live site with Street View enabled."
      : "Mapillary search is not available here right now. Try another source, or use the live site.";
  }
  return provider === "google"
    ? "Street View search did not find a usable scene here. Try another point nearby."
    : "Mapillary search did not find a usable scene here. Try another point nearby.";
}

function providerLabel(provider: ImageProvider) {
  return provider === "google" ? "Google Street View" : "Mapillary";
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
    // Logging should never block the exploration flow.
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
    // Saving should not block entering the story.
  }
}

function storySessionToImage(session: StorySession, config: RuntimeApiConfig): StreetImage | null {
  if (session.provider === "google") {
    const key = config.googleMapsApiKey;
    const panoId = session.panoId || session.imageId;
    const imageUrl = key
      ? buildGoogleStreetViewStaticUrl({
          key,
          panoId,
          width: 640,
          height: 640
        })
      : "";

    return {
      id: session.imageId,
      panoId,
      provider: "google",
      lat: session.lat,
      lng: session.lng,
      thumbUrl: imageUrl,
      fullUrl: imageUrl
    };
  }

  return null;
}
