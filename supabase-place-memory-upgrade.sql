-- Spatial Memory RAG V1
-- Run this in Supabase SQL Editor after the base setup.
-- Embedding dimension is 384, matching Supabase Edge Function gte-small on this project.
-- If an earlier 1536-dimension test column exists, this resets only the vector column.

create extension if not exists vector;

create table if not exists public.place_memory_items (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  session_id uuid references public.story_sessions(id) on delete set null,
  fragment_id uuid references public.selected_fragments(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  source text not null,
  source_tier text,
  claim_type text,
  allowed_use text not null default 'background_only',
  visibility_status text,
  confidence double precision not null default 0.5,
  label text,
  category text,
  text text not null,
  url text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(384),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.place_memory_items drop column if exists embedding;
alter table public.place_memory_items add column embedding vector(384);

create or replace function public.set_place_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists place_memory_items_set_updated_at on public.place_memory_items;
create trigger place_memory_items_set_updated_at
before update on public.place_memory_items
for each row execute function public.set_place_memory_updated_at();

create index if not exists place_memory_items_location_idx
  on public.place_memory_items (lat, lng);

create index if not exists place_memory_items_source_idx
  on public.place_memory_items (source, source_tier, allowed_use);

create index if not exists place_memory_items_expires_at_idx
  on public.place_memory_items (expires_at);

create index if not exists place_memory_items_embedding_idx
  on public.place_memory_items
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.place_memory_distance_meters(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(
    least(
      1,
      sqrt(
        power(sin(radians((lat2 - lat1) / 2)), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians((lng2 - lng1) / 2)), 2)
      )
    )
  );
$$;

create or replace function public.match_place_memory_items(
  query_embedding vector(384),
  match_lat double precision,
  match_lng double precision,
  radius_meters double precision default 300,
  match_count integer default 8
)
returns table (
  id uuid,
  session_id uuid,
  fragment_id uuid,
  lat double precision,
  lng double precision,
  heading double precision,
  source text,
  source_tier text,
  claim_type text,
  allowed_use text,
  visibility_status text,
  confidence double precision,
  label text,
  category text,
  text text,
  url text,
  published_at timestamptz,
  metadata jsonb,
  expires_at timestamptz,
  similarity double precision,
  distance_meters double precision
)
language sql
stable
as $$
  select
    item.id,
    item.session_id,
    item.fragment_id,
    item.lat,
    item.lng,
    item.heading,
    item.source,
    item.source_tier,
    item.claim_type,
    item.allowed_use,
    item.visibility_status,
    item.confidence,
    item.label,
    item.category,
    item.text,
    item.url,
    item.published_at,
    item.metadata,
    item.expires_at,
    1 - (item.embedding <=> query_embedding) as similarity,
    public.place_memory_distance_meters(match_lat, match_lng, item.lat, item.lng) as distance_meters
  from public.place_memory_items item
  where item.embedding is not null
    and (item.expires_at is null or item.expires_at > now())
    and item.lat between match_lat - (radius_meters / 111320.0) and match_lat + (radius_meters / 111320.0)
    and item.lng between match_lng - (radius_meters / (111320.0 * greatest(0.2, cos(radians(match_lat)))))
                    and match_lng + (radius_meters / (111320.0 * greatest(0.2, cos(radians(match_lat)))))
    and public.place_memory_distance_meters(match_lat, match_lng, item.lat, item.lng) <= radius_meters
  order by
    (1 - (item.embedding <=> query_embedding)) desc,
    item.confidence desc,
    public.place_memory_distance_meters(match_lat, match_lng, item.lat, item.lng) asc
  limit match_count;
$$;

alter table public.place_memory_items enable row level security;

drop policy if exists "Public read place memory items" on public.place_memory_items;
create policy "Public read place memory items"
on public.place_memory_items
for select
to anon, authenticated
using (true);

-- Writes should use SUPABASE_SERVICE_ROLE_KEY from server-side API routes.
