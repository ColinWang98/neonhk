import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { SelectedFragment } from "@/types";

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
  narrativePersonaId?: string;
  placeContext?: unknown;
  panoramaPov?: unknown;
  audioGenerations?: unknown;
  status?: string;
};

type FragmentRow = {
  id: string;
  image_id: string | null;
  selected_at: string | null;
  screen_box: SelectedFragment["screenBox"] | null;
  crop_box: SelectedFragment["cropBox"] | null;
  crop_image_url: string | null;
  vision_description: SelectedFragment["visionDescription"] | null;
  narratives: SelectedFragment["narratives"] | null;
  narrative_persona_id?: string | null;
  place_context?: SelectedFragment["placeContext"] | null;
  panorama_pov?: SelectedFragment["panoramaPov"] | null;
  audio_generations?: SelectedFragment["audioGenerations"] | null;
  status: SelectedFragment["status"] | null;
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
      ...(record.narrativePersonaId ? { narrative_persona_id: record.narrativePersonaId } : {}),
      ...(record.placeContext ? { place_context: record.placeContext } : {}),
      ...(record.panoramaPov ? { panorama_pov: record.panoramaPov } : {}),
      ...(record.audioGenerations ? { audio_generations: record.audioGenerations } : {}),
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

    if (result.error && hasOptionalColumnFailure(result.error.message)) {
      const compatiblePayload = stripHistoryColumns(payload);
      const fallbackResult =
        record.screenBox && record.cropBox && record.imageId
          ? await supabase.from("selected_fragments").upsert(
              {
                id: record.id,
                ...compatiblePayload
              },
              { onConflict: "id" }
            )
          : await supabase.from("selected_fragments").update(compatiblePayload).eq("id", record.id);

      if (fallbackResult.error) {
        console.warn(`Fragment persistence skipped: ${fallbackResult.error.message}`);
      }
      return;
    }

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

function hasOptionalColumnFailure(message: string) {
  return (
    message.includes("narrative_persona_id") ||
    message.includes("place_context") ||
    message.includes("panorama_pov") ||
    message.includes("audio_generations") ||
    message.includes("schema cache")
  );
}

function stripHistoryColumns(payload: Record<string, unknown>) {
  const compatiblePayload = { ...payload };
  delete compatiblePayload.narrative_persona_id;
  delete compatiblePayload.place_context;
  delete compatiblePayload.panorama_pov;
  delete compatiblePayload.audio_generations;
  return compatiblePayload;
}

export async function listFragmentsBySession(sessionId: string, config: RuntimeApiConfig = {}) {
  const supabase = getSupabaseAdmin(config);
  if (!supabase) return [];

  const fullColumns = [
    "id",
    "image_id",
    "selected_at",
    "screen_box",
    "crop_box",
    "crop_image_url",
    "vision_description",
    "narratives",
    "narrative_persona_id",
    "place_context",
    "panorama_pov",
    "audio_generations",
    "status"
  ].join(", ");

  const fullResult = await supabase
    .from("selected_fragments")
    .select(fullColumns)
    .eq("session_id", sessionId)
    .order("selected_at", { ascending: false });
  let data = fullResult.data as FragmentRow[] | null;
  let error = fullResult.error;

  if (error) {
    console.warn("[fragments] full_select_failed", { message: error.message });
    const fallback = await supabase
      .from("selected_fragments")
      .select("id, image_id, selected_at, screen_box, crop_box, crop_image_url, vision_description, narratives, status")
      .eq("session_id", sessionId)
      .order("selected_at", { ascending: false });
    data = fallback.data as FragmentRow[] | null;
    error = fallback.error;
  }

  if (error) {
    console.warn("[fragments] list_failed", { sessionId, message: error.message });
    return [];
  }

  return (data || []).map(rowToFragment).filter(Boolean) as SelectedFragment[];
}

function rowToFragment(row: FragmentRow): SelectedFragment | null {
  if (!row.id || !row.image_id || !row.screen_box || !row.crop_box) return null;

  return {
    id: row.id,
    imageId: row.image_id,
    selectedAt: row.selected_at || new Date().toISOString(),
    screenBox: row.screen_box,
    cropBox: row.crop_box,
    cropImageUrl: row.crop_image_url || undefined,
    visionDescription: row.vision_description || undefined,
    narratives: row.narratives || undefined,
    narrativePersonaId: row.narrative_persona_id || undefined,
    placeContext: row.place_context || undefined,
    panoramaPov: row.panorama_pov || undefined,
    audioGenerations: row.audio_generations || undefined,
    status: row.status || "ready"
  };
}
