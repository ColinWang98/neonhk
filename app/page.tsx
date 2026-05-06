"use client";

import dynamic from "next/dynamic";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiConfigButton } from "@/components/ApiConfigModal";
import { ErrorMessage } from "@/components/ErrorMessage";
import { LoadingState } from "@/components/LoadingState";
import {
  publicRuntimeConfig,
  runtimeConfigStorageKey,
  runtimeConfigToHeaders,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";
import { useExplorerStore } from "@/lib/store";
import type { StorySession } from "@/types";

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
  const [apiConfig, setApiConfig] = useState<RuntimeApiConfig>(() => publicRuntimeConfig());
  const [imageProvider, setImageProvider] = useState<ImageProvider>("google");

  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);

  useEffect(() => {
    const saved = localStorage.getItem(runtimeConfigStorageKey);
    if (!saved) return;

    try {
      setApiConfig({ ...publicRuntimeConfig(), ...(JSON.parse(saved) as RuntimeApiConfig) });
    } catch {
      localStorage.removeItem(runtimeConfigStorageKey);
    }
  }, []);

  function saveApiConfig(nextConfig: RuntimeApiConfig) {
    setApiConfig(nextConfig);
    localStorage.setItem(runtimeConfigStorageKey, JSON.stringify(nextConfig));
  }

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
      setError(err instanceof Error ? err.message : "Search failed.");
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
      fragmentIds: [],
      createdAt: new Date().toISOString()
    };

    setStorySession(session);
    setPersonas([]);
    setSelectedPersona(undefined);
    resetFragments();
    sessionStorage.setItem(selectedImageStorageKey, JSON.stringify(selectedImage));
    sessionStorage.setItem(storySessionStorageKey, JSON.stringify(session));
    router.push("/story");
  }

  return (
    <main className="flex h-screen flex-col p-5 text-ink">
      <header className="mb-5 flex flex-col gap-4 border-b border-ink/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="fine-label mb-2">Street-level narrative prototype</p>
          <h1 className="text-[2rem] font-semibold tracking-normal text-ink md:text-[2.4rem]">
            HK Spatial Story
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink/62">
            Choose a Hong Kong street scene, then enter a guided panorama story.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <select
            value={imageProvider}
            onChange={(event) => {
              setImageProvider(event.target.value as ImageProvider);
              setImages([]);
              setSelectedImage(undefined);
            }}
            className="h-10 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink outline-none transition focus:border-signal"
          >
            <option value="google">Google Street View</option>
            <option value="mapillary">Mapillary</option>
          </select>
          <form onSubmit={handleSearchSubmit} className="flex w-full gap-2 md:w-[420px]">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
              placeholder="lat, lng"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </form>
          <ApiConfigButton config={apiConfig} onSave={saveApiConfig} />
        </div>
      </header>

      {error ? (
        <div className="mb-3">
          <ErrorMessage message={error} />
        </div>
      ) : null}

      <section className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(560px,1fr)_380px]">
        <div className="relative min-h-0">
          <LeafletMap
            images={images}
            selectedImage={selectedImage}
            provider={imageProvider}
            onLocationClick={searchAt}
            onImageSelect={(image) => {
              setSelectedImage(image);
              void logClientEvent(
                "street_image_selected",
                { provider: image.provider, imageId: image.id },
                runtimeHeaders
              );
            }}
          />
          {isSearching ? (
            <div className="absolute bottom-3 left-3 z-[600] rounded-md border border-ink/10 bg-paper/95 px-3 py-2 shadow-sm backdrop-blur">
              <LoadingState label={`Searching ${providerLabel(imageProvider)}`} />
            </div>
          ) : null}
        </div>

        <aside className="surface-panel flex min-h-0 flex-col rounded-md">
          <div className="border-b border-ink/10 px-5 py-4">
            <p className="fine-label">Step 1</p>
            <h2 className="mt-1 text-base font-semibold text-ink">Select a Scene</h2>
            <p className="mt-1 text-xs leading-5 text-ink/58">Map first, story second.</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
            {selectedImage ? (
              <>
                <div className="overflow-hidden rounded-md border border-ink/10 bg-field">
                  <img
                    src={selectedImage.thumbUrl}
                    alt="Selected street scene"
                    className="aspect-square w-full object-cover"
                  />
                </div>
                <div className="space-y-1 text-sm text-ink/75">
                  <p className="font-medium text-ink">{providerLabel(selectedImage.provider)}</p>
                  <p className="inline-flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-brass" />
                    {selectedImage.lat.toFixed(5)}, {selectedImage.lng.toFixed(5)}
                  </p>
                  <p className="break-all text-xs text-ink/55">{selectedImage.id}</p>
                </div>
                <button
                  type="button"
                  onClick={enterStory}
                  className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90"
                >
                  Enter Story
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-ink/20 px-5 text-center text-sm leading-6 text-ink/55">
                Search coordinates or click the map, then choose a street scene marker.
              </div>
            )}
          </div>
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
