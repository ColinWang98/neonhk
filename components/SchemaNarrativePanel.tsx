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
    <div className="surface-panel flex h-full min-h-0 flex-col overflow-hidden rounded-md">
      <div className="border-b border-ink/10 px-5 py-4">
        <p className="fine-label">Schema Story / 方案故事</p>
        <h2 className="mt-1 text-sm font-semibold text-ink">Narrative Panel / 叙事面板</h2>
        <p className="mt-1 text-xs text-ink/58">
          Persona-grounded functional, identity, memory, and social-cultural stories
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!fragment ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-ink/20 bg-paper/45 px-4 text-center text-sm leading-6 text-ink/55">
            Narratives will appear after a selected fragment is analyzed.
          </div>
        ) : fragment.status === "blocked" ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            This fragment was blocked because the privacy risk was marked high.
          </div>
        ) : fragment.narratives ? (
          <div className="grid gap-4 md:grid-cols-2">
            {keys.map((key) => {
              const narrative = fragment.narratives![key];
              return (
                <article key={key} className="quiet-panel rounded-md p-5">
                  <h3 className="text-sm font-semibold text-brass">{narrative.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/76">{narrative.text}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="quiet-panel rounded-md p-4 text-sm text-ink/65">
            Fragment status: {fragment.status}
          </div>
        )}
      </div>
    </div>
  );
}
