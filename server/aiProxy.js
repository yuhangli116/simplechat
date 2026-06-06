import { createClient } from '@supabase/supabase-js';

const normalizeApiKey = (apiKey) => apiKey?.trim().replace(/^['"`]|['"`]$/g, '');

const getEnvValue = (...names) => {
  for (const name of names) {
    // 先试不带前缀的
    let value = process.env[name];
    if (value) {
      return normalizeApiKey(value);
    }
    // 再试带 VITE_ 前缀的
    const viteName = `VITE_${name}`;
    value = process.env[viteName];
    if (value) {
      return normalizeApiKey(value);
    }
  }
  return '';
};

const MAX_OUTPUT_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS || 10000);
const SINGLE_CALL_DIAMOND_CAP = Number(process.env.AI_SINGLE_CALL_DIAMOND_CAP || 1000000);
const PRECHECK_OUTPUT_TOKENS = Number(process.env.AI_PRECHECK_OUTPUT_TOKENS || 900);
const PRECHECK_REASONING_TOKENS = Number(process.env.AI_PRECHECK_REASONING_TOKENS || 600);
const ANOMALY_HOURLY_DIAMONDS = Number(process.env.AI_ANOMALY_HOURLY_DIAMONDS || 800000);
const ANOMALY_LOOKBACK_DAYS = Number(process.env.AI_ANOMALY_LOOKBACK_DAYS || 7);
// 注意：不要在模块加载时读取 SUPABASE_URL/ANON_KEY，改成在 getSupabaseClientForRequest 里实时读取
const SUMMARIZE_FETCH_TIMEOUT_MS = Number(process.env.AI_SUMMARIZE_FETCH_TIMEOUT_MS || 60000);

const estimateTokens = (text = '') => {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;

  const cjkChars = (normalized.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const latinWords = (normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) || []).length;
  const numbers = (normalized.match(/\d+(?:\.\d+)?/g) || []).length;
  const punctuation = (normalized.match(/[^\p{L}\p{N}\s]/gu) || []).length;
  const whitespace = (normalized.match(/\s+/g) || []).length;

  return Math.max(
    1,
    Math.ceil(
      cjkChars * 1.15 +
        latinWords * 1.3 +
        numbers * 0.6 +
        punctuation * 0.35 +
        whitespace * 0.1
    )
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryFetchError = (error) => {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  if (error instanceof TypeError && String(error.message || '').toLowerCase().includes('fetch')) return true;
  return false;
};

const getModelRegistry = () => ({
  'deepseek-v4-flash': {
    type: 'openai-compatible',
    provider: 'deepseek',
    modelName: 'deepseek-v4-flash',
    maxOutputTokens: 10000,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: getEnvValue('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY'),
  },
  'deepseek-v4-pro': {
    type: 'openai-compatible',
    provider: 'deepseek',
    modelName: 'deepseek-v4-pro',
    maxOutputTokens: 10000,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: getEnvValue('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY'),
  },
  'deepseek-v3': {
    type: 'openai-compatible',
    provider: 'deepseek',
    modelName: 'deepseek-chat',
    maxOutputTokens: 8000,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: getEnvValue('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY'),
  },
  'claude-sonnet': {
    type: 'anthropic',
    provider: 'anthropic',
    modelName: 'claude-sonnet-4-6',
    maxOutputTokens: 16384,
    apiKey: getEnvValue('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'),
  },
  'claude-opus': {
    type: 'anthropic',
    provider: 'anthropic',
    modelName: 'claude-opus-4-7',
    maxOutputTokens: 16384,
    apiKey: getEnvValue('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'),
  },
  'claude-haiku': {
    type: 'anthropic',
    provider: 'anthropic',
    modelName: 'claude-haiku-4-5-20251001',
    maxOutputTokens: 16384,
    apiKey: getEnvValue('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'),
  },
  'gemini-2.5-pro': {
    type: 'openai-compatible',
    provider: 'openrouter',
    modelName: 'google/gemini-2.5-pro',
    maxOutputTokens: 8192,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: getEnvValue('OPENROUTER_API_KEY', 'VITE_OPENROUTER_API_KEY'),
    extraHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': process.env.APP_NAME || 'simplechat',
    },
  },
  'gemini-3.1-pro': {
    type: 'openai-compatible',
    provider: 'openrouter',
    modelName: 'google/gemini-3.1-pro',
    maxOutputTokens: 8192,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: getEnvValue('OPENROUTER_API_KEY', 'VITE_OPENROUTER_API_KEY'),
    extraHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': process.env.APP_NAME || 'simplechat',
    },
  },
  'gpt-4-turbo': {
    type: 'openai-compatible',
    provider: 'openai',
    modelName: 'gpt-4-turbo',
    maxOutputTokens: 4096,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: getEnvValue('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'),
  },
  'gpt-4o': {
    type: 'openai-compatible',
    provider: 'openai',
    modelName: 'gpt-4o',
    maxOutputTokens: 16384,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: getEnvValue('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'),
  },
});

const normalizeUsage = (usage) => ({
  input_tokens:
    usage?.prompt_tokens ??
    usage?.input_tokens ??
    usage?.promptTokens ??
    usage?.inputTokens ??
    0,
  output_tokens:
    usage?.completion_tokens ??
    usage?.output_tokens ??
    usage?.completionTokens ??
    usage?.outputTokens ??
    0,
  reasoning_tokens:
    usage?.reasoning_tokens ??
    usage?.thinking_tokens ??
    usage?.completion_tokens_details?.reasoning_tokens ??
    usage?.completion_tokens_details?.thinking_tokens ??
    usage?.output_tokens_details?.reasoning_tokens ??
    usage?.output_tokens_details?.thinking_tokens ??
    0,
  cache_hit_tokens:
    usage?.prompt_tokens_details?.cached_tokens ??
    usage?.input_tokens_details?.cached_tokens ??
    usage?.cached_tokens ??
    usage?.cached_context_tokens ??
    usage?.cache_read_input_tokens ??
    0,
});

const extractMessageContent = (content) => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item?.type === 'text') {
          return item.text || '';
        }
        return '';
      })
      .join('');
  }

  return '';
};

const getRequestAccessToken = (headers = {}) => {
  const raw = headers.authorization || headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

export const getRequestContext = (req) => {
  const headers = req?.headers || {};
  const forwardedFor = headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req?.socket?.remoteAddress || '').split(',')[0].trim();

  return {
    accessToken: getRequestAccessToken(headers),
    ip,
    userAgent: headers['user-agent'] || '',
  };
};

const getSupabaseClientForRequest = (accessToken) => {
  // 每次调用都实时读取，确保 vite.config.ts 里已经加载了 env
  const SUPABASE_URL_RUNTIME = getEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const SUPABASE_ANON_KEY_RUNTIME = getEnvValue('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  
  console.log('[debug getSupabaseClientForRequest] SUPABASE_URL:', SUPABASE_URL_RUNTIME ? '✅ 已加载' : '❌ 未加载', SUPABASE_URL_RUNTIME?.slice(0, 30) || '');
  console.log('[debug getSupabaseClientForRequest] SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY_RUNTIME ? '✅ 已加载' : '❌ 未加载', SUPABASE_ANON_KEY_RUNTIME?.slice(0, 20) || '');
  console.log('[debug getSupabaseClientForRequest] accessToken:', accessToken ? '✅ 已提供' : '❌ 未提供', accessToken?.slice(0, 20) || '');

  if (!SUPABASE_URL_RUNTIME || !SUPABASE_ANON_KEY_RUNTIME || !accessToken) {
    console.log('[debug getSupabaseClientForRequest] ❌ 缺少必要参数，返回 null');
    return null;
  }

  return createClient(SUPABASE_URL_RUNTIME, SUPABASE_ANON_KEY_RUNTIME, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
};

const getAuthenticatedUser = async (supabase, accessToken) => {
  console.log('[debug getAuthenticatedUser] 开始验证用户');
  
  // 方案一：先用 supabase.auth.getUser 验证
  const { data, error } = await supabase.auth.getUser({ jwt: accessToken });
  
  console.log('[debug getAuthenticatedUser] getUser 结果:', {
    error: error?.message || '无错误',
    user: data?.user ? '✅' : '❌',
    userId: data?.user?.id || '无'
  });

  if (!error && data?.user) {
    console.log('[debug getAuthenticatedUser] getUser 验证成功 ✅');
    return data.user;
  }

  // 方案二：如果 getUser 失败，尝试直接解析 JWT（备用方案，确保不阻塞）
  console.log('[debug getAuthenticatedUser] getUser 失败，尝试解析 JWT');
  const safeBase64UrlDecode = (str) => {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
    return Buffer.from(base64 + pad, 'base64');
  };
  const parseJwt = (token) => {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payload = JSON.parse(safeBase64UrlDecode(parts[1]).toString('utf8'));
      console.log('[debug getAuthenticatedUser] JWT payload:', payload);
      return payload;
    } catch (e) {
      console.error('[debug getAuthenticatedUser] JWT 解析失败:', e);
      return null;
    }
  };

  const payload = parseJwt(accessToken);
  if (!payload?.sub) {
    console.log('[debug getAuthenticatedUser] JWT 解析也失败 ❌');
    return null;
  }
  console.log('[debug getAuthenticatedUser] JWT 解析成功 ✅，userId:', payload.sub);
  return { id: payload.sub };
};

const getModelPricingFromDb = async (supabase, modelKey) => {
  console.log('[debug getModelPricingFromDb] 开始读取模型定价，modelKey:', modelKey);

  const { data, error } = await supabase
    .from('model_pricing')
    .select(
      'model_key, model_name, input_multiplier, output_multiplier, reasoning_multiplier, cache_multiplier, provider, model_api_name'
    )
    .eq('model_key', modelKey)
    .eq('is_active', true)
    .single();

  console.log('[debug getModelPricingFromDb] 读取结果:', { 
    error: error?.message || null, 
    data: data ? { model_key: data.model_key, input_multiplier: data.input_multiplier } : null 
  });

  if (error || !data) {
    const code = error?.code ? ` (${error.code})` : '';
    const detail = error?.message ? `：${error.message}` : '';
    console.error('[debug getModelPricingFromDb] ❌ 读取失败:', error?.message || '无数据');
    throw new Error(`模型定价配置不存在(${modelKey})${code}${detail}`);
  }

  return {
    ...data,
    input_multiplier: Number(data.input_multiplier ?? 0),
    output_multiplier: Number(data.output_multiplier ?? 0),
    reasoning_multiplier: Number(data.reasoning_multiplier ?? 0),
    cache_multiplier: Number(data.cache_multiplier ?? 0),
  };
};

const getEffectiveBalance = async (supabase, userId) => {
  console.log('[debug getEffectiveBalance] 开始读取用户余额，userId:', userId);
  
  const { data, error } = await supabase
    .from('profiles')
    .select('member_diamonds, permanent_diamonds, membership_type, membership_expires_at')
    .eq('id', userId)
    .single();

  console.log('[debug getEffectiveBalance] 读取结果:', { 
    error: error ? error.message : null, 
    data: data ? { ...data, member_diamonds: data.member_diamonds, permanent_diamonds: data.permanent_diamonds } : null 
  });

  if (error || !data) {
    console.error('[debug getEffectiveBalance] ❌ 读取失败:', error?.message || '无数据');
    throw new Error('读取用户余额失败');
  }

  const expiresAt = data.membership_expires_at ? new Date(data.membership_expires_at).getTime() : 0;
  const expired = Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now();
  const memberDiamonds = expired ? 0 : Number(data.member_diamonds ?? 0);
  const permanentDiamonds = Number(data.permanent_diamonds ?? 0);

  return {
    expired,
    memberDiamonds,
    permanentDiamonds,
    totalRemaining: memberDiamonds + permanentDiamonds,
    membershipType: expired ? 'free' : data.membership_type ?? 'free',
    membershipExpiresAt: expired ? null : data.membership_expires_at ?? null,
  };
};

const calculateDiamondCost = (pricing, usage) => {
  const inputTokens = Math.max(0, Number(usage?.input_tokens ?? 0));
  const rawCacheHitTokens = Math.max(0, Number(usage?.cache_hit_tokens ?? 0));
  const cacheHitTokens = Math.min(inputTokens, rawCacheHitTokens);
  const nonCachedInputTokens = Math.max(0, inputTokens - cacheHitTokens);

  return Math.ceil(
    nonCachedInputTokens * pricing.input_multiplier +
      cacheHitTokens * pricing.cache_multiplier +
      Math.max(0, Number(usage?.output_tokens ?? 0)) * pricing.output_multiplier +
      Math.max(0, Number(usage?.reasoning_tokens ?? 0)) * pricing.reasoning_multiplier
  );
};

const estimateUsageForPrecheck = ({ kind, prompt = '', context = '', pricing }) => {
  const inputTokens =
    kind === 'summarize'
      ? estimateTokens(context)
      : estimateTokens(`${context || ''}\n${prompt || ''}`);

  const outputTokens =
    kind === 'summarize'
      ? Math.min(Math.max(Math.ceil(inputTokens * 0.18), 120), PRECHECK_OUTPUT_TOKENS)
      : Math.min(Math.max(Math.ceil(inputTokens * 0.3), 240), PRECHECK_OUTPUT_TOKENS);

  const reasoningTokens =
    pricing.reasoning_multiplier > 0
      ? Math.min(Math.ceil(outputTokens * 0.5), PRECHECK_REASONING_TOKENS)
      : 0;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    cache_hit_tokens: 0,
  };
};

const createUserFacingError = (message, meta = {}) => {
  const error = new Error(message);
  error.isUserFacing = true;
  error.meta = meta;
  return error;
};

const ensureBudgetPreflight = async ({ supabase, userId, model, kind, prompt, context }) => {
  const balance = await getEffectiveBalance(supabase, userId);
  let pricing;
  try {
    pricing = await getModelPricingFromDb(supabase, model);
  } catch (error) {
    let host = '';
    try {
      host = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : '';
    } catch (_) {
      host = '';
    }

    throw createUserFacingError(
      `${error?.message || `模型定价配置不存在(${model})`}。请确认已在当前 Supabase 项目${host ? ` (${host})` : ''} 执行模型定价迁移，并确保 model_pricing 中该模型 is_active=true。`,
      {
        available: balance.totalRemaining,
      }
    );
  }

  const estimatedUsage = estimateUsageForPrecheck({ kind, prompt, context, pricing });
  const estimatedDiamonds = calculateDiamondCost(pricing, estimatedUsage);

  if (estimatedDiamonds > SINGLE_CALL_DIAMOND_CAP) {
    throw createUserFacingError(
      `本次请求预估需要 ${estimatedDiamonds} 钻石，超过单次上限 ${SINGLE_CALL_DIAMOND_CAP}，请缩短上下文或拆分生成。`,
      { estimatedRequired: estimatedDiamonds, available: balance.totalRemaining }
    );
  }

  if (balance.totalRemaining < estimatedDiamonds) {
    throw createUserFacingError(
      `钻石不足（预计至少需要 ${estimatedDiamonds}，当前 ${balance.totalRemaining}），请充值或缩短输入后重试。`,
      { estimatedRequired: estimatedDiamonds, available: balance.totalRemaining }
    );
  }

  return { pricing, balance, estimatedUsage, estimatedDiamonds };
};

const detectAbnormalUsage = async ({ supabase, userId, latestDiamonds }) => {
  const since = new Date(Date.now() - ANOMALY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('usage_logs')
    .select('diamonds_consumed, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return undefined;

  const totalRecent = data.reduce((sum, row) => sum + Number(row.diamonds_consumed ?? 0), 0);
  const lastHour = data.reduce((sum, row) => {
    const createdAt = new Date(row.created_at).getTime();
    return createdAt >= oneHourAgo ? sum + Number(row.diamonds_consumed ?? 0) : sum;
  }, 0);
  const dailyAverage = totalRecent / Math.max(1, ANOMALY_LOOKBACK_DAYS);
  const projectedHourTotal = lastHour;

  if (projectedHourTotal >= Math.max(ANOMALY_HOURLY_DIAMONDS, dailyAverage * 3)) {
    return `风险提醒：你最近 1 小时已消耗 ${projectedHourTotal.toLocaleString()} 钻石，显著高于平时，请确认当前模型与上下文长度是否符合预期。`;
  }

  if (latestDiamonds >= SINGLE_CALL_DIAMOND_CAP * 0.5) {
    return `风险提醒：本次调用消耗 ${latestDiamonds.toLocaleString()} 钻石，已接近单次上限，请留意模型选择与上下文长度。`;
  }

  return undefined;
};

const deductUsageOnServer = async ({ supabase, userId, model, usage, billingGroupId, billingStep }) => {
  const { data, error } = await supabase.rpc('deduct_diamonds_v4', {
    p_user_id: userId,
    p_model_key: model,
    p_input_tokens: usage.input_tokens ?? 0,
    p_output_tokens: usage.output_tokens ?? 0,
    p_reasoning_tokens: usage.reasoning_tokens ?? 0,
    p_cache_tokens: usage.cache_hit_tokens ?? 0,
    p_billing_group_id: billingGroupId ?? null,
    p_billing_step: billingStep ?? null,
  });

  if (error) {
    throw new Error(error.message || '扣费失败');
  }

  if (!data?.success) {
    throw createUserFacingError(
      data?.error === '钻石不足'
        ? `钻石不足（需要 ${data?.needed ?? '-'}，当前 ${data?.available ?? '-'}），请充值后继续使用。`
        : data?.error || '扣费失败，请稍后重试',
      {
        estimatedRequired: data?.needed,
        available: data?.available,
      }
    );
  }

  return data;
};

const requestOpenAICompatible = async ({ config, messages, temperature }) => {
  if (!config.apiKey) {
    throw new Error(`${config.provider} API Key is missing`);
  }

  const url = `${config.baseURL}/chat/completions`;
  const requestBody = {
    model: config.modelName,
    messages,
    temperature,
    max_tokens: config.maxOutputTokens || MAX_OUTPUT_TOKENS,
    stream: false,
  };

  let lastError;
  const maxAttempts = Math.max(1, Number(config.retries || 0) + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = config.timeoutMs ? new AbortController() : null;
    const timeoutId =
      controller && config.timeoutMs ? setTimeout(() => controller.abort(), config.timeoutMs) : null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          ...(config.extraHeaders || {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller?.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          data?.error?.message ||
          data?.message ||
          `${response.status} ${response.statusText}`;
        throw new Error(message);
      }

      return {
        content: data?.choices?.[0]?.message?.content || '',
        usage: normalizeUsage(data?.usage),
        raw: data,
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1 && shouldRetryFetchError(error)) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      break;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const suffix = config.provider ? ` (${config.provider})` : '';
  throw new Error(`${lastError?.message || 'fetch failed'}${suffix}`);
};

const requestAnthropic = async ({ config, messages, temperature }) => {
  if (!config.apiKey) {
    throw new Error('Anthropic API Key is missing');
  }

  const systemMessage = messages.find((message) => message.role === 'system')?.content || '';
  const userMessages = messages.filter((message) => message.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelName,
      max_tokens: config.maxOutputTokens || Number(process.env.ANTHROPIC_MAX_TOKENS || MAX_OUTPUT_TOKENS),
      temperature,
      system: systemMessage,
      messages: userMessages,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return {
    content: extractMessageContent(data?.content),
    usage: normalizeUsage(data?.usage),
    raw: data,
  };
};

const requestModel = async ({ model, messages, temperature = 0.7, runtimeConfig }) => {
  const modelRegistry = getModelRegistry();
  const config = modelRegistry[model];

  if (!config) {
    throw new Error(`Model ${model} not supported`);
  }

  const finalConfig = runtimeConfig ? { ...config, ...runtimeConfig } : config;

  if (finalConfig.type === 'anthropic') {
    return requestAnthropic({ config: finalConfig, messages, temperature });
  }

  return requestOpenAICompatible({ config: finalConfig, messages, temperature });
};

const executeAiTask = async ({ kind, prompt = '', context = '', model, messages, temperature, requestContext, billingGroupId, billingStep }) => {
  console.log('[debug executeAiTask] 开始执行，requestContext:', {
    ...requestContext,
    accessToken: requestContext?.accessToken ? requestContext.accessToken.slice(0, 20) + '...' : null
  });

  const accessToken = requestContext?.accessToken || '';
  const supabase = getSupabaseClientForRequest(accessToken);
  if (!supabase) {
    console.log('[debug executeAiTask] ❌ getSupabaseClientForRequest 返回 null');
    return { content: '', error: '请先登录后再使用 AI 创作功能。' };
  }

  const user = await getAuthenticatedUser(supabase, accessToken);
  if (!user) {
    console.log('[debug executeAiTask] ❌ getAuthenticatedUser 返回 null');
    return { content: '', error: '请先登录后再使用 AI 创作功能。' };
  }

  console.log('[debug executeAiTask] ✅ 用户验证通过，userId:', user.id);

  let finalModel = model;
  if (finalModel === undefined) {
    finalModel = 'deepseek-v4-flash';
  }

  if (typeof finalModel !== 'string' || finalModel.trim() === '') {
    return { content: '', error: '请先选择一个具体的模型。' };
  }
  finalModel = finalModel.trim();

  try {
    const preflight = await ensureBudgetPreflight({
      supabase,
      userId: user.id,
      model: finalModel,
      kind,
      prompt,
      context,
    });

    const result = await requestModel({
      model: finalModel,
      messages,
      temperature,
      runtimeConfig:
        kind === 'summarize'
          ? {
              retries: 1,
              timeoutMs: SUMMARIZE_FETCH_TIMEOUT_MS,
            }
          : undefined,
    });

    const usage = {
      input_tokens:
        result.usage?.input_tokens ??
        preflight.estimatedUsage.input_tokens,
      output_tokens:
        result.usage?.output_tokens ??
        estimateTokens(result.content),
      reasoning_tokens:
        result.usage?.reasoning_tokens ??
        preflight.estimatedUsage.reasoning_tokens,
      cache_hit_tokens:
        result.usage?.cache_hit_tokens ??
        0,
    };

    const actualDiamonds = calculateDiamondCost(preflight.pricing, usage);
    if (actualDiamonds > SINGLE_CALL_DIAMOND_CAP) {
      return {
        content: '',
        error: `本次请求实际消耗已达到 ${actualDiamonds} 钻石，超过单次上限 ${SINGLE_CALL_DIAMOND_CAP}，系统已阻止扣费，请缩短上下文后重试。`,
        billing: {
          estimatedRequired: preflight.estimatedDiamonds,
          available: preflight.balance.totalRemaining,
        },
      };
    }

    const billing = await deductUsageOnServer({
      supabase,
      userId: user.id,
      model: finalModel,
      usage,
      billingGroupId,
      billingStep: billingStep || kind,
    });

    const warning = await detectAbnormalUsage({
      supabase,
      userId: user.id,
      latestDiamonds: billing?.diamonds_consumed ?? actualDiamonds,
    });

    return {
      content: result.content,
      usage: {
        ...usage,
        total_cost: billing?.diamonds_consumed ?? actualDiamonds,
      },
      billing: {
        totalRemaining: billing?.total_remaining,
        warning,
        estimatedRequired: preflight.estimatedDiamonds,
        available: preflight.balance.totalRemaining,
      },
    };
  } catch (error) {
    if (error?.isUserFacing) {
      return {
        content: '',
        error: error.message,
        billing: {
          warning: error?.meta?.warning,
          estimatedRequired: error?.meta?.estimatedRequired,
          available: error?.meta?.available,
        },
      };
    }
    throw error;
  }
};

export const generateTextServer = async ({ prompt, model = 'deepseek-v4-flash', context, billingGroupId }, requestContext = {}) => {
  const messages = [
    {
      role: 'system',
      content:
        '你是一个专业的小说续写助手。请严格参考以下背景设定与前文剧情（Context），确保新生成的情节或节点符合既有的人物性格与剧情发展逻辑，同时满足用户的具体要求（Task）。如果要求生成思维导图子节点，请返回 JSON。注意：单次输出请控制在 5000 字以内。如果内容较长，请在合适的段落处自然收尾并提示用户可继续生成。',
    },
    {
      role: 'user',
      content: `Context: ${context || '无'}\n\nTask: ${prompt}`,
    },
  ];

  return executeAiTask({
    kind: 'generate',
    prompt,
    context,
    model,
    messages,
    temperature: 0.7,
    requestContext,
    billingGroupId,
  });
};

export const summarizeContextServer = async ({ context, model = 'deepseek-v4-flash', billingGroupId }, requestContext = {}) => {
  const messages = [
    {
      role: 'system',
      content:
        '你是一个专业的剧情与设定提炼助手。你的目标是为“下一次续写/补全”提供高密度、可直接使用的背景摘要。\n\n硬性要求：\n- 总长度控制在 300–450 个中文字符左右（宁可更短，不要更长）。\n- 输出必须是纯文本，不要 Markdown 标题、不要代码块、不要引用原文句子。\n- 只保留对续写有用的信息：人物状态、关键关系、动机、已发生事件的因果链、当前局面、未解决冲突/悬念。\n- 删除细枝末节、重复描写、修辞性句子、无关对话。\n- 不要补写新剧情，不要臆测未给出的设定。\n\n输出格式（严格遵循）：\n1) 一句话总览（不超过 40 字）\n2) 要点（最多 12 条，每条不超过 30 字，用“• ”开头）\n3) 续写重点（1–3 条，用“→ ”开头，指出下一段最该推进的矛盾/目标）',
    },
    {
      role: 'user',
      content: `需要总结的上下文：\n${context}`,
    },
  ];

  return executeAiTask({
    kind: 'summarize',
    context,
    model,
    messages,
    temperature: 0.3,
    requestContext,
    billingGroupId,
  });
};

export const parseRequestBody = async (req) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
};

export const sendJson = (res, statusCode, payload) => {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(payload);
  }

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};
