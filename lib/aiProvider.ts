import OpenAI from "openai";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

export type ModelPurpose = "text" | "vision";

export function createAiClient(config: RuntimeApiConfig, purpose: ModelPurpose) {
  const provider = resolveProvider(purpose);
  const apiKey = resolveApiKey(config, provider);
  const baseURL = resolveBaseUrl(config, provider);
  const model = resolveModel(config, provider);

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    model,
    client: new OpenAI({ apiKey, baseURL }),
    defaults: {}
  };
}

export function resolveProvider(purpose: ModelPurpose) {
  return purpose === "vision" ? "glm" : "deepseek";
}

function resolveApiKey(config: RuntimeApiConfig, provider: ReturnType<typeof resolveProvider>) {
  const unifiedKey =
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY;

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
  if (provider === "glm") {
    return config.glmBaseUrl || process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  }

  return config.aiBaseUrl || process.env.AI_BASE_URL || "https://api.deepseek.com";
}

function resolveModel(
  config: RuntimeApiConfig,
  provider: ReturnType<typeof resolveProvider>
) {
  if (provider === "glm") {
    return config.visionModel || process.env.VISION_MODEL || "glm-4.6v-flash";
  }

  return config.llmModel || process.env.LLM_MODEL || "deepseek-chat";
}
