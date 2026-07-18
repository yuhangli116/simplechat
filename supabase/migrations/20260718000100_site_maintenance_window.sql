create extension if not exists pgcrypto;

create table if not exists public.site_maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  singleton_key boolean not null default true unique check (singleton_key),
  enabled boolean not null default false,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  notice_title text not null default '系统维护升级通知',
  notice_text text not null default '本系统预计将在稍后开始进行系统维护升级，届时网站暂时不对外开放，请各位用户谅解。',
  lock_lead_minutes integer not null default 60 check (lock_lead_minutes >= 0),
  announce_lead_minutes integer not null default 2880 check (announce_lead_minutes >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_maintenance_windows enable row level security;
drop policy if exists "Site maintenance windows are readable by everyone" on public.site_maintenance_windows;
create policy "Site maintenance windows are readable by everyone"
  on public.site_maintenance_windows
  for select
  using (true);

grant select on public.site_maintenance_windows to anon, authenticated;

insert into public.site_maintenance_windows (singleton_key, enabled, notice_title, notice_text)
values (
  true,
  false,
  '系统维护升级通知',
  '本系统预计将在稍后开始进行系统维护升级，届时网站暂时不对外开放，请各位用户谅解。'
)
on conflict (singleton_key) do update set
  notice_title = excluded.notice_title,
  notice_text = excluded.notice_text,
  updated_at = now();

create or replace function public.get_site_maintenance_state()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_window public.site_maintenance_windows%rowtype;
  v_now timestamptz := now();
  v_announce_at timestamptz;
  v_lock_at timestamptz;
  v_phase text := 'normal';
begin
  select * into v_window
  from public.site_maintenance_windows
  order by updated_at desc
  limit 1;

  if found and coalesce(v_window.enabled, false) and v_window.planned_start_at is not null and v_window.planned_end_at is not null then
    v_announce_at := v_window.planned_start_at - make_interval(mins => coalesce(v_window.announce_lead_minutes, 2880));
    v_lock_at := v_window.planned_start_at - make_interval(mins => coalesce(v_window.lock_lead_minutes, 60));

    if v_now >= v_window.planned_end_at then
      v_phase := 'normal';
    elsif v_now >= v_lock_at then
      v_phase := 'locked';
    elsif v_now >= v_announce_at then
      v_phase := 'announced';
    else
      v_phase := 'normal';
    end if;
  else
    v_announce_at := null;
    v_lock_at := null;
  end if;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'enabled', coalesce(v_window.enabled, false),
      'phase', v_phase,
      'planned_start_at', v_window.planned_start_at,
      'planned_end_at', v_window.planned_end_at,
      'announce_at', v_announce_at,
      'lock_at', v_lock_at,
      'notice_title', coalesce(v_window.notice_title, '系统维护升级通知'),
      'notice_text', coalesce(v_window.notice_text, '本系统预计将在稍后开始进行系统维护升级，届时网站暂时不对外开放，请各位用户谅解。'),
      'lock_lead_minutes', coalesce(v_window.lock_lead_minutes, 60),
      'announce_lead_minutes', coalesce(v_window.announce_lead_minutes, 2880),
      'server_now', v_now
    )
  );
end;
$$;

create or replace function public.is_site_maintenance_locked()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_state jsonb;
begin
  select (public.get_site_maintenance_state() -> 'data') into v_state;
  return coalesce((v_state->>'phase') = 'locked', false);
end;
$$;

grant execute on function public.get_site_maintenance_state() to anon, authenticated;
grant execute on function public.is_site_maintenance_locked() to anon, authenticated;

do $$
declare
  v_table regclass;
  v_policy_name text;
begin
  foreach v_table in array array[
    to_regclass('public.profiles'),
    to_regclass('public.works'),
    to_regclass('public.chapters'),
    to_regclass('public.chapter_versions'),
    to_regclass('public.mind_maps'),
    to_regclass('public.trash_items'),
    to_regclass('public.usage_logs'),
    to_regclass('public.recharge_logs'),
    to_regclass('public.user_welfare'),
    to_regclass('public.template_likes'),
    to_regclass('public.user_templates'),
    to_regclass('public.skill_template_likes'),
    to_regclass('public.community_templates'),
    to_regclass('public.community_skill_templates')
  ] loop
    if v_table is not null then
      v_policy_name := 'Maintenance lock blocks ' || replace(v_table::text, 'public.', '');
      execute format('drop policy if exists %I on %s', v_policy_name, v_table);
      execute format(
        'create policy %I on %s as restrictive for all to public using (not public.is_site_maintenance_locked()) with check (not public.is_site_maintenance_locked())',
        v_policy_name,
        v_table
      );
    end if;
  end loop;
end;
$$;
