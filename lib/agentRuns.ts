import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { AgentRunSummary } from "@/types";

type AgentRunStatus = AgentRunSummary["status"];

type AgentRunLog = {
  runId: string;
  sessionId?: string;
  fragmentId?: string;
  personaId?: string;
  graphName: string;
  agentName: string;
  provider?: string;
  model?: string;
  status: AgentRunStatus;
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  durationMs?: number;
};

export async function logAgentRun(record: AgentRunLog, config: RuntimeApiConfig = {}): Promise<AgentRunSummary> {
  const payload = {
    run_id: record.runId,
    session_id: record.sessionId || null,
    fragment_id: record.fragmentId || null,
    persona_id: record.personaId || null,
    graph_name: record.graphName,
    agent_name: record.agentName,
    provider: record.provider || null,
    model: record.model || null,
    status: record.status,
    input_hash: record.input === undefined ? null : hashJson(record.input),
    input_summary: record.input === undefined ? null : record.input,
    output: record.output === undefined ? null : record.output,
    error_message: record.errorMessage || null,
    duration_ms: record.durationMs || null
  };

  const supabase = getSupabaseAdmin(config);
  if (supabase) {
    const { error } = await supabase.from("agent_runs").insert(payload);
    if (error) {
      console.warn("[agent.run.log] supabase_insert_failed", {
        graph: record.graphName,
        agent: record.agentName,
        message: error.message
      });
    }
  } else {
    console.info("[agent.run.log]", {
      ...payload,
      created_at: new Date().toISOString()
    });
  }

  return {
    runId: record.runId,
    agentName: record.agentName,
    status: record.status,
    durationMs: record.durationMs,
    errorMessage: record.errorMessage
  };
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
