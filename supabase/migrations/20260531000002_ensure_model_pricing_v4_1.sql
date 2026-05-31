INSERT INTO public.system_config (key, value, description)
VALUES
  ('pricing_version', 'v4.1', '定价版本号'),
  ('diamonds_per_yuan', '250000', '1元=多少钻石')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = TIMEZONE('utc'::text, NOW());

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
  (
    'deepseek-v4-flash',
    'DeepSeek V4 Flash',
    0.5,
    1,
    1,
    0.01,
    'deepseek',
    'deepseek-v4-flash',
    ARRAY['推荐','高性价比'],
    '新一代轻量模型，速度快价格低，日常创作首选',
    TRUE
  ),
  (
    'deepseek-v4-pro',
    'DeepSeek V4 Pro',
    1.5,
    3,
    3,
    0.0125,
    'deepseek',
    'deepseek-v4-pro',
    ARRAY['旗舰'],
    '强推理能力，适合复杂剧情与长篇创作',
    TRUE
  ),
  (
    'deepseek-v3',
    'DeepSeek V3',
    1,
    4,
    0,
    0.25,
    'deepseek',
    'deepseek-chat',
    ARRAY['基准定价'],
    '基准模型（1x=V3输入价），V4系列已全面优于V3',
    TRUE
  ),
  (
    'claude-haiku',
    'Claude Haiku',
    3.5,
    17.5,
    0,
    0.35,
    'anthropic',
    'claude-haiku-4-5-20251001',
    ARRAY['快速','入门级'],
    'Claude入门款',
    TRUE
  ),
  (
    'claude-sonnet',
    'Claude Sonnet',
    10.5,
    52.5,
    0,
    1.05,
    'anthropic',
    'claude-sonnet-4-6',
    ARRAY['推荐','进阶'],
    '长篇创作首选',
    TRUE
  ),
  (
    'claude-opus',
    'Claude Opus',
    17.5,
    87.5,
    0,
    1.75,
    'anthropic',
    'claude-opus-4-7',
    ARRAY['旗舰','最强'],
    '追求极致质量',
    TRUE
  ),
  (
    'gpt-4-turbo',
    'GPT-4 Turbo',
    7,
    28,
    0,
    0,
    'openai',
    'gpt-4-turbo',
    ARRAY['OpenAI','经典'],
    'GPT-4经典款',
    TRUE
  ),
  (
    'gpt-4o',
    'GPT-4o',
    8.75,
    35,
    0,
    0,
    'openai',
    'gpt-4o',
    ARRAY['旗舰','OpenAI'],
    'OpenAI最新旗舰',
    TRUE
  ),
  (
    'gemini-2.5-pro',
    'Gemini 2.5 Pro',
    4.375,
    35,
    0,
    0,
    'google',
    'google/gemini-2.5-pro',
    ARRAY['Google','长上下文'],
    'Google Gemini 2.5 Pro 路由',
    TRUE
  ),
  (
    'gemini-3.1-pro',
    'Gemini 3.1 Pro',
    7,
    42,
    0,
    0.7,
    'google',
    'google/gemini-3.1-pro',
    ARRAY['旗舰','Google'],
    'Google Gemini 3.1 Pro 路由',
    TRUE
  )
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
  is_active = TRUE,
  updated_at = TIMEZONE('utc'::text, NOW());
