import https from "node:https";

export type TextModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type TextModelResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type GenerateTextJsonParams = {
  messages: TextModelMessage[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  errorPrefix: string;
};

export function textModelApiKey() {
  return process.env.DEEPSEEK_API_KEY;
}

export function textModelName() {
  return process.env.DEEPSEEK_MODEL || "deepseek-chat";
}

export function textModelProvider() {
  return "deepseek";
}

export function textModelDiagnostics() {
  return {
    provider: textModelProvider(),
    model: textModelName(),
    hasApiKey: Boolean(textModelApiKey())
  };
}

export async function generateTextJson(params: GenerateTextJsonParams) {
  const apiKey = textModelApiKey();
  if (!apiKey) {
    throw new Error(`${params.errorPrefix} requires DEEPSEEK_API_KEY.`);
  }

  const model = params.model || textModelName();
  const url = chatCompletionsUrl();
  const timeoutMs = normalizeTimeoutMs(params.timeoutMs);
  let invalidJson = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = buildTextPayload(params, model, attempt);
    const response = await postJson(url, payload, apiKey, timeoutMs, params.errorPrefix);
    const data = parseTextModelResponse(response.body, params.errorPrefix);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(data.error?.message || `${params.errorPrefix} failed: ${response.status}`);
    }

    const raw = data.choices?.[0]?.message?.content?.trim();
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

function buildTextPayload(params: GenerateTextJsonParams, model: string, attempt: number) {
  const retryMessage: TextModelMessage | undefined = attempt
    ? {
        role: "user",
        content: "Repair your previous response. Return only one valid JSON object. Do not include markdown, comments, or extra text."
      }
    : undefined;

  return JSON.stringify({
    model,
    messages: retryMessage ? [...params.messages, retryMessage] : params.messages,
    temperature: params.temperature ?? 0.2,
    response_format: { type: "json_object" },
    ...(maxTokensForAttempt(params.maxOutputTokens, attempt)
      ? { max_tokens: maxTokensForAttempt(params.maxOutputTokens, attempt) }
      : {})
  });
}

function maxTokensForAttempt(value: number | undefined, attempt: number) {
  if (attempt === 0) return value;
  const base = value || 2048;
  return Math.min(Math.max(base * 2, 4096), 8192);
}

function chatCompletionsUrl() {
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/chat/completions`;
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
          Authorization: `Bearer ${apiKey}`
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

function parseTextModelResponse(body: string, errorPrefix: string): TextModelResponse {
  try {
    return JSON.parse(body) as TextModelResponse;
  } catch {
    throw new Error(`${errorPrefix} returned invalid response JSON.`);
  }
}

function normalizeTimeoutMs(value?: number) {
  const raw = value ?? Number(process.env.DEEPSEEK_TIMEOUT_MS || "45000");
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.max(1000, Math.round(raw));
}

function stripJsonFence(value: string) {
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
