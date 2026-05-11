"use client";

import { Crosshair, ImageIcon, MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BoxSelectionLayer } from "@/components/BoxSelectionLayer";
import { LoadingState } from "@/components/LoadingState";
import { buildGoogleStreetViewStaticUrl } from "@/lib/googleStaticUrl";
import type { ImageCropBox, PanoramaPov, ScreenBox, SelectedFragment, StreetImage } from "@/types";

type Props = {
  image?: StreetImage;
  busy?: boolean;
  googleMapsApiKey?: string;
  language?: "en" | "zh";
  targetPov?: PanoramaPov;
  fragments?: SelectedFragment[];
  activeFragmentId?: string;
  onFragmentClick?: (fragment: SelectedFragment) => void;
  onFragmentSelected: (
    screenBox: ScreenBox,
    cropBox: ImageCropBox,
    sourceImageUrl?: string,
    meta?: FragmentSelectionMeta
  ) => void;
};

type GooglePov = {
  heading: number;
  pitch: number;
  zoom?: number;
};

export type FragmentSelectionMeta = {
  heading?: number;
  pitch?: number;
  fov?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};

type GoogleStreetViewPanorama = {
  addListener: (eventName: string, handler: () => void) => void;
  getPov: () => GooglePov;
  getZoom?: () => number;
  getPano?: () => string;
  setPov?: (pov: { heading: number; pitch: number }) => void;
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

export function StreetImageViewer({
  image,
  busy,
  googleMapsApiKey,
  language = "en",
  targetPov,
  fragments = [],
  activeFragmentId,
  onFragmentClick,
  onFragmentSelected
}: Props) {
  const zh = language === "zh";
  const imgRef = useRef<HTMLImageElement | null>(null);
  const panoRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<GoogleStreetViewPanorama | null>(null);
  const targetPovRef = useRef<PanoramaPov | undefined>(targetPov);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [pov, setPov] = useState<GooglePov>({ heading: 0, pitch: 0, zoom: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [googleStatus, setGoogleStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [googleSelecting, setGoogleSelecting] = useState(false);

  useEffect(() => {
    setGoogleSelecting(false);
  }, [image?.id]);

  useEffect(() => {
    targetPovRef.current = targetPov;
  }, [targetPov]);

  useEffect(() => {
    if (image?.provider !== "google" || !panoRef.current) return;
    const node = panoRef.current;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [googleStatus, image?.provider]);

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
          motionTrackingControl: false,
          addressControl: false,
          linksControl: false,
          panControl: false,
          fullscreenControl: false,
          enableCloseButton: false
        });
        const currentPanorama = panorama;
        panoramaRef.current = currentPanorama;
        if (targetPovRef.current) {
          currentPanorama.setPov?.({
            heading: targetPovRef.current.heading || 0,
            pitch: targetPovRef.current.pitch || 0
          });
        }

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

        currentPanorama.addListener("zoom_changed", () => {
          const nextPov = currentPanorama.getPov();
          setPov({
            heading: nextPov.heading || 0,
            pitch: nextPov.pitch || 0,
            zoom: currentPanorama.getZoom?.() || 1
          });
        });

        setGoogleStatus("ready");
      })
      .catch(() => setGoogleStatus("error"));

    return () => {
      cancelled = true;
      if (panorama) {
        panorama.setVisible(false);
      }
      if (panoramaRef.current === panorama) {
        panoramaRef.current = null;
      }
    };
  }, [googleMapsApiKey, image?.id, image?.lat, image?.lng, image?.panoId, image?.provider]);

  useEffect(() => {
    if (!targetPov || image?.provider !== "google") return;
    panoramaRef.current?.setPov?.({
      heading: targetPov.heading || 0,
      pitch: targetPov.pitch || 0
    });
  }, [image?.provider, targetPov]);

  return (
    <div className="surface-panel flex h-full min-h-0 flex-col overflow-hidden rounded-md">
      <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="fine-label">{zh ? "全景图" : "Panorama"}</p>
          <h2 className="mt-1 text-sm font-semibold text-ink">{zh ? "街道图像查看器" : "Street Image Viewer"}</h2>
          <p className="mt-1 break-all text-xs text-ink/58">
            {image ? `${providerLabel(image.provider)} image ${image.id}` : "Select a marker to begin"}
          </p>
          {image ? (
            <p className="mt-1 text-[11px] text-ink/45">
              {image.lat.toFixed(5)}, {image.lng.toFixed(5)}
              {image.provider === "google" ? ` · heading ${Math.round(pov.heading)}° · pitch ${Math.round(pov.pitch)}°` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          {busy ? <LoadingState label={zh ? "正在处理片段" : "Processing fragment"} /> : null}
          {image?.provider === "google" && googleMapsApiKey ? (
            <button
              type="button"
              disabled={busy || googleStatus !== "ready"}
              onClick={() => setGoogleSelecting((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-55 sm:px-4"
            >
              <Crosshair className="h-4 w-4" />
              {googleSelecting ? (zh ? "退出框选" : "Exit selection") : zh ? "开始框选" : "Select fragment"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-[#121514]">
        {image?.provider === "google" ? (
          <div className="absolute inset-0">
            {googleMapsApiKey ? (
              <>
                <div ref={panoRef} className="absolute inset-0" />
                <FragmentBoxOverlay
                  fragments={fragments}
                  activeFragmentId={activeFragmentId}
                  viewportSize={viewportSize}
                  pov={pov}
                  disabled={googleSelecting}
                  onFragmentClick={onFragmentClick}
                />
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
                      const snapshotFov = currentHorizontalFov(pov.zoom);
                      const sourceImageUrl = buildGoogleStreetViewStaticUrl({
                        key: googleMapsApiKey,
                        panoId: image.panoId || image.id,
                        width: sourceSize.width,
                        height: sourceSize.height,
                        heading: pov.heading,
                        pitch: pov.pitch,
                        fov: snapshotFov
                      });
                      setGoogleSelecting(false);
                      onFragmentSelected(screenBox, cropBox, sourceImageUrl, {
                        heading: pov.heading,
                        pitch: pov.pitch,
                        fov: snapshotFov,
                        viewportWidth: rect.width,
                        viewportHeight: rect.height
                      });
                    }}
                  />
                ) : null}
                {googleSelecting ? (
                  <div className="pointer-events-none absolute inset-0 z-[30] border-[3px] border-signal bg-signal/10">
                    <div className="absolute left-3 right-3 top-3 inline-flex max-w-[360px] items-center gap-2 rounded-md border border-white/25 bg-ink/90 px-3 py-2 text-xs font-medium text-white shadow-lg sm:left-4 sm:right-auto sm:top-4 sm:px-4 sm:py-3 sm:text-sm">
                      <MousePointer2 className="h-4 w-4 shrink-0" />
                      {zh ? "在全景图上按住鼠标拖拽，框选一个 place fragment" : "Drag on the panorama to box-select a place fragment"}
                    </div>
                  </div>
                ) : null}
                {googleStatus === "loading" ? (
                  <div className="absolute bottom-3 left-3 rounded-md border border-white/20 bg-paper/95 px-3 py-2 shadow-sm backdrop-blur">
                    <LoadingState label={zh ? "正在加载街景" : "Loading Street View"} />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
                {zh ? "请在设置面板加入 Google Maps API Key 来使用交互式街景。" : "Add a Google Maps API Key in the Settings panel to use interactive Street View."}
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
            <div>
              <ImageIcon className="mx-auto mb-3 h-6 w-6 text-white/45" />
              {zh ? "在地图上搜索地点并选择街道图像。" : "Search a location on the map and choose a street-level image."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentBoxOverlay({
  fragments,
  activeFragmentId,
  viewportSize,
  pov,
  disabled,
  onFragmentClick
}: {
  fragments: SelectedFragment[];
  activeFragmentId?: string;
  viewportSize: { width: number; height: number };
  pov: GooglePov;
  disabled?: boolean;
  onFragmentClick?: (fragment: SelectedFragment) => void;
}) {
  if (disabled || viewportSize.width <= 0 || viewportSize.height <= 0 || fragments.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[35]">
      {fragments.map((fragment, index) => {
        const box = projectFragmentBox(fragment, viewportSize, pov);
        if (!box || box.width < 8 || box.height < 8) return null;
        const active = fragment.id === activeFragmentId;
        const ready = fragment.status === "ready";
        const hasAudio = Object.keys(fragment.audioGenerations || {}).length > 0;

        return (
          <button
            key={fragment.id}
            type="button"
            aria-label={`Select fragment ${index + 1}`}
            onClick={() => onFragmentClick?.(fragment)}
            className={`pointer-events-auto absolute rounded-[2px] border-2 border-dashed border-white text-left shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_8px_20px_rgba(0,0,0,0.25)] transition hover:bg-white/15 ${
              active ? "bg-white/20 ring-2 ring-signal" : "bg-black/10"
            }`}
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height
            }}
          >
            <span className="absolute -left-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border border-white/90 bg-ink px-1 text-[11px] font-semibold text-white shadow">
              {index + 1}
            </span>
            {ready && box.width >= 96 ? (
              <span className="absolute -bottom-7 left-0 whitespace-nowrap rounded-sm border border-white/70 bg-white px-2 py-1 text-[11px] font-semibold text-ink shadow">
                {active ? (hasAudio ? "Active audio" : "Active") : hasAudio ? "Play saved audio" : "Select this"}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function projectFragmentBox(
  fragment: SelectedFragment,
  viewportSize: { width: number; height: number },
  pov: GooglePov
) {
  const sourceWidth = fragment.panoramaPov?.viewportWidth || viewportSize.width;
  const sourceHeight = fragment.panoramaPov?.viewportHeight || viewportSize.height;
  const sourceHeading = fragment.panoramaPov?.heading;
  const sourcePitch = fragment.panoramaPov?.pitch;
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    !Number.isFinite(sourceHeading) ||
    !Number.isFinite(sourcePitch)
  ) {
    return scaleScreenBox(fragment, viewportSize);
  }

  const sourceFov = fragment.panoramaPov?.fov || 90;
  const sourceVerticalFov = verticalFov(sourceFov, sourceWidth, sourceHeight);
  const currentFov = currentHorizontalFov(pov.zoom);
  const currentVerticalFov = verticalFov(currentFov, viewportSize.width, viewportSize.height);
  const box = fragment.screenBox;
  const sourceCorners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ];
  const projected = sourceCorners
    .map((corner) =>
      screenPointToPanoramaPoint(corner, {
        width: sourceWidth,
        height: sourceHeight,
        heading: sourceHeading || 0,
        pitch: sourcePitch || 0,
        horizontalFov: sourceFov,
        verticalFov: sourceVerticalFov
      })
    )
    .map((point) =>
      panoramaPointToScreenPoint(point, {
        width: viewportSize.width,
        height: viewportSize.height,
        heading: pov.heading || 0,
        pitch: pov.pitch || 0,
        horizontalFov: currentFov,
        verticalFov: currentVerticalFov
      })
    );

  if (projected.some((point) => !point.visible)) return undefined;

  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (right < 0 || bottom < 0 || left > viewportSize.width || top > viewportSize.height) return undefined;

  return {
    x: clamp(left, 0, viewportSize.width),
    y: clamp(top, 0, viewportSize.height),
    width: clamp(right - left, 0, viewportSize.width),
    height: clamp(bottom - top, 0, viewportSize.height)
  };
}

function scaleScreenBox(fragment: SelectedFragment, viewportSize: { width: number; height: number }) {
  const sourceWidth = fragment.panoramaPov?.viewportWidth || viewportSize.width;
  const sourceHeight = fragment.panoramaPov?.viewportHeight || viewportSize.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return undefined;

  const scaleX = viewportSize.width / sourceWidth;
  const scaleY = viewportSize.height / sourceHeight;
  return {
    x: clamp(fragment.screenBox.x * scaleX, 0, viewportSize.width),
    y: clamp(fragment.screenBox.y * scaleY, 0, viewportSize.height),
    width: clamp(fragment.screenBox.width * scaleX, 0, viewportSize.width),
    height: clamp(fragment.screenBox.height * scaleY, 0, viewportSize.height)
  };
}

function screenPointToPanoramaPoint(
  point: { x: number; y: number },
  camera: {
    width: number;
    height: number;
    heading: number;
    pitch: number;
    horizontalFov: number;
    verticalFov: number;
  }
) {
  const xNorm = (point.x / camera.width) * 2 - 1;
  const yNorm = (point.y / camera.height) * 2 - 1;
  const headingOffset = toDegrees(Math.atan(xNorm * Math.tan(toRadians(camera.horizontalFov / 2))));
  const pitchOffset = -toDegrees(Math.atan(yNorm * Math.tan(toRadians(camera.verticalFov / 2))));
  return {
    heading: normalizeDegrees(camera.heading + headingOffset),
    pitch: clamp(camera.pitch + pitchOffset, -89, 89)
  };
}

function panoramaPointToScreenPoint(
  point: { heading: number; pitch: number },
  camera: {
    width: number;
    height: number;
    heading: number;
    pitch: number;
    horizontalFov: number;
    verticalFov: number;
  }
) {
  const headingOffset = shortestAngleDifference(point.heading, camera.heading);
  const pitchOffset = point.pitch - camera.pitch;
  const halfHorizontal = camera.horizontalFov / 2;
  const halfVertical = camera.verticalFov / 2;
  const margin = 8;
  const visible = Math.abs(headingOffset) <= halfHorizontal + margin && Math.abs(pitchOffset) <= halfVertical + margin;
  const xNorm = Math.tan(toRadians(headingOffset)) / Math.tan(toRadians(halfHorizontal));
  const yNorm = -Math.tan(toRadians(pitchOffset)) / Math.tan(toRadians(halfVertical));
  return {
    x: ((xNorm + 1) / 2) * camera.width,
    y: ((yNorm + 1) / 2) * camera.height,
    visible
  };
}

function currentHorizontalFov(zoom?: number) {
  const safeZoom = Number.isFinite(zoom) ? zoom || 1 : 1;
  return clamp(180 / Math.pow(2, safeZoom), 20, 120);
}

function verticalFov(horizontalFov: number, width: number, height: number) {
  return toDegrees(2 * Math.atan(Math.tan(toRadians(horizontalFov / 2)) * (height / Math.max(1, width))));
}

function shortestAngleDifference(a: number, b: number) {
  return ((normalizeDegrees(a) - normalizeDegrees(b) + 540) % 360) - 180;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
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
