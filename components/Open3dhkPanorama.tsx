"use client";

import { useEffect, useRef, useState } from "react";
import { BoxSelectionLayer } from "@/components/BoxSelectionLayer";
import { LoadingState } from "@/components/LoadingState";
import type { FragmentSelectionMeta } from "@/components/StreetImageViewer";
import type { ImageCropBox, PanoramaPov, ScreenBox, SelectedFragment, StreetImage } from "@/types";

type Props = {
  image: StreetImage;
  targetPov?: PanoramaPov;
  selecting?: boolean;
  fragments?: SelectedFragment[];
  activeFragmentId?: string;
  onReady?: (snapshot: string) => void;
  onError?: (message: string) => void;
  onViewChange?: (pov: FragmentSelectionMeta) => void;
  onFragmentClick?: (fragment: SelectedFragment) => void;
  onFragmentSelected?: (box: ScreenBox, crop: ImageCropBox, url: string, meta: FragmentSelectionMeta) => void;
};

export function Open3dhkPanorama(props: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  latest.current = props;

  function post(message: Record<string, unknown>) {
    frame.current?.contentWindow?.postMessage({ source: "open3dhk-host", ...message }, window.location.origin);
  }

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin || event.data?.source !== "open3dhk-viewer") return;
      const data = event.data;
      const current = latest.current;
      if (data.type === "mounted") {
        post({ type: "load", image: current.image, pov: current.targetPov });
        return;
      }
      if (data.imageId !== current.image.id) return;
      if (data.type === "ready") {
        setStatus("ready");
        post({ type: "boxes", fragments: current.fragments, activeId: current.activeFragmentId, selecting: current.selecting });
        current.onReady?.(data.snapshot);
      } else if (data.type === "view") {
        current.onViewChange?.(data.pov);
      } else if (data.type === "error") {
        setStatus("error");
        setError(data.message);
        current.onError?.(data.message);
      } else if (data.type === "capture") {
        current.onFragmentSelected?.(data.screenBox, data.cropBox, data.sourceImageUrl, data.meta);
      } else if (data.type === "fragment") {
        const fragment = current.fragments?.find((entry) => entry.id === data.fragmentId);
        if (fragment) current.onFragmentClick?.(fragment);
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    post({ type: "boxes", fragments: props.fragments, activeId: props.activeFragmentId, selecting: props.selecting });
  }, [props.fragments, props.activeFragmentId, props.selecting]);

  useEffect(() => {
    post({ type: "restore", pov: props.targetPov });
  }, [props.targetPov]);

  return (
    <div className="relative h-full min-h-0 w-full bg-[#222]">
      <iframe ref={frame} src="/open3dhk-viewer.html" title="Streetscape 360 panorama" className="absolute inset-0 h-full w-full border-0" />
      {props.selecting && status === "ready" ? <BoxSelectionLayer onSelect={(box) => post({ type: "capture", box })} /> : null}
      {status === "loading" ? <div className="absolute bottom-8 left-3 bg-paper px-3 py-2"><LoadingState label="Loading Streetscape 360" /></div> : null}
      {status === "error" ? <div role="alert" className="absolute inset-0 flex items-center justify-center bg-ink p-4 text-center text-sm text-white">{error}</div> : null}
    </div>
  );
}
