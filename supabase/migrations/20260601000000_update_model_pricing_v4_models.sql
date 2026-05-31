BEGIN;

DELETE FROM public.model_pricing
WHERE model_key IN ('deepseek-v3.2', 'deepseek-r1');

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
  description,
  is_active
)
VALUES
  ('deepseek-v4-flash', 'DeepSeek V4 Flash', 0.500, 1.000, 1.000, 0.010, 'deepseek', 'deepseek-v4-flash', ARRAY['推荐','高性价比'], '新一代轻量模型，速度快价格低，日常创作首选', TRUE),
  ('deepseek-v4-pro', 'DeepSeek V4 Pro', 1.500, 3.000, 3.000, 0.0125, 'deepseek', 'deepseek-v4-pro', ARRAY['旗舰'], '强推理能力，适合复杂剧情与长篇创作', TRUE),
  ('deepseek-v3', 'DeepSeek V3', 1.000, 4.000, 0.000, 0.250, 'deepseek', 'deepseek-chat', ARRAY['基准定价'], '基准模型（1x=V3输入价），V4系列已全面优于V3', TRUE)
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
  is_active = EXCLUDED.is_active,
  updated_at = TIMEZONE('utc'::text, NOW());

COMMIT;

