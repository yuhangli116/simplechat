import { getRequestContext, parseRequestBody, sendJson, sendNdjson, streamGenerateTextServer } from '../../server/aiProxy.js';
import { RequestGuardError, applyAiRequestGuard, sendGuardError } from '../../server/security/requestGuards.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let releaseGuard = () => {};
  try {
    const body = await parseRequestBody(req);
    const requestContext = getRequestContext(req);
    releaseGuard = applyAiRequestGuard({
      endpoint: 'generateStream',
      body,
      requestContext,
      req,
      res,
    });
    return sendNdjson(res, async (write) => {
      const result = await streamGenerateTextServer(body, requestContext, {
        emit: write,
      });

      if (result.error) {
        await write({ type: 'error', error: result.error, billing: result.billing });
        return;
      }

      await write({ type: 'done', ...result });
    });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return sendGuardError(res, error, sendJson);
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI request failed',
    });
  } finally {
    releaseGuard();
  }
}
