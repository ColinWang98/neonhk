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
  boxCorners?: PanoramaPoint[];
};

type PanoramaPoint = {
  heading: number;
  pitch: number;
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
  const povRef = useRef<GooglePov>({ heading: 0, pitch: 0, zoom: 1 });
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
    let frameId = 0;
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
        const syncPov = () => {
          const nextPov = readPanoramaPov(currentPanorama);
          const previous = povRef.current;
          if (
            Math.abs((previous.heading || 0) - (nextPov.heading || 0)) > 0.02 ||
            Math.abs((previous.pitch || 0) - (nextPov.pitch || 0)) > 0.02 ||
            Math.abs((previous.zoom || 1) - (nextPov.zoom || 1)) > 0.02
          ) {
            povRef.current = nextPov;
            setPov(nextPov);
          }
        };
        const pollPov = () => {
          if (cancelled) return;
          syncPov();
          frameId = window.requestAnimationFrame(pollPov);
        };
        if (targetPovRef.current) {
          currentPanorama.setPov?.({
            heading: targetPovRef.current.heading || 0,
            pitch: targetPovRef.current.pitch || 0
          });
        }
        syncPov();
        frameId = window.requestAnimationFrame(pollPov);

        currentPanorama.addListener("pov_changed", syncPov);

        currentPanorama.addListener("pano_changed", () => {
          const panoId = currentPanorama.getPano?.();
          if (panoId) {
            syncPov();
          }
        });

        currentPanorama.addListener("zoom_changed", syncPov);

        setGoogleStatus("ready");
      })
      .catch(() => setGoogleStatus("error"));

    return () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
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
    if (panoramaRef.current) {
      const nextPov = readPanoramaPov(panoramaRef.current);
      povRef.current = nextPov;
      setPov(nextPov);
    }
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
                      const latestPov = panoramaRef.current ? readPanoramaPov(panoramaRef.current) : povRef.current;
                      povRef.current = latestPov;
                      setPov(latestPov);
                      const sourceSize = fitStaticSize(rect.width, rect.height);
                      const cropBox = {
                        x: (screenBox.x / rect.width) * sourceSize.width,
                        y: (screenBox.y / rect.height) * sourceSize.height,
                        width: (screenBox.width / rect.width) * sourceSize.width,
                        height: (screenBox.height / rect.height) * sourceSize.height
                      };
                      const snapshotFov = currentHorizontalFov(latestPov.zoom);
                      const snapshotVerticalFov = verticalFov(snapshotFov, rect.width, rect.height);
                      const boxCorners = screenBoxCorners(screenBox).map((corner) =>
                        screenPointToPanoramaPoint(corner, {
                          width: rect.width,
                          height: rect.height,
                          heading: latestPov.heading,
                          pitch: latestPov.pitch,
                          horizontalFov: snapshotFov,
                          verticalFov: snapshotVerticalFov
                        })
                      );
                      const sourceImageUrl = buildGoogleStreetViewStaticUrl({
                        key: googleMapsApiKey,
                        panoId: image.panoId || image.id,
                        width: sourceSize.width,
                        height: sourceSize.height,
                        heading: latestPov.heading,
                        pitch: latestPov.pitch,
                        fov: snapshotFov
                      });
                      setGoogleSelecting(false);
                      onFragmentSelected(screenBox, cropBox, sourceImageUrl, {
                        heading: latestPov.heading,
                        pitch: latestPov.pitch,
                        fov: snapshotFov,
                        boxCorners,
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

function readPanoramaPov(panorama: GoogleStreetViewPanorama): GooglePov {
  const nextPov = panorama.getPov();
  return {
    heading: nextPov.heading || 0,
    pitch: nextPov.pitch || 0,
    zoom: panorama.getZoom?.() ?? 1
  };
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
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
        width={viewportSize.width}
        height={viewportSize.height}
        viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
        aria-hidden="true"
      >
        {fragments.map((fragment) => {
          const shape = projectFragmentShape(fragment, viewportSize, pov);
          if (!shape) return null;
          const active = fragment.id === activeFragmentId;

          return (
            <polygon
              key={fragment.id}
              points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")}
              onClick={() => onFragmentClick?.(fragment)}
              className="pointer-events-auto cursor-pointer transition"
              fill={active ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)"}
              stroke="rgba(255,255,255,0.96)"
              strokeWidth={active ? 3 : 2}
              strokeDasharray="7 5"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {fragments.map((fragment, index) => {
        const shape = projectFragmentShape(fragment, viewportSize, pov);
        if (!shape) return null;
        const active = fragment.id === activeFragmentId;
        const ready = fragment.status === "ready";
        const hasAudio = Object.keys(fragment.audioGenerations || {}).length > 0;

        return (
          <button
            key={fragment.id}
            type="button"
            aria-label={`Select fragment ${index + 1}`}
            onClick={() => onFragmentClick?.(fragment)}
            className="pointer-events-auto absolute text-left"
            style={{
              left: shape.label.x,
              top: shape.label.y,
              transform: "translate(-50%, -50%)"
            }}
          >
            <span className={`flex h-6 min-w-6 items-center justify-center rounded-full border border-white/90 px-1 text-[11px] font-semibold text-white shadow ${
              active ? "bg-signal text-ink ring-2 ring-white/90" : "bg-ink"
            }`}>
              {index + 1}
            </span>
            {ready && shape.bounds.width >= 96 ? (
              <span className="absolute left-1/2 top-8 -translate-x-1/2 whitespace-nowrap rounded-sm border border-white/70 bg-white px-2 py-1 text-[11px] font-semibold text-ink shadow">
                {active ? (hasAudio ? "Active audio" : "Active") : hasAudio ? "Play saved audio" : "Select this"}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function projectFragmentShape(
  fragment: SelectedFragment,
  viewportSize: { width: number; height: number },
  pov: GooglePov
) {
  const currentFov = currentHorizontalFov(pov.zoom);
  const currentVerticalFov = verticalFov(currentFov, viewportSize.width, viewportSize.height);
  const savedCorners = validPanoramaCorners(fragment.panoramaPov?.boxCorners);
  if (savedCorners) {
    return projectPanoramaCorners(savedCorners, viewportSize, pov, currentFov, currentVerticalFov);
  }

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
    return undefined;
  }

  const sourceFov = fragment.panoramaPov?.fov || 90;
  const sourceVerticalFov = verticalFov(sourceFov, sourceWidth, sourceHeight);
  const box = fragment.screenBox;
  const panoramaCorners = screenBoxCorners(box)
    .map((corner) =>
      screenPointToPanoramaPoint(corner, {
        width: sourceWidth,
        height: sourceHeight,
        heading: sourceHeading || 0,
        pitch: sourcePitch || 0,
        horizontalFov: sourceFov,
        verticalFov: sourceVerticalFov
      })
    );

  return projectPanoramaCorners(panoramaCorners, viewportSize, pov, currentFov, currentVerticalFov);
}

function screenBoxCorners(box: ScreenBox) {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ];
}

function validPanoramaCorners(corners?: PanoramaPoint[]) {
  if (!corners || corners.length < 4) return undefined;
  const firstFour = corners.slice(0, 4);
  if (
    firstFour.some(
      (point) =>
        !Number.isFinite(point.heading) ||
        !Number.isFinite(point.pitch)
    )
  ) {
    return undefined;
  }
  return firstFour;
}

function projectPanoramaCorners(
  corners: PanoramaPoint[],
  viewportSize: { width: number; height: number },
  pov: GooglePov,
  currentFov: number,
  currentVerticalFov: number
) {
  const projected = corners.map((point) =>
    panoramaPointToScreenPoint(point, {
      width: viewportSize.width,
      height: viewportSize.height,
      heading: pov.heading || 0,
      pitch: pov.pitch || 0,
      horizontalFov: currentFov,
      verticalFov: currentVerticalFov
    })
  );

  if (projected.every((point) => !point.visible)) return undefined;
  if (projected.some((point) => !point.inFront)) return undefined;

  const points = projected.map((point) => ({
    x: clamp(point.x, 0, viewportSize.width),
    y: clamp(point.y, 0, viewportSize.height)
  }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (right < 0 || bottom < 0 || left > viewportSize.width || top > viewportSize.height) return undefined;

  return {
    points,
    bounds: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    },
    label: {
      x: clamp(points.reduce((sum, point) => sum + point.x, 0) / points.length, 14, viewportSize.width - 14),
      y: clamp(points.reduce((sum, point) => sum + point.y, 0) / points.length, 14, viewportSize.height - 14)
    }
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
  const inFront = Math.abs(headingOffset) < 88 && Math.abs(pitchOffset) < 88;
  const xNorm = Math.tan(toRadians(headingOffset)) / Math.tan(toRadians(halfHorizontal));
  const yNorm = -Math.tan(toRadians(pitchOffset)) / Math.tan(toRadians(halfVertical));
  return {
    x: ((xNorm + 1) / 2) * camera.width,
    y: ((yNorm + 1) / 2) * camera.height,
    visible,
    inFront
  };
}

function currentHorizontalFov(zoom?: number) {
  const safeZoom = Number.isFinite(zoom) ? zoom! : 1;
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
