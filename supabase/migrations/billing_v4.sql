CREATE TABLE IF NOT EXISTS public.system_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System config is viewable by everyone" ON public.system_config;
CREATE POLICY "System config is viewable by everyone" ON public.system_config FOR SELECT USING (true);

INSERT INTO public.system_config (key, value, description)
VALUES
  ('diamonds_per_yuan', '250000', '1元=多少钻石'),
  ('new_user_bonus', '500000', '新用户赠送钻石'),
  ('pricing_version', 'v4.0', '定价版本号')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = TIMEZONE('utc'::text, NOW());

CREATE TABLE IF NOT EXISTS public.model_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_key VARCHAR(50) UNIQUE NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  input_multiplier DECIMAL(10, 3) NOT NULL,
  output_multiplier DECIMAL(10, 3) NOT NULL,
  reasoning_multiplier DECIMAL(10, 3) DEFAULT 0,
  cache_multiplier DECIMAL(10, 3) DEFAULT 0,
  provider VARCHAR(50) NOT NULL,
  model_api_name VARCHAR(100),
  tags TEXT[] DEFAULT '{}'::text[],
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Model pricing is viewable by everyone" ON public.model_pricing;
CREATE POLICY "Model pricing is viewable by everyone" ON public.model_pricing FOR SELECT USING (true);

INSERT INTO public.model_pricing (
  model_key,
  model_name,
  input_multiplier,
  output_multiplier,
  reasoning_multiplier,
  cache_multiplier,
  provider,
  model_api_name,
  tags,
  description
)
VALUES
  ('deepseek-v3', 'DeepSeek-V3', 1.000, 4.000, 0.000, 0.400, 'deepseek', 'deepseek-chat', ARRAY['推荐','高性价比'], '适合日常创作'),
  ('deepseek-v3.2', 'DeepSeek-V3.2', 1.000, 1.500, 0.000, 0.100, 'deepseek', 'deepseek-chat', ARRAY['特价','性价比之王'], '限时特价，输出成本降低60%'),
  ('deepseek-r1', 'DeepSeek-R1', 2.000, 8.000, 8.000, 0.800, 'deepseek', 'deepseek-reasoner', ARRAY['深度推理','思考模型'], '适合复杂情节设计'),
  ('claude-haiku', 'Claude Haiku', 3.500, 17.500, 0.000, 0.350, 'anthropic', 'claude-3-haiku-20240307', ARRAY['快速','入门级'], 'Claude入门款'),
  ('claude-sonnet', 'Claude Sonnet', 10.500, 52.500, 0.000, 1.050, 'anthropic', 'claude-3-5-sonnet-20240620', ARRAY['推荐','进阶'], '长篇创作首选'),
  ('claude-opus', 'Claude Opus', 17.500, 87.500, 0.000, 1.750, 'anthropic', 'claude-3-opus-20240229', ARRAY['旗舰','最强'], '追求极致质量'),
  ('gpt-4-turbo', 'GPT-4 Turbo', 7.000, 28.000, 0.000, 0.000, 'openai', 'gpt-4-turbo', ARRAY['OpenAI','经典'], 'GPT-4经典款'),
  ('gpt-4o', 'GPT-4o', 8.750, 35.000, 0.000, 0.000, 'openai', 'gpt-4o', ARRAY['旗舰','OpenAI'], 'OpenAI最新旗舰'),
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', 4.375, 35.000, 0.000, 0.000, 'google', 'google/gemini-1.5-flash', ARRAY['Google','长上下文'], '超长上下文支持'),
  ('gemini-3.1-pro', 'Gemini 3.1 Pro', 7.000, 42.000, 0.000, 0.700, 'google', 'google/gemini-1.5-pro', ARRAY['旗舰','Google'], 'Google旗舰模型')
ON CONFLICT (model_key) DO UPDATE SET
  model_name = EXCLUDED.model_name,
  input_multiplier = EXCLUDED.input_multiplier,
  output_multiplier = EXCLUDED.output_multiplier,
  reasoning_multiplier = EXCLUDED.reasoning_multiplier,
  cache_multiplier = EXCLUDED.cache_multiplier,
  provider = EXCLUDED.provider,
  model_api_name = EXCLUDED.model_api_name,
  tags = EXCLUDED.tags,
  description = EXCLUDED.description,
  updated_at = TIMEZONE('utc'::text, NOW());

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_diamonds INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permanent_diamonds INTEGER DEFAULT 500000;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_diamonds_consumed BIGINT DEFAULT 0;

UPDATE public.profiles
SET permanent_diamonds = diamond_balance
WHERE diamond_balance IS NOT NULL;

UPDATE public.profiles
SET membership_type = 'free'
WHERE membership_type IN ('pro', 'max');

ALTER TABLE public.profiles ALTER COLUMN membership_type SET DEFAULT 'free';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_membership_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_membership_type_check CHECK (membership_type IN ('free', 'monthly', 'quarterly', 'yearly'));

CREATE TABLE IF NOT EXISTS public.member_diamond_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  diamonds INTEGER NOT NULL,
  membership_type TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.member_diamond_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own member diamond logs" ON public.member_diamond_logs;
CREATE POLICY "Users can view their own member diamond logs" ON public.member_diamond_logs FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS model_key VARCHAR(50);
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS cache_tokens INTEGER DEFAULT 0;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS diamonds_consumed INTEGER;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS member_diamonds_used INTEGER DEFAULT 0;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS permanent_diamonds_used INTEGER DEFAULT 0;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS estimated_cost_cny DECIMAL(10, 6);

CREATE INDEX IF NOT EXISTS idx_usage_model_key ON public.usage_logs(model_key);

ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS order_type VARCHAR(20);
ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS product_key VARCHAR(50);
ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS product_name VARCHAR(100);
ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS diamonds_granted INTEGER;
ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS membership_days INTEGER;
ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

ALTER TABLE public.recharge_logs ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.recharge_logs DROP CONSTRAINT IF EXISTS recharge_logs_status_check;
ALTER TABLE public.recharge_logs ADD CONSTRAINT recharge_logs_status_check CHECK (status IN ('pending', 'success', 'failed', 'refunded'));

DROP POLICY IF EXISTS "Users can insert their own recharge logs" ON public.recharge_logs;

UPDATE public.recharge_logs
SET
  order_type = COALESCE(order_type, 'fuel_pack'),
  product_key = COALESCE(product_key, 'legacy'),
  product_name = COALESCE(product_name, '历史充值'),
  diamonds_granted = COALESCE(diamonds_granted, diamonds_obtained),
  status = COALESCE(status, 'success')
WHERE order_type IS NULL OR product_key IS NULL OR product_name IS NULL OR diamonds_granted IS NULL;

CREATE OR REPLACE FUNCTION public.update_profile(
  p_username TEXT,
  p_avatar_url TEXT
) RETURNS JSON AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  UPDATE public.profiles
  SET
    username = COALESCE(p_username, username),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = auth.uid();

  RETURN json_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.create_recharge_order(
  p_order_type VARCHAR,
  p_product_key VARCHAR
) RETURNS JSON AS $$
DECLARE
  v_amount DECIMAL(10, 2);
  v_diamonds INTEGER;
  v_days INTEGER;
  v_name VARCHAR(100);
  v_order_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  IF p_order_type = 'membership' THEN
    v_days := CASE p_product_key
      WHEN 'monthly' THEN 30
      WHEN 'quarterly' THEN 90
      WHEN 'yearly' THEN 365
      ELSE NULL
    END;

    v_amount := CASE p_product_key
      WHEN 'monthly' THEN 49.9
      WHEN 'quarterly' THEN 139.9
      WHEN 'yearly' THEN 579.9
      ELSE NULL
    END;

    v_diamonds := CASE p_product_key
      WHEN 'monthly' THEN 12000000
      WHEN 'quarterly' THEN 35000000
      WHEN 'yearly' THEN 150000000
      ELSE NULL
    END;

    v_name := CASE p_product_key
      WHEN 'monthly' THEN '月卡'
      WHEN 'quarterly' THEN '季卡'
      WHEN 'yearly' THEN '年卡'
      ELSE NULL
    END;
  ELSIF p_order_type = 'fuel_pack' THEN
    v_days := NULL;

    v_amount := CASE p_product_key
      WHEN 'starter' THEN 9.9
      WHEN 'standard' THEN 29.9
      WHEN 'value' THEN 99.9
      ELSE NULL
    END;

    v_diamonds := CASE p_product_key
      WHEN 'starter' THEN 2500000
      WHEN 'standard' THEN 8000000
      WHEN 'value' THEN 30000000
      ELSE NULL
    END;

    v_name := CASE p_product_key
      WHEN 'starter' THEN '体验包'
      WHEN 'standard' THEN '标准包'
      WHEN 'value' THEN '超值包'
      ELSE NULL
    END;
  ELSE
    RETURN json_build_object('success', FALSE, 'error', '订单类型不支持');
  END IF;

  IF v_amount IS NULL OR v_diamonds IS NULL OR v_name IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '商品不存在');
  END IF;

  INSERT INTO public.recharge_logs (
    user_id,
    amount_cny,
    diamonds_obtained,
    diamonds_granted,
    payment_method,
    status,
    order_type,
    product_key,
    product_name,
    membership_days
  )
  VALUES (
    auth.uid(),
    v_amount,
    v_diamonds,
    v_diamonds,
    'mock',
    'pending',
    p_order_type,
    p_product_key,
    v_name,
    v_days
  )
  RETURNING id INTO v_order_id;

  RETURN json_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'amount_cny', v_amount,
    'diamonds_granted', v_diamonds,
    'membership_days', v_days,
    'product_name', v_name,
    'order_type', p_order_type,
    'product_key', p_product_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.process_membership_purchase(
  p_order_id UUID
) RETURNS JSON AS $$
DECLARE
  v_order RECORD;
  v_current_expires TIMESTAMP WITH TIME ZONE;
  v_new_expires TIMESTAMP WITH TIME ZONE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  SELECT *
  INTO v_order
  FROM public.recharge_logs
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', '订单不存在');
  END IF;

  IF v_order.user_id != auth.uid() THEN
    RETURN json_build_object('success', FALSE, 'error', '无权限');
  END IF;

  IF v_order.order_type != 'membership' THEN
    RETURN json_build_object('success', FALSE, 'error', '订单类型不匹配');
  END IF;

  IF v_order.status != 'pending' THEN
    RETURN json_build_object('success', TRUE, 'message', 'Already processed');
  END IF;

  SELECT membership_expires_at
  INTO v_current_expires
  FROM public.profiles
  WHERE id = v_order.user_id
  FOR UPDATE;

  IF v_current_expires IS NULL OR v_current_expires < TIMEZONE('utc'::text, NOW()) THEN
    v_new_expires := TIMEZONE('utc'::text, NOW()) + (v_order.membership_days || ' days')::INTERVAL;
  ELSE
    v_new_expires := v_current_expires + (v_order.membership_days || ' days')::INTERVAL;
  END IF;

  UPDATE public.profiles
  SET
    membership_type = v_order.product_key,
    membership_expires_at = v_new_expires,
    member_diamonds = member_diamonds + v_order.diamonds_granted,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = v_order.user_id;

  INSERT INTO public.member_diamond_logs (user_id, diamonds, membership_type, expires_at)
  VALUES (v_order.user_id, v_order.diamonds_granted, v_order.product_key, v_new_expires);

  UPDATE public.recharge_logs
  SET
    status = 'success',
    paid_at = TIMEZONE('utc'::text, NOW()),
    transaction_id = COALESCE(transaction_id, 'mock-' || SUBSTRING(gen_random_uuid()::text, 1, 8))
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', TRUE,
    'membership_type', v_order.product_key,
    'expires_at', v_new_expires,
    'diamonds_added', v_order.diamonds_granted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.process_fuel_pack_purchase(
  p_order_id UUID
) RETURNS JSON AS $$
DECLARE
  v_order RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
  END IF;

  SELECT *
  INTO v_order
  FROM public.recharge_logs
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', '订单不存在');
  END IF;

  IF v_order.user_id != auth.uid() THEN
    RETURN json_build_object('success', FALSE, 'error', '无权限');
  END IF;

  IF v_order.order_type != 'fuel_pack' THEN
    RETURN json_build_object('success', FALSE, 'error', '订单类型不匹配');
  END IF;

  IF v_order.status != 'pending' THEN
    RETURN json_build_object('success', TRUE, 'message', 'Already processed');
  END IF;

  UPDATE public.profiles
  SET
    permanent_diamonds = permanent_diamonds + v_order.diamonds_granted,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = v_order.user_id;

  UPDATE public.recharge_logs
  SET
    status = 'success',
    paid_at = TIMEZONE('utc'::text, NOW()),
    transaction_id = COALESCE(transaction_id, 'mock-' || SUBSTRING(gen_random_uuid()::text, 1, 8))
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', TRUE,
    'diamonds_added', v_order.diamonds_granted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.deduct_diamonds_v4(
  p_user_id UUID,
  p_model_key VARCHAR,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_reasoning_tokens INTEGER DEFAULT 0,
  p_cache_tokens INTEGER DEFAULT 0
) RETURNS JSON AS $$
DECLARE
  v_pricing RECORD;
  v_diamonds_needed INTEGER;
  v_member_diamonds INTEGER;
  v_permanent_diamonds INTEGER;
  v_member_to_use INTEGER := 0;
  v_permanent_to_use INTEGER := 0;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_estimated_cost DECIMAL(10, 6);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', '未登录');
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
  INTO v_member_diamonds, v_permanent_diamonds, v_expires_at
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', '用户不存在');
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < TIMEZONE('utc'::text, NOW()) THEN
    UPDATE public.profiles
    SET
      membership_type = 'free',
      membership_expires_at = NULL,
      member_diamonds = 0,
      updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_user_id;

    v_member_diamonds := 0;
  END IF;

  v_diamonds_needed := CEIL(
    p_input_tokens * v_pricing.input_multiplier +
    p_output_tokens * v_pricing.output_multiplier +
    p_reasoning_tokens * v_pricing.reasoning_multiplier +
    p_cache_tokens * v_pricing.cache_multiplier
  );

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

  v_estimated_cost := (v_diamonds_needed / 250000.0) * 0.5;

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
    estimated_cost_cny
  )
  VALUES (
    p_user_id,
    v_pricing.model_name,
    p_model_key,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_cache_tokens,
    p_cache_tokens,
    'v4.0',
    v_diamonds_needed,
    v_diamonds_needed,
    v_member_to_use,
    v_permanent_to_use,
    v_estimated_cost
  );

  RETURN json_build_object(
    'success', TRUE,
    'diamonds_consumed', v_diamonds_needed,
    'member_diamonds_remaining', v_member_diamonds - v_member_to_use,
    'permanent_diamonds_remaining', v_permanent_diamonds - v_permanent_to_use,
    'total_remaining', (v_member_diamonds - v_member_to_use) + (v_permanent_diamonds - v_permanent_to_use)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

