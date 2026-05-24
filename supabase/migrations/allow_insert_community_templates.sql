alter table public.community_templates enable row level security;

drop policy if exists "Users can create templates" on public.community_templates;
create policy "Users can create templates"
  on public.community_templates
  for insert
  with check (auth.uid() is not null);

