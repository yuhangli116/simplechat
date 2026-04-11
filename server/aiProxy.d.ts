export function generateTextServer(args: { prompt: string; model: string; context?: string }): Promise<any>;
export function summarizeContextServer(args: { context: string }): Promise<any>;
export function parseRequestBody(req: any): Promise<any>;
export function sendJson(res: any, statusCode: number, payload: any): any;
