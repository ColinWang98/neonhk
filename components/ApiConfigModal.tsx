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
  { key: "aiProvider", label: "Text AI Provider", placeholder: "deepseek or xiaomi" },
  { key: "aiApiKey", label: "DeepSeek API Key", secret: true },
  { key: "aiBaseUrl", label: "AI Base URL", placeholder: "https://api.deepseek.com" },
  { key: "visionProvider", label: "Vision AI Provider", placeholder: "glm or xiaomi" },
  { key: "glmApiKey", label: "GLM Vision API Key", secret: true },
  { key: "glmBaseUrl", label: "GLM Base URL", placeholder: "https://open.bigmodel.cn/api/paas/v4" },
  { key: "visionModel", label: "Vision Model", placeholder: "glm-4.6v-flash" },
  { key: "llmModel", label: "Narrative Model", placeholder: "deepseek-chat" },
  { key: "xiaomiApiKey", label: "Xiaomi MiMo API Key", secret: true },
  { key: "xiaomiBaseUrl", label: "Xiaomi Base URL", placeholder: "https://api.xiaomimimo.com/v1" },
  { key: "xiaomiTextModel", label: "Xiaomi Text Model", placeholder: "mimo-v2-flash" },
  { key: "xiaomiVisionModel", label: "Xiaomi Vision Model", placeholder: "mimo-v2-omni" },
  { key: "xiaomiTemperature", label: "Xiaomi Temperature", placeholder: "0.8" },
  { key: "xiaomiTopP", label: "Xiaomi Top P", placeholder: "0.95" },
  { key: "xiaomiMaxTokens", label: "Xiaomi Max Tokens", placeholder: "4096" },
  { key: "supabaseUrl", label: "Supabase URL (optional)", placeholder: "https://project.supabase.co" },
  { key: "supabaseAnonKey", label: "Supabase Anon Key (optional)", secret: true },
  { key: "supabaseServiceRoleKey", label: "Supabase Service Role Key (optional)", secret: true },
  { key: "appUrl", label: "App URL", placeholder: "http://localhost:3000" },
  { key: "ttsProvider", label: "TTS Mode", placeholder: "elevenlabs or local-open-source" },
  { key: "localTtsEndpoint", label: "Local TTS Endpoint", placeholder: "http://127.0.0.1:7860/tts" },
  { key: "elevenLabsApiKey", label: "ElevenLabs API Key", secret: true },
  { key: "elevenLabsModel", label: "ElevenLabs Model", placeholder: "eleven_multilingual_v2" },
  { key: "elevenLabsVoiceId", label: "ElevenLabs Voice ID" },
  { key: "voiceAccentPreset", label: "Voice / Accent Preset", placeholder: "Hong Kong bilingual" }
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
        className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 text-sm font-medium text-ink transition hover:bg-field"
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="surface-panel flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-md">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <p className="fine-label">Local Settings</p>
            <h2 className="mt-1 text-base font-semibold text-ink">API Configuration</h2>
            <p className="mt-1 text-xs text-ink/60">Stored locally in this browser for the desktop prototype.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink/60 transition hover:bg-field hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-brass/25 bg-[#fbf7ed] px-3 py-2 text-xs leading-5 text-ink/72">
            Google Street View uses Maps JavaScript API for the interactive viewer and Street View Static API for fragment snapshots. Enable billing, restrict the key to those APIs, and set daily quotas in Google Cloud.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-xs font-medium text-ink/70">{field.label}</span>
                {field.key === "ttsProvider" ? (
                  <select
                    value={draft.ttsProvider || "elevenlabs"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        ttsProvider: event.target.value
                      }))
                    }
                    className="h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
                  >
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="local-open-source">Local Open Source</option>
                  </select>
                ) : field.key === "aiProvider" ? (
                  <select
                    value={draft.aiProvider || "deepseek"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        aiProvider: event.target.value
                      }))
                    }
                    className="h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="xiaomi">Xiaomi MiMo</option>
                  </select>
                ) : field.key === "visionProvider" ? (
                  <select
                    value={draft.visionProvider || "glm"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        visionProvider: event.target.value
                      }))
                    }
                    className="h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
                  >
                    <option value="glm">GLM</option>
                    <option value="xiaomi">Xiaomi MiMo</option>
                  </select>
                ) : (
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
                    className="h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
                    autoComplete="off"
                  />
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowSecrets((value) => !value)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
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
                  glmBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
                  visionModel: "glm-4.6v-flash",
                  llmModel: "deepseek-chat",
                  ttsProvider: current.ttsProvider || "elevenlabs",
                  localTtsEndpoint: current.localTtsEndpoint || "http://127.0.0.1:7860/tts",
                  elevenLabsModel: current.elevenLabsModel || "eleven_multilingual_v2",
                  voiceAccentPreset: current.voiceAccentPreset || "Hong Kong bilingual",
                  appUrl: current.appUrl || "http://localhost:3000"
                }))
              }
              className="h-9 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              Use DeepSeek Defaults
            </button>
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  aiProvider: "xiaomi",
                  visionProvider: "xiaomi",
                  xiaomiBaseUrl: current.xiaomiBaseUrl || "https://api.xiaomimimo.com/v1",
                  xiaomiTextModel: current.xiaomiTextModel || "mimo-v2-flash",
                  xiaomiVisionModel: current.xiaomiVisionModel || "mimo-v2-omni",
                  xiaomiTemperature: current.xiaomiTemperature || "0.8",
                  xiaomiTopP: current.xiaomiTopP || "0.95",
                  xiaomiMaxTokens: current.xiaomiMaxTokens || "4096",
                  appUrl: current.appUrl || "http://localhost:3000"
                }))
              }
              className="h-9 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              Use Xiaomi Defaults
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(runtimeConfigStorageKey);
                onSave({});
              }}
              className="h-9 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(cleanConfig(draft))}
              className="h-9 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90"
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
  const cleaned = Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => Boolean(value))
  ) as RuntimeApiConfig;

  if (cleaned.ttsProvider !== "local-open-source" && cleaned.ttsProvider !== "elevenlabs") {
    cleaned.ttsProvider = "elevenlabs";
  }

  if (cleaned.aiProvider !== "xiaomi" && cleaned.aiProvider !== "deepseek") {
    cleaned.aiProvider = "deepseek";
  }

  if (cleaned.visionProvider !== "xiaomi" && cleaned.visionProvider !== "glm") {
    cleaned.visionProvider = "glm";
  }

  return cleaned;
}
