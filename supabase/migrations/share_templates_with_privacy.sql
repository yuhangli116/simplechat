alter table public.community_templates
add column if not exists is_public boolean default true;

alter table public.community_skill_templates
add column if not exists is_public boolean default true;

drop policy if exists "Templates are viewable by owner or official" on public.community_templates;
drop policy if exists "Users can create own templates" on public.community_templates;
drop policy if exists "Users can delete own templates" on public.community_templates;
drop policy if exists "Users can update own templates" on public.community_templates;

create policy "Templates are viewable by community"
  on public.community_templates
  for select
  using (
    coalesce(is_official, false) = true
    or coalesce(is_public, true) = true
    or creator_id = auth.uid()
  );

create policy "Users can create own templates"
  on public.community_templates
  for insert
  with check (creator_id = auth.uid() and coalesce(is_official, false) = false);

create policy "Users can update own templates"
  on public.community_templates
  for update
  using (creator_id = auth.uid() and coalesce(is_official, false) = false)
  with check (creator_id = auth.uid() and coalesce(is_official, false) = false);

create policy "Users can delete own templates"
  on public.community_templates
  for delete
  using (creator_id = auth.uid() and coalesce(is_official, false) = false);

create or replace function public.enforce_template_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.creator_id is null then
    raise exception 'creator_id is required';
  end if;

  if (select count(*) from public.community_templates where creator_id = new.creator_id and coalesce(is_official, false) = false) >= 10 then
    raise exception 'template limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_template_limit on public.community_templates;
create trigger trg_enforce_template_limit
before insert on public.community_templates
for each row execute procedure public.enforce_template_limit();

drop policy if exists "Skill templates are viewable by owner or official" on public.community_skill_templates;
drop policy if exists "Users can create own skill templates" on public.community_skill_templates;
drop policy if exists "Users can delete own skill templates" on public.community_skill_templates;
drop policy if exists "Users can update own skill templates" on public.community_skill_templates;

create policy "Skill templates are viewable by community"
  on public.community_skill_templates
  for select
  using (
    coalesce(is_official, false) = true
    or coalesce(is_public, true) = true
    or creator_id = auth.uid()
  );

create policy "Users can create own skill templates"
  on public.community_skill_templates
  for insert
  with check (creator_id = auth.uid() and coalesce(is_official, false) = false);

create policy "Users can update own skill templates"
  on public.community_skill_templates
  for update
  using (creator_id = auth.uid() and coalesce(is_official, false) = false)
  with check (creator_id = auth.uid() and coalesce(is_official, false) = false);

create policy "Users can delete own skill templates"
  on public.community_skill_templates
  for delete
  using (creator_id = auth.uid() and coalesce(is_official, false) = false);

create or replace function public.enforce_skill_template_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.creator_id is null then
    raise exception 'creator_id is required';
  end if;

  if (select count(*) from public.community_skill_templates where creator_id = new.creator_id and coalesce(is_official, false) = false) >= 20 then
    raise exception 'skill template limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_skill_template_limit on public.community_skill_templates;
create trigger trg_enforce_skill_template_limit
before insert on public.community_skill_templates
for each row execute procedure public.enforce_skill_template_limit();

