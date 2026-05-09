import OpenAI from "openai";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

export type ModelPurpose = "text" | "vision";
export type AiProvider = "deepseek" | "glm" | "qwen";

export function createAiClient(config: RuntimeApiConfig, purpose: ModelPurpose, options?: { provider?: AiProvider; model?: string }) {
  const provider = options?.provider || resolveProvider(config, purpose);
  const apiKey = resolveApiKey(config, provider);
  const baseURL = resolveBaseUrl(config, provider);
  const resolvedModel = options?.model || resolveModel(config, provider);
  const model = provider === "qwen" ? normalizeQwenVisionModel(resolvedModel) : resolvedModel;

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    model,
    client: new OpenAI({ apiKey, baseURL, timeout: purpose === "vision" ? 30000 : 20000 }),
    defaults: {}
  };
}

export function getAiProviderDiagnostics(config: RuntimeApiConfig) {
  const visionProvider = resolveProvider(config, "vision");
  const textProvider = resolveProvider(config, "text");

  return {
    vision: {
      provider: visionProvider,
      baseURL: resolveBaseUrl(config, visionProvider),
      model: resolveModel(config, visionProvider),
      hasApiKey: Boolean(resolveApiKey(config, visionProvider))
    },
    text: {
      provider: textProvider,
      baseURL: resolveBaseUrl(config, textProvider),
      model: resolveModel(config, textProvider),
      hasApiKey: Boolean(resolveApiKey(config, textProvider))
    }
  };
}

export function resolveProvider(config: RuntimeApiConfig, purpose: ModelPurpose): AiProvider {
  if (purpose === "vision") {
    return config.visionProvider === "glm" ? "glm" : "qwen";
  }
  return "deepseek";
}

function resolveApiKey(config: RuntimeApiConfig, provider: AiProvider) {
  const unifiedKey =
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (provider === "qwen") {
    return (
      config.qwenApiKey ||
      process.env.QWEN_API_KEY ||
      process.env.DASHSCOPE_API_KEY ||
      unifiedKey
    );
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
  provider: AiProvider
) {
  if (provider === "qwen") {
    return config.qwenBaseUrl || process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  }

  if (provider === "glm") {
    return config.glmBaseUrl || process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  }

  return config.aiBaseUrl || process.env.AI_BASE_URL || "https://api.deepseek.com";
}

function resolveModel(
  config: RuntimeApiConfig,
  provider: AiProvider
) {
  if (provider === "qwen") {
    const model = config.visionModel || process.env.VISION_MODEL || "qwen3-vl-plus";
    return normalizeQwenVisionModel(model);
  }

  if (provider === "glm") {
    const configuredModel = config.visionModel || process.env.GLM_VISION_MODEL;
    return configuredModel?.startsWith("glm") ? configuredModel : "glm-4v-flash";
  }

  return config.llmModel || process.env.LLM_MODEL || "deepseek-chat";
}

export function normalizeQwenVisionModel(model?: string) {
  if (!model) return "qwen3-vl-plus";
  const trimmed = model.trim();
  if (trimmed === "qwen3.6-plus") return "qwen3-vl-plus";
  if (trimmed === "qwen3.6-flash") return "qwen3-vl-flash";
  return trimmed;
}
