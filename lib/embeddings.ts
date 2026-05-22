import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

type EmbeddingResponse = {
  embeddings?: number[][];
  embedding?: number[];
  error?: {
    message?: string;
  };
};

export function embeddingDiagnostics() {
  return {
    provider: "supabase-gte-small",
    model: embeddingModel(),
    hasApiKey: Boolean(supabaseEmbeddingConfig().url && supabaseEmbeddingConfig().key),
    dimension: embeddingDimension()
  };
}

export function embeddingModel() {
  return "gte-small";
}

export function embeddingDimension() {
  return 384;
}

export async function generateEmbeddings(input: string[], config?: RuntimeApiConfig): Promise<number[][] | undefined> {
  const supabase = supabaseEmbeddingConfig(config);
  const cleaned = input.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!supabase.url || !supabase.key || cleaned.length === 0) return undefined;

  const payload = JSON.stringify({
    input: cleaned
  });
  const response = await postJson(embeddingUrl(supabase.url), payload, supabase.key, embeddingTimeoutMs());
  const data = parseEmbeddingResponse(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(data.error?.message || `Embedding request failed: ${response.status}`);
  }
  const vectors = data.embeddings || (data.embedding ? [data.embedding] : []);
  if (vectors.length !== cleaned.length) {
    throw new Error("Embedding response did not include one vector per input.");
  }
  return vectors.map(normalizeVector);
}

function supabaseEmbeddingConfig(config?: RuntimeApiConfig) {
  return {
    url: config?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: config?.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function embeddingUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/place-memory-embed`;
}

function embeddingTimeoutMs() {
  const raw = Number(process.env.PLACE_MEMORY_EMBEDDING_TIMEOUT_MS || "8000");
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 8000;
}

function normalizeVector(vector: number[]) {
  return vector.map((value) => Number(value));
}

async function postJson(urlString: string, payload: string, apiKey: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(urlString, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`
      },
      body: payload,
      signal: controller.signal
    });
    return {
      status: response.status,
      body: await response.text()
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Embedding request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

function parseEmbeddingResponse(body: string): EmbeddingResponse {
  try {
    return JSON.parse(body) as EmbeddingResponse;
  } catch {
    throw new Error("Embedding provider returned invalid response JSON.");
  }
}
