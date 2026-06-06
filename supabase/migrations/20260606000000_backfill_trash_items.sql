-- Idempotent patch for environments missing public.trash_items
create extension if not exists pgcrypto;

create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_id text not null,
  type text not null,
  title text not null,
  content jsonb not null,
  deleted_at bigint not null,
  expires_at bigint not null,
  original_path text,
  parent_id text,
  work_name text,
  extra jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trash_items enable row level security;

drop policy if exists "Users can view their own trash items" on public.trash_items;
create policy "Users can view their own trash items"
  on public.trash_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own trash items" on public.trash_items;
create policy "Users can insert their own trash items"
  on public.trash_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own trash items" on public.trash_items;
create policy "Users can update their own trash items"
  on public.trash_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own trash items" on public.trash_items;
create policy "Users can delete their own trash items"
  on public.trash_items
  for delete
  using (auth.uid() = user_id);

create index if not exists idx_trash_items_user_id on public.trash_items(user_id);
create index if not exists idx_trash_items_expires_at on public.trash_items(expires_at);

create or replace function public.delete_expired_trash_items()
returns void
language plpgsql
as $$
begin
  delete from public.trash_items
  where expires_at < (extract(epoch from now()) * 1000)::bigint;
end;
$$;
