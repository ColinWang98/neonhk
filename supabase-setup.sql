-- HK Spatial Story Supabase setup
-- Run this once in Supabase SQL Editor.
-- The app uses server-side API routes with SUPABASE_SERVICE_ROLE_KEY.

create extension if not exists pgcrypto;

create table if not exists public.story_sessions (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google', 'mapillary')),
  image_id text not null,
  lat double precision not null,
  lng double precision not null,
  selected_persona jsonb,
  personas jsonb not null default '[]'::jsonb,
  scene_visual_description jsonb,
  place_context jsonb,
  scene_opening_generations jsonb not null default '{}'::jsonb,
  journey jsonb not null default '[]'::jsonb,
  fragment_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.selected_fragments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.story_sessions(id) on delete set null,
  image_id text not null,
  selected_at timestamptz not null default now(),
  screen_box jsonb not null,
  crop_box jsonb not null,
  crop_image_url text,
  vision_description jsonb,
  personas jsonb not null default '[]'::jsonb,
  narratives jsonb,
  narrative_persona_id text,
  place_context jsonb,
  panorama_pov jsonb,
  evidence_packet jsonb,
  persona_fragment_plans jsonb not null default '{}'::jsonb,
  narrative_generations jsonb not null default '{}'::jsonb,
  narrative_blocks jsonb not null default '[]'::jsonb,
  narrative_validation jsonb,
  audio_generations jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('cropping', 'analyzing', 'generating', 'ready', 'blocked', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interaction_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.story_sessions(id) on delete set null,
  fragment_id uuid references public.selected_fragments(id) on delete set null,
  stage text not null,
  provider text,
  model text,
  status text not null check (status in ('started', 'success', 'fallback', 'error')),
  input_summary jsonb,
  output jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists story_sessions_set_updated_at on public.story_sessions;
create trigger story_sessions_set_updated_at
before update on public.story_sessions
for each row execute function public.set_updated_at();

drop trigger if exists selected_fragments_set_updated_at on public.selected_fragments;
create trigger selected_fragments_set_updated_at
before update on public.selected_fragments
for each row execute function public.set_updated_at();

create index if not exists story_sessions_created_at_idx
  on public.story_sessions (created_at desc);

create index if not exists story_sessions_location_idx
  on public.story_sessions (lat, lng);

create index if not exists selected_fragments_session_selected_at_idx
  on public.selected_fragments (session_id, selected_at desc);

create index if not exists selected_fragments_image_id_idx
  on public.selected_fragments (image_id);

create index if not exists interaction_logs_created_at_idx
  on public.interaction_logs (created_at desc);

create index if not exists interaction_logs_event_type_idx
  on public.interaction_logs (event_type);

create index if not exists ai_generation_logs_session_created_at_idx
  on public.ai_generation_logs (session_id, created_at desc);

create index if not exists ai_generation_logs_fragment_created_at_idx
  on public.ai_generation_logs (fragment_id, created_at desc);

-- Storage bucket for crop images and generated TTS audio.
-- If the bucket already exists, this keeps it unchanged except public/file-size/mime settings.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fragment-crops',
  'fragment-crops',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.story_sessions enable row level security;
alter table public.selected_fragments enable row level security;
alter table public.interaction_logs enable row level security;
alter table public.ai_generation_logs enable row level security;

-- Browser clients can read public story history through the anon key.
-- Writes are expected to go through Next.js API routes using the service role key.
drop policy if exists "Public read story sessions" on public.story_sessions;
create policy "Public read story sessions"
on public.story_sessions
for select
to anon, authenticated
using (true);

drop policy if exists "Public read selected fragments" on public.selected_fragments;
create policy "Public read selected fragments"
on public.selected_fragments
for select
to anon, authenticated
using (true);

drop policy if exists "Public read fragment crop files" on storage.objects;
create policy "Public read fragment crop files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'fragment-crops');

-- If you later choose to upload directly from the browser, add scoped insert/update
-- storage policies. The current app uploads from server routes with service role.
