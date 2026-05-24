CREATE OR REPLACE FUNCTION public.claim_daily_checkin()
RETURNS JSON AS $$
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  v_today := (TIMEZONE('utc'::text, NOW()))::date;

  SELECT created_at
  INTO v_created_at
  FROM auth.users
  WHERE id = v_user_id;

  IF v_created_at IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '用户不存在');
  END IF;

  v_signup_date := (v_created_at AT TIME ZONE 'utc')::date;
  v_days_since_signup := (v_today - v_signup_date) + 1;

  IF v_days_since_signup > 7 THEN
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

  v_reward := CASE
    WHEN (v_streak % 7) = 0 THEN 20000
    ELSE 10000
  END;

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
    'days_remaining', GREATEST(0, 7 - v_days_since_signup)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.claim_welfare_task(
  p_task_id TEXT
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_today TEXT;
  v_key TEXT;
  v_reward INTEGER;
  v_tasks jsonb;
  v_has_usage BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  v_today := (TIMEZONE('utc'::text, NOW()))::date::text;

  INSERT INTO public.user_welfare (user_id, completed_tasks)
  VALUES (v_user_id, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  v_reward := CASE p_task_id
    WHEN 'first_ai_use' THEN 30000
    WHEN 'ad' THEN 50000
    ELSE NULL
  END;

  IF v_reward IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '任务不存在');
  END IF;

  IF p_task_id = 'first_ai_use' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.usage_logs WHERE user_id = v_user_id LIMIT 1
    ) INTO v_has_usage;

    IF NOT v_has_usage THEN
      RETURN json_build_object('success', FALSE, 'error', '请先完成一次 AI 生成后再领取');
    END IF;
  END IF;

  v_key := CASE p_task_id
    WHEN 'ad' THEN p_task_id || ':' || v_today
    ELSE p_task_id
  END;

  SELECT completed_tasks
  INTO v_tasks
  FROM public.user_welfare
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_tasks @> to_jsonb(ARRAY[v_key]::text[]) THEN
    RETURN json_build_object('success', FALSE, 'error', '任务已完成');
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

