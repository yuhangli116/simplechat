CREATE OR REPLACE FUNCTION public.claim_daily_checkin()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_last DATE;
  v_prev_streak INTEGER;
  v_streak INTEGER;
  v_reward INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  v_today := (TIMEZONE('utc'::text, NOW()))::date;

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

  IF v_streak > 7 THEN
    v_streak := 1;
  END IF;

  v_reward := CASE v_streak
    WHEN 1 THEN 20000
    WHEN 2 THEN 20000
    WHEN 3 THEN 30000
    WHEN 4 THEN 30000
    WHEN 5 THEN 40000
    WHEN 6 THEN 40000
    WHEN 7 THEN 60000
    ELSE 0
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
    'streak', v_streak
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
    WHEN 'profile' THEN 20000
    WHEN 'share' THEN 30000
    WHEN 'ad' THEN 50000
    ELSE NULL
  END;

  IF v_reward IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '任务不存在');
  END IF;

  v_key := CASE p_task_id
    WHEN 'share' THEN p_task_id || ':' || v_today
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

