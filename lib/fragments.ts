import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

type FragmentRecord = {
  id: string;
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
    const { error } = await supabase.from("fragments").upsert(
      {
        id: record.id,
        image_id: record.imageId,
        selected_at: record.selectedAt,
        screen_box: record.screenBox,
        crop_box: record.cropBox,
        crop_image_url: record.cropImageUrl,
        vision_description: record.visionDescription,
        narratives: record.narratives,
        status: record.status
      },
      { onConflict: "id" }
    );

    if (error) {
      console.warn(`Fragment persistence skipped: ${error.message}`);
    }
    return;
  }

  const logDir = path.join(process.cwd(), ".local-data");
  await mkdir(logDir, { recursive: true });
  await appendFile(
    path.join(logDir, "fragments.jsonl"),
    `${JSON.stringify({ ...record, updatedAt: new Date().toISOString() })}\n`
  );
}
