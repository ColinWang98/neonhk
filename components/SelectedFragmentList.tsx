"use client";

import { ImageIcon } from "lucide-react";
import type { SelectedFragment } from "@/types";

export function SelectedFragmentList({ fragments }: { fragments: SelectedFragment[] }) {
  return (
    <div className="surface-panel flex h-full min-h-0 flex-col overflow-hidden rounded-md">
      <div className="border-b border-ink/10 px-5 py-4">
        <p className="fine-label">Fragments</p>
        <h2 className="mt-1 text-sm font-semibold text-ink">Selected Fragments</h2>
        <p className="mt-1 text-xs text-ink/58">{fragments.length} fragment records</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {fragments.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-ink/20 bg-paper/45 px-4 text-center text-sm leading-6 text-ink/55">
            Box-select a region in the street image to create a fragment.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fragments.map((fragment) => (
              <article key={fragment.id} className="quiet-panel rounded-md p-3">
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
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
