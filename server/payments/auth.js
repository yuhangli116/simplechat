import { PaymentError } from './paymentService.js';

const getBearerToken = (req) => {
  const authorization = String(req.headers?.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

export const createPaymentAuthenticator = ({ supabase }) => async (req) => {
  const token = getBearerToken(req);
  if (!token || !supabase) {
    throw new PaymentError('AUTH_REQUIRED', '请先登录后再购买', 401);
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new PaymentError('AUTH_INVALID', '登录状态已失效，请重新登录', 401);
  }
  return data.user;
};
