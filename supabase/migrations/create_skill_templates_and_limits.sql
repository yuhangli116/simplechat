create table if not exists public.community_skill_templates (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  category text not null,
  prompt_text text not null,
  author_name text default '用户',
  creator_id uuid references auth.users(id) on delete cascade,
  cover_color text,
  likes integer default 0,
  uses integer default 0,
  is_official boolean default false,
  tags text[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.community_skill_templates enable row level security;

drop policy if exists "Skill templates are viewable by everyone" on public.community_skill_templates;
drop policy if exists "Users can create own skill templates" on public.community_skill_templates;
drop policy if exists "Users can delete own skill templates" on public.community_skill_templates;

create policy "Skill templates are viewable by owner or official"
  on public.community_skill_templates
  for select
  using (coalesce(is_official, false) = true or creator_id = auth.uid());

create policy "Users can create own skill templates"
  on public.community_skill_templates
  for insert
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

