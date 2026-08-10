import assert from 'node:assert/strict';
import test from 'node:test';

import { createAlipayGateway } from './alipayGateway.js';

const createSdk = () => {
  const calls = [];
  return {
    calls,
    sdk: {
      pageExecute(method, httpMethod, params) {
        calls.push(['pageExecute', method, httpMethod, params]);
        return '<form name="punchout_form"></form>';
      },
      exec(method, params) {
        calls.push(['exec', method, params]);
        return Promise.resolve({ code: '10000' });
      },
      checkNotifySignV2(payload) {
        calls.push(['checkNotifySignV2', payload]);
        return true;
      },
    },
  };
};

const config = {
  appId: 'app-1',
  sellerId: 'seller-1',
  privateKey: 'pkcs1-key',
  alipayPublicKey: 'alipay-public-key',
  gateway: 'https://openapi.alipay.com/gateway.do',
  signType: 'RSA2',
  charset: 'utf-8',
  productCode: 'FAST_INSTANT_TRADE_PAY',
};

test('page payment uses POST pageExecute with FAST_INSTANT_TRADE_PAY', async () => {
  const fixture = createSdk();
  const gateway = createAlipayGateway({ config, sdk: fixture.sdk, now: () => new Date(2026, 6, 31, 9, 0, 0) });
  const result = await gateway.createPagePayment({
    outTradeNo: 'SC-1',
    subject: 'SimpleChat 月卡',
    body: '月卡会员一次性购买',
    amountCny: '0.01',
    notifyUrl: 'https://simplechat.love/api/payments/alipay/notify/payment',
    returnUrl: 'https://simplechat.love/api/payments/alipay/return',
  });

  assert.equal(result, '<form name="punchout_form"></form>');
  const [, method, httpMethod, params] = fixture.calls[0];
  assert.equal(method, 'alipay.trade.page.pay');
  assert.equal(httpMethod, 'POST');
  assert.equal(params.notifyUrl, 'https://simplechat.love/api/payments/alipay/notify/payment');
  assert.equal(params.returnUrl, 'https://simplechat.love/api/payments/alipay/return');
  assert.equal(params.bizContent.product_code, 'FAST_INSTANT_TRADE_PAY');
  assert.equal(params.bizContent.total_amount, '0.01');
  assert.equal(params.bizContent.time_expire, '2026-07-31 09:30:00');
});

test('query, close, refund and notification verification delegate to SDK', async () => {
  const fixture = createSdk();
  const gateway = createAlipayGateway({ config, sdk: fixture.sdk });
  const payload = { sign: 'signature', out_trade_no: 'SC-1' };

  await gateway.queryTrade({ outTradeNo: 'SC-1', tradeNo: 'trade-1' });
  await gateway.closeTrade({ outTradeNo: 'SC-1' });
  await gateway.refund({
    outTradeNo: 'SC-1',
    tradeNo: 'trade-1',
    outRequestNo: 'SCRF-1',
    amountCny: '0.01',
    reason: '测试退款',
  });
  assert.equal(gateway.verifyNotification(payload), true);

  assert.equal(fixture.calls[0][1], 'alipay.trade.query');
  assert.equal(fixture.calls[1][1], 'alipay.trade.close');
  assert.equal(fixture.calls[2][1], 'alipay.trade.refund');
  assert.strictEqual(fixture.calls[3][1], payload);
});
