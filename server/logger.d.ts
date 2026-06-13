export const LOG_DIR: string;

export function formatTimestamp(date?: Date): string;

export interface ServerLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  success(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>, error?: unknown): void;
}

export function createServerLogger(module: string): ServerLogger;
export function persistBatchLogs(entries: unknown[]): void;
export function initLogger(): void;
export function stopCleanupTimer(): void;

declare const defaultLoggerFactory: typeof createServerLogger;
export default defaultLoggerFactory;
