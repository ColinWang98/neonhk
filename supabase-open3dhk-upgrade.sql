begin;
alter table public.story_sessions drop constraint if exists story_sessions_provider_check;
alter table public.story_sessions add constraint story_sessions_provider_check
  check (provider in ('google', 'mapillary', 'open3dhk'));
commit;
