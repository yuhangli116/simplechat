import { getRequestContext, parseRequestBody, sendJson, summarizeContextServer } from '../../server/aiProxy.js';
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
      endpoint: 'summarize',
      body,
      requestContext,
      req,
      res,
    });
    const result = await summarizeContextServer(body, requestContext);
    return sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return sendGuardError(res, error, sendJson);
    }
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI summarize failed',
    });
  } finally {
    releaseGuard();
  }
}
