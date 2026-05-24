CREATE OR REPLACE FUNCTION public.dev_reset_welfare_state()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  SELECT email
  INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS DISTINCT FROM '1909232424@qq.com' THEN
    RETURN json_build_object('success', FALSE, 'error', '无权限');
  END IF;

  UPDATE public.user_welfare
  SET
    last_check_in_date = NULL,
    check_in_streak = 0,
    total_points_earned = 0,
    completed_tasks = '[]'::jsonb,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_welfare (user_id, completed_tasks)
    VALUES (v_user_id, '[]'::jsonb);
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

