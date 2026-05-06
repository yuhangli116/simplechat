-- Migration: Add Pricing Multipliers, Update Profiles default, Add Usage Logs schema

-- 1. Create pricing_multipliers table
CREATE TABLE IF NOT EXISTS public.pricing_multipliers (
    version VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    input_multiplier DECIMAL(10, 3) NOT NULL,
    output_multiplier DECIMAL(10, 3) NOT NULL,
    reasoning_multiplier DECIMAL(10, 3) DEFAULT 0,
    cache_hit_multiplier DECIMAL(10, 3) DEFAULT 0,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (version, model_name)
);

ALTER TABLE public.pricing_multipliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing multipliers are viewable by everyone" ON public.pricing_multipliers FOR SELECT USING (true);

-- Insert initial pricing multipliers (v3.2)
INSERT INTO public.pricing_multipliers (version, model_name, input_multiplier, output_multiplier, reasoning_multiplier, cache_hit_multiplier)
VALUES
('v3.2', 'DeepSeek-V3-0324', 1.000, 4.000, 0.000, 0.400),
('v3.2', 'DeepSeek-V3.1', 2.000, 6.000, 0.000, 0.800),
('v3.2', 'DeepSeek-V3.2', 1.000, 1.500, 0.000, 0.100),
('v3.2', 'DeepSeek-R1-0528', 2.000, 8.000, 8.000, 0.800),
('v3.2', 'Claude Sonnet 4.6', 10.500, 52.500, 0.000, 1.050),
('v3.2', 'Claude Opus 4.6', 17.500, 87.500, 0.000, 1.750),
('v3.2', 'Claude Haiku 4.5', 3.500, 17.500, 0.000, 0.350),
('v3.2', 'Gemini 2.5 Pro', 4.375, 35.000, 0.000, 0.000),
('v3.2', 'Gemini 3.1 Pro', 7.000, 42.000, 0.000, 0.700),
('v3.2', 'GPT-4.1', 7.000, 28.000, 0.000, 0.000),
('v3.2', 'GPT-5.4', 8.750, 35.000, 0.000, 0.000)
ON CONFLICT (version, model_name) DO NOTHING;


-- 2. Update profiles table default diamond_balance
ALTER TABLE public.profiles ALTER COLUMN diamond_balance SET DEFAULT 1000000;


-- 3. Create or update usage_logs table
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    cache_hit_tokens INTEGER DEFAULT 0,
    multiplier_version VARCHAR(50) NOT NULL,
    total_deducted DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own usage logs" ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_logs(user_id, created_at DESC);


-- 4. Update recharge_logs (Ensure paid_at exists)
ALTER TABLE public.recharge_logs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_recharge_id_status ON recharge_logs(id, status);


-- 5. RPC Function: Atomic Deduction
CREATE OR REPLACE FUNCTION public.deduct_diamonds(
    p_user_id UUID,
    p_model_name VARCHAR,
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_reasoning_tokens INTEGER,
    p_cache_hit_tokens INTEGER,
    p_multiplier_version VARCHAR
) RETURNS json AS $$
DECLARE
    v_total_cost DECIMAL(15, 2);
    v_affected_rows INTEGER;
    v_input_mult DECIMAL;
    v_output_mult DECIMAL;
    v_reason_mult DECIMAL;
    v_cache_mult DECIMAL;
BEGIN
    -- Fetch multipliers
    SELECT input_multiplier, output_multiplier, reasoning_multiplier, cache_hit_multiplier
    INTO v_input_mult, v_output_mult, v_reason_mult, v_cache_mult
    FROM public.pricing_multipliers
    WHERE version = p_multiplier_version AND model_name = p_model_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Multiplier not found for version % and model %', p_multiplier_version, p_model_name;
    END IF;

    -- Calculate total cost
    v_total_cost := (p_input_tokens * v_input_mult) + 
                    (p_output_tokens * v_output_mult) + 
                    (p_reasoning_tokens * v_reason_mult) + 
                    (p_cache_hit_tokens * v_cache_mult);

    -- Atomic deduction
    UPDATE public.profiles
    SET diamond_balance = diamond_balance - v_total_cost
    WHERE id = p_user_id AND diamond_balance >= v_total_cost;

    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;

    IF v_affected_rows = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance or user not found');
    END IF;

    -- Log usage
    INSERT INTO public.usage_logs (
        user_id, model_name, input_tokens, output_tokens, reasoning_tokens, cache_hit_tokens, multiplier_version, total_deducted
    ) VALUES (
        p_user_id, p_model_name, p_input_tokens, p_output_tokens, p_reasoning_tokens, p_cache_hit_tokens, p_multiplier_version, v_total_cost
    );

    RETURN json_build_object('success', true, 'total_cost', v_total_cost);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC Function: Idempotent Recharge
CREATE OR REPLACE FUNCTION public.process_recharge_callback(
    p_order_id UUID
) RETURNS json AS $$
DECLARE
    v_status VARCHAR;
    v_user_id UUID;
    v_diamonds_obtained INTEGER;
BEGIN
    -- Lock the row
    SELECT status, user_id, diamonds_obtained 
    INTO v_status, v_user_id, v_diamonds_obtained
    FROM public.recharge_logs 
    WHERE id = p_order_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_status != 'pending' THEN
        -- Idempotent return
        RETURN json_build_object('success', true, 'message', 'Already processed');
    END IF;

    -- Update order status
    UPDATE public.recharge_logs 
    SET status = 'success', paid_at = NOW() 
    WHERE id = p_order_id;

    -- Add diamonds to user
    UPDATE public.profiles 
    SET diamond_balance = diamond_balance + v_diamonds_obtained 
    WHERE id = v_user_id;

    RETURN json_build_object('success', true, 'diamonds_added', v_diamonds_obtained);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
