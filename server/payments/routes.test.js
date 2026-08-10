import assert from 'node:assert/strict';
import test from 'node:test';

import express from 'express';
import iconv from 'iconv-lite';

import { PaymentError } from './paymentService.js';
import { createPaymentRouters } from './routes.js';

const logger = {
  info() {},
  success() {},
  warn() {},
  error() {},
};

const createServer = async ({ service = {}, authenticate = async () => ({ id: 'user-1', email: 'u@example.com' }) } = {}) => {
  const config = {
    configured: true,
    enabled: true,
    refundsEnabled: false,
    requestedEnabled: true,
    missing: [],
    refundMissing: ['PAYMENT_ADMIN_SECRET'],
    gateway: 'https://openapi.alipay.com/gateway.do',
    testMode: { enabled: false },
    cronSecret: 'cron-secret',
    adminSecret: '',
    notifyBaseUrl: 'https://simplechat.love',
  };
  const defaults = {
    handlePaymentNotification: async () => ({ ack: 'success' }),
    handleReturn: async () => ({ orderId: 'order-1', status: 'succeeded' }),
    createCheckout: async () => ({ orderId: 'order-1' }),
    listOrders: async () => [],
    getOrder: async () => ({ id: 'order-1' }),
    refreshOrder: async () => ({ id: 'order-1' }),
    reconcileOrders: async () => ({ checked: 0 }),
    reconcileRefunds: async () => ({ checked: 0 }),
    requestRefund: async () => ({ id: 'refund-1' }),
    ...service,
  };
  const routers = createPaymentRouters({ service: defaults, config, authenticate, logger });
  const app = express();
  app.use('/api/payments', routers.callbackRouter);
  app.use('/api/payments', routers.userRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '0.0.0.0', () => resolve(instance));
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/payments`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
};

test('Alipay form callbacks return exactly success after service processing', async (t) => {
  let received = null;
  const server = await createServer({
    service: {
      handlePaymentNotification: async (payload) => {
        received = payload;
        return { ack: 'success' };
      },
    },
  });
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/alipay/notify/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'notify_id=notify-1&trade_status=TRADE_SUCCESS',
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type').startsWith('text/plain'), true);
  assert.equal(await response.text(), 'success');
  assert.equal(received.notify_id, 'notify-1');
});

test('callback failures still return HTTP 200 with exactly fail for Alipay retry', async (t) => {
  const server = await createServer({
    service: {
      handlePaymentNotification: async () => {
        throw new Error('temporary database failure');
      },
    },
  });
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/alipay/notify/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'notify_id=notify-2',
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'fail');
});

test('application gateway decodes GBK notifications before verification', async (t) => {
  let received = null;
  const server = await createServer({
    service: {
      handlePaymentNotification: async (payload) => {
        received = payload;
        return { ack: 'success' };
      },
    },
  });
  t.after(server.close);
  const body = iconv.encode('notify_id=notify-gbk&memo=用户解约', 'gbk');

  const response = await fetch(`${server.baseUrl}/alipay/gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=gbk' },
    body,
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'success');
  assert.equal(received.memo, '用户解约');
});

test('checkout rejects invalid authentication without calling payment logic', async (t) => {
  let called = false;
  const server = await createServer({
    authenticate: async () => {
      throw new PaymentError('AUTH_INVALID', '登录状态已失效', 401);
    },
    service: {
      createCheckout: async () => {
        called = true;
      },
    },
  });
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/alipay/membership/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productKey: 'monthly' }),
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_INVALID');
  assert.equal(called, false);
});

test('checkout endpoint accepts monthly, quarterly and yearly product keys', async (t) => {
  const received = [];
  const server = await createServer({
    service: {
      createCheckout: async (input) => {
        received.push(input.productKey);
        return { orderId: `order-${input.productKey}`, paymentHtml: '<form></form>' };
      },
    },
  });
  t.after(server.close);

  for (const productKey of ['monthly', 'quarterly', 'yearly']) {
    const response = await fetch(`${server.baseUrl}/alipay/membership/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productKey }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).orderId, `order-${productKey}`);
  }
  assert.deepEqual(received, ['monthly', 'quarterly', 'yearly']);
});

test('Alipay return redirects back to membership with local order status', async (t) => {
  const server = await createServer();
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/alipay/return?out_trade_no=SC1`, {
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get('location'),
    'https://simplechat.love/membership?payment_order_id=order-1&payment_status=succeeded'
  );
});

test('maintenance-bypass reconciliation endpoint requires the cron secret', async (t) => {
  const server = await createServer();
  t.after(server.close);

  const rejected = await fetch(`${server.baseUrl}/internal/reconcile/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).code, 'INTERNAL_AUTH_FAILED');

  const accepted = await fetch(`${server.baseUrl}/internal/reconcile/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer cron-secret',
    },
    body: '{}',
  });
  assert.equal(accepted.status, 200);
  const payload = await accepted.json();
  assert.equal(payload.orders.checked, 0);
  assert.equal(payload.refunds.skipped, true);
});

test('config endpoint exposes diagnostics but no secrets', async (t) => {
  const server = await createServer();
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/config`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.enabled, true);
  assert.equal(payload.gatewayHost, 'openapi.alipay.com');
  assert.equal(JSON.stringify(payload).includes('cron-secret'), false);
});
