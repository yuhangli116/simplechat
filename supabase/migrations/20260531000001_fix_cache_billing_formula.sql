DROP FUNCTION IF EXISTS public.deduct_diamonds_v4(UUID, VARCHAR, INTEGER, INTEGER, INTEGER, INTEGER, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.deduct_diamonds_v4(
  p_user_id UUID,
  p_model_key VARCHAR,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_reasoning_tokens INTEGER DEFAULT 0,
  p_cache_tokens INTEGER DEFAULT 0,
  p_billing_group_id UUID DEFAULT NULL,
  p_billing_step TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_pricing RECORD;
  v_pricing_version TEXT;
  v_diamonds_per_yuan NUMERIC;
  v_diamonds_needed INTEGER;
  v_member_diamonds INTEGER;
  v_permanent_diamonds INTEGER;
  v_member_to_use INTEGER := 0;
  v_permanent_to_use INTEGER := 0;
  v_log_expires_at TIMESTAMP WITH TIME ZONE;
  v_estimated_cost DECIMAL(10, 6);
  v_input_diamonds INTEGER := 0;
  v_output_diamonds INTEGER := 0;
  v_reasoning_diamonds INTEGER := 0;
  v_cache_diamonds INTEGER := 0;
  v_cache_hit_tokens INTEGER := 0;
  v_non_cached_input_tokens INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  SELECT value
  INTO v_pricing_version
  FROM public.system_config
  WHERE key = 'pricing_version';

  IF v_pricing_version IS NULL OR v_pricing_version = '' THEN
    v_pricing_version := 'v4.1';
  END IF;

  SELECT value::NUMERIC
  INTO v_diamonds_per_yuan
  FROM public.system_config
  WHERE key = 'diamonds_per_yuan';

  IF v_diamonds_per_yuan IS NULL OR v_diamonds_per_yuan <= 0 THEN
    v_diamonds_per_yuan := 250000;
  END IF;

  IF p_user_id != auth.uid() THEN
    RETURN json_build_object('success', FALSE, 'error', '无权限');
  END IF;

  SELECT *
  INTO v_pricing
  FROM public.model_pricing
  WHERE model_key = p_model_key AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', '模型不存在');
  END IF;

  SELECT member_diamonds, permanent_diamonds, membership_expires_at
  INTO v_member_diamonds, v_permanent_diamonds, v_log_expires_at
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', '用户不存在');
  END IF;

  IF v_log_expires_at IS NOT NULL AND v_log_expires_at < TIMEZONE('utc'::text, NOW()) THEN
    UPDATE public.profiles
    SET
      membership_type = 'free',
      membership_expires_at = NULL,
      member_diamonds = 0,
      updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_user_id;

    v_member_diamonds := 0;
  END IF;

  v_cache_hit_tokens := LEAST(GREATEST(COALESCE(p_cache_tokens, 0), 0), GREATEST(COALESCE(p_input_tokens, 0), 0));
  v_non_cached_input_tokens := GREATEST(COALESCE(p_input_tokens, 0), 0) - v_cache_hit_tokens;

  v_input_diamonds := CEIL(v_non_cached_input_tokens * v_pricing.input_multiplier);
  v_output_diamonds := CEIL(GREATEST(COALESCE(p_output_tokens, 0), 0) * v_pricing.output_multiplier);
  v_reasoning_diamonds := CEIL(GREATEST(COALESCE(p_reasoning_tokens, 0), 0) * v_pricing.reasoning_multiplier);
  v_cache_diamonds := CEIL(v_cache_hit_tokens * v_pricing.cache_multiplier);
  v_diamonds_needed := v_input_diamonds + v_output_diamonds + v_reasoning_diamonds + v_cache_diamonds;

  IF v_member_diamonds + v_permanent_diamonds < v_diamonds_needed THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', '钻石不足',
      'needed', v_diamonds_needed,
      'available', v_member_diamonds + v_permanent_diamonds
    );
  END IF;

  IF v_member_diamonds >= v_diamonds_needed THEN
    v_member_to_use := v_diamonds_needed;
    v_permanent_to_use := 0;
  ELSE
    v_member_to_use := v_member_diamonds;
    v_permanent_to_use := v_diamonds_needed - v_member_diamonds;
  END IF;

  UPDATE public.profiles
  SET
    member_diamonds = member_diamonds - v_member_to_use,
    permanent_diamonds = permanent_diamonds - v_permanent_to_use,
    total_diamonds_consumed = total_diamonds_consumed + v_diamonds_needed,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_user_id;

  v_estimated_cost := (v_diamonds_needed::NUMERIC / v_diamonds_per_yuan);
  v_log_expires_at := TIMEZONE('utc'::text, NOW()) + INTERVAL '30 days';

  INSERT INTO public.usage_logs (
    user_id,
    model_name,
    model_key,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    cache_hit_tokens,
    cache_tokens,
    multiplier_version,
    total_deducted,
    diamonds_consumed,
    member_diamonds_used,
    permanent_diamonds_used,
    estimated_cost_cny,
    input_diamonds,
    output_diamonds,
    reasoning_diamonds,
    cache_diamonds,
    expires_at,
    billing_group_id,
    billing_step
  )
  VALUES (
    p_user_id,
    v_pricing.model_name,
    p_model_key,
    GREATEST(COALESCE(p_input_tokens, 0), 0),
    GREATEST(COALESCE(p_output_tokens, 0), 0),
    GREATEST(COALESCE(p_reasoning_tokens, 0), 0),
    v_cache_hit_tokens,
    v_cache_hit_tokens,
    v_pricing_version,
    v_diamonds_needed,
    v_diamonds_needed,
    v_member_to_use,
    v_permanent_to_use,
    v_estimated_cost,
    v_input_diamonds,
    v_output_diamonds,
    v_reasoning_diamonds,
    v_cache_diamonds,
    v_log_expires_at,
    p_billing_group_id,
    p_billing_step
  );

  DELETE FROM public.usage_logs
  WHERE user_id = p_user_id
    AND expires_at < TIMEZONE('utc'::text, NOW());

  RETURN json_build_object(
    'success', TRUE,
    'diamonds_consumed', v_diamonds_needed,
    'input_diamonds', v_input_diamonds,
    'output_diamonds', v_output_diamonds,
    'reasoning_diamonds', v_reasoning_diamonds,
    'cache_diamonds', v_cache_diamonds,
    'member_diamonds_remaining', v_member_diamonds - v_member_to_use,
    'permanent_diamonds_remaining', v_permanent_diamonds - v_permanent_to_use,
    'total_remaining', (v_member_diamonds - v_member_to_use) + (v_permanent_diamonds - v_permanent_to_use)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.deduct_diamonds_v4(UUID, VARCHAR, INTEGER, INTEGER, INTEGER, INTEGER, UUID, TEXT) TO authenticated;
