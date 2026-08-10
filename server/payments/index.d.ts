export interface PaymentSystem {
  callbackRouter: any;
  userRouter: any;
  config: Record<string, any>;
  service: Record<string, (...args: any[]) => any>;
  close: () => Promise<void>;
}

export function createPaymentSystem(args: {
  env?: Record<string, string | undefined>;
  supabase?: any;
  logger: ServerLogger;
}): PaymentSystem;
import type { ServerLogger } from '../logger.js';
