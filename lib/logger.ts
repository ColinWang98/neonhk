import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { LogEvent } from "@/types";

export async function logEvent(event: LogEvent, config: RuntimeApiConfig = {}) {
  const record = {
    ...event,
    createdAt: new Date().toISOString()
  };

  const supabase = getSupabaseAdmin(config);
  if (supabase) {
    await supabase.from("interaction_logs").insert({
      event_type: event.eventType,
      payload: event.payload
    });
    return record;
  }

  const logDir = path.join(process.cwd(), ".local-data");
  await mkdir(logDir, { recursive: true });
  await appendFile(path.join(logDir, "interaction_logs.jsonl"), `${JSON.stringify(record)}\n`);
  return record;
}
