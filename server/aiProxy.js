import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createServerLogger } from './logger.js';

const log = createServerLogger('AIProxy');

const normalizeApiKey = (apiKey) => apiKey?.trim().replace(/^['"`]|['"`]$/g, '');

const getEnvValue = (...names) => {
  for (const name of names) {
    let value = process.env[name];
    if (value) {
      return normalizeApiKey(value);
    }
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
const SUMMARIZE_FETCH_TIMEOUT_MS = Number(process.env.AI_SUMMARIZE_FETCH_TIMEOUT_MS || 60000);
const SUPABASE_QUERY_RETRY_DELAYS = [0, 600, 1200];
const AUTH_RLS_VALIDATION_TIMEOUT_MS = Number(process.env.AI_AUTH_RLS_VALIDATION_TIMEOUT_MS || 2500);
const MODEL_PRICING_CACHE_TTL_MS = Number(process.env.AI_MODEL_PRICING_CACHE_TTL_MS || 10 * 60 * 1000);
const MODEL_PRICING_REFRESH_GRACE_MS = Number(process.env.AI_MODEL_PRICING_REFRESH_GRACE_MS || 60 * 1000);

const DEFAULT_MODEL_PRICING = {
  'deepseek-v4-flash': {
    model_key: 'deepseek-v4-flash',
    model_name: 'DeepSeek V4 Flash',
    input_multiplier: 0.5,
    output_multiplier: 1,
    reasoning_multiplier: 1,
    cache_multiplier: 0.01,
    provider: 'deepseek',
    model_api_name: 'deepseek-v4-flash',
  },
  'deepseek-v4-pro': {
    model_key: 'deepseek-v4-pro',
    model_name: 'DeepSeek V4 Pro',
    input_multiplier: 1.5,
    output_multiplier: 3,
    reasoning_multiplier: 3,
    cache_multiplier: 0.0125,
    provider: 'deepseek',
    model_api_name: 'deepseek-v4-pro',
  },
  'deepseek-v3': {
    model_key: 'deepseek-v3',
    model_name: 'DeepSeek V3',
    input_multiplier: 1,
    output_multiplier: 4,
    reasoning_multiplier: 0,
    cache_multiplier: 0.25,
    provider: 'deepseek',
    model_api_name: 'deepseek-chat',
  },
  'claude-haiku': {
    model_key: 'claude-haiku',
    model_name: 'Claude Haiku',
    input_multiplier: 3.5,
    output_multiplier: 17.5,
    reasoning_multiplier: 0,
    cache_multiplier: 0.35,
    provider: 'anthropic',
    model_api_name: 'claude-haiku-4-5-20251001',
  },
  'claude-sonnet': {
    model_key: 'claude-sonnet',
    model_name: 'Claude Sonnet',
    input_multiplier: 10.5,
    output_multiplier: 52.5,
    reasoning_multiplier: 0,
    cache_multiplier: 1.05,
    provider: 'anthropic',
    model_api_name: 'claude-sonnet-4-6',
  },
  'claude-opus': {
    model_key: 'claude-opus',
    model_name: 'Claude Opus',
    input_multiplier: 17.5,
    output_multiplier: 87.5,
    reasoning_multiplier: 0,
    cache_multiplier: 1.75,
    provider: 'anthropic',
    model_api_name: 'claude-opus-4-7',
  },
  'gpt-4-turbo': {
    model_key: 'gpt-4-turbo',
    model_name: 'GPT-4 Turbo',
    input_multiplier: 7,
    output_multiplier: 28,
    reasoning_multiplier: 0,
    cache_multiplier: 0,
    provider: 'openai',
    model_api_name: 'gpt-4-turbo',
  },
  'gpt-4o': {
    model_key: 'gpt-4o',
    model_name: 'GPT-4o',
    input_multiplier: 8.75,
    output_multiplier: 35,
    reasoning_multiplier: 0,
    cache_multiplier: 0,
    provider: 'openai',
    model_api_name: 'gpt-4o',
  },
  'gemini-2.5-pro': {
    model_key: 'gemini-2.5-pro',
    model_name: 'Gemini 2.5 Pro',
    input_multiplier: 4.375,
    output_multiplier: 35,
    reasoning_multiplier: 0,
    cache_multiplier: 0,
    provider: 'google',
    model_api_name: 'google/gemini-2.5-pro',
  },
  'gemini-3.1-pro': {
    model_key: 'gemini-3.1-pro',
    model_name: 'Gemini 3.1 Pro',
    input_multiplier: 7,
    output_multiplier: 42,
    reasoning_multiplier: 0,
    cache_multiplier: 0.7,
    provider: 'google',
    model_api_name: 'google/gemini-3.1-pro',
  },
};

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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && uuidPattern.test(value);

const stripHtml = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const getWordCount = (value = '') => stripHtml(value).length;

const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeAiContinuationOutput = (userPrompt = '', content = '') => {
  const prompt = String(userPrompt ?? '').trim();
  const raw = String(content ?? '');
  if (!prompt || !raw.trim()) return raw;

  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalizedPrompt = normalize(prompt);
  if (!normalizedPrompt) return raw;

  const lines = raw.split(/\r?\n/);
  while (lines.length > 0 && !normalize(lines[0])) lines.shift();

  const prefixes = [/^(task|prompt|instruction|任务|提示词|用户需求|需求|指令)\s*[:：]\s*/i];

  while (lines.length > 0) {
    const line = lines[0];
    const trimmed = String(line ?? '').trim();
    const normalizedLine = normalize(trimmed);
    const normalizedLineStripped = normalize(trimmed.replace(/^[\-\*\u2022>\s"'“”‘’]+/g, ''));

    const isExact = normalizedLine === normalizedPrompt || normalizedLineStripped === normalizedPrompt;
    const isNearExact =
      normalizedPrompt.length >= 12 &&
      normalizedLine.includes(normalizedPrompt) &&
      normalizedLine.length <= normalizedPrompt.length + 10;

    if (isExact || isNearExact) {
      lines.shift();
      while (lines.length > 0 && !normalize(lines[0])) lines.shift();
      continue;
    }

    let removedPrefixed = false;
    for (const re of prefixes) {
      if (re.test(trimmed)) {
        const rest = trimmed.replace(re, '');
        const normalizedRest = normalize(rest);
        if (normalizedRest === normalizedPrompt || normalizedLine.includes(normalizedPrompt)) {
          lines.shift();
          while (lines.length > 0 && !normalize(lines[0])) lines.shift();
          removedPrefixed = true;
        }
        break;
      }
    }
    if (removedPrefixed) continue;
    break;
  }

  return lines.join('\n').trimStart();
};

const textToParagraphHtml = (content = '') => {
  const paragraphs = String(content || '')
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().replace(/\n/g, ' '))
    .filter(Boolean);

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
};

const appendHtml = (baseContentHtml = '', generatedHtml = '') => {
  const base = String(baseContentHtml || '').trim();
  if (!base || base === '<p></p>') return generatedHtml;
  return `${base}${generatedHtml}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDbError = (error) => {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    name: error.name,
  };
};

const withSupabaseRetry = async (label, fn, meta = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt < SUPABASE_QUERY_RETRY_DELAYS.length; attempt += 1) {
    const delay = SUPABASE_QUERY_RETRY_DELAYS[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    const startedAt = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - startedAt;
      if (!result?.error) {
        log.info(`${label} succeeded`, {
          ...meta,
          attempt: attempt + 1,
          retried: attempt > 0,
          durationMs,
        });
        return result;
      }

      lastError = result.error;
      log.warn(`${label} attempt failed`, {
        ...meta,
        attempt: attempt + 1,
        maxAttempts: SUPABASE_QUERY_RETRY_DELAYS.length,
        durationMs,
        error: formatDbError(result.error),
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      lastError = error;
      log.warn(`${label} attempt threw`, {
        ...meta,
        attempt: attempt + 1,
        maxAttempts: SUPABASE_QUERY_RETRY_DELAYS.length,
        durationMs,
        error: formatDbError(error) || { message: error?.message, name: error?.name },
      });
    }
  }

  return { data: null, error: lastError || new Error(`${label} failed`) };
};

const shouldRetryFetchError = (error) => {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  const combined = `${message}\n${details}\n${hint}`;
  if (error instanceof TypeError && message.includes('fetch')) return true;
  if (combined.includes('fetch failed')) return true;
  if (combined.includes('aborterror')) return true;
  if (combined.includes('aborted')) return true;
  if (combined.includes('network')) return true;
  if (combined.includes('timeout')) return true;
  if (combined.includes('terminated')) return true;
  if (combined.includes('connect timeout')) return true;
  if (combined.includes('und_err_connect_timeout')) return true;
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

const streamTextFromReadable = async (readable, onText) => {
  if (!readable) return '';

  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    if (!text) continue;
    fullText += text;
    await onText?.(text);
  }

  const tail = decoder.decode();
  if (tail) {
    fullText += tail;
    await onText?.(tail);
  }

  return fullText;
};

const parseJsonSafe = (value) => {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const parseOpenAIStreamChunk = (chunk) => {
  const delta = chunk?.choices?.[0]?.delta;
  const message = chunk?.choices?.[0]?.message;
  return extractMessageContent(delta?.content ?? message?.content ?? '');
};

const readOpenAICompatibleStream = async (response, onDelta) => {
  let buffer = '';
  let content = '';
  let usage = null;
  let rawFinal = null;

  await streamTextFromReadable(response.body, async (text) => {
    buffer += text;
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const lines = frame
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, ''));

      for (const line of lines) {
        if (!line || line === '[DONE]') continue;
        const json = parseJsonSafe(line);
        if (!json) continue;
        rawFinal = json;
        if (json.usage) usage = normalizeUsage(json.usage);

        const delta = parseOpenAIStreamChunk(json);
        if (delta) {
          content += delta;
          await onDelta?.(delta);
        }
      }
    }
  });

  if (buffer.trim()) {
    const lines = buffer
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''));
    for (const line of lines) {
      if (!line || line === '[DONE]') continue;
      const json = parseJsonSafe(line);
      if (!json) continue;
      rawFinal = json;
      if (json.usage) usage = normalizeUsage(json.usage);
      const delta = parseOpenAIStreamChunk(json);
      if (delta) {
        content += delta;
        await onDelta?.(delta);
      }
    }
  }

  return { content, usage: usage || normalizeUsage(rawFinal?.usage), raw: rawFinal };
};

const readAnthropicStream = async (response, onDelta) => {
  let buffer = '';
  let content = '';
  let usage = null;
  let currentEvent = '';
  let rawFinal = null;

  const processFrame = async (frame) => {
    const eventLine = frame.split(/\r?\n/).find((line) => line.startsWith('event:'));
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''));

    if (eventLine) {
      currentEvent = eventLine.replace(/^event:\s*/, '').trim();
    }

    for (const line of dataLines) {
      if (!line || line === '[DONE]') continue;
      const json = parseJsonSafe(line);
      if (!json) continue;
      rawFinal = json;

      const delta = json?.delta?.text || json?.content_block?.text || '';
      if (delta) {
        content += delta;
        await onDelta?.(delta);
      }

      if (json?.message?.usage || json?.usage) {
        usage = normalizeUsage(json.message?.usage || json.usage);
      }

      if (currentEvent === 'message_delta' && json?.usage) {
        usage = normalizeUsage({ ...(usage || {}), ...json.usage });
      }
    }
  };

  await streamTextFromReadable(response.body, async (text) => {
    buffer += text;
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      await processFrame(frame);
    }
  });

  if (buffer.trim()) {
    await processFrame(buffer);
  }

  return { content, usage: usage || normalizeUsage(rawFinal?.usage), raw: rawFinal };
};

const getRequestAccessToken = (headers = {}) => {
  const raw = headers.authorization || headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const safeBase64UrlDecode = (str = '') => {
  const base64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
  return Buffer.from(base64 + pad, 'base64');
};

const parseJwtPayload = (token = '') => {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(safeBase64UrlDecode(parts[1]).toString('utf8'));
  } catch (error) {
    log.error('JWT parsing failed', null, error);
    return null;
  }
};

const isJwtExpired = (payload) => {
  const exp = Number(payload?.exp ?? 0);
  return Number.isFinite(exp) && exp > 0 && exp * 1000 <= Date.now();
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
  const SUPABASE_URL_RUNTIME = getEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const SUPABASE_ANON_KEY_RUNTIME = getEnvValue('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

  log.info('Creating Supabase client for request', {
    hasUrl: !!SUPABASE_URL_RUNTIME,
    hasKey: !!SUPABASE_ANON_KEY_RUNTIME,
    hasToken: !!accessToken,
  });

  if (!SUPABASE_URL_RUNTIME || !SUPABASE_ANON_KEY_RUNTIME || !accessToken) {
    log.warn('Supabase client creation skipped: missing required params', {
      hasUrl: !!SUPABASE_URL_RUNTIME,
      hasKey: !!SUPABASE_ANON_KEY_RUNTIME,
      hasToken: !!accessToken,
    });
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
  log.info('Authenticating user');

  const startedAt = Date.now();
  const payload = parseJwtPayload(accessToken);
  if (payload?.sub && !isJwtExpired(payload)) {
    log.info('User authenticated via JWT claims', { userId: payload.sub, durationMs: Date.now() - startedAt });
    return { id: payload.sub };
  }

  // If the local claim path cannot establish a usable subject, fall back to Supabase Auth.
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (!error && data?.user) {
    log.info('User authenticated via getUser fallback', { userId: data.user.id, durationMs: Date.now() - startedAt });
    return data.user;
  }

  log.warn('User authentication failed', {
    hasPayload: !!payload,
    expired: isJwtExpired(payload),
    error: error?.message,
    durationMs: Date.now() - startedAt,
  });

  if (!payload?.sub || isJwtExpired(payload)) {
    return null;
  }

  // The Supabase client still carries the bearer token, so all RLS checks and billing RPCs
  // continue to validate auth.uid() even when this fallback user object is returned.
  log.info('User authenticated via JWT fallback after getUser miss', { userId: payload.sub });
  return { id: payload.sub };
};

const validateRequestAuth = async ({ supabase, userId, traceId, kind }) => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_RLS_VALIDATION_TIMEOUT_MS);

  let error = null;
  try {
    let query = supabase
      .from('usage_logs')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (typeof query.abortSignal === 'function') {
      query = query.abortSignal(controller.signal);
    }

    const result = await query;
    error = result?.error || null;
  } catch (caughtError) {
    error = caughtError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (error) {
    if (shouldRetryFetchError(error)) {
      log.warn('Request token RLS validation unavailable; continuing with JWT subject and downstream RLS/RPC checks', {
        userId,
        traceId,
        kind,
        durationMs: Date.now() - startedAt,
        timeoutMs: AUTH_RLS_VALIDATION_TIMEOUT_MS,
        error: formatDbError(error),
      });
      return { softPassed: true, reason: 'rls_validation_network_unavailable' };
    }

    log.warn('Request token rejected by Supabase RLS validation', {
      userId,
      traceId,
      kind,
      durationMs: Date.now() - startedAt,
      error: formatDbError(error),
    });
    throw new Error('AUTH_RLS_VALIDATION_FAILED');
  }

  log.info('Request token accepted by Supabase RLS validation', {
    userId,
    traceId,
    kind,
    durationMs: Date.now() - startedAt,
  });
  return { softPassed: false };
};

const modelPricingCache = new Map();
const modelPricingRefreshInflight = new Map();

const normalizePricingRow = (row) => ({
  ...row,
  input_multiplier: Number(row.input_multiplier ?? 0),
  output_multiplier: Number(row.output_multiplier ?? 0),
  reasoning_multiplier: Number(row.reasoning_multiplier ?? 0),
  cache_multiplier: Number(row.cache_multiplier ?? 0),
});

const getDefaultModelPricing = (modelKey) => {
  const pricing = DEFAULT_MODEL_PRICING[modelKey];
  return pricing ? normalizePricingRow(pricing) : null;
};

const setModelPricingCache = (modelKey, pricing, source = 'db') => {
  modelPricingCache.set(modelKey, {
    pricing: normalizePricingRow(pricing),
    source,
    cachedAt: Date.now(),
    expiresAt: Date.now() + MODEL_PRICING_CACHE_TTL_MS,
  });
};

const refreshModelPricingInBackground = (supabase, modelKey, reason = 'background') => {
  if (modelPricingRefreshInflight.has(modelKey)) return;

  const promise = (async () => {
    log.info('Model pricing background refresh started', { modelKey, reason });
    try {
      const pricing = await fetchModelPricingFromDb(supabase, modelKey);
      setModelPricingCache(modelKey, pricing, 'db');
      log.success('Model pricing background refresh completed', {
        modelKey,
        reason,
        inputMult: pricing.input_multiplier,
        outputMult: pricing.output_multiplier,
      });
    } catch (error) {
      log.warn('Model pricing background refresh failed', {
        modelKey,
        reason,
        error: formatDbError(error) || { message: error?.message, name: error?.name },
      });
    } finally {
      modelPricingRefreshInflight.delete(modelKey);
    }
  })();

  modelPricingRefreshInflight.set(modelKey, promise);
};

const fetchModelPricingFromDb = async (supabase, modelKey) => {
  log.info('Fetching model pricing from DB', { modelKey });

  const { data, error } = await withSupabaseRetry(
    'Fetch model pricing',
    () =>
      supabase
        .from('model_pricing')
        .select(
          'model_key, model_name, input_multiplier, output_multiplier, reasoning_multiplier, cache_multiplier, provider, model_api_name'
        )
        .eq('model_key', modelKey)
        .eq('is_active', true)
        .single(),
    { modelKey }
  );

  if (error || !data) {
    const code = error?.code ? ` (${error.code})` : '';
    const detail = error?.message ? `：${error.message}` : '';
    log.error('Model pricing not found in DB', { modelKey, errorCode: error?.code, errorMsg: error?.message });
    throw new Error(`模型定价配置不存在(${modelKey})${code}${detail}`);
  }

  log.info('Model pricing fetched', { modelKey, inputMult: data.input_multiplier, outputMult: data.output_multiplier });
  return normalizePricingRow(data);
};

const getModelPricingFromDb = async (supabase, modelKey, options = {}) => {
  const { allowFallback = false } = options;
  const cached = modelPricingCache.get(modelKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    log.info('Model pricing cache hit', {
      modelKey,
      source: cached.source,
      ageMs: now - (cached.cachedAt || now),
    });
    return cached.pricing;
  }

  const defaultPricing = getDefaultModelPricing(modelKey);
  if (allowFallback && defaultPricing) {
    const recentlyTried =
      cached?.source === 'default' &&
      cached.cachedAt &&
      now - cached.cachedAt < MODEL_PRICING_REFRESH_GRACE_MS;

    setModelPricingCache(modelKey, defaultPricing, 'default');
    log.info('Model pricing default fallback used for preflight', {
      modelKey,
      reason: cached ? 'cache-expired-or-default' : 'cache-miss',
      refreshQueued: !recentlyTried,
      ttlMs: MODEL_PRICING_CACHE_TTL_MS,
    });
    if (!recentlyTried) {
      refreshModelPricingInBackground(supabase, modelKey, 'preflight-fallback');
    }
    return defaultPricing;
  }

  const pricing = await fetchModelPricingFromDb(supabase, modelKey);
  setModelPricingCache(modelKey, pricing, 'db');
  return pricing;
};

const getEffectiveBalance = async (supabase, userId) => {
  log.info('Fetching user balance', { userId });

  const { data, error } = await withSupabaseRetry(
    'Fetch user balance',
    () =>
      supabase
        .from('profiles')
        .select('member_diamonds, permanent_diamonds, membership_type, membership_expires_at')
        .eq('id', userId)
        .single(),
    { userId }
  );

  if (error || !data) {
    log.error('Failed to fetch user balance', { userId, error: formatDbError(error) }, error);
    throw new Error('读取用户余额失败');
  }

  const expiresAt = data.membership_expires_at ? new Date(data.membership_expires_at).getTime() : 0;
  const expired = Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now();
  const memberDiamonds = expired ? 0 : Number(data.member_diamonds ?? 0);
  const permanentDiamonds = Number(data.permanent_diamonds ?? 0);

  log.info('User balance fetched', {
    userId,
    memberDiamonds,
    permanentDiamonds,
    totalRemaining: memberDiamonds + permanentDiamonds,
    membershipType: expired ? 'free' : data.membership_type,
    expired,
  });

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
  const startedAt = Date.now();
  const balancePromise = getEffectiveBalance(supabase, userId);
  const pricingPromise = getModelPricingFromDb(supabase, model, { allowFallback: true });
  const [balanceResult, pricingResult] = await Promise.allSettled([balancePromise, pricingPromise]);

  if (balanceResult.status === 'rejected') {
    throw balanceResult.reason;
  }

  const balance = balanceResult.value;
  let pricing;
  if (pricingResult.status === 'fulfilled') {
    pricing = pricingResult.value;
  } else {
    const error = pricingResult.reason;
    let host = '';
    try {
      host = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : '';
    } catch (_) {
      host = '';
    }

    log.error('Budget preflight failed: pricing not found', { model, userId, host });
    throw createUserFacingError(
      `${error?.message || `模型定价配置不存在(${model})`}。请确认已在当前 Supabase 项目${host ? ` (${host})` : ''} 执行模型定价迁移，并确保 model_pricing 中该模型 is_active=true。`,
      {
        available: balance.totalRemaining,
      }
    );
  }

  const estimatedUsage = estimateUsageForPrecheck({ kind, prompt, context, pricing });
  const estimatedDiamonds = calculateDiamondCost(pricing, estimatedUsage);

  log.info('Budget preflight check', {
    userId,
    model,
    estimatedDiamonds,
    available: balance.totalRemaining,
    kind,
    durationMs: Date.now() - startedAt,
    balanceLoaded: balanceResult.status === 'fulfilled',
    pricingLoaded: pricingResult.status === 'fulfilled',
  });

  if (estimatedDiamonds > SINGLE_CALL_DIAMOND_CAP) {
    log.warn('Budget preflight rejected: exceeds single call cap', {
      userId,
      model,
      estimatedDiamonds,
      cap: SINGLE_CALL_DIAMOND_CAP,
    });
    throw createUserFacingError(
      `本次请求预估需要 ${estimatedDiamonds} 钻石，超过单次上限 ${SINGLE_CALL_DIAMOND_CAP}，请缩短上下文或拆分生成。`,
      { estimatedRequired: estimatedDiamonds, available: balance.totalRemaining }
    );
  }

  if (balance.totalRemaining < estimatedDiamonds) {
    log.warn('Budget preflight rejected: insufficient balance', {
      userId,
      model,
      estimatedDiamonds,
      available: balance.totalRemaining,
    });
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
    log.warn('Abnormal usage detected: hourly consumption too high', {
      userId,
      lastHourConsumption: projectedHourTotal,
      dailyAverage,
      threshold: ANOMALY_HOURLY_DIAMONDS,
    });
    return `风险提醒：你最近 1 小时已消耗 ${projectedHourTotal.toLocaleString()} 钻石，显著高于平时，请确认当前模型与上下文长度是否符合预期。`;
  }

  if (latestDiamonds >= SINGLE_CALL_DIAMOND_CAP * 0.5) {
    log.warn('Abnormal usage detected: single call near cap', {
      userId,
      latestDiamonds,
      cap: SINGLE_CALL_DIAMOND_CAP,
    });
    return `风险提醒：本次调用消耗 ${latestDiamonds.toLocaleString()} 钻石，已接近单次上限，请留意模型选择与上下文长度。`;
  }

  return undefined;
};

const normalizeBillingResultFromLog = (row, balance) => {
  if (!row) return null;
  const memberRemaining = Number(balance?.member_diamonds ?? NaN);
  const permanentRemaining = Number(balance?.permanent_diamonds ?? NaN);
  const totalRemaining = Number.isFinite(memberRemaining) && Number.isFinite(permanentRemaining)
    ? memberRemaining + permanentRemaining
    : undefined;

  return {
    success: true,
    diamonds_consumed: Number(row.diamonds_consumed ?? row.total_deducted ?? 0),
    input_diamonds: Number(row.input_diamonds ?? 0),
    output_diamonds: Number(row.output_diamonds ?? 0),
    reasoning_diamonds: Number(row.reasoning_diamonds ?? 0),
    cache_diamonds: Number(row.cache_diamonds ?? 0),
    member_diamonds_remaining: Number.isFinite(memberRemaining) ? memberRemaining : undefined,
    permanent_diamonds_remaining: Number.isFinite(permanentRemaining) ? permanentRemaining : undefined,
    total_remaining: totalRemaining,
    recoveredFromUsageLog: true,
  };
};

const findExistingBillingLog = async ({ supabase, userId, billingGroupId, billingStep }) => {
  if (!billingGroupId || !billingStep) return null;

  const { data, error } = await withSupabaseRetry(
    'Lookup existing billing log',
    () =>
      supabase
        .from('usage_logs')
        .select(
          'id, diamonds_consumed, total_deducted, input_diamonds, output_diamonds, reasoning_diamonds, cache_diamonds, created_at'
        )
        .eq('user_id', userId)
        .eq('billing_group_id', billingGroupId)
        .eq('billing_step', billingStep)
        .order('created_at', { ascending: false })
        .limit(1),
    { userId, billingGroupId, billingStep }
  );

  if (error) {
    log.warn('Existing billing log lookup failed', {
      userId,
      billingGroupId,
      billingStep,
      error: formatDbError(error),
    });
    return null;
  }

  if (!data?.[0]) return null;

  const balanceResult = await withSupabaseRetry(
    'Fetch balance after recovered billing',
    () =>
      supabase
        .from('profiles')
        .select('member_diamonds, permanent_diamonds')
        .eq('id', userId)
        .single(),
    { userId, billingGroupId, billingStep }
  );

  return normalizeBillingResultFromLog(data[0], balanceResult.data);
};

let billingIdempotencyReadyCache = null;
const isBillingIdempotencyReady = async (supabase, { billingGroupId, billingStep } = {}) => {
  if (billingIdempotencyReadyCache !== null) return billingIdempotencyReadyCache;

  const { data, error } = await supabase.rpc('billing_idempotency_ready');
  if (error) {
    const hasIdempotencyKey = Boolean(billingGroupId && billingStep);
    log.warn('Billing idempotency check unavailable; fallback selected', {
      retryEnabled: hasIdempotencyKey,
      billingGroupId,
      billingStep,
      error: formatDbError(error),
    });
    return hasIdempotencyKey;
  } else {
    billingIdempotencyReadyCache = data === true;
    log.info('Billing idempotency check completed', { ready: billingIdempotencyReadyCache });
  }
  return billingIdempotencyReadyCache;
};

const deductUsageOnServer = async ({ supabase, userId, model, usage, billingGroupId, billingStep }) => {
  log.info('Deducting usage on server', {
    userId,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.reasoning_tokens,
    cacheTokens: usage.cache_hit_tokens,
    billingGroupId,
    billingStep,
  });

  const existing = await findExistingBillingLog({ supabase, userId, billingGroupId, billingStep });
  if (existing) {
    log.warn('Deduct diamonds skipped because billing log already exists', {
      userId,
      model,
      billingGroupId,
      billingStep,
      diamondsConsumed: existing.diamonds_consumed,
    });
    return existing;
  }

  const callDeductRpc = async () => {
    const result = await supabase.rpc('deduct_diamonds_v4', {
      p_user_id: userId,
      p_model_key: model,
      p_input_tokens: usage.input_tokens ?? 0,
      p_output_tokens: usage.output_tokens ?? 0,
      p_reasoning_tokens: usage.reasoning_tokens ?? 0,
      p_cache_tokens: usage.cache_hit_tokens ?? 0,
      p_billing_group_id: billingGroupId ?? null,
      p_billing_step: billingStep ?? null,
    });

    if (result.error && shouldRetryFetchError(result.error)) {
      const recovered = await findExistingBillingLog({ supabase, userId, billingGroupId, billingStep });
      if (recovered) {
        log.warn('Deduct diamonds RPC response lost but billing log was found', {
          userId,
          model,
          billingGroupId,
          billingStep,
          diamondsConsumed: recovered.diamonds_consumed,
        });
        return { data: recovered, error: null };
      }
    }

    return result;
  };

  const idempotencyReady = await isBillingIdempotencyReady(supabase, { billingGroupId, billingStep });
  const { data, error } = idempotencyReady
    ? await withSupabaseRetry('Deduct diamonds RPC', callDeductRpc, { userId, model, billingGroupId, billingStep })
    : await callDeductRpc();

  if (error) {
    const recovered = await findExistingBillingLog({ supabase, userId, billingGroupId, billingStep });
    if (recovered) {
      log.warn('Deduct diamonds RPC failed after retries but billing log was found', {
        userId,
        model,
        billingGroupId,
        billingStep,
        diamondsConsumed: recovered.diamonds_consumed,
      });
      return recovered;
    }

    log.error('Deduct diamonds RPC failed', { userId, model, error: formatDbError(error) }, error);
    if (shouldRetryFetchError(error)) {
      throw createUserFacingError('扣费确认时网络异常，AI 内容尚未应用。请稍后重试，系统会尽量避免重复扣费。');
    }
    throw new Error(error.message || '扣费失败');
  }

  if (!data?.success) {
    log.warn('Deduct diamonds rejected by RPC', {
      userId,
      model,
      rpcError: data?.error,
      needed: data?.needed,
      available: data?.available,
    });
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

  log.info('Deduct diamonds success', {
    userId,
    model,
    diamondsConsumed: data.diamonds_consumed,
    totalRemaining: data.total_remaining,
  });

  return data;
};

const requestOpenAICompatible = async ({ config, messages, temperature, stream = false, onDelta, traceId }) => {
  if (!config.apiKey) {
    log.error('API Key missing for OpenAI-compatible provider', { provider: config.provider });
    throw new Error(`${config.provider} API Key is missing`);
  }

  const url = `${config.baseURL}/chat/completions`;
  const requestBody = {
    model: config.modelName,
    messages,
    temperature,
    max_tokens: config.maxOutputTokens || MAX_OUTPUT_TOKENS,
    stream,
    ...(stream && config.includeStreamUsage !== false ? { stream_options: { include_usage: true } } : {}),
  };

  log.info('Requesting OpenAI-compatible API', {
    traceId,
    provider: config.provider,
    model: config.modelName,
    baseURL: config.baseURL,
    stream,
  });

  let lastError;
  const maxAttempts = Math.max(1, Number(config.retries || 0) + 1);
  let retriedWithoutStreamOptions = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
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

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          data?.error?.message ||
          data?.message ||
          `${response.status} ${response.statusText}`;
        log.warn('OpenAI-compatible API returned error', {
          traceId,
          provider: config.provider,
          model: config.modelName,
          status: response.status,
          errorMsg: message?.slice(0, 200),
          attempt: attempt + 1,
          durationMs: Date.now() - attemptStartedAt,
        });

        if (
          stream &&
          requestBody.stream_options &&
          !retriedWithoutStreamOptions &&
          response.status >= 400 &&
          response.status < 500 &&
          /stream_options|include_usage|unknown|unsupported|extra/i.test(message || '')
        ) {
          delete requestBody.stream_options;
          retriedWithoutStreamOptions = true;
          log.info('Retrying stream request without stream_options', { traceId, provider: config.provider, model: config.modelName });
          attempt -= 1;
          continue;
        }

        throw new Error(message);
      }

      if (stream) {
        const streamed = await readOpenAICompatibleStream(response, onDelta);
        log.info('OpenAI-compatible API stream success', {
          traceId,
          provider: config.provider,
          model: config.modelName,
          inputTokens: streamed.usage?.input_tokens || 0,
          outputTokens: streamed.usage?.output_tokens || 0,
          contentLength: streamed.content?.length || 0,
          durationMs: Date.now() - attemptStartedAt,
        });
        return streamed;
      }

      const data = await response.json().catch(() => null);
      log.info('OpenAI-compatible API success', {
        traceId,
        provider: config.provider,
        model: config.modelName,
        inputTokens: normalizeUsage(data?.usage).input_tokens,
        outputTokens: normalizeUsage(data?.usage).output_tokens,
        contentLength: data?.choices?.[0]?.message?.content?.length || 0,
        durationMs: Date.now() - attemptStartedAt,
      });

      return {
        content: data?.choices?.[0]?.message?.content || '',
        usage: normalizeUsage(data?.usage),
        raw: data,
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1 && shouldRetryFetchError(error)) {
        log.info('Retrying OpenAI-compatible request', { traceId, provider: config.provider, attempt: attempt + 1 });
        await sleep(250 * (attempt + 1));
        continue;
      }
      break;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const suffix = config.provider ? ` (${config.provider})` : '';
  log.error('OpenAI-compatible request failed after all attempts', { traceId, provider: config.provider, model: config.modelName }, lastError);
  throw new Error(`${lastError?.message || 'fetch failed'}${suffix}`);
};

const requestAnthropic = async ({ config, messages, temperature, stream = false, onDelta, traceId }) => {
  if (!config.apiKey) {
    log.error('Anthropic API Key missing');
    throw new Error('Anthropic API Key is missing');
  }

  const systemMessage = messages.find((message) => message.role === 'system')?.content || '';
  const userMessages = messages.filter((message) => message.role !== 'system');

  const startedAt = Date.now();
  log.info('Requesting Anthropic API', { traceId, model: config.modelName, stream });

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
      stream,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message =
      data?.error?.message ||
      data?.message ||
      `${response.status} ${response.statusText}`;
    log.warn('Anthropic API returned error', {
      traceId,
      model: config.modelName,
      status: response.status,
      errorMsg: message?.slice(0, 200),
      durationMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }

  if (stream) {
    const streamed = await readAnthropicStream(response, onDelta);
    log.info('Anthropic API stream success', {
      traceId,
      model: config.modelName,
      inputTokens: streamed.usage?.input_tokens || 0,
      outputTokens: streamed.usage?.output_tokens || 0,
      contentLength: streamed.content.length,
      durationMs: Date.now() - startedAt,
    });
    return streamed;
  }

  const data = await response.json().catch(() => null);
  log.info('Anthropic API success', {
    traceId,
    model: config.modelName,
    inputTokens: normalizeUsage(data?.usage).input_tokens,
    outputTokens: normalizeUsage(data?.usage).output_tokens,
    contentLength: extractMessageContent(data?.content).length,
    durationMs: Date.now() - startedAt,
  });

  return {
    content: extractMessageContent(data?.content),
    usage: normalizeUsage(data?.usage),
    raw: data,
  };
};

const requestModel = async ({ model, messages, temperature = 0.7, runtimeConfig, stream = false, onDelta, traceId }) => {
  const modelRegistry = getModelRegistry();
  const config = modelRegistry[model];

  if (!config) {
    log.error('Model not found in registry', { model });
    throw new Error(`Model ${model} not supported`);
  }

  const finalConfig = runtimeConfig ? { ...config, ...runtimeConfig } : config;

  if (finalConfig.type === 'anthropic') {
    return requestAnthropic({ config: finalConfig, messages, temperature, stream, onDelta, traceId });
  }

  return requestOpenAICompatible({ config: finalConfig, messages, temperature, stream, onDelta, traceId });
};

const saveGeneratedChapterContent = async ({
  supabase,
  userId,
  workId,
  chapterId,
  chapterTitle,
  baseContentHtml,
  generatedContent,
  prompt,
  deferChapterSave = false,
}) => {
  if (!isUuid(workId) || !isUuid(chapterId)) {
    return { savedToChapter: false, savedChapterContent: null };
  }

  const cleaned = sanitizeAiContinuationOutput(prompt, generatedContent);
  const generatedHtml = textToParagraphHtml(cleaned);
  if (!generatedHtml) {
    return { savedToChapter: false, savedChapterContent: null };
  }

  const finalContent = appendHtml(baseContentHtml, generatedHtml);

  if (deferChapterSave) {
    log.info('Generated chapter content prepared without saving', {
      userId,
      workId,
      chapterId,
      baseLength: String(baseContentHtml || '').length,
      generatedLength: generatedContent?.length || 0,
      finalLength: finalContent.length,
    });
    return {
      savedToChapter: false,
      savedChapterContent: null,
      generatedHtml,
      previewChapterContent: finalContent,
    };
  }

  log.info('Saving generated chapter content on server', {
    userId,
    workId,
    chapterId,
    title: chapterTitle,
    baseLength: String(baseContentHtml || '').length,
    generatedLength: generatedContent?.length || 0,
    finalLength: finalContent.length,
  });

  const { data: existing, error: lookupError } = await supabase
    .from('chapters')
    .select('id')
    .eq('id', chapterId)
    .eq('work_id', workId)
    .maybeSingle();

  if (lookupError) {
    log.error('Failed to lookup chapter before AI save', { userId, workId, chapterId }, lookupError);
    throw new Error('AI 已生成，但保存章节前读取数据库失败，请稍后重试。');
  }

  const payload = {
    title: String(chapterTitle || '未命名章节'),
    content: finalContent,
    word_count: getWordCount(finalContent),
    status: 'draft',
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('chapters')
      .update(payload)
      .eq('id', chapterId)
      .eq('work_id', workId);
    if (error) {
      log.error('Failed to update chapter after AI generation', { userId, workId, chapterId }, error);
      throw new Error('AI 已生成，但保存到章节失败，请检查网络后重试。');
    }
    log.info('Generated chapter content saved', { userId, workId, chapterId, mode: 'update' });
    return { savedToChapter: true, savedChapterContent: finalContent, generatedHtml, previewChapterContent: finalContent };
  }

  const { data: latestChapter, error: latestError } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('work_id', workId)
    .order('chapter_number', { ascending: false })
    .limit(1);

  if (latestError) {
    log.error('Failed to read latest chapter number before AI save', { userId, workId, chapterId }, latestError);
    throw new Error('AI 已生成，但保存章节序号失败，请稍后重试。');
  }

  const chapterNumber = Number(latestChapter?.[0]?.chapter_number || 0) + 1;
  const { error } = await supabase.from('chapters').insert({
    id: chapterId,
    work_id: workId,
    ...payload,
    chapter_number: chapterNumber,
  });

  if (error) {
    log.error('Failed to insert chapter after AI generation', { userId, workId, chapterId }, error);
    throw new Error('AI 已生成，但新建章节保存失败，请稍后重试。');
  }

  log.info('Generated chapter content saved', { userId, workId, chapterId, mode: 'insert', chapterNumber });
  return { savedToChapter: true, savedChapterContent: finalContent, generatedHtml, previewChapterContent: finalContent };
};

const executeAiTask = async ({
  kind,
  prompt = '',
  context = '',
  model,
  messages,
  temperature,
  requestContext,
  billingGroupId,
  billingStep,
  afterSuccess,
  stream = false,
  onDelta,
  onPhase,
  traceId,
}) => {
  const effectiveBillingGroupId = billingGroupId || randomUUID();
  const effectiveBillingStep = billingStep || kind;
  const taskStartedAt = Date.now();
  let phaseStartedAt = taskStartedAt;

  log.info('Executing AI task', {
    kind,
    model,
    hasPrompt: !!prompt,
    contextLength: context?.length || 0,
    ip: requestContext?.ip,
    billingGroupId: effectiveBillingGroupId,
    billingStep: effectiveBillingStep,
    traceId,
  });

  const accessToken = requestContext?.accessToken || '';
  const supabase = getSupabaseClientForRequest(accessToken);
  if (!supabase) {
    log.warn('AI task rejected: Supabase client unavailable');
    return { content: '', error: '请先登录后再使用 AI 创作功能。' };
  }

  await onPhase?.({ phase: 'authenticating', label: '正在校验登录状态' });
  const user = await getAuthenticatedUser(supabase, accessToken);
  if (!user) {
    log.warn('AI task rejected: user authentication failed');
    return { content: '', error: '请先登录后再使用 AI 创作功能。' };
  }

  try {
    const authValidation = await validateRequestAuth({ supabase, userId: user.id, traceId, kind });
    if (authValidation?.softPassed) {
      log.warn('AI task auth validation soft-passed', {
        traceId,
        kind,
        userId: user.id,
        reason: authValidation.reason,
      });
    }
  } catch (error) {
    if (error?.message !== 'AUTH_RLS_VALIDATION_FAILED') throw error;
    return { content: '', error: '请先登录后再使用 AI 创作功能。' };
  }
  log.info('AI task phase completed', {
    traceId,
    phase: 'authenticating',
    userId: user.id,
    durationMs: Date.now() - phaseStartedAt,
  });

  let finalModel = model;
  if (finalModel === undefined) {
    finalModel = 'deepseek-v4-flash';
  }

  if (typeof finalModel !== 'string' || finalModel.trim() === '') {
    log.warn('AI task rejected: invalid model', { model });
    return { content: '', error: '请先选择一个具体的模型。' };
  }
  finalModel = finalModel.trim();

  try {
    phaseStartedAt = Date.now();
    await onPhase?.({ phase: 'preflight', label: '正在校验额度' });
    log.info('AI task phase started', { traceId, phase: 'preflight', userId: user.id, model: finalModel });
    const preflight = await ensureBudgetPreflight({
      supabase,
      userId: user.id,
      model: finalModel,
      kind,
      prompt,
      context,
    });
    log.info('AI task phase completed', {
      traceId,
      phase: 'preflight',
      userId: user.id,
      model: finalModel,
      durationMs: Date.now() - phaseStartedAt,
      estimatedDiamonds: preflight.estimatedDiamonds,
      available: preflight.balance.totalRemaining,
    });

    phaseStartedAt = Date.now();
    await onPhase?.({ phase: 'requesting_model', label: '正在请求模型' });
    log.info('AI task phase started', { traceId, phase: 'requesting_model', userId: user.id, model: finalModel });
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
      stream,
      onDelta,
      traceId,
    });
    log.info('AI task phase completed', {
      traceId,
      phase: 'requesting_model',
      userId: user.id,
      model: finalModel,
      durationMs: Date.now() - phaseStartedAt,
      contentLength: result.content?.length || 0,
    });
    await onPhase?.({
      phase: 'output_ready',
      label: 'AI 输出完成',
      generatedChars: result.content?.length || 0,
    });

    phaseStartedAt = Date.now();
    await onPhase?.({ phase: 'billing', label: '正在结算扣费' });
    log.info('AI task model result received', {
      traceId,
      userId: user.id,
      model: finalModel,
      contentLength: result.content?.length || 0,
      usage: result.usage,
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
    log.info('AI task actual usage calculated', {
      traceId,
      userId: user.id,
      model: finalModel,
      actualDiamonds,
      estimatedDiamonds: preflight.estimatedDiamonds,
      availableBefore: preflight.balance.totalRemaining,
      usage,
    });
    if (actualDiamonds > SINGLE_CALL_DIAMOND_CAP) {
      log.warn('AI task result exceeds diamond cap after generation', {
        userId: user.id,
        model: finalModel,
        actualDiamonds,
        cap: SINGLE_CALL_DIAMOND_CAP,
      });
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
      billingGroupId: effectiveBillingGroupId,
      billingStep: effectiveBillingStep,
    });
    log.info('AI task phase completed', {
      traceId,
      phase: 'billing',
      userId: user.id,
      model: finalModel,
      durationMs: Date.now() - phaseStartedAt,
      diamondsConsumed: billing?.diamonds_consumed,
      totalRemaining: billing?.total_remaining,
    });
    log.info('AI task billing completed', {
      traceId,
      userId: user.id,
      model: finalModel,
      diamondsConsumed: billing?.diamonds_consumed,
      totalRemaining: billing?.total_remaining,
      billingGroupId: effectiveBillingGroupId,
      billingStep: effectiveBillingStep,
    });

    const warningPromise = detectAbnormalUsage({
      supabase,
      userId: user.id,
      latestDiamonds: billing?.diamonds_consumed ?? actualDiamonds,
    });

    let afterSuccessPayload = {};
    if (typeof afterSuccess === 'function') {
      phaseStartedAt = Date.now();
      await onPhase?.({ phase: 'saving', label: '正在保存' });
      log.info('AI task afterSuccess started', { traceId, userId: user.id, model: finalModel });
      afterSuccessPayload = await afterSuccess({
        supabase,
        user,
        content: result.content,
        usage,
        billing,
      });
      log.info('AI task afterSuccess completed', {
        traceId,
        userId: user.id,
        model: finalModel,
        savedToChapter: afterSuccessPayload?.savedToChapter,
        generatedHtmlLength: afterSuccessPayload?.generatedHtml?.length || 0,
        durationMs: Date.now() - phaseStartedAt,
      });
    }
    const warning = await warningPromise;

    log.info('AI task completed successfully', {
      kind,
      model: finalModel,
      userId: user.id,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: usage.reasoning_tokens,
      cacheHitTokens: usage.cache_hit_tokens,
      actualDiamonds,
      totalRemaining: billing?.total_remaining,
      hasWarning: !!warning,
      billingGroupId: effectiveBillingGroupId,
      billingStep: effectiveBillingStep,
      traceId,
      durationMs: Date.now() - taskStartedAt,
    });

    return {
      content: result.content,
      ...afterSuccessPayload,
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
      log.warn('AI task returned user-facing error', {
        kind,
        model: finalModel,
        userId: user.id,
        errorMsg: error.message?.slice(0, 200),
      });
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
    log.error('AI task unhandled error', { kind, model: finalModel, userId: user.id }, error);
    throw error;
  }
};

export const generateTextServer = async ({
  prompt,
  model = 'deepseek-v4-flash',
  context,
  billingGroupId,
  traceId,
  workId,
  chapterId,
  chapterTitle,
  baseContentHtml,
  deferChapterSave,
}, requestContext = {}) => {
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
    traceId,
    afterSuccess: isUuid(workId) && isUuid(chapterId)
      ? ({ supabase, user, content }) => saveGeneratedChapterContent({
          supabase,
          userId: user.id,
          workId,
          chapterId,
          chapterTitle,
          baseContentHtml,
          generatedContent: content,
          prompt,
          deferChapterSave,
        })
      : undefined,
  });
};

export const streamGenerateTextServer = async ({
  prompt,
  model = 'deepseek-v4-flash',
  context,
  billingGroupId,
  traceId,
  workId,
  chapterId,
  chapterTitle,
  baseContentHtml,
  deferChapterSave,
}, requestContext = {}, stream = {}) => {
  const emit = typeof stream.emit === 'function' ? stream.emit : async () => {};
  let generatedChars = 0;
  log.info('AI generate stream server started', {
    traceId,
    model,
    contextLength: context?.length || 0,
    workId,
    chapterId,
    deferChapterSave,
  });

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
    traceId,
    stream: true,
    onPhase: (event) => emit({ type: 'phase', ...event }),
    onDelta: async (delta) => {
      generatedChars += delta.length;
      if (generatedChars === delta.length || generatedChars % 500 < delta.length) {
        log.info('AI stream delta emitted', { traceId, generatedChars, deltaLength: delta.length });
      }
      await emit({
        type: 'delta',
        delta,
        generatedChars,
        phase: 'streaming',
        label: `AI 正在输出，已生成 ${generatedChars} 字`,
      });
    },
    afterSuccess: isUuid(workId) && isUuid(chapterId)
      ? ({ supabase, user, content }) => saveGeneratedChapterContent({
          supabase,
          userId: user.id,
          workId,
          chapterId,
          chapterTitle,
          baseContentHtml,
          generatedContent: content,
          prompt,
          deferChapterSave,
        })
      : undefined,
  });
};

export const summarizeContextServer = async ({ context, model = 'deepseek-v4-flash', billingGroupId, traceId }, requestContext = {}) => {
  const messages = [
    {
      role: 'system',
      content:
        '你是一个专业的剧情与设定提炼助手。你的目标是为"下一次续写/补全"提供高密度、可直接使用的背景摘要。\n\n硬性要求：\n- 总长度控制在 300–450 个中文字符左右（宁可更短，不要更长）。\n- 输出必须是纯文本，不要 Markdown 标题、不要代码块、不要引用原文句子。\n- 只保留对续写有用的信息：人物状态、关键关系、动机、已发生事件的因果链、当前局面、未解决冲突/悬念。\n- 删除细枝末节、重复描写、修辞性句子、无关对话。\n- 不要补写新剧情，不要臆测未给出的设定。\n\n输出格式（严格遵循）：\n1) 一句话总览（不超过 40 字）\n2) 要点（最多 12 条，每条不超过 30 字，用"• "开头）\n3) 续写重点（1–3 条，用"→ "开头，指出下一段最该推进的矛盾/目标）',
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
    traceId,
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

export const sendNdjson = async (res, producer) => {
  const setHeader = (name, value) => {
    if (typeof res.setHeader === 'function') {
      res.setHeader(name, value);
    } else if (typeof res.set === 'function') {
      res.set(name, value);
    }
  };

  if (typeof res.status === 'function') {
    res.status(200);
  } else {
    res.statusCode = 200;
  }

  setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  setHeader('Cache-Control', 'no-cache, no-transform');
  setHeader('Connection', 'keep-alive');
  setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const write = async (event) => {
    const line = `${JSON.stringify(event)}\n`;
    if (typeof res.write !== 'function') return;
    if (!res.write(line)) {
      await new Promise((resolve) => res.once?.('drain', resolve) || resolve());
    }
  };

  try {
    await producer(write);
  } catch (error) {
    await write({
      type: 'error',
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  } finally {
    if (typeof res.end === 'function' && !res.writableEnded) {
      res.end();
    }
  }
};
