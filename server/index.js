import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTextServer, getRequestContext, sendJson, summarizeContextServer } from './aiProxy.js';
import { createServerLogger, persistBatchLogs, initLogger, LOG_DIR } from './logger.js';

const log = createServerLogger('Server');

// 初始化日志系统
initLogger();

const app = express();
app.disable('x-powered-by');

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || '2mb',
  })
);

// ─── 日志接收端点（前端批量日志持久化） ───

app.post('/api/log', (req, res) => {
  try {
    const { logs } = req.body || {};
    if (Array.isArray(logs) && logs.length > 0) {
      persistBatchLogs(logs);
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
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

  log.info('AI generate request received', { model, userId, ip: requestContext.ip });

  try {
    const result = await generateTextServer(req.body || {}, requestContext);

    if (result.error) {
      log.warn('AI generate returned error', { model, error: result.error?.slice(0, 200) });
    } else {
      log.info('AI generate success', {
        model,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        totalCost: result.usage?.total_cost,
        contentLength: result.content?.length,
      });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    log.error('AI generate unhandled error', { model }, error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  }
});

// ─── AI 摘要端点 ───

app.all('/api/ai/summarize', async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const requestContext = getRequestContext(req);
  const model = req.body?.model || 'unknown';

  log.info('AI summarize request received', { model, ip: requestContext.ip });

  try {
    const result = await summarizeContextServer(req.body || {}, requestContext);

    if (result.error) {
      log.warn('AI summarize returned error', { model, error: result.error?.slice(0, 200) });
    } else {
      log.info('AI summarize success', {
        model,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        totalCost: result.usage?.total_cost,
      });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    log.error('AI summarize unhandled error', { model }, error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI summarize failed',
    });
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
