alter table if exists public.selected_fragments
  add column if not exists narrative_persona_id text,
  add column if not exists place_context jsonb,
  add column if not exists panorama_pov jsonb,
  add column if not exists evidence_packet jsonb,
  add column if not exists personas jsonb default '[]'::jsonb,
  add column if not exists persona_fragment_plans jsonb default '{}'::jsonb,
  add column if not exists narrative_generations jsonb default '{}'::jsonb,
  add column if not exists narrative_blocks jsonb default '[]'::jsonb,
  add column if not exists narrative_validation jsonb,
  add column if not exists audio_generations jsonb default '{}'::jsonb;

alter table if exists public.story_sessions
  add column if not exists scene_visual_description jsonb,
  add column if not exists place_context jsonb,
  add column if not exists scene_opening_generations jsonb default '{}'::jsonb,
  add column if not exists journey jsonb default '[]'::jsonb;

create index if not exists selected_fragments_session_selected_at_idx
  on public.selected_fragments (session_id, selected_at desc);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  session_id uuid references public.story_sessions(id) on delete set null,
  fragment_id uuid references public.selected_fragments(id) on delete set null,
  persona_id text,
  graph_name text not null,
  agent_name text not null,
  provider text,
  model text,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  input_hash text,
  input_summary jsonb,
  output jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_session_created_at_idx
  on public.agent_runs (session_id, created_at desc);

create index if not exists agent_runs_fragment_created_at_idx
  on public.agent_runs (fragment_id, created_at desc);

create index if not exists agent_runs_graph_agent_idx
  on public.agent_runs (graph_name, agent_name, created_at desc);

alter table if exists public.agent_runs enable row level security;
