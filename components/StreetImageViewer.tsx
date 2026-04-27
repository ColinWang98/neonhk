"use client";

import { useEffect, useRef, useState } from "react";
import { BoxSelectionLayer } from "@/components/BoxSelectionLayer";
import { LoadingState } from "@/components/LoadingState";
import type { ImageCropBox, ScreenBox, StreetImage } from "@/types";

type Props = {
  image?: StreetImage;
  busy?: boolean;
  googleMapsApiKey?: string;
  onFragmentSelected: (screenBox: ScreenBox, cropBox: ImageCropBox, sourceImageUrl?: string) => void;
};

type GooglePov = {
  heading: number;
  pitch: number;
  zoom?: number;
};

type GoogleStreetViewPanorama = {
  addListener: (eventName: string, handler: () => void) => void;
  getPov: () => GooglePov;
  getZoom?: () => number;
  getPano?: () => string;
  setVisible: (visible: boolean) => void;
};

type GoogleMapsNamespace = {
  maps: {
    StreetViewPanorama: new (
      element: HTMLElement,
      options: Record<string, unknown>
    ) => GoogleStreetViewPanorama;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __streetFragmentGoogleMapsPromise?: Promise<void>;
  }
}

export function StreetImageViewer({ image, busy, googleMapsApiKey, onFragmentSelected }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const panoRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [pov, setPov] = useState<GooglePov>({ heading: 0, pitch: 0, zoom: 1 });
  const [googleStatus, setGoogleStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [googleSelecting, setGoogleSelecting] = useState(false);

  useEffect(() => {
    setGoogleSelecting(false);
  }, [image?.id]);

  useEffect(() => {
    if (image?.provider !== "google" || !panoRef.current || !googleMapsApiKey) return;

    let panorama: GoogleStreetViewPanorama | undefined;
    let cancelled = false;
    setGoogleStatus("loading");

    loadGoogleMaps(googleMapsApiKey)
      .then(() => {
        if (cancelled || !panoRef.current || !window.google) return;

        panorama = new window.google.maps.StreetViewPanorama(panoRef.current, {
          pano: image.panoId || image.id,
          position: { lat: image.lat, lng: image.lng },
          pov: { heading: 0, pitch: 0 },
          zoom: 1,
          visible: true,
          motionTracking: false,
          motionTrackingControl: true,
          addressControl: true,
          linksControl: true,
          panControl: true,
          enableCloseButton: false
        });
        const currentPanorama = panorama;

        currentPanorama.addListener("pov_changed", () => {
          const nextPov = currentPanorama.getPov();
          setPov({
            heading: nextPov.heading || 0,
            pitch: nextPov.pitch || 0,
            zoom: currentPanorama.getZoom?.() || 1
          });
        });

        currentPanorama.addListener("pano_changed", () => {
          const panoId = currentPanorama.getPano?.();
          if (panoId) {
            setPov((current) => ({ ...current }));
          }
        });

        setGoogleStatus("ready");
      })
      .catch(() => setGoogleStatus("error"));

    return () => {
      cancelled = true;
      if (panorama) {
        panorama.setVisible(false);
      }
    };
  }, [googleMapsApiKey, image?.id, image?.lat, image?.lng, image?.panoId, image?.provider]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-ink/10 bg-white">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Street Image Viewer</h2>
          <p className="text-xs text-ink/60">
            {image ? `${providerLabel(image.provider)} image ${image.id}` : "Select a marker to begin"}
          </p>
        </div>
        {busy ? <LoadingState label="Processing fragment" /> : null}
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        {image?.provider === "google" ? (
          <div className="absolute inset-0">
            {googleMapsApiKey ? (
              <>
                <div ref={panoRef} className="absolute inset-0" />
                {googleSelecting ? (
                  <BoxSelectionLayer
                    disabled={busy || googleStatus !== "ready"}
                    onSelect={(screenBox) => {
                      if (!panoRef.current || !image) return;
                      const rect = panoRef.current.getBoundingClientRect();
                      const sourceSize = fitStaticSize(rect.width, rect.height);
                      const cropBox = {
                        x: (screenBox.x / rect.width) * sourceSize.width,
                        y: (screenBox.y / rect.height) * sourceSize.height,
                        width: (screenBox.width / rect.width) * sourceSize.width,
                        height: (screenBox.height / rect.height) * sourceSize.height
                      };
                      const sourceImageUrl = buildGoogleStreetViewStaticUrl({
                        key: googleMapsApiKey,
                        panoId: image.panoId || image.id,
                        width: sourceSize.width,
                        height: sourceSize.height,
                        heading: pov.heading,
                        pitch: pov.pitch,
                        fov: 90
                      });
                      setGoogleSelecting(false);
                      onFragmentSelected(screenBox, cropBox, sourceImageUrl);
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  disabled={busy || googleStatus !== "ready"}
                  onClick={() => setGoogleSelecting((value) => !value)}
                  className="absolute right-3 top-3 rounded-md bg-white px-3 py-2 text-xs font-medium text-ink shadow hover:bg-field disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {googleSelecting ? "Cancel selection" : "Select fragment"}
                </button>
                {googleStatus === "loading" ? (
                  <div className="absolute bottom-3 left-3 rounded-md bg-white px-3 py-2 shadow">
                    <LoadingState label="Loading Street View" />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
                Add a Google Maps API Key in the API panel to use interactive Street View.
              </div>
            )}
          </div>
        ) : image ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <img
              ref={imgRef}
              src={image.fullUrl || image.thumbUrl}
              alt="Selected Mapillary street-level scene"
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
              onLoad={(event) =>
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                })
              }
            />
            <BoxSelectionLayer
              disabled={busy}
              onSelect={(screenBox) => {
                const img = imgRef.current;
                if (!img || naturalSize.width === 0 || naturalSize.height === 0) return;
                const rect = img.getBoundingClientRect();
                const parentRect = img.offsetParent?.getBoundingClientRect();
                if (!parentRect) return;

                const imageLeft = rect.left - parentRect.left;
                const imageTop = rect.top - parentRect.top;
                const clippedX = clamp(screenBox.x - imageLeft, 0, rect.width);
                const clippedY = clamp(screenBox.y - imageTop, 0, rect.height);
                const clippedRight = clamp(screenBox.x + screenBox.width - imageLeft, 0, rect.width);
                const clippedBottom = clamp(screenBox.y + screenBox.height - imageTop, 0, rect.height);
                const displayWidth = clippedRight - clippedX;
                const displayHeight = clippedBottom - clippedY;

                if (displayWidth < 8 || displayHeight < 8) return;

                onFragmentSelected(screenBox, {
                  x: (clippedX / rect.width) * naturalSize.width,
                  y: (clippedY / rect.height) * naturalSize.height,
                  width: (displayWidth / rect.width) * naturalSize.width,
                  height: (displayHeight / rect.height) * naturalSize.height
                });
              }}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
            Search a location on the map and choose a street-level image.
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function providerLabel(provider: StreetImage["provider"]) {
  return provider === "google" ? "Google Street View" : "Mapillary";
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.StreetViewPanorama) {
    return Promise.resolve();
  }

  if (window.__streetFragmentGoogleMapsPromise) {
    return window.__streetFragmentGoogleMapsPromise;
  }

  window.__streetFragmentGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API."));
    document.head.appendChild(script);
  });

  return window.__streetFragmentGoogleMapsPromise;
}

function fitStaticSize(width: number, height: number) {
  const max = 640;
  const aspect = width / Math.max(1, height);

  if (aspect >= 1) {
    return {
      width: max,
      height: Math.max(1, Math.round(max / aspect))
    };
  }

  return {
    width: Math.max(1, Math.round(max * aspect)),
    height: max
  };
}

function buildGoogleStreetViewStaticUrl(params: {
  key: string;
  panoId: string;
  width: number;
  height: number;
  heading: number;
  pitch: number;
  fov: number;
}) {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", `${params.width}x${params.height}`);
  url.searchParams.set("pano", params.panoId);
  url.searchParams.set("heading", String(Math.round(params.heading)));
  url.searchParams.set("pitch", String(Math.round(params.pitch)));
  url.searchParams.set("fov", String(params.fov));
  url.searchParams.set("key", params.key);
  return url.toString();
}
