export type RuntimeApiConfig = {
  mapillaryAccessToken?: string;
  googleMapsApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  appUrl?: string;
  ttsProvider?: string;
  localTtsEndpoint?: string;
  elevenLabsApiKey?: string;
  elevenLabsModel?: string;
  elevenLabsVoiceId?: string;
  minimaxApiKey?: string;
  minimaxGroupId?: string;
  minimaxEndpoint?: string;
  minimaxModel?: string;
  minimaxVoiceId?: string;
  minimaxVoiceIdAlt?: string;
  minimaxVoiceIdFemale?: string;
  voiceAccentPreset?: string;
};

export const runtimeConfigStorageKey = "street-fragment-explorer.api-config";

export function publicRuntimeConfig(): RuntimeApiConfig {
  return {
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  };
}

export function runtimeConfigToHeaders(config: RuntimeApiConfig) {
  const headers: Record<string, string> = {};

  setHeader(headers, "x-mapillary-access-token", config.mapillaryAccessToken);
  setHeader(headers, "x-google-maps-api-key", config.googleMapsApiKey);
  setHeader(headers, "x-supabase-url", config.supabaseUrl);
  setHeader(headers, "x-supabase-anon-key", config.supabaseAnonKey);
  setHeader(headers, "x-supabase-service-role-key", config.supabaseServiceRoleKey);
  setHeader(headers, "x-app-url", config.appUrl);
  setHeader(headers, "x-tts-provider", config.ttsProvider);
  setHeader(headers, "x-local-tts-endpoint", config.localTtsEndpoint);
  setHeader(headers, "x-elevenlabs-api-key", config.elevenLabsApiKey);
  setHeader(headers, "x-elevenlabs-model", config.elevenLabsModel);
  setHeader(headers, "x-elevenlabs-voice-id", config.elevenLabsVoiceId);
  setHeader(headers, "x-minimax-api-key", config.minimaxApiKey);
  setHeader(headers, "x-minimax-group-id", config.minimaxGroupId);
  setHeader(headers, "x-minimax-endpoint", config.minimaxEndpoint);
  setHeader(headers, "x-minimax-model", config.minimaxModel);
  setHeader(headers, "x-minimax-voice-id", config.minimaxVoiceId);
  setHeader(headers, "x-minimax-voice-id-alt", config.minimaxVoiceIdAlt);
  setHeader(headers, "x-minimax-voice-id-female", config.minimaxVoiceIdFemale);
  setHeader(headers, "x-voice-accent-preset", config.voiceAccentPreset);

  return headers;
}

export function runtimeConfigFromHeaders(headers: Headers): RuntimeApiConfig {
  return {
    mapillaryAccessToken: readHeader(headers, "x-mapillary-access-token"),
    googleMapsApiKey: readHeader(headers, "x-google-maps-api-key"),
    supabaseUrl: readHeader(headers, "x-supabase-url"),
    supabaseAnonKey: readHeader(headers, "x-supabase-anon-key"),
    supabaseServiceRoleKey: readHeader(headers, "x-supabase-service-role-key"),
    appUrl: readHeader(headers, "x-app-url"),
    ttsProvider: readHeader(headers, "x-tts-provider"),
    localTtsEndpoint: readHeader(headers, "x-local-tts-endpoint"),
    elevenLabsApiKey: readHeader(headers, "x-elevenlabs-api-key"),
    elevenLabsModel: readHeader(headers, "x-elevenlabs-model"),
    elevenLabsVoiceId: readHeader(headers, "x-elevenlabs-voice-id"),
    minimaxApiKey: readHeader(headers, "x-minimax-api-key"),
    minimaxGroupId: readHeader(headers, "x-minimax-group-id"),
    minimaxEndpoint: readHeader(headers, "x-minimax-endpoint"),
    minimaxModel: readHeader(headers, "x-minimax-model"),
    minimaxVoiceId: readHeader(headers, "x-minimax-voice-id"),
    minimaxVoiceIdAlt: readHeader(headers, "x-minimax-voice-id-alt"),
    minimaxVoiceIdFemale: readHeader(headers, "x-minimax-voice-id-female"),
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
