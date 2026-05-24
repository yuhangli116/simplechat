alter table public.community_templates enable row level security;

delete from public.community_templates where coalesce(is_official, false) = false;

alter table public.community_templates
add column if not exists creator_id uuid references auth.users(id) on delete cascade;

drop policy if exists "Templates are viewable by everyone" on public.community_templates;
drop policy if exists "Users can create templates" on public.community_templates;

create policy "Templates are viewable by owner or official"
  on public.community_templates
  for select
  using (coalesce(is_official, false) = true or creator_id = auth.uid());

create policy "Users can create own templates"
  on public.community_templates
  for insert
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

  if (select count(*) from public.community_templates where creator_id = new.creator_id and coalesce(is_official, false) = false) >= 20 then
    raise exception 'template limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_template_limit on public.community_templates;
create trigger trg_enforce_template_limit
before insert on public.community_templates
for each row execute procedure public.enforce_template_limit();

