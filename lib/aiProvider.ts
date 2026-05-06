import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

export type ModelPurpose = "text" | "vision";

export function createAiClient(config: RuntimeApiConfig, purpose: ModelPurpose) {
  const provider = resolveProvider(config, purpose);
  const apiKey = resolveApiKey(config, provider);
  const baseURL = resolveBaseUrl(config, provider);
  const model = resolveModel(config, provider, purpose);

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    model,
    client: new OpenAI({ apiKey, baseURL }),
    defaults: requestDefaults(config, provider)
  };
}

export function resolveProvider(config: RuntimeApiConfig, purpose: ModelPurpose) {
  const configured =
    purpose === "vision"
      ? config.visionProvider || process.env.VISION_PROVIDER
      : config.aiProvider || process.env.AI_PROVIDER;
  if (configured === "xiaomi" || configured === "glm" || configured === "deepseek") {
    return configured;
  }

  if (purpose === "vision") {
    if (config.xiaomiApiKey || process.env.XIAOMI_API_KEY) return "xiaomi";
    return "glm";
  }

  if (config.xiaomiApiKey || process.env.XIAOMI_API_KEY) return "xiaomi";
  return "deepseek";
}

export function requestDefaults(
  config: RuntimeApiConfig,
  provider: ReturnType<typeof resolveProvider>
): Partial<ChatCompletionCreateParamsNonStreaming> {
  if (provider !== "xiaomi") {
    return {};
  }

  return {
    temperature: parseNumber(config.xiaomiTemperature, process.env.XIAOMI_TEMPERATURE, 0.8),
    top_p: parseNumber(config.xiaomiTopP, process.env.XIAOMI_TOP_P, 0.95),
    max_tokens: parseInteger(config.xiaomiMaxTokens, process.env.XIAOMI_MAX_TOKENS, 4096)
  };
}

function resolveApiKey(config: RuntimeApiConfig, provider: ReturnType<typeof resolveProvider>) {
  const unifiedKey =
    config.unifiedAiApiKey ||
    process.env.UNIFIED_AI_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (provider === "xiaomi") {
    return config.xiaomiApiKey || process.env.XIAOMI_API_KEY || unifiedKey;
  }

  if (provider === "glm") {
    return (
      config.glmApiKey ||
      process.env.GLM_API_KEY ||
      process.env.ZHIPUAI_API_KEY ||
      process.env.BIGMODEL_API_KEY ||
      unifiedKey
    );
  }

  return config.aiApiKey || unifiedKey;
}

function resolveBaseUrl(
  config: RuntimeApiConfig,
  provider: ReturnType<typeof resolveProvider>
) {
  if (provider === "xiaomi") {
    return config.xiaomiBaseUrl || process.env.XIAOMI_BASE_URL || "https://api.xiaomimimo.com/v1";
  }

  if (provider === "glm") {
    return config.glmBaseUrl || process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  }

  return config.aiBaseUrl || process.env.AI_BASE_URL || "https://api.deepseek.com";
}

function resolveModel(
  config: RuntimeApiConfig,
  provider: ReturnType<typeof resolveProvider>,
  purpose: ModelPurpose
) {
  if (provider === "xiaomi") {
    return (
      (purpose === "vision" ? config.xiaomiVisionModel : config.xiaomiTextModel) ||
      process.env[purpose === "vision" ? "XIAOMI_VISION_MODEL" : "XIAOMI_TEXT_MODEL"] ||
      (purpose === "vision" ? "mimo-v2-omni" : "mimo-v2-flash")
    );
  }

  if (provider === "glm") {
    return config.visionModel || process.env.VISION_MODEL || "glm-4.6v-flash";
  }

  return config.llmModel || process.env.LLM_MODEL || "deepseek-chat";
}

function parseNumber(value: string | undefined, envValue: string | undefined, fallback: number) {
  const parsed = Number(value || envValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value: string | undefined, envValue: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || envValue || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
