create table if not exists public.mind_maps (
  id text primary key,
  work_id uuid not null references public.works(id) on delete cascade,
  title text not null,
  editor_type text not null check (editor_type in ('outline', 'world', 'character', 'event')),
  is_default boolean not null default false,
  custom_icon text,
  content jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.mind_maps enable row level security;

create policy "Users can view mind maps of own works." on public.mind_maps
  for select using (
    exists (
      select 1 from public.works
      where public.works.id = public.mind_maps.work_id
      and public.works.user_id = auth.uid()
    )
  );

create policy "Users can insert mind maps to own works." on public.mind_maps
  for insert with check (
    exists (
      select 1 from public.works
      where public.works.id = public.mind_maps.work_id
      and public.works.user_id = auth.uid()
    )
  );

create policy "Users can update mind maps of own works." on public.mind_maps
  for update using (
    exists (
      select 1 from public.works
      where public.works.id = public.mind_maps.work_id
      and public.works.user_id = auth.uid()
    )
  );

create policy "Users can delete mind maps of own works." on public.mind_maps
  for delete using (
    exists (
      select 1 from public.works
      where public.works.id = public.mind_maps.work_id
      and public.works.user_id = auth.uid()
    )
  );
