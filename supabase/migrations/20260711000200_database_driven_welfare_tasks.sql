alter table public.welfare_tasks
  add column if not exists video_path text,
  add column if not exists eligible_days integer,
  add column if not exists reward_schedule jsonb;

drop function if exists public.admin_upsert_welfare_task(
  text,
  text,
  text,
  integer,
  text,
  integer,
  boolean,
  timestamptz,
  timestamptz,
  text
);

drop function if exists public.admin_upsert_welfare_task(
  text,
  text,
  text,
  integer,
  text,
  integer,
  text,
  boolean,
  timestamptz,
  timestamptz,
  text
);

create or replace function public.admin_upsert_welfare_task(
  p_id text,
  p_title text,
  p_description text,
  p_reward_diamonds integer,
  p_task_type text,
  p_daily_limit integer,
  p_video_path text,
  p_eligible_days integer,
  p_reward_schedule integer[],
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
  if p_task_type = 'ad' and trim(coalesce(p_video_path, '')) = '' then
    return jsonb_build_object('success', false, 'error', '观看视频活动需要填写视频保存路径');
  end if;
  if p_task_type = 'newbie_checkin' then
    if coalesce(p_eligible_days, 0) < 1 then
      return jsonb_build_object('success', false, 'error', '新手有效天数必须至少为 1');
    end if;
    if coalesce(array_length(p_reward_schedule, 1), 0) < p_eligible_days then
      return jsonb_build_object('success', false, 'error', '每日奖励配置数量不能少于有效天数');
    end if;
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
    video_path,
    eligible_days,
    reward_schedule,
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
    nullif(trim(coalesce(p_video_path, '')), ''),
    p_eligible_days,
    case when p_reward_schedule is null then null else to_jsonb(p_reward_schedule) end,
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
    video_path = excluded.video_path,
    eligible_days = excluded.eligible_days,
    reward_schedule = excluded.reward_schedule,
    is_active = excluded.is_active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now();
  select to_jsonb(t) into v_after from public.welfare_tasks t where t.id = p_id;
  perform public.admin_write_audit('welfare_task.upsert', 'welfare_task', p_id, p_reason, v_before, v_after);
  return jsonb_build_object('success', true, 'data', v_after);
end;
$$;

insert into public.welfare_tasks (
  id,
  title,
  description,
  reward_diamonds,
  task_type,
  daily_limit,
  video_path,
  eligible_days,
  reward_schedule,
  is_active,
  starts_at,
  ends_at,
  updated_at
) values
  (
    'first_ai_call',
    '完成首次 AI 生成',
    '完成一次 AI 生成后即可领取',
    10000,
    'once',
    1,
    null,
    null,
    null,
    true,
    null,
    null,
    now()
  ),
  (
    'first_template_create',
    '完成首次创建模板',
    '创建作品模板或提示词模板后即可领取',
    5000,
    'once',
    1,
    null,
    null,
    null,
    true,
    null,
    null,
    now()
  ),
  (
    'ad',
    '观看激励视频',
    '观看80%即可领取',
    50000,
    'ad',
    1,
    '/video/guanggao.MP4',
    null,
    null,
    true,
    null,
    null,
    now()
  ),
  (
    'newbie_checkin',
    '新手签到',
    '注册 7 天内，每日签到可领取丰厚钻石奖励',
    10000,
    'newbie_checkin',
    1,
    null,
    7,
    '[10000,10000,10000,10000,10000,10000,20000]'::jsonb,
    true,
    null,
    null,
    now()
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  reward_diamonds = excluded.reward_diamonds,
  task_type = excluded.task_type,
  daily_limit = excluded.daily_limit,
  video_path = excluded.video_path,
  eligible_days = excluded.eligible_days,
  reward_schedule = excluded.reward_schedule,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.claim_daily_checkin()
returns json
language plpgsql
security definer
as $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_last DATE;
  v_prev_streak INTEGER;
  v_streak INTEGER;
  v_reward INTEGER;
  v_created_at TIMESTAMP WITH TIME ZONE;
  v_signup_date DATE;
  v_days_since_signup INTEGER;
  v_title TEXT;
  v_eligible_days INTEGER;
  v_reward_schedule jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  v_today := (TIMEZONE('utc'::text, NOW()))::date;

  SELECT
    title,
    coalesce(eligible_days, 7),
    coalesce(reward_schedule, '[10000,10000,10000,10000,10000,10000,20000]'::jsonb)
  INTO v_title, v_eligible_days, v_reward_schedule
  FROM public.welfare_tasks
  WHERE id = 'newbie_checkin'
    AND task_type = 'newbie_checkin'
    AND is_active = true
    AND (starts_at is null or starts_at <= now())
    AND (ends_at is null or ends_at > now())
  LIMIT 1;

  IF v_title IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '新手签到活动未上线');
  END IF;

  SELECT created_at
  INTO v_created_at
  FROM auth.users
  WHERE id = v_user_id;

  IF v_created_at IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '用户不存在');
  END IF;

  v_signup_date := (v_created_at AT TIME ZONE 'utc')::date;
  v_days_since_signup := (v_today - v_signup_date) + 1;

  IF v_days_since_signup > v_eligible_days THEN
    RETURN json_build_object('success', FALSE, 'error', '新手签到已结束');
  END IF;

  INSERT INTO public.user_welfare (user_id, completed_tasks)
  VALUES (v_user_id, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_check_in_date, check_in_streak
  INTO v_last, v_prev_streak
  FROM public.user_welfare
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_last = v_today THEN
    RETURN json_build_object('success', FALSE, 'error', '今日已签到');
  END IF;

  IF v_last = (v_today - 1) THEN
    v_streak := v_prev_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  v_reward := coalesce((v_reward_schedule ->> (least(v_streak, v_eligible_days) - 1))::integer, 0);
  IF v_reward <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', '新手签到奖励配置无效');
  END IF;

  UPDATE public.user_welfare
  SET
    last_check_in_date = v_today,
    check_in_streak = v_streak,
    total_points_earned = total_points_earned + v_reward
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET
    permanent_diamonds = permanent_diamonds + v_reward,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = v_user_id;

  RETURN json_build_object(
    'success', TRUE,
    'reward', v_reward,
    'streak', v_streak,
    'days_since_signup', v_days_since_signup,
    'days_remaining', GREATEST(0, v_eligible_days - v_days_since_signup)
  );
END;
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
    WHEN v_task_type in ('daily', 'ad') THEN p_task_id || ':' || v_today
    ELSE p_task_id
  END;

  SELECT completed_tasks
  INTO v_tasks
  FROM public.user_welfare
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_task_type in ('daily', 'ad') THEN
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
