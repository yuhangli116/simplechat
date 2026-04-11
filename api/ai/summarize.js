import { parseRequestBody, sendJson, summarizeContextServer } from '../../server/aiProxy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    const result = await summarizeContextServer(body);
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI summarize failed',
    });
  }
}
