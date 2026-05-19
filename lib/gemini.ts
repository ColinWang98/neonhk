import { readFile } from "node:fs/promises";
import path from "node:path";

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export function geminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

export function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-3-flash-preview";
}

export function geminiDiagnostics() {
  return {
    provider: "gemini",
    model: geminiModel(),
    hasApiKey: Boolean(geminiApiKey())
  };
}

export async function generateGeminiJson(params: {
  parts: GeminiPart[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  errorPrefix: string;
}) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error(`${params.errorPrefix} requires GEMINI_API_KEY.`);
  }

  const model = params.model || geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = JSON.stringify({
    contents: [{ role: "user", parts: params.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: params.temperature ?? 0.2,
      ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {})
    }
  });
  const timeoutMs = normalizeTimeoutMs(params.timeoutMs);
  const controller = new AbortController();
  const timeout = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: payload,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${params.errorPrefix} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message || `${params.errorPrefix} failed: ${res.status}`);
  }

  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!raw) {
    throw new Error(`${params.errorPrefix} returned no content.`);
  }

  return stripJsonFence(raw);
}

function normalizeTimeoutMs(value?: number) {
  const raw = value ?? Number(process.env.GEMINI_TIMEOUT_MS || "45000");
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.max(1000, Math.round(raw));
}

export async function prepareGeminiImagePart(
  imageUrl: string,
  errorPrefix = "Gemini image input"
): Promise<GeminiPart> {
  const dataUrl = await prepareImageUrl(imageUrl);
  if (dataUrl.startsWith("data:")) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL for Gemini image input.");
    return { inline_data: { mime_type: match[1], data: match[2] } };
  }

  const res = await fetch(dataUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch image for ${errorPrefix}: ${res.status}`);
  }
  const contentType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { inline_data: { mime_type: contentType, data: buffer.toString("base64") } };
}

export function stripJsonFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function prepareImageUrl(imageUrl: string) {
  if (!imageUrl.startsWith("/")) return imageUrl;
  const file = await readFile(path.join(process.cwd(), "public", imageUrl));
  return `data:image/jpeg;base64,${file.toString("base64")}`;
}
