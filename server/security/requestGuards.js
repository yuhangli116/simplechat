import { createServerLogger } from '../logger.js';

const log = createServerLogger('RequestGuards');

const WINDOW_MS = 60 * 1000;
const DEFAULT_USER_KEY = 'anonymous';
const MAX_LOG_MESSAGE_LENGTH = Number(process.env.LOG_MAX_MESSAGE_LENGTH || 500);
const MAX_LOG_ERROR_LENGTH = Number(process.env.LOG_MAX_ERROR_LENGTH || 2000);
const MAX_LOG_DATA_LENGTH = Number(process.env.LOG_MAX_DATA_LENGTH || 10000);

const AI_ENDPOINT_LIMITS = {
  generateStream: {
    label: 'AI 流式生成',
    userPerMinute: Number(process.env.AI_STREAM_USER_PER_MINUTE || 6),
    ipPerMinute: Number(process.env.AI_STREAM_IP_PER_MINUTE || 30),
    globalPerMinute: Number(process.env.AI_STREAM_GLOBAL_PER_MINUTE || 600),
    userConcurrent: Number(process.env.AI_STREAM_USER_CONCURRENT || 2),
    ipConcurrent: Number(process.env.AI_STREAM_IP_CONCURRENT || 8),
    globalConcurrent: Number(process.env.AI_STREAM_GLOBAL_CONCURRENT || 80),
    maxPromptChars: Number(process.env.AI_MAX_PROMPT_CHARS || 4000),
    maxContextChars: Number(process.env.AI_MAX_CONTEXT_CHARS || 120000),
    maxBaseHtmlChars: Number(process.env.AI_MAX_BASE_HTML_CHARS || 200000),
  },
  generate: {
    label: 'AI 生成',
    userPerMinute: Number(process.env.AI_GENERATE_USER_PER_MINUTE || 12),
    ipPerMinute: Number(process.env.AI_GENERATE_IP_PER_MINUTE || 60),
    globalPerMinute: Number(process.env.AI_GENERATE_GLOBAL_PER_MINUTE || 1200),
    userConcurrent: Number(process.env.AI_GENERATE_USER_CONCURRENT || 4),
    ipConcurrent: Number(process.env.AI_GENERATE_IP_CONCURRENT || 12),
    globalConcurrent: Number(process.env.AI_GENERATE_GLOBAL_CONCURRENT || 120),
    maxPromptChars: Number(process.env.AI_MAX_PROMPT_CHARS || 4000),
    maxContextChars: Number(process.env.AI_MAX_CONTEXT_CHARS || 120000),
    maxBaseHtmlChars: Number(process.env.AI_MAX_BASE_HTML_CHARS || 200000),
  },
  summarize: {
    label: 'AI 摘要',
    userPerMinute: Number(process.env.AI_SUMMARIZE_USER_PER_MINUTE || 20),
    ipPerMinute: Number(process.env.AI_SUMMARIZE_IP_PER_MINUTE || 80),
    globalPerMinute: Number(process.env.AI_SUMMARIZE_GLOBAL_PER_MINUTE || 1600),
    userConcurrent: Number(process.env.AI_SUMMARIZE_USER_CONCURRENT || 4),
    ipConcurrent: Number(process.env.AI_SUMMARIZE_IP_CONCURRENT || 16),
    globalConcurrent: Number(process.env.AI_SUMMARIZE_GLOBAL_CONCURRENT || 150),
    maxPromptChars: 0,
    maxContextChars: Number(process.env.AI_MAX_SUMMARY_CONTEXT_CHARS || 120000),
    maxBaseHtmlChars: 0,
  },
};

const LOG_LIMITS = {
  label: '日志上报',
  ipPerMinute: Number(process.env.LOG_INGEST_IP_PER_MINUTE || 120),
  globalPerMinute: Number(process.env.LOG_INGEST_GLOBAL_PER_MINUTE || 5000),
  maxBatchSize: Number(process.env.LOG_INGEST_MAX_BATCH || 50),
  maxBodyBytes: Number(process.env.LOG_INGEST_MAX_BODY_BYTES || 128 * 1024),
};

const rateWindows = new Map();
const concurrencyCounts = new Map();
let lastCleanupAt = Date.now();

export class RequestGuardError extends Error {
  constructor(message, { statusCode = 429, retryAfterSeconds = 0, reason = 'rate_limited', limit, scope } = {}) {
    super(message);
    this.name = 'RequestGuardError';
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
    this.reason = reason;
    this.limit = limit;
    this.scope = scope;
  }
}

const getHeaderValue = (headers = {}, name) => {
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  return Array.isArray(direct) ? direct[0] : direct;
};

export const getContentLength = (req) => {
  const raw = getHeaderValue(req?.headers || {}, 'content-length');
  const value = Number(raw || 0);
  return Number.isFinite(value) ? value : 0;
};

const safeKeyPart = (value) => String(value || DEFAULT_USER_KEY).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120);

export const parseJwtSubject = (accessToken = '') => {
  const parts = String(accessToken || '').split('.');
  if (parts.length !== 3) return '';
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
    const payload = JSON.parse(Buffer.from(base64 + pad, 'base64').toString('utf8'));
    const exp = Number(payload?.exp || 0);
    if (Number.isFinite(exp) && exp > 0 && exp * 1000 <= Date.now()) return '';
    return typeof payload?.sub === 'string' ? payload.sub : '';
  } catch {
    return '';
  }
};

const cleanupIfNeeded = () => {
  const now = Date.now();
  if (now - lastCleanupAt < WINDOW_MS) return;
  lastCleanupAt = now;
  for (const [key, window] of rateWindows.entries()) {
    if (!window || window.resetAt <= now) rateWindows.delete(key);
  }
  for (const [key, count] of concurrencyCounts.entries()) {
    if (!count || count <= 0) concurrencyCounts.delete(key);
  }
};

const checkRate = ({ key, limit, label, scope }) => {
  if (!Number.isFinite(limit) || limit <= 0) return;
  cleanupIfNeeded();

  const now = Date.now();
  const existing = rateWindows.get(key);
  const window = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + WINDOW_MS };
  window.count += 1;
  rateWindows.set(key, window);

  if (window.count <= limit) return;

  const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  log.warn('Request rejected by rate limit', {
    key,
    label,
    scope,
    limit,
    count: window.count,
    retryAfterSeconds,
  });
  throw new RequestGuardError(
    `${label}请求过于频繁：${scope} 1 分钟内最多允许 ${limit} 次，请 ${retryAfterSeconds} 秒后重试。`,
    {
      statusCode: 429,
      retryAfterSeconds,
      reason: 'rate_limited',
      limit,
      scope,
    }
  );
};

const acquireConcurrency = ({ key, limit, label, scope }) => {
  if (!Number.isFinite(limit) || limit <= 0) return () => {};
  cleanupIfNeeded();

  const current = concurrencyCounts.get(key) || 0;
  if (current >= limit) {
    log.warn('Request rejected by concurrency limit', {
      key,
      label,
      scope,
      limit,
      current,
    });
    throw new RequestGuardError(
      `${label}并发已达到上限：${scope}最多同时进行 ${limit} 个请求，请等待正在执行的任务完成后再试。`,
      {
        statusCode: 429,
        retryAfterSeconds: 5,
        reason: 'concurrency_limited',
        limit,
        scope,
      }
    );
  }

  concurrencyCounts.set(key, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (concurrencyCounts.get(key) || 1) - 1;
    if (next <= 0) {
      concurrencyCounts.delete(key);
    } else {
      concurrencyCounts.set(key, next);
    }
  };
};

const assertLength = ({ value, max, field, label }) => {
  if (!max) return;
  const length = typeof value === 'string' ? value.length : 0;
  if (length <= max) return;
  log.warn('Request rejected by payload length limit', {
    label,
    field,
    length,
    max,
  });
  throw new RequestGuardError(
    `${label}输入过长：${field} 当前 ${length} 字符，最多允许 ${max} 字符，请缩短内容后重试。`,
    {
      statusCode: 413,
      reason: 'payload_too_large',
      limit: max,
      scope: field,
    }
  );
};

const validateAiPayload = (endpoint, body) => {
  const limits = AI_ENDPOINT_LIMITS[endpoint];
  if (!limits) return;

  if (body?.model !== undefined && (typeof body.model !== 'string' || body.model.trim().length > 80)) {
    throw new RequestGuardError('AI 请求参数错误：模型参数不合法，请重新选择模型后再试。', {
      statusCode: 400,
      reason: 'invalid_model',
      scope: 'model',
    });
  }

  assertLength({ value: body?.prompt, max: limits.maxPromptChars, field: '提示词', label: limits.label });
  assertLength({ value: body?.context, max: limits.maxContextChars, field: '上下文', label: limits.label });
  assertLength({ value: body?.baseContentHtml, max: limits.maxBaseHtmlChars, field: '章节正文', label: limits.label });
};

export const applyAiRequestGuard = ({ endpoint, body, requestContext, req, res }) => {
  const limits = AI_ENDPOINT_LIMITS[endpoint];
  if (!limits) return () => {};

  validateAiPayload(endpoint, body || {});

  const accessToken = requestContext?.accessToken || '';
  const userId = parseJwtSubject(accessToken) || (accessToken ? 'authenticated' : DEFAULT_USER_KEY);
  const ip = requestContext?.ip || 'unknown-ip';
  const endpointKey = safeKeyPart(endpoint);
  const userKey = safeKeyPart(userId);
  const ipKey = safeKeyPart(ip);

  checkRate({
    key: `rate:user:${endpointKey}:${userKey}`,
    limit: limits.userPerMinute,
    label: limits.label,
    scope: '当前账号',
  });
  checkRate({
    key: `rate:ip:${endpointKey}:${ipKey}`,
    limit: limits.ipPerMinute,
    label: limits.label,
    scope: '当前网络',
  });
  checkRate({
    key: `rate:global:${endpointKey}`,
    limit: limits.globalPerMinute,
    label: limits.label,
    scope: '全站',
  });

  const releases = [];
  try {
    releases.push(
      acquireConcurrency({
        key: `concurrent:user:${endpointKey}:${userKey}`,
        limit: limits.userConcurrent,
        label: limits.label,
        scope: '当前账号',
      })
    );
    releases.push(
      acquireConcurrency({
        key: `concurrent:ip:${endpointKey}:${ipKey}`,
        limit: limits.ipConcurrent,
        label: limits.label,
        scope: '当前网络',
      })
    );
    releases.push(
      acquireConcurrency({
        key: `concurrent:global:${endpointKey}`,
        limit: limits.globalConcurrent,
        label: limits.label,
        scope: '全站',
      })
    );
  } catch (error) {
    releases.forEach((fn) => fn());
    throw error;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releases.forEach((fn) => fn());
  };

  if (res && typeof res.once === 'function') {
    res.once('close', release);
  } else if (req && typeof req.once === 'function') {
    req.once('close', release);
  }

  log.info('AI request guard passed', {
    endpoint,
    userKey,
    ip,
    userPerMinute: limits.userPerMinute,
    userConcurrent: limits.userConcurrent,
  });

  return release;
};

export const applyLogRequestGuard = ({ body, req, requestContext }) => {
  const contentLength = getContentLength(req);
  if (contentLength > LOG_LIMITS.maxBodyBytes) {
    throw new RequestGuardError(
      `日志上报内容过大：单次最多 ${(LOG_LIMITS.maxBodyBytes / 1024).toFixed(0)}KB，请减少日志数量后重试。`,
      {
        statusCode: 413,
        reason: 'log_payload_too_large',
        limit: LOG_LIMITS.maxBodyBytes,
        scope: '日志上报',
      }
    );
  }

  const ip = requestContext?.ip || 'unknown-ip';
  checkRate({
    key: `rate:log:ip:${safeKeyPart(ip)}`,
    limit: LOG_LIMITS.ipPerMinute,
    label: LOG_LIMITS.label,
    scope: '当前网络',
  });
  checkRate({
    key: 'rate:log:global',
    limit: LOG_LIMITS.globalPerMinute,
    label: LOG_LIMITS.label,
    scope: '全站',
  });

  const logs = Array.isArray(body?.logs) ? body.logs : [];
  if (logs.length > LOG_LIMITS.maxBatchSize) {
    log.warn('Log ingest rejected by batch size limit', {
      count: logs.length,
      maxBatchSize: LOG_LIMITS.maxBatchSize,
      ip,
    });
    throw new RequestGuardError(
      `日志上报过于频繁：单批最多 ${LOG_LIMITS.maxBatchSize} 条，请稍后重试。`,
      {
        statusCode: 429,
        retryAfterSeconds: 10,
        reason: 'log_batch_too_large',
        limit: LOG_LIMITS.maxBatchSize,
        scope: '日志上报',
      }
    );
  }
};

const truncate = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
};

const truncateJsonValue = (value, max) => {
  if (!value || typeof value !== 'object') return value;
  let json = '';
  try {
    json = JSON.stringify(value);
  } catch {
    return { serialization: 'failed' };
  }
  if (json.length <= max) return value;
  return { truncated: true, preview: json.slice(0, max) };
};

export const sanitizeLogBatch = (logs) => {
  if (!Array.isArray(logs)) return [];
  return logs.slice(0, LOG_LIMITS.maxBatchSize).map((entry) => ({
    timestamp: truncate(entry?.timestamp, 80),
    level: ['info', 'success', 'warn', 'error'].includes(entry?.level) ? entry.level : 'info',
    module: truncate(entry?.module || 'Unknown', 80),
    message: truncate(entry?.message, MAX_LOG_MESSAGE_LENGTH),
    data: truncateJsonValue(entry?.data, MAX_LOG_DATA_LENGTH),
    error: entry?.error ? truncate(entry.error, MAX_LOG_ERROR_LENGTH) : undefined,
  }));
};

export const sendGuardError = (res, error, sendJson) => {
  const statusCode = error?.statusCode || 429;
  if (error?.retryAfterSeconds && typeof res?.setHeader === 'function') {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }
  return sendJson(res, statusCode, {
    error: error?.message || '请求过于频繁，请稍后重试。',
    retryAfterSeconds: error?.retryAfterSeconds || 0,
    reason: error?.reason || 'rate_limited',
    limit: error?.limit,
    scope: error?.scope,
  });
};
