-- Security operations dashboard: IP blocks, richer health metrics and admin actions.

insert into public.admin_permissions (permission_key, description)
values
  ('security.read', '查看系统安全监控'),
  ('security.manage', '封禁或恢复用户/IP')
on conflict (permission_key) do update set description = excluded.description;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id
from public.admin_roles r
join public.admin_permissions p on p.permission_key in ('security.read', 'security.manage')
where r.role_key in ('super_admin', 'operations')
on conflict do nothing;

create table if not exists public.ip_risk_controls (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null unique,
  status text not null default 'blocked' check (status in ('normal', 'limited', 'blocked')),
  reason text,
  limits jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ip_risk_controls_status on public.ip_risk_controls(status, updated_at desc);

alter table public.ip_risk_controls enable row level security;

drop policy if exists "Admins can read ip risk controls" on public.ip_risk_controls;
create policy "Admins can read ip risk controls"
  on public.ip_risk_controls for select
  using (public.admin_has_permission('security.read', auth.uid()));

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require_permission('user.read');

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'today_registered_users', (select count(*) from public.profiles where created_at >= current_date),
      'total_users', (select count(*) from public.profiles),
      'active_users_7d', (select count(distinct user_id) from public.usage_logs where created_at >= now() - interval '7 days'),
      'today_ai_calls', (select count(*) from public.usage_logs where created_at >= current_date),
      'today_diamonds_consumed', (select coalesce(sum(coalesce(diamonds_consumed, total_deducted::integer, 0)), 0) from public.usage_logs where created_at >= current_date),
      'today_recharge_amount', (select coalesce(sum(amount_cny), 0) from public.recharge_logs where created_at >= current_date and status = 'success'),
      'total_recharge_amount', (select coalesce(sum(amount_cny), 0) from public.recharge_logs where status = 'success'),
      'pending_orders', (select count(*) from public.recharge_logs where status = 'pending'),
      'refund_orders', (select count(*) from public.recharge_logs where status = 'refunded'),
      'risk_users', (select count(*) from public.user_risk_controls where status in ('limited', 'blacklisted')),
      'blocked_ips', (select count(*) from public.ip_risk_controls where status in ('limited', 'blocked')),
      'pending_templates', (select count(*) from public.admin_template_reviews where review_status = 'pending'),
      'model_ranking', coalesce((
        select jsonb_agg(to_jsonb(m) order by m.diamonds desc)
        from (
          select model_key, coalesce(model_name, model_key) as model_name, count(*)::integer as calls,
            coalesce(sum(coalesce(diamonds_consumed, total_deducted::integer, 0)), 0)::integer as diamonds,
            coalesce(sum(estimated_cost_cny), 0)::numeric as cost_cny
          from public.usage_logs
          where created_at >= now() - interval '7 days'
          group by model_key, model_name
          order by diamonds desc
          limit 50
        ) m
      ), '[]'::jsonb),
      'recent_audit_logs', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from (select * from public.admin_audit_logs order by created_at desc limit 50) a
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require_permission('security.read');
  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'database_time', now(),
      'pending_orders_24h', (select count(*) from public.recharge_logs where status = 'pending' and created_at < now() - interval '30 minutes'),
      'high_cost_usage_24h', (select count(*) from public.usage_logs where created_at >= now() - interval '24 hours' and coalesce(diamonds_consumed, total_deducted::integer, 0) >= 5000),
      'failed_audits_24h', (select count(*) from public.admin_audit_logs where created_at >= now() - interval '24 hours' and result = 'failed'),
      'negative_balance_users', (select count(*) from public.profiles where coalesce(member_diamonds, 0) < 0 or coalesce(permanent_diamonds, 0) < 0),
      'risk_users', (select count(*) from public.user_risk_controls where status in ('limited', 'blacklisted')),
      'blocked_ips', (select count(*) from public.ip_risk_controls where status in ('limited', 'blocked')),
      'ai_calls_1h', (select count(*) from public.usage_logs where created_at >= now() - interval '1 hour'),
      'ai_diamonds_1h', (select coalesce(sum(coalesce(diamonds_consumed, total_deducted::integer, 0)), 0)::integer from public.usage_logs where created_at >= now() - interval '1 hour'),
      'revenue_24h', (select coalesce(sum(amount_cny), 0)::numeric from public.recharge_logs where created_at >= now() - interval '24 hours' and status = 'success'),
      'hourly_usage', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.hour)
        from (
          select date_trunc('hour', created_at) as hour,
            count(*)::integer as calls,
            coalesce(sum(coalesce(diamonds_consumed, total_deducted::integer, 0)), 0)::integer as diamonds
          from public.usage_logs
          where created_at >= now() - interval '24 hours'
          group by 1
          order by 1
        ) r
      ), '[]'::jsonb),
      'daily_revenue', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.day)
        from (
          select date_trunc('day', created_at)::date as day, coalesce(sum(amount_cny), 0)::numeric as amount
          from public.recharge_logs
          where created_at >= now() - interval '14 days' and status = 'success'
          group by 1
          order by 1
        ) r
      ), '[]'::jsonb),
      'top_users_24h', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.diamonds desc)
        from (
          select u.user_id, p.username, au.email,
            count(*)::integer as calls,
            coalesce(sum(coalesce(u.diamonds_consumed, u.total_deducted::integer, 0)), 0)::integer as diamonds,
            coalesce(urc.status, 'normal') as risk_status
          from public.usage_logs u
          left join public.profiles p on p.id = u.user_id
          left join auth.users au on au.id = u.user_id
          left join public.user_risk_controls urc on urc.user_id = u.user_id
          where u.created_at >= now() - interval '24 hours'
          group by u.user_id, p.username, au.email, urc.status
          order by diamonds desc
          limit 20
        ) r
      ), '[]'::jsonb),
      'top_ips_24h', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.events desc)
        from (
          select ip_address, count(*)::integer as events,
            count(*) filter (where result = 'failed')::integer as failed_events,
            max(created_at) as last_seen_at,
            coalesce((select status from public.ip_risk_controls i where i.ip_address = a.ip_address::text), 'normal') as status
          from public.admin_audit_logs a
          where created_at >= now() - interval '24 hours' and ip_address is not null
          group by ip_address
          order by events desc
          limit 20
        ) r
      ), '[]'::jsonb),
      'active_user_blocks', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.updated_at desc)
        from (
          select urc.*, p.username, au.email
          from public.user_risk_controls urc
          left join public.profiles p on p.id = urc.user_id
          left join auth.users au on au.id = urc.user_id
          where urc.status in ('limited', 'blacklisted')
          order by urc.updated_at desc
          limit 20
        ) r
      ), '[]'::jsonb),
      'active_ip_blocks', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.updated_at desc)
        from (
          select * from public.ip_risk_controls
          where status in ('limited', 'blocked')
          order by updated_at desc
          limit 20
        ) r
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_set_ip_risk_control(
  p_ip_address text,
  p_status text,
  p_reason text,
  p_limits jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := nullif(trim(p_ip_address), '');
  v_status text := coalesce(nullif(trim(p_status), ''), 'blocked');
  v_before jsonb;
  v_after jsonb;
begin
  perform public.admin_require_permission('security.manage');
  if v_ip is null then raise exception 'ip_address_required'; end if;
  if v_status not in ('normal', 'limited', 'blocked') then raise exception 'invalid_ip_risk_status'; end if;

  select to_jsonb(r) into v_before from public.ip_risk_controls r where r.ip_address = v_ip;

  insert into public.ip_risk_controls (ip_address, status, reason, limits, created_by, updated_by, updated_at)
  values (v_ip, v_status, p_reason, coalesce(p_limits, '{}'::jsonb), auth.uid(), auth.uid(), now())
  on conflict (ip_address) do update
    set status = excluded.status,
        reason = excluded.reason,
        limits = excluded.limits,
        updated_by = auth.uid(),
        updated_at = now();

  select to_jsonb(r) into v_after from public.ip_risk_controls r where r.ip_address = v_ip;
  perform public.admin_write_audit('security.ip_risk.set', 'ip', v_ip, p_reason, v_before, v_after);
  return jsonb_build_object('success', true, 'data', v_after);
end;
$$;

create or replace function public.admin_security_check(p_user_id uuid default null, p_ip_address text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.user_risk_controls%rowtype;
  v_ip public.ip_risk_controls%rowtype;
begin
  if p_user_id is not null then
    select * into v_user from public.user_risk_controls where user_id = p_user_id;
  end if;
  if p_ip_address is not null and trim(p_ip_address) <> '' then
    select * into v_ip from public.ip_risk_controls where ip_address = trim(p_ip_address);
  end if;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'user_status', coalesce(v_user.status, 'normal'),
      'user_reason', v_user.reason,
      'user_limits', coalesce(v_user.limits, '{}'::jsonb),
      'ip_status', coalesce(v_ip.status, 'normal'),
      'ip_reason', v_ip.reason,
      'ip_limits', coalesce(v_ip.limits, '{}'::jsonb),
      'blocked', coalesce(v_user.status = 'blacklisted', false) or coalesce(v_ip.status = 'blocked', false)
    )
  );
end;
$$;

grant execute on function public.admin_set_ip_risk_control(text, text, text, jsonb) to authenticated;
grant execute on function public.admin_security_check(uuid, text) to anon, authenticated;

create or replace function public.is_user_blacklisted(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_risk_controls urc
    where urc.user_id = p_user_id
      and urc.status = 'blacklisted'
  );
$$;

grant execute on function public.is_user_blacklisted(uuid) to authenticated;

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
      v_policy_name := 'Blocked users cannot access ' || replace(v_table::text, 'public.', '');
      execute format('drop policy if exists %I on %s', v_policy_name, v_table);
      execute format(
        'create policy %I on %s as restrictive for all to authenticated using (not public.is_user_blacklisted(auth.uid())) with check (not public.is_user_blacklisted(auth.uid()))',
        v_policy_name,
        v_table
      );
    end if;
  end loop;
end;
$$;

create index if not exists idx_recharge_logs_status_created_at on public.recharge_logs(status, created_at desc);
create index if not exists idx_usage_logs_created_user on public.usage_logs(created_at desc, user_id);
