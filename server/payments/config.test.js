import assert from 'node:assert/strict';
import test from 'node:test';

import { loadPaymentConfig } from './config.js';

const validEnv = {
  PAYMENT_ENABLED: 'true',
  ALIPAY_APP_ID: 'app-1',
  ALIPAY_PID: 'seller-1',
  ALIPAY_APP_PRIVATE_PKCS1_KEY: 'pkcs1-key',
  ALIPAY_PUBLIC_KEY: 'public-key',
  APP_URL: 'https://simplechat.love',
  SUPABASE_DB_URL: 'postgres://db',
};

test('payment stays disabled when production identifiers or PKCS1 key are missing', () => {
  const config = loadPaymentConfig({
    ALIPAY_PUBLIC_KEY: 'public-key',
    ALIPAY_APP_PRIVATE_KEY: 'pkcs8-key-must-not-be-used',
    APP_URL: 'https://simplechat.love',
    SUPABASE_DB_URL: 'postgres://db',
  });

  assert.equal(config.enabled, false);
  assert.ok(config.missing.includes('ALIPAY_APP_ID'));
  assert.ok(config.missing.includes('ALIPAY_PID'));
  assert.ok(config.missing.includes('ALIPAY_APP_PRIVATE_PKCS1_KEY'));
  assert.equal(config.privateKey, '');
});

test('one-time payment enables without sign-scene or recurring-payment cron configuration', () => {
  const config = loadPaymentConfig(validEnv);

  assert.equal(config.enabled, true);
  assert.equal(config.configured, true);
  assert.equal(config.productCode, 'FAST_INSTANT_TRADE_PAY');
  assert.deepEqual(config.missing, []);
});

test('test price is never zero and only applies to the allowlisted account', () => {
  const config = loadPaymentConfig({
    ...validEnv,
    ALIPAY_TEST_MODE: 'true',
    ALIPAY_TEST_USER_EMAIL: 'test@example.com',
    ALIPAY_TEST_AMOUNT_CNY: '0.01',
  });

  assert.deepEqual(config.testMode, {
    enabled: true,
    userEmail: 'test@example.com',
    amountCny: '0.01',
  });

  assert.throws(() =>
    loadPaymentConfig({
      ...validEnv,
      ALIPAY_TEST_MODE: 'true',
      ALIPAY_TEST_USER_EMAIL: 'test@example.com',
      ALIPAY_TEST_AMOUNT_CNY: '0',
    })
  );

  assert.throws(() =>
    loadPaymentConfig({
      ...validEnv,
      ALIPAY_TEST_MODE: 'true',
      ALIPAY_TEST_USER_EMAIL: 'test@example.com',
      ALIPAY_TEST_AMOUNT_CNY: '100.01',
    })
  );
});

test('refund capability requires certificate mode and a separate admin secret', () => {
  const config = loadPaymentConfig(validEnv);

  assert.equal(config.refundsEnabled, false);
  assert.deepEqual(config.refundMissing.sort(), [
    'ALIPAY_APP_CERT_PATH',
    'ALIPAY_PUBLIC_CERT_PATH',
    'ALIPAY_ROOT_CERT_PATH',
    'PAYMENT_ADMIN_SECRET',
  ]);
});
