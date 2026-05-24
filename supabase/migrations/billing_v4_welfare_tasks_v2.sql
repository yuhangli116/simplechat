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
  v_has_templates BOOLEAN;
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
    WHEN 'first_ai_call' THEN 10000
    WHEN 'first_template_create' THEN 5000
    WHEN 'ad' THEN 50000
    ELSE NULL
  END;

  IF v_reward IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '任务不存在');
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
    )
    OR EXISTS(
      SELECT 1 FROM public.community_skill_templates WHERE creator_id = v_user_id LIMIT 1
    )
    INTO v_has_templates;

    IF NOT v_has_templates THEN
      RETURN json_build_object('success', FALSE, 'error', '请先创建一个作品模板或提示词模板后再领取');
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

