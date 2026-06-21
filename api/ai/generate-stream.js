import { getRequestContext, parseRequestBody, sendJson, sendNdjson, streamGenerateTextServer } from '../../server/aiProxy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    return sendNdjson(res, async (write) => {
      const result = await streamGenerateTextServer(body, getRequestContext(req), {
        emit: write,
      });

      if (result.error) {
        await write({ type: 'error', error: result.error, billing: result.billing });
        return;
      }

      await write({ type: 'done', ...result });
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  }
}
