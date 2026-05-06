import { getSupabaseAdmin } from "@/lib/supabase";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";
import type { StorySession } from "@/types";

type StorySessionRow = {
  id: string;
  provider: StorySession["provider"] | null;
  image_id: string | null;
  lat: number | null;
  lng: number | null;
  selected_persona: StorySession["selectedPersona"] | null;
  fragment_ids: string[] | null;
  created_at: string | null;
};

export async function listStorySessions(config: RuntimeApiConfig = {}) {
  const supabase = getSupabaseAdmin(config);
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("story_sessions")
    .select("id, provider, image_id, lat, lng, selected_persona, fragment_ids, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[story.sessions] list_failed", { message: error.message });
    return [];
  }

  return (data || []).map(rowToSession).filter(Boolean) as StorySession[];
}

export async function upsertStorySession(session: StorySession, config: RuntimeApiConfig = {}) {
  const supabase = getSupabaseAdmin(config);
  if (!supabase) return session;

  const { error } = await supabase.from("story_sessions").upsert(
    {
      id: session.id,
      provider: session.provider,
      image_id: session.imageId,
      lat: session.lat,
      lng: session.lng,
      selected_persona: session.selectedPersona || null,
      fragment_ids: session.fragmentIds || [],
      created_at: session.createdAt
    },
    { onConflict: "id" }
  );

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
    fragmentIds: row.fragment_ids || [],
    createdAt: row.created_at || new Date().toISOString()
  };
}
