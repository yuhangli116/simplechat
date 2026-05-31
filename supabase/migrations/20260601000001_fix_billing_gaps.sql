BEGIN;

INSERT INTO public.system_config (key, value, description)
VALUES ('pricing_version', 'v4.1', '定价版本号')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = TIMEZONE('utc'::text, NOW());

UPDATE public.model_pricing
SET
  model_name = 'Gemini 2.5 Pro',
  model_api_name = 'google/gemini-2.5-pro',
  description = 'Google Gemini 2.5 Pro 路由',
  updated_at = TIMEZONE('utc'::text, NOW())
WHERE model_key = 'gemini-2.5-pro';

UPDATE public.model_pricing
SET
  model_name = 'Gemini 3.1 Pro',
  model_api_name = 'google/gemini-3.1-pro',
  description = 'Google Gemini 3.1 Pro 路由',
  updated_at = TIMEZONE('utc'::text, NOW())
WHERE model_key = 'gemini-3.1-pro';

ALTER TABLE public.usage_logs
  ALTER COLUMN expires_at SET DEFAULT (TIMEZONE('utc'::text, NOW()) + INTERVAL '30 days');

UPDATE public.usage_logs
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at < created_at + INTERVAL '30 days';

ALTER TABLE public.recharge_logs
  ALTER COLUMN expires_at SET DEFAULT (TIMEZONE('utc'::text, NOW()) + INTERVAL '365 days');

UPDATE public.recharge_logs
SET expires_at = created_at + INTERVAL '365 days'
WHERE expires_at < created_at + INTERVAL '365 days';

CREATE OR REPLACE FUNCTION public.cleanup_expired_diamond_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.usage_logs
  WHERE user_id = auth.uid()
    AND expires_at < TIMEZONE('utc'::text, NOW());

  DELETE FROM public.recharge_logs
  WHERE user_id = auth.uid()
    AND expires_at < TIMEZONE('utc'::text, NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_diamond_logs() TO authenticated;

COMMIT;

