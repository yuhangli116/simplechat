import assert from 'node:assert/strict';
import test from 'node:test';

import { PaymentError, createPaymentService } from './paymentService.js';

const baseConfig = {
  configured: true,
  enabled: true,
  refundsEnabled: true,
  appId: 'app-1',
  sellerId: 'seller-1',
  notifyBaseUrl: 'https://simplechat.love',
  productCode: 'FAST_INSTANT_TRADE_PAY',
  testMode: { enabled: false, userEmail: '', amountCny: '0.01' },
};
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const createFixture = (overrides = {}) => {
  const calls = [];
  const order = {
    id: ORDER_ID,
    outTradeNo: 'SC202607310001',
    userId: 'user-1',
    productKey: 'monthly',
    productName: '月卡',
    amountCny: '0.01',
    status: 'submitted',
    expiresAt: '2026-07-31T01:30:00.000Z',
  };
  const product = {
    productKey: 'monthly',
    name: '月卡',
    amountCny: '0.01',
    diamondsGranted: 12_000_000,
    membershipDays: 30,
  };
  const repository = {
    async createCheckoutDraft(input) {
      calls.push(['createCheckoutDraft', input]);
      return { order: { ...order, productKey: input.productKey }, product: { ...product, productKey: input.productKey } };
    },
    async markCheckoutReady(input) {
      calls.push(['markCheckoutReady', input]);
    },
    async markOrderFailed(input) {
      calls.push(['markOrderFailed', input]);
    },
    async findOrderByOutTradeNo(value) {
      calls.push(['findOrderByOutTradeNo', value]);
      return order;
    },
    async applyPaymentNotification(input) {
      calls.push(['applyPaymentNotification', input]);
      return { duplicate: false, orderStatus: input.outcome === 'paid' ? 'succeeded' : input.outcome };
    },
    async getOrderForUser(input) {
      calls.push(['getOrderForUser', input]);
      return order;
    },
    async listOrdersForUser(input) {
      calls.push(['listOrdersForUser', input]);
      return [order];
    },
    async listReconcilableOrders(input) {
      calls.push(['listReconcilableOrders', input]);
      return [];
    },
    async closeUnpaidOrder(input) {
      calls.push(['closeUnpaidOrder', input]);
    },
    async createRefundDraft(input) {
      calls.push(['createRefundDraft', input]);
      return {
        id: 'refund-1',
        outRequestNo: 'SCRF-1',
        amountCny: '0.01',
        status: 'requested',
        order: { ...order, alipayTradeNo: 'trade-1' },
      };
    },
    async markRefundProcessing(input) {
      calls.push(['markRefundProcessing', input]);
    },
    async markRefundSucceeded(input) {
      calls.push(['markRefundSucceeded', input]);
    },
    async markRefundFailed(input) {
      calls.push(['markRefundFailed', input]);
    },
    async listProcessingRefunds(input) {
      calls.push(['listProcessingRefunds', input]);
      return [];
    },
    ...overrides.repository,
  };
  const gateway = {
    verifyNotification() {
      return true;
    },
    async createPagePayment(input) {
      calls.push(['createPagePayment', input]);
      return '<form name="punchout_form"></form>';
    },
    async queryTrade(input) {
      calls.push(['queryTrade', input]);
      return {
        code: '10000',
        tradeStatus: 'TRADE_SUCCESS',
        tradeNo: 'trade-query-1',
        outTradeNo: order.outTradeNo,
        totalAmount: order.amountCny,
        sendPayDate: '2026-07-31 09:00:00',
      };
    },
    async refund(input) {
      calls.push(['refund', input]);
      return { code: '10000', fundChange: 'Y' };
    },
    async queryRefund(input) {
      calls.push(['queryRefund', input]);
      return { code: '10000', refundStatus: 'REFUND_SUCCESS' };
    },
    async closeTrade(input) {
      calls.push(['closeTrade', input]);
      return { code: '10000' };
    },
    ...overrides.gateway,
  };
  const logger = {
    info: (message, data) => calls.push(['log.info', message, data]),
    success: (message, data) => calls.push(['log.success', message, data]),
    warn: (message, data) => calls.push(['log.warn', message, data]),
    error: (message, data) => calls.push(['log.error', message, data]),
  };
  const service = createPaymentService({
    config: { ...baseConfig, ...overrides.config },
    repository,
    gateway,
    logger,
    now: overrides.now ?? (() => new Date('2026-07-31T01:00:00.000Z')),
  });
  return { service, calls, order, product };
};

test('checkout creates page payment for monthly, quarterly and yearly products', async () => {
  for (const productKey of ['monthly', 'quarterly', 'yearly']) {
    const { service, calls } = createFixture();
    const result = await service.createCheckout({ userId: 'user-1', email: 'user@example.com', productKey });

    assert.equal(result.orderId, ORDER_ID);
    assert.equal(result.paymentHtml, '<form name="punchout_form"></form>');
    assert.equal(result.productKey, productKey);
    const draftCall = calls.find(([name]) => name === 'createCheckoutDraft');
    const gatewayCall = calls.find(([name]) => name === 'createPagePayment');
    assert.equal(draftCall[1].productKey, productKey);
    assert.equal(gatewayCall[1].notifyUrl, 'https://simplechat.love/api/payments/alipay/notify/payment');
    assert.equal(gatewayCall[1].returnUrl, 'https://simplechat.love/api/payments/alipay/return');
  }
});

test('allowlisted test checkout overrides amount to 0.01 only server-side', async () => {
  const { service, calls } = createFixture({
    config: {
      testMode: {
        enabled: true,
        userEmail: 'buyer@example.com',
        amountCny: '0.01',
      },
    },
  });
  const result = await service.createCheckout({ userId: 'user-1', email: 'buyer@example.com', productKey: 'yearly' });

  assert.equal(result.amountCny, '0.01');
  assert.equal(calls.find(([name]) => name === 'createCheckoutDraft')[1].amountOverrideCny, '0.01');
});

test('payment notification verifies signature and grants only paid statuses', async () => {
  const { service, calls } = createFixture();
  const result = await service.handlePaymentNotification({
    notify_id: 'notify-1',
    notify_type: 'trade_status_sync',
    out_trade_no: 'SC202607310001',
    trade_no: 'trade-1',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '0.01',
    app_id: 'app-1',
    seller_id: 'seller-1',
    gmt_payment: '2026-07-31 09:00:00',
    sign: 'signature',
  });

  assert.equal(result.ack, 'success');
  const applied = calls.find(([name]) => name === 'applyPaymentNotification');
  assert.equal(applied[1].outcome, 'paid');
  assert.equal(applied[1].tradeNo, 'trade-1');
});

test('payment notification rejects mismatched amount without fulfillment', async () => {
  const { service, calls } = createFixture();
  const result = await service.handlePaymentNotification({
    notify_id: 'notify-1',
    notify_type: 'trade_status_sync',
    out_trade_no: 'SC202607310001',
    trade_no: 'trade-1',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '9.99',
    app_id: 'app-1',
    seller_id: 'seller-1',
    sign: 'signature',
  });

  assert.equal(result.ack, 'fail');
  assert.equal(calls.some(([name]) => name === 'applyPaymentNotification'), false);
});

test('invalid notification signature returns fail for Alipay retry', async () => {
  const { service } = createFixture({
    gateway: { verifyNotification: () => false },
  });

  const result = await service.handlePaymentNotification({ notify_id: 'notify-1' });

  assert.deepEqual(result, { ack: 'fail', reason: 'invalid_signature' });
});

test('manual refresh confirms provider result before fulfillment', async () => {
  const { service, calls } = createFixture();

  const result = await service.refreshOrder({ userId: 'user-1', orderId: ORDER_ID });

  assert.equal(result.status, 'succeeded');
  assert.equal(calls.some(([name]) => name === 'queryTrade'), true);
  assert.equal(calls.find(([name]) => name === 'applyPaymentNotification')[1].eventType, 'trade_query');
});

test('failed provider query does not ask user to repay or grant early', async () => {
  const { service, calls } = createFixture({
    gateway: {
      async queryTrade(input) {
        calls.push(['queryTrade', input]);
        return { code: '20000', subCode: 'isp.unknow-error' };
      },
    },
  });

  const result = await service.refreshOrder({ userId: 'user-1', orderId: ORDER_ID });

  assert.equal(result.status, 'submitted');
  assert.equal(calls.some(([name]) => name === 'applyPaymentNotification'), false);
});

test('Alipay return endpoint queries provider and returns the local order id', async () => {
  const { service } = createFixture();

  const result = await service.handleReturn({ out_trade_no: 'SC202607310001' });

  assert.deepEqual(result, { orderId: ORDER_ID, status: 'succeeded' });
});

test('refund success reserves entitlement first and then confirms provider result', async () => {
  const { service, calls } = createFixture();

  const result = await service.requestRefund({
    orderId: ORDER_ID,
    amountCny: '0.01',
    reason: '测试退款',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(calls.some(([name]) => name === 'createRefundDraft'), true);
  assert.equal(calls.some(([name]) => name === 'markRefundSucceeded'), true);
});

test('unconfigured payment fails with explicit diagnostics', async () => {
  const { service } = createFixture({
    config: { configured: false, enabled: false, missing: ['ALIPAY_APP_ID'] },
  });

  await assert.rejects(
    () => service.createCheckout({ userId: 'user-1', email: 'user@example.com', productKey: 'monthly' }),
    (error) => error instanceof PaymentError && error.code === 'PAYMENT_UNAVAILABLE'
  );
});
