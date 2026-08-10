import { createAlipayGateway } from './alipayGateway.js';
import { createPaymentAuthenticator } from './auth.js';
import { getPaymentConfigSummary, loadPaymentConfig } from './config.js';
import { createPaymentRepository } from './repository.js';
import { createPaymentRouters } from './routes.js';
import { createPaymentService } from './paymentService.js';

const unavailable = (name) => async () => {
  throw Object.assign(new Error(`支付模块未配置: ${name}`), { code: 'PAYMENT_UNAVAILABLE' });
};

const createUnavailableRepository = () => new Proxy({}, {
  get: (_target, property) => property === 'close' ? async () => {} : unavailable(String(property)),
});

const createUnavailableGateway = () => ({
  verifyNotification: () => false,
  createPagePayment: unavailable('createPagePayment'),
  queryTrade: unavailable('queryTrade'),
  closeTrade: unavailable('closeTrade'),
  refund: unavailable('refund'),
  queryRefund: unavailable('queryRefund'),
});

export const createPaymentSystem = ({ env = process.env, supabase, logger }) => {
  const config = loadPaymentConfig(env);
  const repository = config.configured
    ? createPaymentRepository({ databaseUrl: config.databaseUrl })
    : createUnavailableRepository();
  const gateway = config.configured
    ? createAlipayGateway({ config })
    : createUnavailableGateway();
  const service = createPaymentService({ config, repository, gateway, logger });
  const authenticate = createPaymentAuthenticator({ supabase });
  const routers = createPaymentRouters({ service, config, authenticate, logger });

  logger.info('Payment system initialized', getPaymentConfigSummary(config));
  return {
    ...routers,
    config,
    service,
    close: () => repository.close(),
  };
};
