"use client";

import { ImageIcon } from "lucide-react";
import type { SelectedFragment } from "@/types";

export function SelectedFragmentList({
  fragments,
  language = "en",
  activeFragmentId,
  onSelect
}: {
  fragments: SelectedFragment[];
  language?: "en" | "zh";
  activeFragmentId?: string;
  onSelect?: (fragment: SelectedFragment) => void;
}) {
  const zh = language === "zh";
  return (
    <div className="surface-panel flex h-full min-h-0 flex-col overflow-hidden rounded-md">
      <div className="border-b border-ink/10 px-5 py-4">
        <p className="fine-label">{zh ? "碎片" : "Fragments"}</p>
        <h2 className="mt-1 text-sm font-semibold text-ink">{zh ? "Selected Fragments / 精选片段" : "Selected Fragments"}</h2>
        <p className="mt-1 text-xs text-ink/58">
          {zh ? `${fragments.length} 条片段记录` : `${fragments.length} fragment records`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {fragments.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-ink/20 bg-paper/45 px-4 text-center text-sm leading-6 text-ink/55">
            {zh ? "在街景图像中框选一个区域来创建 fragment。" : "Box-select a region in the street image to create a fragment."}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fragments.map((fragment) => (
              <button
                type="button"
                key={fragment.id}
                onClick={() => onSelect?.(fragment)}
                className={`quiet-panel rounded-md p-3 text-left transition hover:border-brass/45 ${
                  activeFragmentId === fragment.id ? "border-signal bg-[#eef7f4]" : ""
                }`}
              >
                <div className="space-y-3">
                  <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded border border-ink/10 bg-field">
                    {fragment.cropImageUrl ? (
                      <img
                        src={fragment.cropImageUrl}
                        alt="Cropped fragment"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-ink/45" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-xs font-semibold text-ink">{fragment.id}</h3>
                      <span className="rounded bg-field px-2 py-0.5 text-[11px] text-ink/65">
                        {fragment.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink/60">
                      {new Date(fragment.selectedAt).toLocaleTimeString()}
                    </p>
                    {fragment.visionDescription ? (
                      <p className="mt-2 line-clamp-2 text-xs text-ink/70">
                        {fragment.visionDescription.mainFeature}
                      </p>
                    ) : null}
                    {fragment.audioGenerations && Object.keys(fragment.audioGenerations).length > 0 ? (
                      <p className="mt-2 text-[11px] font-medium text-signal">
                        {zh ? "已有音频" : "Audio saved"}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
