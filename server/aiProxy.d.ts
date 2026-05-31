export function generateTextServer(args: { prompt: string; model: string; context?: string }, requestContext?: { accessToken?: string; ip?: string; userAgent?: string }): Promise<any>;
export function summarizeContextServer(args: { context: string; model?: string }, requestContext?: { accessToken?: string; ip?: string; userAgent?: string }): Promise<any>;
export function getRequestContext(req: any): { accessToken?: string; ip?: string; userAgent?: string };
export function parseRequestBody(req: any): Promise<any>;
export function sendJson(res: any, statusCode: number, payload: any): any;
