alter table if exists public.selected_fragments
  add column if not exists narrative_persona_id text,
  add column if not exists place_context jsonb,
  add column if not exists panorama_pov jsonb,
  add column if not exists evidence_packet jsonb,
  add column if not exists persona_fragment_plans jsonb default '{}'::jsonb,
  add column if not exists narrative_blocks jsonb default '[]'::jsonb,
  add column if not exists narrative_validation jsonb,
  add column if not exists audio_generations jsonb default '{}'::jsonb;

create index if not exists selected_fragments_session_selected_at_idx
  on public.selected_fragments (session_id, selected_at desc);
