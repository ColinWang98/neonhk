import { readFile } from "node:fs/promises";
import https from "node:https";
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

type GenerateGeminiJsonParams = {
  parts: GeminiPart[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  errorPrefix: string;
};

export async function generateGeminiJson(params: GenerateGeminiJsonParams) {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error(`${params.errorPrefix} requires GEMINI_API_KEY.`);
  }

  const model = params.model || geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const timeoutMs = normalizeTimeoutMs(params.timeoutMs);
  let invalidJson = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = buildGeminiPayload(params, attempt);
    const response = await postJson(url, payload, apiKey, timeoutMs, params.errorPrefix);
    const data = parseGeminiResponse(response.body, params.errorPrefix);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(data.error?.message || `${params.errorPrefix} failed: ${response.status}`);
    }

    const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!raw) {
      throw new Error(`${params.errorPrefix} returned no content.`);
    }

    const json = stripJsonFence(raw);
    if (isValidJson(json)) {
      return json;
    }
    invalidJson = true;
  }

  throw new Error(
    invalidJson
      ? `${params.errorPrefix} returned invalid JSON after retry.`
      : `${params.errorPrefix} returned invalid JSON.`
  );
}

function buildGeminiPayload(params: GenerateGeminiJsonParams, attempt: number) {
  return JSON.stringify({
    contents: [{ role: "user", parts: params.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: params.temperature ?? 0.2,
      ...(maxOutputTokensForAttempt(params.maxOutputTokens, attempt)
        ? { maxOutputTokens: maxOutputTokensForAttempt(params.maxOutputTokens, attempt) }
        : {})
    }
  });
}

function maxOutputTokensForAttempt(value: number | undefined, attempt: number) {
  if (attempt === 0) return value;
  const base = value || 2048;
  return Math.min(Math.max(base * 2, 4096), 8192);
}

function postJson(
  urlString: string,
  payload: string,
  apiKey: string,
  timeoutMs: number | undefined,
  errorPrefix: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    let settled = false;
    const deadline = timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(`${errorPrefix} timed out after ${timeoutMs}ms.`));
          request.destroy();
        }, timeoutMs)
      : undefined;
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-goog-api-key": apiKey
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          if (settled) return;
          settled = true;
          if (deadline) clearTimeout(deadline);
          resolve({
            status: response.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    request.on("error", (error) => {
      settled = true;
      if (deadline) clearTimeout(deadline);
      reject(error);
    });
    if (timeoutMs) {
      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error(`${errorPrefix} timed out after ${timeoutMs}ms.`));
      });
    }
    request.write(payload);
    request.end();
  });
}

function parseGeminiResponse(body: string, errorPrefix: string): GeminiResponse {
  try {
    return JSON.parse(body) as GeminiResponse;
  } catch {
    throw new Error(`${errorPrefix} returned invalid response JSON.`);
  }
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
  const stripped = value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }
  return stripped;
}

function isValidJson(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

async function prepareImageUrl(imageUrl: string) {
  if (!imageUrl.startsWith("/")) return imageUrl;
  const file = await readFile(path.join(process.cwd(), "public", imageUrl));
  return `data:image/jpeg;base64,${file.toString("base64")}`;
}
