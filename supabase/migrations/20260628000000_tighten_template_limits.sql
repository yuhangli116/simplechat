-- Tighten community creation limits without deleting existing user content.
-- Existing rows above the new limit remain readable/editable; new inserts are blocked.

create or replace function public.enforce_template_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.creator_id is null then
    raise exception 'creator_id is required';
  end if;

  if (
    select count(*)
    from public.community_templates
    where creator_id = new.creator_id
      and coalesce(is_official, false) = false
  ) >= 5 then
    raise exception 'template limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_template_limit on public.community_templates;
create trigger trg_enforce_template_limit
before insert on public.community_templates
for each row execute procedure public.enforce_template_limit();

create or replace function public.enforce_skill_template_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.creator_id is null then
    raise exception 'creator_id is required';
  end if;

  if (
    select count(*)
    from public.community_skill_templates
    where creator_id = new.creator_id
      and coalesce(is_official, false) = false
  ) >= 10 then
    raise exception 'skill template limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_skill_template_limit on public.community_skill_templates;
create trigger trg_enforce_skill_template_limit
before insert on public.community_skill_templates
for each row execute procedure public.enforce_skill_template_limit();

