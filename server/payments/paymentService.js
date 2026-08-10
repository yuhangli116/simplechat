import {
  hashPaymentPayload,
  moneyToFen,
  parseAlipayTimestamp,
  redactPaymentPayload,
} from './core.js';

const PAID_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PaymentError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const requireFields = (payload, fields) => {
  const missing = fields.filter((field) => !payload[field]);
  if (missing.length > 0) {
    throw new PaymentError('INVALID_NOTIFICATION', `支付宝通知缺少字段: ${missing.join(', ')}`);
  }
};

const paymentOutcome = (tradeStatus) => {
  if (PAID_STATUSES.has(tradeStatus)) return 'paid';
  if (tradeStatus === 'TRADE_CLOSED') return 'closed';
  if (tradeStatus === 'WAIT_BUYER_PAY') return 'processing';
  return 'ignored';
};

const REPOSITORY_ERROR_STATUS = new Map([
  ['PRODUCT_NOT_AVAILABLE', 409],
  ['ORDER_NOT_FOUND', 404],
  ['ORDER_NOT_REFUNDABLE', 409],
  ['PARTIAL_REFUND_NOT_SUPPORTED', 422],
  ['REFUND_TRADE_NO_MISSING', 409],
  ['REFUND_REQUIRES_LATEST_ORDER', 409],
  ['REFUND_ENTITLEMENT_CONSUMED', 409],
]);

const translateRepositoryError = (error) => {
  if (error instanceof PaymentError) return error;
  const status = REPOSITORY_ERROR_STATUS.get(error?.code);
  return status ? new PaymentError(error.code, error.message, status) : error;
};

export const createPaymentService = ({
  config,
  repository,
  gateway,
  logger,
  now = () => new Date(),
}) => {
  const assertConfigured = () => {
    if (!config.configured) {
      throw new PaymentError(
        'PAYMENT_UNAVAILABLE',
        '支付服务尚未完成正式配置',
        503,
        { missing: config.missing ?? [] }
      );
    }
  };

  const assertEnabled = () => {
    if (!config.enabled) {
      throw new PaymentError(
        'PAYMENT_UNAVAILABLE',
        '支付服务尚未完成正式配置',
        503,
        { missing: config.missing ?? [] }
      );
    }
  };

  const assertRefundsEnabled = () => {
    assertConfigured();
    if (!config.refundsEnabled) {
      throw new PaymentError(
        'REFUND_UNAVAILABLE',
        '退款服务尚未完成证书和管理配置',
        503,
        { missing: config.refundMissing ?? [] }
      );
    }
  };

  const createCheckout = async ({ userId, email, productKey }) => {
    assertEnabled();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const isAllowlistedTest = config.testMode.enabled
      && normalizedEmail
      && normalizedEmail === config.testMode.userEmail;
    const amountOverrideCny = isAllowlistedTest ? config.testMode.amountCny : null;

    let draft;
    try {
      draft = await repository.createCheckoutDraft({ userId, productKey, amountOverrideCny });
    } catch (error) {
      throw translateRepositoryError(error);
    }

    try {
      const amountCny = amountOverrideCny ?? draft.order.amountCny;
      const paymentHtml = await gateway.createPagePayment({
        outTradeNo: draft.order.outTradeNo,
        subject: `SimpleChat ${draft.product.name}`,
        body: `${draft.product.name}会员一次性购买，到账后有效期${draft.product.membershipDays}天`,
        amountCny,
        notifyUrl: `${config.notifyBaseUrl}/api/payments/alipay/notify/payment`,
        returnUrl: `${config.notifyBaseUrl}/api/payments/alipay/return`,
      });
      await repository.markCheckoutReady({ orderId: draft.order.id });
      logger.info('Alipay page payment created', {
        orderId: draft.order.id,
        outTradeNo: draft.order.outTradeNo,
        productKey,
        amountCny,
        testMode: isAllowlistedTest,
        notifyUrlHost: new URL(config.notifyBaseUrl).host,
      });
      return {
        orderId: draft.order.id,
        expiresAt: draft.order.expiresAt,
        paymentHtml,
        amountCny,
        productKey,
        productName: draft.product.name,
        testMode: isAllowlistedTest,
      };
    } catch (error) {
      try {
        await repository.markOrderFailed({
          orderId: draft.order.id,
          errorCode: error?.code || 'ALIPAY_CHECKOUT_ERROR',
          errorMessage: '支付宝网页支付表单生成失败',
        });
      } catch (stateError) {
        logger.error('Failed to persist Alipay checkout failure', {
          orderId: draft.order.id,
          code: stateError?.code || 'CHECKOUT_STATE_ERROR',
        });
      }
      logger.error('Alipay checkout failed', {
        orderId: draft.order.id,
        outTradeNo: draft.order.outTradeNo,
        code: error?.code || 'ALIPAY_CHECKOUT_ERROR',
      });
      throw new PaymentError('ALIPAY_CHECKOUT_FAILED', '支付宝下单失败，请稍后重试', 502);
    }
  };

  const validateProviderResult = ({ order, appId, sellerId, amountCny, outTradeNo, tradeNo }) => {
    if (outTradeNo && outTradeNo !== order.outTradeNo) {
      throw new PaymentError('PAYMENT_ORDER_MISMATCH', '支付宝订单号不匹配', 502);
    }
    if (appId && appId !== config.appId) {
      throw new PaymentError('PAYMENT_APP_MISMATCH', '支付宝应用不匹配', 502);
    }
    if (sellerId && sellerId !== config.sellerId) {
      throw new PaymentError('PAYMENT_SELLER_MISMATCH', '支付宝商户不匹配', 502);
    }
    if (amountCny && moneyToFen(amountCny) !== moneyToFen(order.amountCny)) {
      throw new PaymentError('PAYMENT_AMOUNT_MISMATCH', '支付宝金额不匹配', 502);
    }
    if (order.alipayTradeNo && tradeNo && order.alipayTradeNo !== tradeNo) {
      throw new PaymentError('PAYMENT_TRADE_NO_MISMATCH', '支付宝交易号冲突', 502);
    }
  };

  const applyTradeResult = async ({ order, tradeStatus, tradeNo, paidAt, payload, eventType, notifyId }) => {
    const outcome = paymentOutcome(tradeStatus);
    if (outcome === 'paid' && !tradeNo) {
      throw new PaymentError('PAYMENT_TRADE_NO_MISSING', '支付宝支付成功结果缺少交易号', 502);
    }
    return repository.applyPaymentNotification({
      eventType,
      notifyId,
      outTradeNo: order.outTradeNo,
      tradeNo: tradeNo || null,
      tradeStatus,
      outcome,
      paidAt,
      payloadHash: hashPaymentPayload(payload),
      payload: redactPaymentPayload(payload),
    });
  };

  const handlePaymentNotification = async (payload) => {
    logger.info('Alipay payment notification received', {
      notifyId: payload?.notify_id,
      notifyType: payload?.notify_type,
      outTradeNo: payload?.out_trade_no,
      tradeStatus: payload?.trade_status,
      hasTradeNo: Boolean(payload?.trade_no),
    });
    if (!gateway.verifyNotification(payload)) {
      logger.warn('Rejected Alipay payment notification signature', {
        notifyId: payload?.notify_id,
        outTradeNo: payload?.out_trade_no,
      });
      return { ack: 'fail', reason: 'invalid_signature' };
    }

    try {
      requireFields(payload, [
        'notify_id',
        'notify_type',
        'out_trade_no',
        'trade_status',
        'total_amount',
        'app_id',
        'seller_id',
      ]);
      if (payload.notify_type !== 'trade_status_sync') return { ack: 'fail', reason: 'notify_type_mismatch' };
      const order = await repository.findOrderByOutTradeNo(payload.out_trade_no);
      if (!order) {
        logger.warn('Alipay payment notification order not found', {
          notifyId: payload.notify_id,
          outTradeNo: payload.out_trade_no,
        });
        return { ack: 'fail', reason: 'order_not_found' };
      }
      validateProviderResult({
        order,
        appId: payload.app_id,
        sellerId: payload.seller_id,
        amountCny: payload.total_amount,
        outTradeNo: payload.out_trade_no,
        tradeNo: payload.trade_no,
      });
      const result = await applyTradeResult({
        order,
        tradeStatus: payload.trade_status,
        tradeNo: payload.trade_no,
        paidAt: parseAlipayTimestamp(payload.gmt_payment),
        payload,
        eventType: 'payment_notification',
        notifyId: payload.notify_id,
      });
      logger.success('Alipay payment notification processed', {
        notifyId: payload.notify_id,
        outTradeNo: payload.out_trade_no,
        tradeStatus: payload.trade_status,
        duplicate: result.duplicate,
        orderStatus: result.orderStatus,
      });
      return { ack: 'success', ...result };
    } catch (error) {
      logger.error('Alipay payment notification failed', {
        notifyId: payload?.notify_id,
        outTradeNo: payload?.out_trade_no,
        code: error?.code || 'NOTIFY_PROCESSING_ERROR',
      });
      return { ack: 'fail', reason: error?.code || 'processing_error' };
    }
  };

  const applyTradeQuery = async ({ order, response }) => {
    logger.info('Alipay trade query returned', {
      orderId: order.id,
      outTradeNo: order.outTradeNo,
      code: response.code,
      subCode: response.subCode,
      tradeStatus: response.tradeStatus,
      hasTradeNo: Boolean(response.tradeNo || order.alipayTradeNo),
    });
    if (String(response.code) !== '10000' || !response.tradeStatus) {
      return { confirmed: false, orderStatus: order.status };
    }
    validateProviderResult({
      order,
      amountCny: response.totalAmount,
      outTradeNo: response.outTradeNo,
      tradeNo: response.tradeNo,
    });
    const payload = {
      notify_id: `query:${response.tradeNo || order.outTradeNo}:${response.tradeStatus}`,
      out_trade_no: order.outTradeNo,
      trade_no: response.tradeNo || order.alipayTradeNo || null,
      trade_status: response.tradeStatus,
      total_amount: response.totalAmount || order.amountCny,
      app_id: config.appId,
      seller_id: config.sellerId,
    };
    const applied = await applyTradeResult({
      order,
      tradeStatus: response.tradeStatus,
      tradeNo: response.tradeNo || order.alipayTradeNo,
      paidAt: parseAlipayTimestamp(response.sendPayDate),
      payload,
      eventType: 'trade_query',
      notifyId: payload.notify_id,
    });
    return {
      confirmed: true,
      orderStatus: applied.orderStatus,
      tradeNo: response.tradeNo || order.alipayTradeNo,
      tradeStatus: response.tradeStatus,
    };
  };

  const getOrder = async ({ userId, orderId }) => {
    assertConfigured();
    if (!UUID_PATTERN.test(String(orderId || ''))) {
      throw new PaymentError('ORDER_ID_INVALID', '订单编号格式无效', 400);
    }
    const order = await repository.getOrderForUser({ userId, orderId });
    if (!order) throw new PaymentError('ORDER_NOT_FOUND', '订单不存在', 404);
    return order;
  };

  const listOrders = ({ userId, limit }) => {
    assertConfigured();
    return repository.listOrdersForUser({ userId, limit });
  };

  const refreshOrder = async ({ userId, orderId }) => {
    assertConfigured();
    const order = await getOrder({ userId, orderId });
    if (['succeeded', 'refunded', 'closed', 'failed'].includes(order.status)) return order;

    const response = await gateway.queryTrade({
      outTradeNo: order.outTradeNo,
      tradeNo: order.alipayTradeNo,
    });
    const applied = await applyTradeQuery({ order, response });
    if (!applied.confirmed) {
      logger.warn('Alipay order query remains unknown', {
        orderId,
        outTradeNo: order.outTradeNo,
        code: response.code,
        subCode: response.subCode,
      });
      return order;
    }
    logger.info('Alipay order refreshed', {
      orderId,
      outTradeNo: order.outTradeNo,
      tradeStatus: applied.tradeStatus,
      orderStatus: applied.orderStatus,
    });
    return { ...order, status: applied.orderStatus, alipayTradeNo: applied.tradeNo };
  };

  const handleReturn = async (query) => {
    assertConfigured();
    const outTradeNo = query?.out_trade_no;
    logger.info('Alipay return received', { outTradeNo: outTradeNo || null });
    if (!outTradeNo) return { orderId: null, status: 'missing_out_trade_no' };
    const order = await repository.findOrderByOutTradeNo(outTradeNo);
    if (!order) {
      logger.warn('Alipay return order not found', { outTradeNo });
      return { orderId: null, status: 'order_not_found' };
    }
    try {
      const response = await gateway.queryTrade({ outTradeNo, tradeNo: order.alipayTradeNo });
      const applied = await applyTradeQuery({ order, response });
      logger.info('Alipay return resolved', {
        orderId: order.id,
        outTradeNo,
        tradeStatus: applied.tradeStatus,
        orderStatus: applied.orderStatus || order.status,
      });
      return { orderId: order.id, status: applied.orderStatus || order.status };
    } catch (error) {
      logger.warn('Alipay return query failed', {
        orderId: order.id,
        outTradeNo,
        code: error?.code || 'RETURN_QUERY_ERROR',
      });
      return { orderId: order.id, status: 'unknown' };
    }
  };

  const reconcileOrders = async ({ limit = 50 } = {}) => {
    assertConfigured();
    const orders = await repository.listReconcilableOrders({ limit });
    const summary = { checked: 0, succeeded: 0, processing: 0, closed: 0, unknown: 0 };
    for (const order of orders) {
      summary.checked += 1;
      try {
        const response = await gateway.queryTrade({
          outTradeNo: order.outTradeNo,
          tradeNo: order.alipayTradeNo,
        });
        const applied = await applyTradeQuery({ order, response });
        if (applied.confirmed && applied.orderStatus === 'succeeded') {
          summary.succeeded += 1;
          continue;
        }

        const expired = new Date(order.expiresAt).getTime() <= now().getTime();
        const providerMissing = String(response.code) === '40004'
          && ['ACQ.TRADE_NOT_EXIST', 'TRADE_NOT_EXIST'].includes(response.subCode);
        if (expired && (providerMissing || applied.tradeStatus === 'WAIT_BUYER_PAY')) {
          if (!providerMissing) {
            const close = await gateway.closeTrade({ outTradeNo: order.outTradeNo });
            if (String(close.code) !== '10000') {
              summary.unknown += 1;
              continue;
            }
          }
          await repository.closeUnpaidOrder({
            orderId: order.id,
            providerStatus: providerMissing ? response.subCode : 'TRADE_CLOSED',
          });
          summary.closed += 1;
        } else if (applied.confirmed) {
          summary.processing += 1;
        } else {
          summary.unknown += 1;
        }
      } catch (error) {
        summary.unknown += 1;
        logger.warn('Alipay order reconciliation remains unknown', {
          orderId: order.id,
          outTradeNo: order.outTradeNo,
          code: error?.code || 'ORDER_RECONCILIATION_ERROR',
        });
      }
    }
    logger.info('Alipay order reconciliation completed', summary);
    return summary;
  };

  const requestRefund = async ({ orderId, amountCny, reason, requestedBy = null }) => {
    assertRefundsEnabled();
    let draft;
    try {
      draft = await repository.createRefundDraft({ orderId, amountCny, reason, requestedBy });
    } catch (error) {
      throw translateRepositoryError(error);
    }
    try {
      const response = await gateway.refund({
        outTradeNo: draft.order.outTradeNo,
        tradeNo: draft.order.alipayTradeNo,
        outRequestNo: draft.outRequestNo,
        amountCny: draft.amountCny,
        reason,
      });
      if (String(response.code) === '10000' && response.fundChange === 'Y') {
        await repository.markRefundSucceeded({ refundId: draft.id, code: response.code });
        logger.info('Alipay refund succeeded', { refundId: draft.id, orderId });
        return { ...draft, status: 'succeeded' };
      }
      await repository.markRefundProcessing({
        refundId: draft.id,
        code: response.subCode || response.code,
        message: response.subMsg || response.msg || null,
      });
      logger.warn('Alipay refund pending', { refundId: draft.id, orderId, code: response.subCode || response.code });
      return { ...draft, status: 'processing' };
    } catch (error) {
      await repository.markRefundFailed({
        refundId: draft.id,
        code: error?.code || 'REFUND_REQUEST_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
      logger.error('Alipay refund failed', { refundId: draft.id, orderId, code: error?.code || 'REFUND_REQUEST_ERROR' });
      throw new PaymentError('REFUND_FAILED', '支付宝退款失败，权益已恢复', 502);
    }
  };

  const reconcileRefunds = async ({ limit = 50 } = {}) => {
    assertRefundsEnabled();
    const refunds = await repository.listProcessingRefunds({ limit });
    const summary = { checked: 0, succeeded: 0, failed: 0, unknown: 0 };
    for (const refund of refunds) {
      summary.checked += 1;
      try {
        const response = await gateway.queryRefund({
          outTradeNo: refund.out_trade_no,
          tradeNo: refund.alipay_trade_no,
          outRequestNo: refund.out_request_no,
        });
        if (String(response.code) === '10000' && response.refundStatus === 'REFUND_SUCCESS') {
          await repository.markRefundSucceeded({ refundId: refund.id, code: response.code });
          summary.succeeded += 1;
        } else if (String(response.code) === '40004') {
          await repository.markRefundFailed({
            refundId: refund.id,
            code: response.subCode || response.code,
            message: response.subMsg || response.msg || '退款不存在',
          });
          summary.failed += 1;
        } else {
          summary.unknown += 1;
        }
      } catch (error) {
        summary.unknown += 1;
        logger.warn('Alipay refund reconciliation remains unknown', {
          refundId: refund.id,
          code: error?.code || 'REFUND_QUERY_ERROR',
        });
      }
    }
    logger.info('Alipay refund reconciliation completed', summary);
    return summary;
  };

  return {
    createCheckout,
    handlePaymentNotification,
    getOrder,
    listOrders,
    refreshOrder,
    handleReturn,
    reconcileOrders,
    requestRefund,
    reconcileRefunds,
  };
};
