import { moneyToFen } from './core.js';

const normalize = (value) => String(value ?? '').trim().replace(/^["'`]|["'`]$/g, '');
const isTrue = (value) => normalize(value).toLowerCase() === 'true';

const REQUIRED_ENV = {
  ALIPAY_APP_ID: 'appId',
  ALIPAY_PID: 'sellerId',
  ALIPAY_APP_PRIVATE_PKCS1_KEY: 'privateKey',
  ALIPAY_PUBLIC_KEY: 'alipayPublicKey',
  SUPABASE_DB_URL: 'databaseUrl',
};

const REFUND_ENV = {
  ALIPAY_APP_CERT_PATH: 'appCertPath',
  ALIPAY_PUBLIC_CERT_PATH: 'alipayPublicCertPath',
  ALIPAY_ROOT_CERT_PATH: 'alipayRootCertPath',
  PAYMENT_ADMIN_SECRET: 'adminSecret',
};

const validateBaseUrl = (value) => {
  if (!value) return;
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) {
    throw new Error('支付通知基础地址必须使用 HTTPS');
  }
};

const validateGateway = (value) => {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('支付宝网关必须使用 HTTPS');
};

export const loadPaymentConfig = (env = process.env) => {
  const values = Object.fromEntries(
    Object.entries(REQUIRED_ENV).map(([envName, property]) => [property, normalize(env[envName])])
  );
  values.notifyBaseUrl = (normalize(env.ALIPAY_NOTIFY_BASE_URL) || normalize(env.APP_URL)).replace(/\/+$/, '');
  values.cronSecret = normalize(env.PAYMENT_CRON_SECRET);
  Object.assign(values, Object.fromEntries(
    Object.entries(REFUND_ENV).map(([envName, property]) => [property, normalize(env[envName])])
  ));

  const coreMissing = Object.entries(REQUIRED_ENV)
    .filter(([, property]) => !values[property])
    .map(([envName]) => envName);
  if (!values.notifyBaseUrl) coreMissing.push('ALIPAY_NOTIFY_BASE_URL');
  const refundMissing = Object.entries(REFUND_ENV)
    .filter(([, property]) => !values[property])
    .map(([envName]) => envName);

  validateBaseUrl(values.notifyBaseUrl);

  const testModeEnabled = isTrue(env.ALIPAY_TEST_MODE);
  const testUserEmail = normalize(env.ALIPAY_TEST_USER_EMAIL).toLowerCase();
  const testAmountCny = normalize(env.ALIPAY_TEST_AMOUNT_CNY || '0.01');
  if (testModeEnabled) {
    if (!testUserEmail) throw new Error('测试支付必须配置 ALIPAY_TEST_USER_EMAIL');
    if (moneyToFen(testAmountCny) > 10_000) {
      throw new Error('测试支付金额不能超过 100 元');
    }
  }

  const requestedEnabled = isTrue(env.PAYMENT_ENABLED);
  const configured = coreMissing.length === 0;
  const missing = [...coreMissing];
  const gateway = normalize(env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do');
  validateGateway(gateway);
  return {
    ...values,
    configured,
    enabled: requestedEnabled && configured,
    refundsEnabled: configured && refundMissing.length === 0,
    requestedEnabled,
    missing,
    refundMissing,
    gateway,
    signType: 'RSA2',
    charset: 'utf-8',
    productCode: 'FAST_INSTANT_TRADE_PAY',
    testMode: {
      enabled: testModeEnabled,
      userEmail: testUserEmail,
      amountCny: testAmountCny,
    },
  };
};

export const getPaymentConfigSummary = (config) => ({
  configured: config.configured,
  enabled: config.enabled,
  refundsEnabled: config.refundsEnabled,
  requestedEnabled: config.requestedEnabled,
  missing: [...config.missing],
  refundMissing: [...config.refundMissing],
  gatewayHost: config.gateway ? new URL(config.gateway).host : null,
  testModeEnabled: config.testMode.enabled,
});
