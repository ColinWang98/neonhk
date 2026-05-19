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
  personas?: unknown;
  narratives?: unknown;
  narrativePersonaId?: string;
  placeContext?: unknown;
  panoramaPov?: unknown;
  evidencePacket?: unknown;
  personaFragmentPlans?: unknown;
  narrativeGenerations?: unknown;
  narrativeBlocks?: unknown;
  narrativeValidation?: unknown;
  audioGenerations?: unknown;
  status?: string;
};

type FragmentRow = {
  id: string;
  session_id?: string | null;
  image_id: string | null;
  selected_at: string | null;
  screen_box: SelectedFragment["screenBox"] | null;
  crop_box: SelectedFragment["cropBox"] | null;
  crop_image_url: string | null;
  vision_description: SelectedFragment["visionDescription"] | null;
  personas?: SelectedFragment["personas"] | null;
  narratives: SelectedFragment["narratives"] | null;
  narrative_persona_id?: string | null;
  place_context?: SelectedFragment["placeContext"] | null;
  panorama_pov?: SelectedFragment["panoramaPov"] | null;
  evidence_packet?: SelectedFragment["evidencePacket"] | null;
  persona_fragment_plans?: SelectedFragment["personaFragmentPlans"] | null;
  narrative_generations?: SelectedFragment["narrativeGenerations"] | null;
  narrative_blocks?: SelectedFragment["narrativeBlocks"] | null;
  narrative_validation?: SelectedFragment["narrativeValidation"] | null;
  audio_generations?: SelectedFragment["audioGenerations"] | null;
  status: SelectedFragment["status"] | null;
};

export type FragmentRepairCandidate = {
  sessionId: string;
  fragment: SelectedFragment;
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
      ...(record.personas ? { personas: record.personas } : {}),
      ...(record.narratives ? { narratives: record.narratives } : {}),
      ...(record.narrativePersonaId ? { narrative_persona_id: record.narrativePersonaId } : {}),
      ...(record.placeContext ? { place_context: record.placeContext } : {}),
      ...(record.panoramaPov ? { panorama_pov: record.panoramaPov } : {}),
      ...(record.evidencePacket ? { evidence_packet: record.evidencePacket } : {}),
      ...(record.personaFragmentPlans ? { persona_fragment_plans: record.personaFragmentPlans } : {}),
      ...(record.narrativeGenerations ? { narrative_generations: record.narrativeGenerations } : {}),
      ...(record.narrativeBlocks ? { narrative_blocks: record.narrativeBlocks } : {}),
      ...(record.narrativeValidation ? { narrative_validation: record.narrativeValidation } : {}),
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
    message.includes("personas") ||
    message.includes("evidence_packet") ||
    message.includes("persona_fragment_plans") ||
    message.includes("narrative_generations") ||
    message.includes("narrative_blocks") ||
    message.includes("narrative_validation") ||
    message.includes("audio_generations") ||
    message.includes("schema cache")
  );
}

function stripHistoryColumns(payload: Record<string, unknown>) {
  const compatiblePayload = { ...payload };
  delete compatiblePayload.narrative_persona_id;
  delete compatiblePayload.place_context;
  delete compatiblePayload.panorama_pov;
  delete compatiblePayload.personas;
  delete compatiblePayload.evidence_packet;
  delete compatiblePayload.persona_fragment_plans;
  delete compatiblePayload.narrative_generations;
  delete compatiblePayload.narrative_blocks;
  delete compatiblePayload.narrative_validation;
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
    "personas",
    "narratives",
    "narrative_persona_id",
    "place_context",
    "panorama_pov",
    "evidence_packet",
    "persona_fragment_plans",
    "narrative_generations",
    "narrative_blocks",
    "narrative_validation",
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

export async function listFragmentsForNarrativeRepair(params: {
  sessionId?: string;
  fragmentId?: string;
  beforeSelectedAt?: string;
  limit?: number;
  config?: RuntimeApiConfig;
} = {}): Promise<FragmentRepairCandidate[]> {
  const supabase = getSupabaseAdmin(params.config || {});
  if (!supabase) return [];

  const fullColumns = [
    "id",
    "session_id",
    "image_id",
    "selected_at",
    "screen_box",
    "crop_box",
    "crop_image_url",
    "vision_description",
    "personas",
    "narratives",
    "narrative_persona_id",
    "place_context",
    "panorama_pov",
    "evidence_packet",
    "persona_fragment_plans",
    "narrative_generations",
    "narrative_blocks",
    "narrative_validation",
    "audio_generations",
    "status"
  ].join(", ");

  let query = supabase
    .from("selected_fragments")
    .select(fullColumns)
    .order("selected_at", { ascending: false })
    .limit(params.limit || 100);

  if (params.sessionId) {
    query = query.eq("session_id", params.sessionId);
  }
  if (params.fragmentId) {
    query = query.eq("id", params.fragmentId);
  }
  if (params.beforeSelectedAt) {
    query = query.lt("selected_at", params.beforeSelectedAt);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[fragments] repair_list_failed", { message: error.message });
    return [];
  }

  return ((data || []) as unknown as FragmentRow[])
    .map((row) => {
      const fragment = rowToFragment(row);
      if (!fragment || !row.session_id) return null;
      return { sessionId: row.session_id, fragment };
    })
    .filter(Boolean) as FragmentRepairCandidate[];
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
    personas: row.personas || undefined,
    narratives: row.narratives || undefined,
    narrativePersonaId: row.narrative_persona_id || undefined,
    placeContext: row.place_context || undefined,
    panoramaPov: row.panorama_pov || undefined,
    evidencePacket: row.evidence_packet || undefined,
    personaFragmentPlans: row.persona_fragment_plans || undefined,
    narrativeGenerations: row.narrative_generations || undefined,
    narrativeBlocks: row.narrative_blocks || undefined,
    narrativeValidation: row.narrative_validation || undefined,
    audioGenerations: row.audio_generations || undefined,
    status: row.status || "ready"
  };
}
