import { createLogger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

const log = createLogger('Payment');

export interface PaymentConfigStatus {
  configured: boolean;
  enabled: boolean;
  refundsEnabled: boolean;
  requestedEnabled: boolean;
  missing: string[];
  refundMissing: string[];
  gatewayHost: string | null;
  testModeEnabled: boolean;
}

export interface MembershipCheckout {
  orderId: string;
  expiresAt: string;
  paymentHtml: string;
  amountCny: string;
  productKey: string;
  productName: string;
  testMode: boolean;
}

export interface PaymentOrder {
  id: string;
  outTradeNo: string;
  productKey: string;
  productName: string;
  amountCny: string;
  purpose: 'purchase';
  status:
    | 'created'
    | 'submitted'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'closed'
    | 'refund_pending'
    | 'partially_refunded'
    | 'refunded';
  providerErrorCode?: string | null;
  paidAt?: string | null;
  fulfilledAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export class PaymentApiError extends Error {
  code: string;
  status: number;
  details?: { missing?: string[] };

  constructor(message: string, code: string, status: number, details?: { missing?: string[] }) {
    super(message);
    this.name = 'PaymentApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const getAccessToken = async () => {
  const storeToken = useAuthStore.getState().session?.access_token;
  if (storeToken) return storeToken;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
};

const requestPaymentApi = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const accessToken = await getAccessToken();
  const response = await fetch(`/api/payments${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || '支付服务暂时不可用';
    log.warn('Payment API returned error', {
      path,
      status: response.status,
      code: payload?.code || 'PAYMENT_API_ERROR',
    });
    throw new PaymentApiError(message, payload?.code || 'PAYMENT_API_ERROR', response.status, payload?.details);
  }
  return payload as T;
};

export const getPaymentConfig = () => requestPaymentApi<PaymentConfigStatus>('/config');

export const createMembershipCheckout = (productKey: string) =>
  requestPaymentApi<MembershipCheckout>('/alipay/membership/checkout', {
    method: 'POST',
    body: JSON.stringify({ productKey }),
  });

export const getPaymentOrder = (orderId: string) =>
  requestPaymentApi<PaymentOrder>(`/orders/${encodeURIComponent(orderId)}`);

export const refreshPaymentOrder = (orderId: string) =>
  requestPaymentApi<PaymentOrder>(`/orders/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' });

export const getPaymentOrders = () =>
  requestPaymentApi<{ orders: PaymentOrder[] }>('/orders');
