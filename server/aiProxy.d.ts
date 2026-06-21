export function generateTextServer(args: { prompt: string; model: string; context?: string }, requestContext?: { accessToken?: string; ip?: string; userAgent?: string }): Promise<any>;
export function streamGenerateTextServer(args: { prompt: string; model: string; context?: string }, requestContext?: { accessToken?: string; ip?: string; userAgent?: string }, stream?: { emit?: (event: any) => Promise<void> | void }): Promise<any>;
export function summarizeContextServer(args: { context: string; model?: string; billingGroupId?: string; traceId?: string }, requestContext?: { accessToken?: string; ip?: string; userAgent?: string }): Promise<any>;
export function getRequestContext(req: any): { accessToken?: string; ip?: string; userAgent?: string };
export function parseRequestBody(req: any): Promise<any>;
export function sendJson(res: any, statusCode: number, payload: any): any;
export function sendNdjson(res: any, producer: (write: (event: any) => Promise<void>) => Promise<void>): Promise<void>;
