export type RuntimeApiConfig = {
  mapillaryAccessToken?: string;
  googleMapsApiKey?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiProvider?: string;
  glmApiKey?: string;
  glmBaseUrl?: string;
  visionProvider?: string;
  visionModel?: string;
  llmModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  appUrl?: string;
  ttsProvider?: string;
  localTtsEndpoint?: string;
  elevenLabsApiKey?: string;
  elevenLabsModel?: string;
  elevenLabsVoiceId?: string;
  voiceAccentPreset?: string;
};

export const runtimeConfigStorageKey = "street-fragment-explorer.api-config";

export function publicRuntimeConfig(): RuntimeApiConfig {
  return {
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    aiProvider: "deepseek",
    visionProvider: "glm"
  };
}

export function runtimeConfigToHeaders(config: RuntimeApiConfig) {
  const headers: Record<string, string> = {};

  setHeader(headers, "x-mapillary-access-token", config.mapillaryAccessToken);
  setHeader(headers, "x-google-maps-api-key", config.googleMapsApiKey);
  setHeader(headers, "x-ai-api-key", config.aiApiKey);
  setHeader(headers, "x-ai-base-url", config.aiBaseUrl);
  setHeader(headers, "x-ai-provider", config.aiProvider);
  setHeader(headers, "x-glm-api-key", config.glmApiKey);
  setHeader(headers, "x-glm-base-url", config.glmBaseUrl);
  setHeader(headers, "x-vision-provider", config.visionProvider);
  setHeader(headers, "x-vision-model", config.visionModel);
  setHeader(headers, "x-llm-model", config.llmModel);
  setHeader(headers, "x-supabase-url", config.supabaseUrl);
  setHeader(headers, "x-supabase-anon-key", config.supabaseAnonKey);
  setHeader(headers, "x-supabase-service-role-key", config.supabaseServiceRoleKey);
  setHeader(headers, "x-app-url", config.appUrl);
  setHeader(headers, "x-tts-provider", config.ttsProvider);
  setHeader(headers, "x-local-tts-endpoint", config.localTtsEndpoint);
  setHeader(headers, "x-elevenlabs-api-key", config.elevenLabsApiKey);
  setHeader(headers, "x-elevenlabs-model", config.elevenLabsModel);
  setHeader(headers, "x-elevenlabs-voice-id", config.elevenLabsVoiceId);
  setHeader(headers, "x-voice-accent-preset", config.voiceAccentPreset);

  return headers;
}

export function runtimeConfigFromHeaders(headers: Headers): RuntimeApiConfig {
  return {
    mapillaryAccessToken: readHeader(headers, "x-mapillary-access-token"),
    googleMapsApiKey: readHeader(headers, "x-google-maps-api-key"),
    aiApiKey:
      readHeader(headers, "x-ai-api-key") ||
      readHeader(headers, "x-openai-api-key"),
    aiBaseUrl: readHeader(headers, "x-ai-base-url"),
    aiProvider: readHeader(headers, "x-ai-provider"),
    glmApiKey: readHeader(headers, "x-glm-api-key"),
    glmBaseUrl: readHeader(headers, "x-glm-base-url"),
    visionProvider: readHeader(headers, "x-vision-provider"),
    visionModel: readHeader(headers, "x-vision-model"),
    llmModel: readHeader(headers, "x-llm-model"),
    supabaseUrl: readHeader(headers, "x-supabase-url"),
    supabaseAnonKey: readHeader(headers, "x-supabase-anon-key"),
    supabaseServiceRoleKey: readHeader(headers, "x-supabase-service-role-key"),
    appUrl: readHeader(headers, "x-app-url"),
    ttsProvider: readHeader(headers, "x-tts-provider"),
    localTtsEndpoint: readHeader(headers, "x-local-tts-endpoint"),
    elevenLabsApiKey: readHeader(headers, "x-elevenlabs-api-key"),
    elevenLabsModel: readHeader(headers, "x-elevenlabs-model"),
    elevenLabsVoiceId: readHeader(headers, "x-elevenlabs-voice-id"),
    voiceAccentPreset: readHeader(headers, "x-voice-accent-preset")
  };
}

function setHeader(headers: Record<string, string>, name: string, value?: string) {
  if (value?.trim()) {
    headers[name] = value.trim();
  }
}

function readHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  return value?.trim() || undefined;
}
