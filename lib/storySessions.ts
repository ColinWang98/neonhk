import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { GeneratedPersona, StorySession } from "@/types";

type StorySessionRow = {
  id: string;
  provider: StorySession["provider"] | null;
  image_id: string | null;
  lat: number | null;
  lng: number | null;
  selected_persona: StorySession["selectedPersona"] | null;
  personas?: GeneratedPersona[] | null;
  fragment_ids: string[] | null;
  created_at: string | null;
};

const fullStorySessionSelect = "id, provider, image_id, lat, lng, selected_persona, personas, fragment_ids, created_at";
const compatibleStorySessionSelect = "id, provider, image_id, lat, lng, selected_persona, fragment_ids, created_at";

export async function listStorySessions(config: RuntimeApiConfig = {}) {
  const supabase = getSupabaseAdmin(config);
  if (!supabase) return [];

  const fullResult = await supabase
    .from("story_sessions")
    .select(fullStorySessionSelect)
    .order("created_at", { ascending: false })
    .limit(200);
  let rows = fullResult.data as StorySessionRow[] | null;
  let error = fullResult.error;

  if (error) {
    if (!isMissingPersonasColumn(error.message)) {
      console.warn("[story.sessions] list_failed", { message: error.message });
      return [];
    }
    const fallback = await supabase
      .from("story_sessions")
      .select(compatibleStorySessionSelect)
      .order("created_at", { ascending: false })
      .limit(200);
    rows = fallback.data as StorySessionRow[] | null;
    error = fallback.error;
    if (error) {
      console.warn("[story.sessions] compatible_list_failed", { message: error.message });
      return [];
    }
  }

  return (rows || []).map(rowToSession).filter(Boolean) as StorySession[];
}

export async function upsertStorySession(session: StorySession, config: RuntimeApiConfig = {}) {
  const supabase = getSupabaseAdmin(config);
  if (!supabase) return session;

  const payload = {
    id: session.id,
    provider: session.provider,
    image_id: session.imageId,
    lat: session.lat,
    lng: session.lng,
    selected_persona: session.selectedPersona || null,
    personas: session.personas || [],
    fragment_ids: session.fragmentIds || [],
    created_at: session.createdAt
  };

  let { error } = await supabase.from("story_sessions").upsert(payload, { onConflict: "id" });

  if (error && isMissingPersonasColumn(error.message)) {
    const compatiblePayload = {
      id: payload.id,
      provider: payload.provider,
      image_id: payload.image_id,
      lat: payload.lat,
      lng: payload.lng,
      selected_persona: payload.selected_persona,
      fragment_ids: payload.fragment_ids,
      created_at: payload.created_at
    };
    const fallback = await supabase.from("story_sessions").upsert(compatiblePayload, { onConflict: "id" });
    error = fallback.error;
  }

  if (error) {
    console.warn("[story.sessions] upsert_failed", {
      sessionId: session.id,
      message: error.message
    });
  }

  return session;
}

function rowToSession(row: StorySessionRow): StorySession | null {
  if (!row.id || !row.provider || !row.image_id || row.lat === null || row.lng === null) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    imageId: row.image_id,
    panoId: row.provider === "google" ? row.image_id : undefined,
    lat: row.lat,
    lng: row.lng,
    selectedPersona: row.selected_persona || undefined,
    personas: row.personas || undefined,
    fragmentIds: row.fragment_ids || [],
    createdAt: row.created_at || new Date().toISOString()
  };
}

function isMissingPersonasColumn(message?: string) {
  return Boolean(
    message?.includes("personas") &&
      (message.includes("column") || message.includes("schema cache") || message.includes("Could not find"))
  );
}
