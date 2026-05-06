import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

type AiGenerationLog = {
  sessionId?: string;
  fragmentId?: string;
  stage: string;
  provider?: string;
  model?: string;
  status: "started" | "success" | "fallback" | "error";
  inputSummary?: unknown;
  output?: unknown;
  errorMessage?: string;
  durationMs?: number;
};

export async function logAiGeneration(
  record: AiGenerationLog,
  config: RuntimeApiConfig = {}
) {
  const payload = {
    session_id: record.sessionId || null,
    fragment_id: record.fragmentId || null,
    stage: record.stage,
    provider: record.provider || null,
    model: record.model || null,
    status: record.status,
    input_summary: record.inputSummary || null,
    output: record.output || null,
    error_message: record.errorMessage || null,
    duration_ms: record.durationMs || null
  };

  const supabase = getSupabaseAdmin(config);
  if (supabase) {
    const { error } = await supabase.from("ai_generation_logs").insert(payload);
    if (error) {
      console.warn("[ai.generation.log] supabase_insert_failed", {
        stage: record.stage,
        message: error.message
      });
    }
    return;
  }

  console.info("[ai.generation.log]", {
    ...payload,
    created_at: new Date().toISOString()
  });
}
