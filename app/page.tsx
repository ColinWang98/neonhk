"use client";

import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiConfigButton } from "@/components/ApiConfigModal";
import { ErrorMessage } from "@/components/ErrorMessage";
import { LoadingState } from "@/components/LoadingState";
import { SchemaNarrativePanel } from "@/components/SchemaNarrativePanel";
import { SelectedFragmentList } from "@/components/SelectedFragmentList";
import { StreetImageViewer } from "@/components/StreetImageViewer";
import {
  runtimeConfigStorageKey,
  runtimeConfigToHeaders,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";
import { useExplorerStore } from "@/lib/store";
import type { ImageCropBox, SchemaNarratives, ScreenBox, SelectedFragment, VisionDescription } from "@/types";

type ImageProvider = "mapillary" | "google";

const LeafletMap = dynamic(
  () => import("@/components/LeafletMap").then((module) => module.LeafletMap),
  { ssr: false }
);

export default function Home() {
  const { images, selectedImage, fragments, setImages, setSelectedImage, addFragment, updateFragment } =
    useExplorerStore();
  const [searchText, setSearchText] = useState("22.303, 114.172");
  const [isSearching, setIsSearching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<RuntimeApiConfig>({});
  const [imageProvider, setImageProvider] = useState<ImageProvider>("google");

  const activeFragment = useMemo(() => fragments[0], [fragments]);
  const runtimeHeaders = useMemo(() => runtimeConfigToHeaders(apiConfig), [apiConfig]);

  useEffect(() => {
    const saved = localStorage.getItem(runtimeConfigStorageKey);
    if (!saved) return;

    try {
      setApiConfig(JSON.parse(saved) as RuntimeApiConfig);
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
      const res = await fetch(endpoint, {
        headers: runtimeHeaders
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `${providerLabel(imageProvider)} search failed.`);
      }
      setImages(data.images);
      setSelectedImage(data.images[0]);
      await logClientEvent(
        "street_images_loaded",
        {
          provider: imageProvider,
          lat,
          lng,
          count: data.images.length
        },
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
          imageUrl: sourceImageUrl || selectedImage.fullUrl || selectedImage.thumbUrl,
          screenBox,
          cropBox
        })
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) {
        throw new Error(cropData.error || "Cropping failed.");
      }

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
          cropImageUrl: cropData.cropImageUrl
        })
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || "Analysis failed.");
      }

      const { blocked, ...visionDescription } = analyzeData as VisionDescription & { blocked?: boolean };
      if (blocked) {
        updateFragment(cropData.fragmentId, {
          visionDescription,
          status: "blocked"
        });
        return;
      }

      updateFragment(cropData.fragmentId, {
        visionDescription,
        status: "generating"
      });

      const narrativeRes = await fetch("/api/narrative/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...runtimeHeaders },
        body: JSON.stringify({
          fragmentId: cropData.fragmentId,
          visionDescription
        })
      });
      const narratives = (await narrativeRes.json()) as SchemaNarratives & { error?: string };
      if (!narrativeRes.ok) {
        throw new Error(narratives.error || "Narrative generation failed.");
      }

      updateFragment(cropData.fragmentId, {
        narratives,
        status: "ready"
      });
    } catch (err) {
      updateFragment(activeFragmentId, { status: "error" });
      setError(err instanceof Error ? err.message : "Fragment processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="flex h-screen flex-col bg-[#f5f6f2] p-4 text-ink">
      <header className="mb-4 flex flex-col gap-3 border-b border-ink/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Street Fragment Explorer</h1>
          <p className="mt-1 text-sm text-ink/65">Mapillary + AI Schema Narrative Prototype</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <select
            value={imageProvider}
            onChange={(event) => {
              setImageProvider(event.target.value as ImageProvider);
              setImages([]);
              setSelectedImage(undefined);
            }}
            className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink outline-none focus:border-signal"
          >
            <option value="google">Google Street View</option>
            <option value="mapillary">Mapillary</option>
          </select>
          <form onSubmit={handleSearchSubmit} className="flex w-full gap-2 md:w-[420px]">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-ink/15 bg-white px-3 text-sm outline-none focus:border-signal"
              placeholder="lat, lng"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-signal px-4 text-sm font-medium text-white hover:bg-signal/90"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </form>
          <ApiConfigButton config={apiConfig} onSave={saveApiConfig} />
        </div>
      </header>

      {error ? <div className="mb-3"><ErrorMessage message={error} /></div> : null}

      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(420px,1fr)_minmax(520px,1fr)]">
        <div className="grid min-h-0 grid-rows-[minmax(320px,1.3fr)_minmax(180px,0.7fr)] gap-4">
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
              <div className="absolute bottom-3 left-3 z-[600] rounded-md bg-white px-3 py-2 shadow">
                <LoadingState label={`Searching ${providerLabel(imageProvider)}`} />
              </div>
            ) : null}
          </div>
          <SelectedFragmentList fragments={fragments} />
        </div>
        <div className="grid min-h-0 grid-rows-[minmax(320px,1.15fr)_minmax(220px,0.85fr)] gap-4">
          <StreetImageViewer
            image={selectedImage}
            busy={processing}
            googleMapsApiKey={apiConfig.googleMapsApiKey}
            onFragmentSelected={handleFragmentSelected}
          />
          <SchemaNarrativePanel fragment={activeFragment} />
        </div>
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
