export class RequestGuardError extends Error {
  statusCode: number;
  retryAfterSeconds: number;
  reason: string;
  limit?: number;
  scope?: string;
}

export function applyAiRequestGuard(args: {
  endpoint: 'generate' | 'generateStream' | 'summarize';
  body?: Record<string, unknown>;
  requestContext?: { accessToken?: string; ip?: string; userAgent?: string };
  req?: unknown;
  res?: unknown;
}): () => void;

export function applyLogRequestGuard(args: {
  body?: Record<string, unknown>;
  req?: unknown;
  requestContext?: { accessToken?: string; ip?: string; userAgent?: string };
}): void;

export function sanitizeLogBatch(logs: unknown): Array<Record<string, unknown>>;

export function sendGuardError(
  res: unknown,
  error: RequestGuardError,
  sendJson: (res: unknown, statusCode: number, payload: unknown) => unknown
): unknown;

export function parseJwtSubject(accessToken?: string): string;

export function getContentLength(req: unknown): number;
