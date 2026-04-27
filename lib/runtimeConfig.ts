export type RuntimeApiConfig = {
  mapillaryAccessToken?: string;
  googleMapsApiKey?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  visionModel?: string;
  llmModel?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  appUrl?: string;
};

export const runtimeConfigStorageKey = "street-fragment-explorer.api-config";

export function runtimeConfigToHeaders(config: RuntimeApiConfig) {
  const headers: Record<string, string> = {};

  setHeader(headers, "x-mapillary-access-token", config.mapillaryAccessToken);
  setHeader(headers, "x-google-maps-api-key", config.googleMapsApiKey);
  setHeader(headers, "x-ai-api-key", config.aiApiKey);
  setHeader(headers, "x-ai-base-url", config.aiBaseUrl);
  setHeader(headers, "x-vision-model", config.visionModel);
  setHeader(headers, "x-llm-model", config.llmModel);
  setHeader(headers, "x-supabase-url", config.supabaseUrl);
  setHeader(headers, "x-supabase-anon-key", config.supabaseAnonKey);
  setHeader(headers, "x-supabase-service-role-key", config.supabaseServiceRoleKey);
  setHeader(headers, "x-app-url", config.appUrl);

  return headers;
}

export function runtimeConfigFromHeaders(headers: Headers): RuntimeApiConfig {
  return {
    mapillaryAccessToken: readHeader(headers, "x-mapillary-access-token"),
    googleMapsApiKey: readHeader(headers, "x-google-maps-api-key"),
    aiApiKey: readHeader(headers, "x-ai-api-key") || readHeader(headers, "x-openai-api-key"),
    aiBaseUrl: readHeader(headers, "x-ai-base-url"),
    visionModel: readHeader(headers, "x-vision-model"),
    llmModel: readHeader(headers, "x-llm-model"),
    supabaseUrl: readHeader(headers, "x-supabase-url"),
    supabaseAnonKey: readHeader(headers, "x-supabase-anon-key"),
    supabaseServiceRoleKey: readHeader(headers, "x-supabase-service-role-key"),
    appUrl: readHeader(headers, "x-app-url")
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
