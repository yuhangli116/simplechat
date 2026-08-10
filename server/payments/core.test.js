import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAlipayTimestamp,
  moneyToFen,
  redactPaymentPayload,
} from './core.js';

test('moneyToFen preserves two-decimal money without floating point rounding', () => {
  assert.equal(moneyToFen('49.90'), 4990);
  assert.equal(moneyToFen('0.01'), 1);
  assert.equal(moneyToFen(9.9), 990);
  assert.throws(() => moneyToFen('0'));
  assert.throws(() => moneyToFen('1.001'));
  assert.throws(() => moneyToFen('not-money'));
});

test('formatAlipayTimestamp uses Beijing yyyy-MM-dd HH:mm:ss independent of server timezone', () => {
  const value = formatAlipayTimestamp(new Date('2026-07-31T01:08:07.000Z'));
  assert.equal(value, '2026-07-31 09:08:07');
  assert.doesNotMatch(value, /T|Z/);
});

test('redactPaymentPayload keeps audit fields and removes secrets and account data', () => {
  const redacted = redactPaymentPayload({
    notify_id: 'notify-1',
    out_trade_no: 'SC202607310001',
    trade_no: '202607312200001',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '49.90',
    app_id: 'app-1',
    seller_id: 'seller-1',
    buyer_logon_id: 'secret@example.com',
    sign: 'signature-secret',
    privateKey: 'private-secret',
  });

  assert.deepEqual(redacted, {
    notify_id: 'notify-1',
    out_trade_no: 'SC202607310001',
    trade_no: '202607312200001',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '49.90',
    app_id: 'app-1',
    seller_id: 'seller-1',
  });
  assert.equal(JSON.stringify(redacted).includes('secret'), false);
});
