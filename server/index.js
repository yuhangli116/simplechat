import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTextServer, sendJson, summarizeContextServer } from './aiProxy.js';

const app = express();
app.disable('x-powered-by');

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || '2mb',
  })
);

app.all('/api/ai/generate', async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const result = await generateTextServer(req.body || {});
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  }
});

app.all('/api/ai/summarize', async (req, res) => {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const result = await summarizeContextServer(req.body || {});
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI summarize failed',
    });
  }
});

app.get('/api/health', (req, res) => sendJson(res, 200, { ok: true }));

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

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`simplechat server listening on ${port}`);
});
