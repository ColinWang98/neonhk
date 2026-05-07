"use client";

import { useRef, useState } from "react";
import type { ScreenBox } from "@/types";

type Props = {
  disabled?: boolean;
  onSelect: (box: ScreenBox) => void;
};

export function BoxSelectionLayer({ disabled, onSelect }: Props) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ScreenBox | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-[50] cursor-crosshair touch-none"
      onPointerDown={(event) => {
        if (disabled || !layerRef.current) return;
        const rect = layerRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        startRef.current = { x, y };
        setDraft({ x, y, width: 0, height: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (disabled || !layerRef.current || !startRef.current) return;
        const rect = layerRef.current.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        const x = Math.min(startRef.current.x, currentX);
        const y = Math.min(startRef.current.y, currentY);
        setDraft({
          x,
          y,
          width: Math.abs(currentX - startRef.current.x),
          height: Math.abs(currentY - startRef.current.y)
        });
      }}
      onPointerUp={(event) => {
        if (disabled || !draft) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        startRef.current = null;
        setDraft(null);
        if (draft.width >= 12 && draft.height >= 12) {
          onSelect(draft);
        }
      }}
    >
      {draft ? (
        <div
          className="absolute border-2 border-white bg-signal/20 shadow-[0_0_0_1px_rgba(37,111,134,0.95)]"
          style={{
            left: draft.x,
            top: draft.y,
            width: draft.width,
            height: draft.height
          }}
        />
      ) : null}
    </div>
  );
}
