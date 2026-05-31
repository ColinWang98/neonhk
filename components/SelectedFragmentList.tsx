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
    <div className="surface-panel flex min-h-0 flex-col gap-2 overflow-hidden p-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3 sm:w-44 sm:flex-col sm:items-start">
        <div>
          <p className="fine-label">{zh ? "白框" : "Boxes"}</p>
          <h2 className="mt-0.5 text-sm font-semibold text-ink">{zh ? "已保存" : "Saved"}</h2>
        </div>
        <p className="rounded-full bg-field/75 px-2.5 py-1 text-[11px] font-semibold text-ink/58">
          {zh ? `${fragments.length} 个` : `${fragments.length} saved`}
        </p>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto pb-1">
        {fragments.length === 0 ? (
          <div className="flex min-h-[4.75rem] items-center justify-center rounded-[16px] border-2 border-dashed border-ink/20 bg-paper/45 px-4 text-center text-sm leading-6 text-ink/55">
            {zh ? "在全景图里框选一个公共细节，白框会保存在这里。" : "Select one public detail in the panorama. Saved boxes will appear here."}
          </div>
        ) : (
          <div className="flex min-w-max gap-2">
            {fragments.map((fragment, index) => (
              <button
                type="button"
                key={fragment.id}
                onClick={() => onSelect?.(fragment)}
                className={`quiet-panel w-[12.25rem] shrink-0 p-2 text-left transition hover:border-brass/45 ${
                  activeFragmentId === fragment.id ? "cozy-card-active" : ""
                }`}
              >
                <div className="flex gap-2">
                  <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-2 border-ink/10 bg-field">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-xs font-semibold text-ink">
                        {fragment.visionDescription?.mainFeature || (zh ? `片段 ${index + 1}` : `Box ${index + 1}`)}
                      </h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        activeFragmentId === fragment.id ? "bg-signal text-white" : "bg-field/80 text-ink/65"
                      }`}>
                        {activeFragmentId === fragment.id ? (zh ? "当前" : "Active") : fragmentStatusLabel(fragment.status, zh)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink/60">
                      {new Date(fragment.selectedAt).toLocaleTimeString()}
                    </p>
                    {fragment.audioGenerations && Object.keys(fragment.audioGenerations).length > 0 ? (
                      <p className="mt-1 text-[11px] font-medium text-signal">
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
