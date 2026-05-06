import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

type FragmentRecord = {
  id: string;
  sessionId?: string;
  imageId?: string;
  selectedAt?: string;
  screenBox?: unknown;
  cropBox?: unknown;
  cropImageUrl?: string;
  visionDescription?: unknown;
  narratives?: unknown;
  status?: string;
};

export async function persistFragment(record: FragmentRecord, config: RuntimeApiConfig = {}) {
  const supabase = getSupabaseAdmin(config);
  if (supabase) {
    const payload = {
      ...(record.sessionId ? { session_id: record.sessionId } : {}),
      ...(record.imageId ? { image_id: record.imageId } : {}),
      ...(record.selectedAt ? { selected_at: record.selectedAt } : {}),
      ...(record.screenBox ? { screen_box: record.screenBox } : {}),
      ...(record.cropBox ? { crop_box: record.cropBox } : {}),
      ...(record.cropImageUrl ? { crop_image_url: record.cropImageUrl } : {}),
      ...(record.visionDescription ? { vision_description: record.visionDescription } : {}),
      ...(record.narratives ? { narratives: record.narratives } : {}),
      ...(record.status ? { status: record.status } : {})
    };

    const result =
      record.screenBox && record.cropBox && record.imageId
        ? await supabase.from("selected_fragments").upsert(
            {
              id: record.id,
              ...payload
            },
            { onConflict: "id" }
          )
        : await supabase.from("selected_fragments").update(payload).eq("id", record.id);

    if (result.error) {
      console.warn(`Fragment persistence skipped: ${result.error.message}`);
    }
    return;
  }

  if (process.env.VERCEL) {
    console.info("[fragment.persist]", {
      ...record,
      updatedAt: new Date().toISOString()
    });
    return;
  }

  const logDir = path.join(process.cwd(), ".local-data");
  await mkdir(logDir, { recursive: true });
  await appendFile(
    path.join(logDir, "fragments.jsonl"),
    `${JSON.stringify({ ...record, updatedAt: new Date().toISOString() })}\n`
  );
}
