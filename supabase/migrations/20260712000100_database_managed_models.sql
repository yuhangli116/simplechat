alter table public.model_pricing
  add column if not exists api_type text not null default 'openai-compatible',
  add column if not exists api_key_env_var text,
  add column if not exists base_url text,
  add column if not exists base_url_env_var text,
  add column if not exists max_output_tokens integer,
  add column if not exists sort_order integer not null default 100,
  add column if not exists supports_stream boolean not null default true;

comment on column public.model_pricing.api_type is 'AI request adapter: openai-compatible or anthropic.';
comment on column public.model_pricing.api_key_env_var is 'Environment variable name for the API key. The secret value is not stored in database.';
comment on column public.model_pricing.base_url is 'Optional default base URL for OpenAI-compatible providers.';
comment on column public.model_pricing.base_url_env_var is 'Optional environment variable name that overrides base_url.';
comment on column public.model_pricing.max_output_tokens is 'Optional per-model max output token limit.';

update public.model_pricing
set
  api_type = case when provider = 'anthropic' then 'anthropic' else 'openai-compatible' end,
  api_key_env_var = case
    when provider = 'anthropic' then 'ANTHROPIC_API_KEY'
    when provider = 'openai' then 'OPENAI_API_KEY'
    when provider = 'deepseek' then 'DEEPSEEK_API_KEY'
    when provider = 'google' then 'OPENROUTER_API_KEY'
    when provider = 'openrouter' then 'OPENROUTER_API_KEY'
    else api_key_env_var
  end,
  base_url = case
    when provider = 'deepseek' then 'https://api.deepseek.com/v1'
    when provider = 'openai' then 'https://api.openai.com/v1'
    when provider = 'google' then 'https://openrouter.ai/api/v1'
    when provider = 'openrouter' then 'https://openrouter.ai/api/v1'
    else base_url
  end,
  base_url_env_var = case
    when provider = 'deepseek' then 'DEEPSEEK_BASE_URL'
    when provider = 'openai' then 'OPENAI_BASE_URL'
    when provider = 'google' then 'OPENROUTER_BASE_URL'
    when provider = 'openrouter' then 'OPENROUTER_BASE_URL'
    else base_url_env_var
  end,
  max_output_tokens = coalesce(max_output_tokens, case
    when provider = 'anthropic' then 16384
    when model_key in ('gpt-4-turbo') then 4096
    when model_key like 'gemini-%' then 8192
    else 10000
  end),
  sort_order = case model_key
    when 'deepseek-v4-flash' then 10
    when 'deepseek-v4-pro' then 20
    when 'deepseek-v3' then 30
    when 'claude-haiku' then 40
    when 'claude-sonnet' then 50
    when 'claude-opus' then 60
    when 'gpt-4-turbo' then 70
    when 'gpt-4o' then 80
    when 'gemini-2.5-pro' then 90
    when 'gemini-3.1-pro' then 100
    else sort_order
  end
where true;

drop function if exists public.admin_update_model_pricing(text, jsonb, text);

create or replace function public.admin_update_model_pricing(p_model_key text, p_values jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.admin_require_permission('model_pricing.update');
  select to_jsonb(m) into v_before from public.model_pricing m where model_key = p_model_key;

  if v_before is null then
    insert into public.model_pricing (
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
      is_active,
      api_type,
      api_key_env_var,
      base_url,
      base_url_env_var,
      max_output_tokens,
      sort_order,
      supports_stream
    )
    values (
      p_model_key,
      coalesce(p_values->>'model_name', p_model_key),
      coalesce((p_values->>'input_multiplier')::numeric, 1),
      coalesce((p_values->>'output_multiplier')::numeric, 1),
      coalesce((p_values->>'reasoning_multiplier')::numeric, 0),
      coalesce((p_values->>'cache_multiplier')::numeric, 0),
      coalesce(p_values->>'provider', 'openai'),
      coalesce(p_values->>'model_api_name', p_model_key),
      coalesce(array(select jsonb_array_elements_text(p_values->'tags')), '{}'::text[]),
      p_values->>'description',
      coalesce((p_values->>'is_active')::boolean, true),
      coalesce(p_values->>'api_type', 'openai-compatible'),
      nullif(p_values->>'api_key_env_var', ''),
      nullif(p_values->>'base_url', ''),
      nullif(p_values->>'base_url_env_var', ''),
      nullif(p_values->>'max_output_tokens', '')::integer,
      coalesce(nullif(p_values->>'sort_order', '')::integer, 100),
      coalesce((p_values->>'supports_stream')::boolean, true)
    );
  else
    update public.model_pricing
    set model_name = coalesce(p_values->>'model_name', model_name),
        input_multiplier = coalesce((p_values->>'input_multiplier')::numeric, input_multiplier),
        output_multiplier = coalesce((p_values->>'output_multiplier')::numeric, output_multiplier),
        reasoning_multiplier = coalesce((p_values->>'reasoning_multiplier')::numeric, reasoning_multiplier),
        cache_multiplier = coalesce((p_values->>'cache_multiplier')::numeric, cache_multiplier),
        provider = coalesce(p_values->>'provider', provider),
        model_api_name = coalesce(p_values->>'model_api_name', model_api_name),
        tags = case when p_values ? 'tags' then array(select jsonb_array_elements_text(p_values->'tags')) else tags end,
        description = coalesce(p_values->>'description', description),
        is_active = coalesce((p_values->>'is_active')::boolean, is_active),
        api_type = coalesce(p_values->>'api_type', api_type),
        api_key_env_var = coalesce(nullif(p_values->>'api_key_env_var', ''), api_key_env_var),
        base_url = coalesce(nullif(p_values->>'base_url', ''), base_url),
        base_url_env_var = coalesce(nullif(p_values->>'base_url_env_var', ''), base_url_env_var),
        max_output_tokens = coalesce(nullif(p_values->>'max_output_tokens', '')::integer, max_output_tokens),
        sort_order = coalesce(nullif(p_values->>'sort_order', '')::integer, sort_order),
        supports_stream = coalesce((p_values->>'supports_stream')::boolean, supports_stream),
        updated_at = now()
    where model_key = p_model_key;
  end if;

  select to_jsonb(m) into v_after from public.model_pricing m where m.model_key = p_model_key;

  insert into public.admin_config_change_logs (admin_id, config_area, target_key, before_value, after_value, reason)
  values (auth.uid(), 'model_pricing', p_model_key, v_before, v_after, p_reason);
  perform public.admin_write_audit('model_pricing.update', 'model_pricing', p_model_key, p_reason, v_before, v_after);
  return jsonb_build_object('success', true, 'data', v_after);
end;
$$;
