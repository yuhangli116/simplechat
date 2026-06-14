-- Chapter version history for StoryEditor.
-- Keeps restorable chapter snapshots for 30 days.

create extension if not exists pgcrypto;

create table if not exists public.chapter_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  title text not null,
  content text not null,
  word_count integer not null default 0,
  source text not null default 'manual',
  prompt text,
  model text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.chapter_versions enable row level security;

drop policy if exists "Users can view own chapter versions" on public.chapter_versions;
create policy "Users can view own chapter versions"
  on public.chapter_versions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own chapter versions" on public.chapter_versions;
create policy "Users can insert own chapter versions"
  on public.chapter_versions
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.works w
      where w.id = work_id
        and w.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete own chapter versions" on public.chapter_versions;
create policy "Users can delete own chapter versions"
  on public.chapter_versions
  for delete
  using (auth.uid() = user_id);

create index if not exists idx_chapter_versions_user_chapter_created
  on public.chapter_versions(user_id, chapter_id, created_at desc);

create index if not exists idx_chapter_versions_expires_at
  on public.chapter_versions(expires_at);

create or replace function public.delete_expired_chapter_versions()
returns void
language plpgsql
as $$
begin
  delete from public.chapter_versions
  where expires_at < now();
end;
$$;
