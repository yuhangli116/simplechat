alter table public.community_templates
add column if not exists views bigint;

update public.community_templates
set views = coalesce(views, 0)
where views is null;

alter table public.community_templates
alter column views set default 0;

alter table public.community_templates
alter column views set not null;

create or replace function public.increment_template_views(template_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.community_templates
  set views = coalesce(views, 0) + 1
  where id = template_id;
end;
$$;

