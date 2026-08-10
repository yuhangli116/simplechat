import { AlipaySdk } from 'alipay-sdk';

import { formatAlipayTimestamp } from './core.js';

const createSdkClient = (config) => new AlipaySdk({
  appId: config.appId,
  privateKey: config.privateKey,
  keyType: 'PKCS1',
  alipayPublicKey: config.alipayPublicKey,
  gateway: config.gateway,
  signType: config.signType,
  charset: config.charset,
  timeout: 10_000,
  camelcase: true,
  ...(config.appCertPath && config.alipayPublicCertPath && config.alipayRootCertPath ? {
    appCertPath: config.appCertPath,
    alipayPublicCertPath: config.alipayPublicCertPath,
    alipayRootCertPath: config.alipayRootCertPath,
  } : {}),
});

export const createAlipayGateway = ({ config, sdk = null, now = () => new Date() }) => {
  const client = sdk ?? createSdkClient(config);

  const createPagePayment = async (input) => {
    const expiresAt = new Date(now().getTime() + 30 * 60 * 1000);
    return client.pageExecute('alipay.trade.page.pay', 'POST', {
      notifyUrl: input.notifyUrl,
      returnUrl: input.returnUrl,
      bizContent: {
        out_trade_no: input.outTradeNo,
        total_amount: input.amountCny,
        subject: input.subject,
        body: input.body,
        product_code: 'FAST_INSTANT_TRADE_PAY',
        time_expire: formatAlipayTimestamp(expiresAt),
        timeout_express: '30m',
        qr_pay_mode: '4',
        qrcode_width: 180,
      },
    });
  };

  const queryTrade = async ({ outTradeNo, tradeNo = null }) => client.exec('alipay.trade.query', {
    bizContent: {
      out_trade_no: outTradeNo,
      ...(tradeNo ? { trade_no: tradeNo } : {}),
    },
  });

  const closeTrade = async ({ outTradeNo }) => client.exec('alipay.trade.close', {
    bizContent: { out_trade_no: outTradeNo },
  });

  const refund = async ({ outTradeNo, tradeNo, outRequestNo, amountCny, reason }) => client.exec(
    'alipay.trade.refund',
    {
      bizContent: {
        out_trade_no: outTradeNo,
        ...(tradeNo ? { trade_no: tradeNo } : {}),
        out_request_no: outRequestNo,
        refund_amount: amountCny,
        refund_reason: reason,
      },
    }
  );

  const queryRefund = async ({ outTradeNo, tradeNo, outRequestNo }) => client.exec(
    'alipay.trade.fastpay.refund.query',
    {
      bizContent: {
        out_trade_no: outTradeNo,
        ...(tradeNo ? { trade_no: tradeNo } : {}),
        out_request_no: outRequestNo,
      },
    }
  );

  return {
    createPagePayment,
    queryTrade,
    closeTrade,
    refund,
    queryRefund,
    verifyNotification: (payload) => client.checkNotifySignV2(payload),
  };
};
