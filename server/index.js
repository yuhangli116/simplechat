import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { generateTextServer, getRequestContext, sendJson, sendNdjson, streamGenerateTextServer, summarizeContextServer } from './aiProxy.js';
import { createServerLogger, persistBatchLogs, initLogger, LOG_DIR } from './logger.js';
import { checkSiteMaintenance, sendMaintenanceLocked } from './maintenance.js';
import {
  RequestGuardError,
  applyAiRequestGuard,
  applyLogRequestGuard,
  parseJwtSubject,
  sanitizeLogBatch,
  sendGuardError,
} from './security/requestGuards.js';
import { checkSecurityControls, sendSecurityBlocked } from './security/securityControls.js';
import { createPaymentSystem } from './payments/index.js';

const log = createServerLogger('Server');

// 初始化日志系统
initLogger();

const app = express();
app.disable('x-powered-by');

const normalizeEnvValue = (value) => value?.trim().replace(/^['"`]|['"`]$/g, '');
const getEnvValue = (...names) => {
  for (const name of names) {
    const direct = normalizeEnvValue(process.env[name]);
    if (direct) return direct;
    const vite = normalizeEnvValue(process.env[`VITE_${name}`]);
    if (vite) return vite;
  }
  return '';
};

const createSecuritySupabase = () => {
  const supabaseUrl = getEnvValue('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseAnonKey = getEnvValue('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    log.warn('Security middleware disabled: missing Supabase URL or anon key');
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const securitySupabase = createSecuritySupabase();
const paymentSystem = createPaymentSystem({
  env: process.env,
  supabase: securitySupabase,
  logger: createServerLogger('Payments'),
});

// 支付宝回调必须在维护锁之前处理，避免已扣款但未到账。
app.use('/api/payments', paymentSystem.callbackRouter);

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || '2mb',
  })
);

app.get('/api/site-maintenance-state', async (_req, res) => {
  try {
    const maintenance = await checkSiteMaintenance({
      supabase: securitySupabase,
      kind: 'public_state',
      path: '/site-maintenance-state',
    });
    return sendJson(res, 200, {
      enabled: maintenance.state.enabled,
      phase: maintenance.state.phase,
      planned_start_at: maintenance.state.plannedStartAt,
      planned_end_at: maintenance.state.plannedEndAt,
      announce_at: maintenance.state.announceAt,
      lock_at: maintenance.state.lockAt,
      notice_title: maintenance.state.noticeTitle,
      notice_text: maintenance.state.noticeText,
      lock_lead_minutes: 30,
      announce_lead_minutes: 2880,
      server_now: maintenance.state.serverNow,
    });
  } catch (error) {
    log.warn('Failed to load public maintenance state', {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, 200, {
      enabled: false,
      phase: 'normal',
      planned_start_at: null,
      planned_end_at: null,
      announce_at: null,
      lock_at: null,
      notice_title: '系统维护升级通知',
      notice_text: '本系统预计将在稍后开始进行系统维护升级，届时网站暂时不对外开放，请各位用户谅解。',
      lock_lead_minutes: 30,
      announce_lead_minutes: 2880,
      server_now: new Date().toISOString(),
    });
  }
});

app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path === '/site-maintenance-state') return next();
  if (!securitySupabase) return next();

  const requestContext = getRequestContext(req);
  const userId = parseJwtSubject(requestContext.accessToken || '');

  try {
    const maintenance = await checkSiteMaintenance({
      supabase: securitySupabase,
      kind: 'api_middleware',
      path: req.path,
    });

    if (maintenance.locked) {
      log.warn('API request rejected by maintenance lock', {
        path: req.path,
        method: req.method,
        userId,
        ip: requestContext.ip,
        phase: maintenance.state.phase,
      });
      return sendMaintenanceLocked(res, maintenance.state);
    }

    const security = await checkSecurityControls({
      supabase: securitySupabase,
      userId,
      ip: requestContext.ip,
      kind: 'api_middleware',
    });

    if (security.blocked) {
      log.warn('API request rejected by security middleware', {
        path: req.path,
        method: req.method,
        userId,
        ip: requestContext.ip,
        userStatus: security.userStatus,
        ipStatus: security.ipStatus,
      });
      return sendSecurityBlocked(res, security);
    }
  } catch (error) {
    log.warn('API access middleware failed open', {
      path: req.path,
      method: req.method,
      userId,
      ip: requestContext.ip,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return next();
});

app.use('/api/payments', paymentSystem.userRouter);

// ─── 日志接收端点（前端批量日志持久化） ───

app.post('/api/log', (req, res) => {
  try {
    const requestContext = getRequestContext(req);
    applyLogRequestGuard({ body: req.body || {}, req, requestContext });

    const logs = sanitizeLogBatch(req.body?.logs || []);
    if (logs.length > 0) {
      persistBatchLogs(logs);
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      log.warn('Log ingest rejected by request guard', {
        ip: getRequestContext(req).ip,
        reason: error.reason,
        scope: error.scope,
        limit: error.limit,
      });
      return sendGuardError(res, error, sendJson);
    }
    log.error('Failed to persist batch logs', { count: req.body?.logs?.length }, error);
    sendJson(res, 500, { error: 'Log persist failed' });
  }
});

app.all('/api/log', (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
});

// ─── AI 生成端点 ───

app.all('/api/ai/generate', async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const requestContext = getRequestContext(req);
  const model = req.body?.model || 'unknown';
  const userId = requestContext.accessToken ? 'authenticated' : 'anonymous';
  let releaseGuard = () => {};
  req.once('aborted', () => {
    log.warn('AI generate client connection aborted; server task may still settle provider usage', {
      traceId: req.body?.traceId,
      model,
      ip: requestContext.ip,
    });
  });

    log.info('AI generate request received', { traceId: req.body?.traceId, model, userId, ip: requestContext.ip });

  try {
    releaseGuard = applyAiRequestGuard({
      endpoint: 'generate',
      body: req.body || {},
      requestContext,
      req,
      res,
    });
    const result = await generateTextServer(req.body || {}, requestContext);

    if (result.error) {
      log.warn('AI generate returned error', {
        traceId: req.body?.traceId,
        model,
        error: result.error?.slice(0, 200),
        billing: result.billing || null,
      });
    } else {
      log.info('AI generate success', {
        traceId: req.body?.traceId,
        model,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        totalCost: result.usage?.total_cost,
        contentLength: result.content?.length,
      });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof RequestGuardError) {
      log.warn('AI generate rejected by request guard', {
        model,
        ip: requestContext.ip,
        reason: error.reason,
        scope: error.scope,
        limit: error.limit,
      });
      return sendGuardError(res, error, sendJson);
    }
    log.error('AI generate unhandled error', { traceId: req.body?.traceId, model }, error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  } finally {
    releaseGuard();
  }
});

app.all('/api/ai/generate-stream', async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const requestContext = getRequestContext(req);
  const model = req.body?.model || 'unknown';
  const traceId = req.body?.traceId;
  let releaseGuard = () => {};
  log.info('AI generate stream request received', {
    traceId,
    model,
    ip: requestContext.ip,
    workId: req.body?.workId,
    chapterId: req.body?.chapterId,
    deferChapterSave: req.body?.deferChapterSave,
  });

  try {
    releaseGuard = applyAiRequestGuard({
      endpoint: 'generateStream',
      body: req.body || {},
      requestContext,
      req,
      res,
    });

    return await sendNdjson(res, async (write) => {
      const result = await streamGenerateTextServer(req.body || {}, requestContext, {
        emit: write,
      });

      if (result.error) {
        log.warn('AI generate stream returned error', { traceId, model, error: result.error?.slice(0, 200) });
        await write({ type: 'error', error: result.error, billing: result.billing });
        return;
      }

      log.info('AI generate stream success', {
        traceId,
        model,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        totalCost: result.usage?.total_cost,
        contentLength: result.content?.length,
      });
      await write({ type: 'done', ...result });
    });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      log.warn('AI generate stream rejected by request guard', {
        traceId,
        model,
        ip: requestContext.ip,
        reason: error.reason,
        scope: error.scope,
        limit: error.limit,
      });
      return sendGuardError(res, error, sendJson);
    }
    log.error('AI generate stream unhandled error', { traceId, model }, error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  } finally {
    releaseGuard();
  }
});

// ─── AI 摘要端点 ───

app.all('/api/ai/summarize', async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const requestContext = getRequestContext(req);
  const model = req.body?.model || 'unknown';
  const traceId = req.body?.traceId;
  const billingGroupId = req.body?.billingGroupId;
  let releaseGuard = () => {};

  log.info('AI summarize request received', { traceId, model, billingGroupId, ip: requestContext.ip });

  try {
    releaseGuard = applyAiRequestGuard({
      endpoint: 'summarize',
      body: req.body || {},
      requestContext,
      req,
      res,
    });
    const result = await summarizeContextServer(req.body || {}, requestContext);

    if (result.error) {
      log.warn('AI summarize returned error', { traceId, model, billingGroupId, error: result.error?.slice(0, 200) });
    } else {
      log.info('AI summarize success', {
        traceId,
        model,
        billingGroupId,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        totalCost: result.usage?.total_cost,
      });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof RequestGuardError) {
      log.warn('AI summarize rejected by request guard', {
        traceId,
        model,
        billingGroupId,
        ip: requestContext.ip,
        reason: error.reason,
        scope: error.scope,
        limit: error.limit,
      });
      return sendGuardError(res, error, sendJson);
    }
    log.error('AI summarize unhandled error', { traceId, model, billingGroupId }, error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI summarize failed',
    });
  } finally {
    releaseGuard();
  }
});

// ─── 健康检查 ───

app.get('/api/health', (req, res) => {
  log.info('Health check');
  return sendJson(res, 200, { ok: true, logDir: LOG_DIR });
});

// ─── 静态文件与 SPA 回退 ───

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

app.use(express.static(distDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  res.sendFile(path.join(distDir, 'index.html'));
});

// ─── 启动服务器 ───

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  log.info(`SimpleChat server started`, { port, logDir: LOG_DIR, nodeEnv: process.env.NODE_ENV || 'development' });
});

const shutdown = async () => {
  await paymentSystem.close();
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
