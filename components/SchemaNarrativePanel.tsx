"use client";

import type { SelectedFragment } from "@/types";

const keys = [
  "functionalUse",
  "identityBelonging",
  "memoryTemporality",
  "socialCulturalResonance"
] as const;

export function SchemaNarrativePanel({ fragment }: { fragment?: SelectedFragment }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-ink/10 bg-white">
      <div className="border-b border-ink/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Schema Narrative Panel</h2>
        <p className="text-xs text-ink/60">
          Functional, identity, memory, and social-cultural readings
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!fragment ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-ink/20 px-4 text-center text-sm text-ink/55">
            Narratives will appear after a selected fragment is analyzed.
          </div>
        ) : fragment.status === "blocked" ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            This fragment was blocked because the privacy risk was marked high.
          </div>
        ) : fragment.narratives ? (
          <div className="grid gap-3 md:grid-cols-2">
            {keys.map((key) => {
              const narrative = fragment.narratives![key];
              return (
                <article key={key} className="rounded-md border border-ink/10 p-4">
                  <h3 className="text-sm font-semibold text-signal">{narrative.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/80">{narrative.text}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-ink/10 p-4 text-sm text-ink/65">
            Fragment status: {fragment.status}
          </div>
        )}
      </div>
    </div>
  );
}
