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
    const { error } = await supabase.from("interaction_logs").insert({
      event_type: event.eventType,
      payload: event.payload
    });

    if (error) {
      console.warn("[interaction.log] supabase_insert_failed", {
        eventType: event.eventType,
        message: error.message
      });
    } else {
      return record;
    }
  }

  if (process.env.VERCEL) {
    console.info("[interaction.log]", record);
    return record;
  }

  const logDir = path.join(process.cwd(), ".local-data");
  await mkdir(logDir, { recursive: true });
  await appendFile(path.join(logDir, "interaction_logs.jsonl"), `${JSON.stringify(record)}\n`);
  return record;
}
