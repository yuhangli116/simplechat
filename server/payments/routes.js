import crypto from 'node:crypto';
import express from 'express';
import iconv from 'iconv-lite';

import { getPaymentConfigSummary } from './config.js';
import { PaymentError } from './paymentService.js';

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const sendApiError = (error, res, logger, context = {}) => {
  const paymentError = error instanceof PaymentError;
  const statusCode = paymentError ? error.statusCode : 500;
  const code = paymentError ? error.code : 'PAYMENT_INTERNAL_ERROR';
  logger.error('Payment API request failed', { code, statusCode, ...context }, error);
  res.status(statusCode).json({
    error: paymentError ? error.message : '支付服务暂时不可用',
    code,
    ...(paymentError && error.details ? { details: error.details } : {}),
  });
};

const requireSecret = (req, expected) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const provided = Buffer.from(token);
  const configured = Buffer.from(String(expected || ''));
  if (!expected || provided.length !== configured.length || !crypto.timingSafeEqual(provided, configured)) {
    throw new PaymentError('INTERNAL_AUTH_FAILED', '内部任务鉴权失败', 401);
  }
};

const createRateLimiter = ({ limit, windowMs }) => {
  const buckets = new Map();
  return (key) => {
    const current = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      if (buckets.size >= 10_000) {
        for (const [bucketKey, candidate] of buckets) {
          if (candidate.resetAt <= current) buckets.delete(bucketKey);
        }
      }
      buckets.set(key, { count: 1, resetAt: current + windowMs });
      return;
    }
    if (bucket.count >= limit) {
      throw new PaymentError('PAYMENT_RATE_LIMITED', '操作过于频繁，请稍后重试', 429);
    }
    bucket.count += 1;
  };
};

const decodeFormPart = (value, charset) => {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '+') {
      bytes.push(0x20);
    } else if (value[index] === '%' && /^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(value.charCodeAt(index));
    }
  }
  return iconv.decode(Buffer.from(bytes), charset);
};

export const parseAlipayGatewayForm = (body, contentType = '') => {
  if (!Buffer.isBuffer(body)) throw new TypeError('支付宝应用网关请求体格式无效');
  const ascii = body.toString('latin1');
  const headerCharset = String(contentType).match(/charset\s*=\s*([^;\s]+)/i)?.[1];
  const formCharset = ascii.match(/(?:^|&)charset=([^&]+)/i)?.[1];
  const declared = String(headerCharset || formCharset || 'gbk').replace(/["']/g, '').toLowerCase();
  const charset = ['utf-8', 'utf8'].includes(declared) ? 'utf8' : 'gbk';
  const payload = Object.create(null);
  for (const pair of ascii.split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
    const rawValue = separator >= 0 ? pair.slice(separator + 1) : '';
    payload[decodeFormPart(rawKey, charset)] = decodeFormPart(rawValue, charset);
  }
  return payload;
};

export const createPaymentRouters = ({ service, config, authenticate, logger }) => {
  const callbackRouter = express.Router();
  const userRouter = express.Router();
  const limitCheckout = createRateLimiter({ limit: 5, windowMs: 60_000 });
  const alipayForm = express.urlencoded({
    extended: false,
    limit: '64kb',
    type: 'application/x-www-form-urlencoded',
  });
  const alipayGatewayBody = express.raw({
    limit: '64kb',
    type: 'application/x-www-form-urlencoded',
  });

  const sendAck = (res, result) => {
    res.status(200).type('text/plain').send(result.ack === 'success' ? 'success' : 'fail');
  };

  callbackRouter.post('/alipay/notify/payment', alipayForm, asyncRoute(async (req, res) => {
    logger.info('Alipay notify route hit', {
      path: req.path,
      contentType: req.headers['content-type'],
      hasBody: Boolean(req.body && Object.keys(req.body).length),
    });
    sendAck(res, await service.handlePaymentNotification(req.body || {}));
  }));
  callbackRouter.post('/alipay/gateway', alipayGatewayBody, asyncRoute(async (req, res) => {
    logger.info('Alipay gateway route hit', {
      path: req.path,
      contentType: req.headers['content-type'],
      bodyBytes: Buffer.isBuffer(req.body) ? req.body.length : 0,
    });
    const payload = parseAlipayGatewayForm(req.body, req.headers['content-type']);
    sendAck(res, await service.handlePaymentNotification(payload));
  }));
  callbackRouter.get('/alipay/return', asyncRoute(async (req, res) => {
    logger.info('Alipay return route hit', {
      path: req.path,
      outTradeNo: req.query?.out_trade_no || null,
      tradeStatus: req.query?.trade_status || null,
    });
    const result = await service.handleReturn(req.query || {});
    const target = new URL('/membership', config.notifyBaseUrl || 'http://localhost:5173');
    if (result.orderId) target.searchParams.set('payment_order_id', result.orderId);
    if (result.status) target.searchParams.set('payment_status', result.status);
    res.redirect(302, target.toString());
  }));
  callbackRouter.post('/internal/reconcile/run', express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
    requireSecret(req, config.cronSecret);
    const [orders, refunds] = await Promise.all([
      service.reconcileOrders({ limit: req.body?.limit }),
      config.refundsEnabled
        ? service.reconcileRefunds({ limit: req.body?.limit })
        : Promise.resolve({ skipped: true, reason: 'refund_not_configured' }),
    ]);
    res.json({ orders, refunds });
  }));
  callbackRouter.use((error, req, res, _next) => {
    if (req.path.startsWith('/internal/')) {
      sendApiError(error, res, logger, { path: req.path, method: req.method });
      return;
    }
    logger.error('Alipay callback route failed', {
      code: error?.code || 'CALLBACK_ROUTE_ERROR',
      path: req.path,
      method: req.method,
    }, error);
    res.status(200).type('text/plain').send('fail');
  });

  userRouter.use(express.json({ limit: '64kb' }));
  userRouter.get('/config', (_req, res) => {
    res.json(getPaymentConfigSummary(config));
  });
  userRouter.post('/alipay/membership/checkout', asyncRoute(async (req, res) => {
    const user = await authenticate(req);
    limitCheckout(`user:${user.id}`);
    limitCheckout(`ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`);
    const result = await service.createCheckout({
      userId: user.id,
      email: user.email,
      productKey: req.body?.productKey,
    });
    res.status(201).json(result);
  }));
  userRouter.get('/orders', asyncRoute(async (req, res) => {
    const user = await authenticate(req);
    res.json({ orders: await service.listOrders({ userId: user.id, limit: req.query.limit }) });
  }));
  userRouter.get('/orders/:orderId', asyncRoute(async (req, res) => {
    const user = await authenticate(req);
    res.json(await service.getOrder({ userId: user.id, orderId: req.params.orderId }));
  }));
  userRouter.post('/orders/:orderId/refresh', asyncRoute(async (req, res) => {
    const user = await authenticate(req);
    res.json(await service.refreshOrder({ userId: user.id, orderId: req.params.orderId }));
  }));
  userRouter.post('/internal/refunds', asyncRoute(async (req, res) => {
    requireSecret(req, config.adminSecret);
    res.status(202).json(await service.requestRefund({
      orderId: req.body?.orderId,
      amountCny: req.body?.amountCny,
      reason: req.body?.reason,
      requestedBy: null,
    }));
  }));
  userRouter.use((error, req, res, _next) => sendApiError(error, res, logger, {
    path: req.path,
    method: req.method,
  }));

  return { callbackRouter, userRouter };
};
