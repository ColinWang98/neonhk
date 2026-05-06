"use client";

import { Eye, EyeOff, Settings, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  runtimeConfigStorageKey,
  type RuntimeApiConfig
} from "@/lib/runtimeConfig";

type Props = {
  config: RuntimeApiConfig;
  onSave: (config: RuntimeApiConfig) => void;
};

type Field = {
  key: keyof RuntimeApiConfig;
  label: string;
  placeholder?: string;
  secret?: boolean;
};

const overrideFields: Field[] = [
  { key: "googleMapsApiKey", label: "Google Maps API Key Override", secret: true },
  { key: "aiApiKey", label: "DeepSeek API Key Override", secret: true },
  { key: "glmApiKey", label: "GLM Vision API Key Override", secret: true }
];

const optionalFields: Field[] = [
  { key: "supabaseUrl", label: "Supabase URL", placeholder: "https://project.supabase.co" },
  { key: "supabaseAnonKey", label: "Supabase Anon Key", secret: true },
  { key: "supabaseServiceRoleKey", label: "Supabase Service Role Key", secret: true }
];

const advancedFields: Field[] = [
  { key: "mapillaryAccessToken", label: "Mapillary Access Token", secret: true },
  { key: "aiBaseUrl", label: "DeepSeek Base URL", placeholder: "https://api.deepseek.com" },
  { key: "glmBaseUrl", label: "GLM Base URL", placeholder: "https://open.bigmodel.cn/api/paas/v4" },
  { key: "llmModel", label: "DeepSeek Text Model", placeholder: "deepseek-chat" },
  { key: "visionModel", label: "GLM Vision Model", placeholder: "glm-4v-flash" },
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
  const hasStreetProvider = Boolean(config.googleMapsApiKey);

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
          {hasStreetProvider ? "cloud" : "setup"}
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="surface-panel flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-md">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <p className="fine-label">Cloud Settings</p>
            <h2 className="mt-1 text-base font-semibold text-ink">API Configuration</h2>
            <p className="mt-1 text-xs text-ink/60">
              Public visitors use the server keys you set in Vercel. This panel is only for local overrides.
            </p>
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
            For deployment, configure Vercel once with NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, AI_API_KEY, and GLM_API_KEY. Other users do not need to enter tokens.
          </div>

          <section>
            <p className="fine-label mb-3">Local Overrides</p>
            <div className="grid gap-3 md:grid-cols-2">
              {overrideFields.map((field) => (
                <TextField
                  key={field.key}
                  field={field}
                  draft={draft}
                  showSecrets={showSecrets}
                  setDraft={setDraft}
                />
              ))}
            </div>
          </section>

          <section className="mt-6">
            <p className="fine-label mb-3">Optional Storage</p>
            <div className="grid gap-3 md:grid-cols-2">
              {optionalFields.map((field) => (
                <TextField
                  key={field.key}
                  field={field}
                  draft={draft}
                  showSecrets={showSecrets}
                  setDraft={setDraft}
                />
              ))}
            </div>
          </section>

          <section className="mt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {showAdvanced ? "Hide Advanced" : "Show Advanced"}
            </button>
            {showAdvanced ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {advancedFields.map((field) =>
                  field.key === "ttsProvider" ? (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      value={draft.ttsProvider || "elevenlabs"}
                      options={[
                        { value: "elevenlabs", label: "ElevenLabs" },
                        { value: "local-open-source", label: "Local Open Source" }
                      ]}
                      onChange={(value) => setDraft((current) => ({ ...current, ttsProvider: value }))}
                    />
                  ) : (
                    <TextField
                      key={field.key}
                      field={field}
                      draft={draft}
                      showSecrets={showSecrets}
                      setDraft={setDraft}
                    />
                  )
                )}
              </div>
            ) : null}
          </section>
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
              onClick={() => setDraft((current) => applyDefaults(current))}
              className="h-9 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              Defaults
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(runtimeConfigStorageKey);
                onSave(applyDefaults({}));
              }}
              className="h-9 rounded-md border border-ink/15 bg-paper px-3 text-sm text-ink transition hover:bg-field"
            >
              Clear Overrides
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

function TextField({
  field,
  draft,
  showSecrets,
  setDraft
}: {
  field: Field;
  draft: RuntimeApiConfig;
  showSecrets: boolean;
  setDraft: React.Dispatch<React.SetStateAction<RuntimeApiConfig>>;
}) {
  return (
    <label className="block">
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
        className="h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
        autoComplete="off"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink/70">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-ink/15 bg-paper px-3 text-sm outline-none transition focus:border-signal"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function applyDefaults(config: RuntimeApiConfig): RuntimeApiConfig {
  return {
    ...config,
    aiProvider: "deepseek",
    visionProvider: "glm",
    aiBaseUrl: config.aiBaseUrl || "https://api.deepseek.com",
    glmBaseUrl: config.glmBaseUrl || "https://open.bigmodel.cn/api/paas/v4",
    visionModel: config.visionModel || "glm-4v-flash",
    llmModel: config.llmModel || "deepseek-chat",
    appUrl: config.appUrl || "http://localhost:3000"
  };
}

function cleanConfig(config: RuntimeApiConfig): RuntimeApiConfig {
  const withDefaults = applyDefaults(config);
  const cleaned = Object.fromEntries(
    Object.entries(withDefaults)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => Boolean(value))
  ) as RuntimeApiConfig;

  if (cleaned.ttsProvider && cleaned.ttsProvider !== "local-open-source" && cleaned.ttsProvider !== "elevenlabs") {
    cleaned.ttsProvider = "elevenlabs";
  }

  cleaned.aiProvider = "deepseek";
  cleaned.visionProvider = "glm";

  return cleaned;
}
