"use client";

import { Eye, EyeOff, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  runtimeConfigStorageKey,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";

type Props = {
  config: RuntimeApiConfig;
  onSave: (config: RuntimeApiConfig) => void;
};

const fields: Array<{
  key: keyof RuntimeApiConfig;
  label: string;
  placeholder?: string;
  secret?: boolean;
}> = [
  { key: "mapillaryAccessToken", label: "Mapillary Access Token", secret: true },
  { key: "googleMapsApiKey", label: "Google Maps API Key", secret: true },
  { key: "aiApiKey", label: "DeepSeek API Key", secret: true },
  { key: "aiBaseUrl", label: "AI Base URL", placeholder: "https://api.deepseek.com" },
  { key: "visionModel", label: "Vision Model", placeholder: "fallback" },
  { key: "llmModel", label: "Narrative Model", placeholder: "deepseek-v4-flash" },
  { key: "supabaseUrl", label: "Supabase URL (optional)", placeholder: "https://project.supabase.co" },
  { key: "supabaseAnonKey", label: "Supabase Anon Key (optional)", secret: true },
  { key: "supabaseServiceRoleKey", label: "Supabase Service Role Key (optional)", secret: true },
  { key: "appUrl", label: "App URL", placeholder: "http://localhost:3000" }
];

export function ApiConfigButton({ config, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const hasStreetProvider = Boolean(config.googleMapsApiKey || config.mapillaryAccessToken);
  const hasAI = Boolean(config.aiApiKey);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-white px-3 text-sm font-medium text-ink hover:bg-field"
      >
        <Settings className="h-4 w-4" />
        API
        <span className="rounded bg-field px-1.5 py-0.5 text-[11px] text-ink/65">
          {hasStreetProvider && hasAI ? "ready" : "setup"}
        </span>
      </button>
      {open ? (
        <ApiConfigModal
          config={config}
          onClose={() => setOpen(false)}
          onSave={(nextConfig) => {
            onSave(nextConfig);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ApiConfigModal({
  config,
  onSave,
  onClose
}: Props & { onClose: () => void }) {
  const [draft, setDraft] = useState<RuntimeApiConfig>(config);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">API Configuration</h2>
            <p className="mt-1 text-xs text-ink/60">Stored locally in this browser for the desktop prototype.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink/60 hover:bg-field hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Google Street View uses Maps JavaScript API for the interactive viewer and Street View Static API for fragment snapshots. Enable billing, restrict the key to those APIs, and set daily quotas in Google Cloud.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-xs font-medium text-ink/70">{field.label}</span>
                <input
                  value={draft[field.key] || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value
                    }))
                  }
                  type={field.secret && !showSecrets ? "password" : "text"}
                  placeholder={field.placeholder}
                  className="h-10 w-full rounded-md border border-ink/15 bg-white px-3 text-sm outline-none focus:border-signal"
                  autoComplete="off"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowSecrets((value) => !value)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink hover:bg-field"
            >
              {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showSecrets ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  aiBaseUrl: "https://api.deepseek.com",
                  visionModel: "fallback",
                  llmModel: "deepseek-v4-flash",
                  appUrl: current.appUrl || "http://localhost:3000"
                }))
              }
              className="h-9 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink hover:bg-field"
            >
              Use DeepSeek Defaults
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(runtimeConfigStorageKey);
                onSave({});
              }}
              className="h-9 rounded-md border border-ink/15 px-3 text-sm text-ink hover:bg-field"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border border-ink/15 px-3 text-sm text-ink hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(cleanConfig(draft))}
              className="h-9 rounded-md bg-signal px-4 text-sm font-medium text-white hover:bg-signal/90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function cleanConfig(config: RuntimeApiConfig): RuntimeApiConfig {
  return Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => Boolean(value))
  ) as RuntimeApiConfig;
}
