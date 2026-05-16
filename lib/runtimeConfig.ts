export type RuntimeApiConfig = {
  mapillaryAccessToken?: string;
  googleMapsApiKey?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiProvider?: string;
  glmApiKey?: string;
  glmBaseUrl?: string;
  qwenApiKey?: string;
  qwenBaseUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  candidateVerifierProvider?: string;
  sceneVisionModel?: string;
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
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    aiProvider: "deepseek",
    visionProvider: "qwen",
    candidateVerifierProvider: "qwen"
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
  setHeader(headers, "x-qwen-api-key", config.qwenApiKey);
  setHeader(headers, "x-qwen-base-url", config.qwenBaseUrl);
  setHeader(headers, "x-gemini-api-key", config.geminiApiKey);
  setHeader(headers, "x-gemini-model", config.geminiModel);
  setHeader(headers, "x-candidate-verifier-provider", config.candidateVerifierProvider);
  setHeader(headers, "x-scene-vision-model", normalizeLegacyVisionModel(config.sceneVisionModel));
  setHeader(headers, "x-vision-provider", config.visionProvider);
  setHeader(headers, "x-vision-model", normalizeLegacyVisionModel(config.visionModel));
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
    aiApiKey:
      readHeader(headers, "x-ai-api-key") ||
      readHeader(headers, "x-openai-api-key"),
    aiBaseUrl: readHeader(headers, "x-ai-base-url"),
    aiProvider: readHeader(headers, "x-ai-provider"),
    glmApiKey: readHeader(headers, "x-glm-api-key"),
    glmBaseUrl: readHeader(headers, "x-glm-base-url"),
    qwenApiKey: readHeader(headers, "x-qwen-api-key"),
    qwenBaseUrl: readHeader(headers, "x-qwen-base-url"),
    geminiApiKey: readHeader(headers, "x-gemini-api-key"),
    geminiModel: readHeader(headers, "x-gemini-model"),
    candidateVerifierProvider: readHeader(headers, "x-candidate-verifier-provider"),
    sceneVisionModel: readHeader(headers, "x-scene-vision-model"),
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

function normalizeLegacyVisionModel(model?: string) {
  if (model === "qwen3.6-plus") return "qwen3-vl-plus";
  if (model === "qwen3.6-flash") return "qwen3-vl-flash";
  return model;
}
