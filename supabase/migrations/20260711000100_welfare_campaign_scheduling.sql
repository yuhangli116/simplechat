alter table public.welfare_tasks
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'welfare_tasks'
      and policyname = 'Anyone can view active scheduled welfare tasks'
  ) then
    create policy "Anyone can view active scheduled welfare tasks"
      on public.welfare_tasks for select
      using (
        is_active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now())
      );
  end if;
end $$;

create or replace function public.admin_list_welfare_tasks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rows jsonb;
begin
  perform public.admin_require_permission('template.review');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      *,
      case
        when is_active = false then 'offline'
        when starts_at is not null and starts_at > now() then 'scheduled'
        when ends_at is not null and ends_at <= now() then 'expired'
        else 'online'
      end as publication_status
    from public.welfare_tasks
    order by updated_at desc
    limit 200
  ) t;
  return jsonb_build_object('success', true, 'data', v_rows);
end;
$$;

create or replace function public.admin_upsert_welfare_task(
  p_id text,
  p_title text,
  p_description text,
  p_reward_diamonds integer,
  p_task_type text,
  p_daily_limit integer,
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.admin_require_permission('template.review');

  if trim(coalesce(p_id, '')) = '' then
    return jsonb_build_object('success', false, 'error', '活动 ID 不能为空');
  end if;
  if trim(coalesce(p_title, '')) = '' then
    return jsonb_build_object('success', false, 'error', '活动标题不能为空');
  end if;
  if coalesce(p_reward_diamonds, 0) <= 0 then
    return jsonb_build_object('success', false, 'error', '奖励钻石必须大于 0');
  end if;
  if coalesce(p_daily_limit, 0) < 1 then
    return jsonb_build_object('success', false, 'error', '领取次数必须至少为 1');
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    return jsonb_build_object('success', false, 'error', '下架时间必须晚于发布时间');
  end if;

  select to_jsonb(t) into v_before from public.welfare_tasks t where id = p_id;
  insert into public.welfare_tasks (
    id,
    title,
    description,
    reward_diamonds,
    task_type,
    daily_limit,
    is_active,
    starts_at,
    ends_at,
    updated_at
  )
  values (
    p_id,
    p_title,
    p_description,
    p_reward_diamonds,
    p_task_type,
    p_daily_limit,
    p_is_active,
    p_starts_at,
    p_ends_at,
    now()
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    reward_diamonds = excluded.reward_diamonds,
    task_type = excluded.task_type,
    daily_limit = excluded.daily_limit,
    is_active = excluded.is_active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now();
  select to_jsonb(t) into v_after from public.welfare_tasks t where t.id = p_id;
  perform public.admin_write_audit('welfare_task.upsert', 'welfare_task', p_id, p_reason, v_before, v_after);
  return jsonb_build_object('success', true, 'data', v_after);
end;
$$;

create or replace function public.admin_deactivate_welfare_task(
  p_id text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.admin_require_permission('template.review');
  select to_jsonb(t) into v_before from public.welfare_tasks t where id = p_id;
  if v_before is null then
    return jsonb_build_object('success', false, 'error', '活动不存在');
  end if;

  update public.welfare_tasks
  set is_active = false, ends_at = coalesce(ends_at, now()), updated_at = now()
  where id = p_id;

  select to_jsonb(t) into v_after from public.welfare_tasks t where t.id = p_id;
  perform public.admin_write_audit('welfare_task.deactivate', 'welfare_task', p_id, p_reason, v_before, v_after);
  return jsonb_build_object('success', true, 'data', v_after);
end;
$$;

create or replace function public.claim_welfare_task(p_task_id text)
returns json
language plpgsql
security definer
as $$
DECLARE
  v_user_id UUID;
  v_today TEXT;
  v_key TEXT;
  v_reward INTEGER;
  v_task_type TEXT;
  v_daily_limit INTEGER;
  v_tasks jsonb;
  v_has_usage BOOLEAN;
  v_has_template BOOLEAN;
  v_claims_today INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  v_today := (TIMEZONE('utc'::text, NOW()))::date::text;

  INSERT INTO public.user_welfare (user_id, completed_tasks)
  VALUES (v_user_id, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  select reward_diamonds, task_type, coalesce(daily_limit, 1)
  into v_reward, v_task_type, v_daily_limit
  from public.welfare_tasks
  where id = p_task_id
    and is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  limit 1;

  if v_reward is null then
    v_reward := case p_task_id
      when 'first_ai_call' then 10000
      when 'first_template_create' then 5000
      when 'ad' then 50000
      else null
    end;
    v_task_type := case p_task_id when 'ad' then 'daily' else 'once' end;
    v_daily_limit := 1;
  end if;

  IF v_reward IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '活动不存在或尚未上线');
  END IF;

  IF p_task_id = 'first_ai_call' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.usage_logs WHERE user_id = v_user_id LIMIT 1
    ) INTO v_has_usage;

    IF NOT v_has_usage THEN
      RETURN json_build_object('success', FALSE, 'error', '请先完成一次 AI 生成后再领取');
    END IF;
  END IF;

  IF p_task_id = 'first_template_create' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.community_templates WHERE creator_id = v_user_id LIMIT 1
    ) OR EXISTS(
      SELECT 1 FROM public.community_skill_templates WHERE creator_id = v_user_id LIMIT 1
    ) INTO v_has_template;

    IF NOT v_has_template THEN
      RETURN json_build_object('success', FALSE, 'error', '请先创建一个模板后再领取');
    END IF;
  END IF;

  v_key := CASE
    WHEN v_task_type = 'daily' THEN p_task_id || ':' || v_today
    ELSE p_task_id
  END;

  SELECT completed_tasks
  INTO v_tasks
  FROM public.user_welfare
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_task_type = 'daily' THEN
    select count(*)
    into v_claims_today
    from jsonb_array_elements_text(coalesce(v_tasks, '[]'::jsonb)) as completed(key)
    where completed.key like p_task_id || ':' || v_today || '%';

    IF v_claims_today >= greatest(v_daily_limit, 1) THEN
      RETURN json_build_object('success', FALSE, 'error', '今日领取次数已达上限');
    END IF;

    IF v_daily_limit > 1 THEN
      v_key := p_task_id || ':' || v_today || ':' || (v_claims_today + 1)::text;
    END IF;
  ELSIF v_tasks @> to_jsonb(ARRAY[v_key]::text[]) THEN
    RETURN json_build_object('success', FALSE, 'error', '活动奖励已领取');
  END IF;

  UPDATE public.user_welfare
  SET
    completed_tasks = completed_tasks || to_jsonb(ARRAY[v_key]::text[]),
    total_points_earned = total_points_earned + v_reward
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET
    permanent_diamonds = permanent_diamonds + v_reward,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = v_user_id;

  RETURN json_build_object('success', TRUE, 'reward', v_reward, 'task_id', p_task_id);
END;
$$;
