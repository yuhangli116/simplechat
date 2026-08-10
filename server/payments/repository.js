import pg from 'pg';

import { createOutTradeNo, moneyToFen } from './core.js';

const { Pool } = pg;

const createPool = (databaseUrl) => {
  const url = new URL(databaseUrl);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
  });
};

const mapProduct = (row) => row && ({
  productKey: row.product_key,
  name: row.name,
  orderType: row.order_type,
  amountCny: String(row.amount_cny),
  diamondsGranted: Number(row.diamonds_granted),
  membershipDays: row.membership_days == null ? null : Number(row.membership_days),
  version: Number(row.version),
});

const mapOrder = (row) => row && ({
  id: row.id,
  outTradeNo: row.out_trade_no,
  userId: row.user_id,
  productKey: row.product_key,
  productName: row.product_name,
  amountCny: String(row.amount_cny),
  diamondsGranted: Number(row.diamonds_granted),
  membershipDays: row.membership_days == null ? null : Number(row.membership_days),
  purpose: row.purpose,
  status: row.status,
  alipayTradeNo: row.alipay_trade_no,
  providerStatus: row.provider_status,
  providerErrorCode: row.provider_error_code,
  testMode: Boolean(row.test_mode),
  paidAt: row.paid_at,
  fulfilledAt: row.fulfilled_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

const createRepositoryError = (code, message) => Object.assign(new Error(message), { code });

export const createPaymentRepository = ({ databaseUrl, pool = null }) => {
  const db = pool ?? createPool(databaseUrl);

  const transaction = async (work) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  const createCheckoutDraft = async ({ userId, productKey, amountOverrideCny }) => transaction(async (client) => {
    const productResult = await client.query(
      `SELECT * FROM public.payment_products
       WHERE product_key = $1 AND active = TRUE
         AND order_type = 'membership'
         AND membership_days IS NOT NULL
       FOR SHARE`,
      [productKey]
    );
    if (productResult.rowCount !== 1) {
      throw createRepositoryError('PRODUCT_NOT_AVAILABLE', '会员商品不存在或已下架');
    }

    const product = productResult.rows[0];
    const amountCny = amountOverrideCny || String(product.amount_cny);
    const outTradeNo = createOutTradeNo();
    const orderResult = await client.query(
      `INSERT INTO public.payment_orders (
         out_trade_no, user_id, product_key, product_name,
         amount_cny, diamonds_granted, membership_days, product_version,
         purpose, status, test_mode, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 'purchase', 'created', $9, NOW() + INTERVAL '30 minutes')
       RETURNING *`,
      [
        outTradeNo,
        userId,
        productKey,
        product.name,
        amountCny,
        product.diamonds_granted,
        product.membership_days,
        product.version,
        Boolean(amountOverrideCny),
      ]
    );

    return { product: mapProduct(product), order: mapOrder(orderResult.rows[0]) };
  });

  const markCheckoutReady = async ({ orderId }) => {
    await db.query(
      `UPDATE public.payment_orders
       SET status = 'submitted', updated_at = NOW(), version = version + 1
       WHERE id = $1 AND status = 'created'`,
      [orderId]
    );
  };

  const markOrderFailed = async ({ orderId, errorCode, errorMessage }) => {
    await db.query(
      `UPDATE public.payment_orders
       SET status = 'failed', provider_error_code = $2,
           provider_error_message = LEFT($3, 500), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND status IN ('created', 'submitted')`,
      [orderId, errorCode, errorMessage]
    );
  };

  const findOrderByOutTradeNo = async (outTradeNo) => {
    const result = await db.query('SELECT * FROM public.payment_orders WHERE out_trade_no = $1', [outTradeNo]);
    return mapOrder(result.rows[0]);
  };

  const getOrderForUser = async ({ orderId, userId }) => {
    const result = await db.query(
      'SELECT * FROM public.payment_orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );
    return mapOrder(result.rows[0]);
  };

  const listOrdersForUser = async ({ userId, limit = 30 }) => {
    const result = await db.query(
      `SELECT * FROM public.payment_orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, Math.min(Math.max(Number(limit) || 30, 1), 100)]
    );
    return result.rows.map(mapOrder);
  };

  const applyPaymentNotification = async (input) => transaction(async (client) => {
    const eventResult = await client.query(
      `INSERT INTO public.payment_events (
         event_type, notify_id, out_trade_no, signature_verified,
         payload_sha256, payload_redacted, processing_status
       ) VALUES ($5, $1, $2, TRUE, $3, $4::jsonb, 'received')
       ON CONFLICT (provider, event_type, notify_id) DO NOTHING
       RETURNING id`,
      [
        input.notifyId,
        input.outTradeNo,
        input.payloadHash,
        JSON.stringify(input.payload),
        input.eventType || 'payment_notification',
      ]
    );
    if (eventResult.rowCount === 0) {
      const existing = await client.query(
        'SELECT status FROM public.payment_orders WHERE out_trade_no = $1',
        [input.outTradeNo]
      );
      return { duplicate: true, orderStatus: existing.rows[0]?.status ?? 'unknown' };
    }

    const orderResult = await client.query(
      `SELECT * FROM public.payment_orders
       WHERE out_trade_no = $1
       FOR UPDATE`,
      [input.outTradeNo]
    );
    if (orderResult.rowCount !== 1) throw createRepositoryError('ORDER_NOT_FOUND', '支付订单不存在');
    const order = orderResult.rows[0];

    let orderStatus = order.status;
    if (input.outcome === 'paid') {
      if (!order.fulfilled_at) {
        const paidAt = input.paidAt || new Date();
        const profileResult = await client.query(
          'SELECT member_diamonds, membership_expires_at, current_period_end FROM public.profiles WHERE id = $1 FOR UPDATE',
          [order.user_id]
        );
        if (profileResult.rowCount !== 1) throw createRepositoryError('PROFILE_NOT_FOUND', '用户资料不存在');

        const updateResult = await client.query(
          `UPDATE public.profiles
           SET membership_type = $2,
               member_diamonds = COALESCE(member_diamonds, 0) + $3,
               current_period_start = CASE
                 WHEN current_period_end IS NOT NULL AND current_period_end > $4 THEN current_period_end
                 ELSE $4
               END,
               current_period_end = CASE
                 WHEN current_period_end IS NOT NULL AND current_period_end > $4
                   THEN current_period_end + ($5::text || ' days')::interval
                 ELSE $4 + ($5::text || ' days')::interval
               END,
               membership_expires_at = CASE
                 WHEN membership_expires_at IS NOT NULL AND membership_expires_at > $4
                   THEN membership_expires_at + ($5::text || ' days')::interval
                 ELSE $4 + ($5::text || ' days')::interval
               END,
               subscription_status = 'active',
               subscription_grace_until = NULL,
               updated_at = NOW()
           WHERE id = $1
           RETURNING member_diamonds, membership_expires_at`,
          [order.user_id, order.product_key, order.diamonds_granted, paidAt, order.membership_days]
        );
        const profile = updateResult.rows[0];

        await client.query(
          `INSERT INTO public.wallet_ledger (
             user_id, asset_type, delta, business_type, business_id,
             idempotency_key, balance_after
           ) VALUES ($1, 'member_diamonds', $2, 'payment_fulfillment', $3, $4, $5)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [order.user_id, order.diamonds_granted, order.id, `fulfill:${order.id}`, profile.member_diamonds]
        );
        await client.query(
          `INSERT INTO public.member_diamond_logs (user_id, diamonds, membership_type, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [order.user_id, order.diamonds_granted, order.product_key, profile.membership_expires_at]
        );
        await client.query(
          `INSERT INTO public.recharge_logs (
             user_id, amount_cny, diamonds_obtained, diamonds_granted,
             payment_method, status, order_type, product_key, product_name,
             membership_days, transaction_id, paid_at
           )
           SELECT $1, $2, $3, $3, 'alipay', 'success', 'membership', $4, $5, $6, $7, $8
           WHERE NOT EXISTS (
             SELECT 1 FROM public.recharge_logs WHERE transaction_id = $7::varchar
           )`,
          [
            order.user_id,
            order.amount_cny,
            order.diamonds_granted,
            order.product_key,
            order.product_name,
            order.membership_days,
            input.tradeNo,
            paidAt,
          ]
        );
        await client.query(
          `UPDATE public.payment_orders
           SET status = 'succeeded', alipay_trade_no = $2,
               provider_status = $3, paid_at = $4, fulfilled_at = NOW(),
               updated_at = NOW(), version = version + 1
           WHERE id = $1`,
          [order.id, input.tradeNo, input.tradeStatus, paidAt]
        );
      }
      orderStatus = 'succeeded';
    } else if (input.outcome === 'closed') {
      await client.query(
        `UPDATE public.payment_orders
         SET status = 'closed', provider_status = $2, updated_at = NOW(), version = version + 1
         WHERE id = $1 AND fulfilled_at IS NULL`,
        [order.id, input.tradeStatus]
      );
      orderStatus = order.fulfilled_at ? order.status : 'closed';
    } else if (input.outcome === 'processing') {
      await client.query(
        `UPDATE public.payment_orders
         SET status = 'processing', provider_status = $2, updated_at = NOW(), version = version + 1
         WHERE id = $1 AND status IN ('created', 'submitted', 'processing')`,
        [order.id, input.tradeStatus]
      );
      orderStatus = 'processing';
    }

    await client.query(
      `UPDATE public.payment_events
       SET processing_status = $2, processed_at = NOW()
       WHERE id = $1`,
      [eventResult.rows[0].id, input.outcome === 'ignored' ? 'ignored' : 'processed']
    );
    return { duplicate: false, orderStatus };
  });

  const listReconcilableOrders = async ({ limit = 50 }) => {
    const result = await db.query(
      `SELECT * FROM public.payment_orders
       WHERE status IN ('created', 'submitted', 'processing')
         AND updated_at < NOW() - INTERVAL '1 minute'
       ORDER BY updated_at
       LIMIT $1`,
      [Math.min(Math.max(Number(limit) || 50, 1), 100)]
    );
    return result.rows.map(mapOrder);
  };

  const closeUnpaidOrder = async ({ orderId, providerStatus }) => {
    await db.query(
      `UPDATE public.payment_orders
       SET status = 'closed', provider_status = $2, updated_at = NOW(), version = version + 1
       WHERE id = $1 AND fulfilled_at IS NULL
         AND status IN ('created', 'submitted', 'processing')`,
      [orderId, providerStatus]
    );
  };

  const createRefundDraft = async ({ orderId, amountCny, reason, requestedBy }) => transaction(async (client) => {
    const orderResult = await client.query(
      'SELECT * FROM public.payment_orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    if (orderResult.rowCount !== 1) throw createRepositoryError('ORDER_NOT_FOUND', '退款订单不存在');
    const order = orderResult.rows[0];
    if (order.status !== 'succeeded') {
      throw createRepositoryError('ORDER_NOT_REFUNDABLE', '订单当前不可退款');
    }
    if (moneyToFen(order.amount_cny) !== moneyToFen(amountCny)) {
      throw createRepositoryError('PARTIAL_REFUND_NOT_SUPPORTED', '自动退款仅支持全额退款');
    }
    if (!order.alipay_trade_no) throw createRepositoryError('REFUND_TRADE_NO_MISSING', '订单缺少支付宝交易号');

    const latest = await client.query(
      `SELECT id FROM public.payment_orders
       WHERE user_id = $1 AND fulfilled_at IS NOT NULL AND status = 'succeeded'
       ORDER BY fulfilled_at DESC LIMIT 1`,
      [order.user_id]
    );
    if (latest.rows[0]?.id !== order.id) {
      throw createRepositoryError('REFUND_REQUIRES_LATEST_ORDER', '只能自动退款最近一笔已履约订单');
    }

    const profileResult = await client.query(
      'SELECT member_diamonds FROM public.profiles WHERE id = $1 FOR UPDATE',
      [order.user_id]
    );
    if (Number(profileResult.rows[0]?.member_diamonds || 0) < Number(order.diamonds_granted)) {
      throw createRepositoryError('REFUND_ENTITLEMENT_CONSUMED', '会员钻石已使用，需人工审核退款');
    }

    const refundResult = await client.query(
      `INSERT INTO public.payment_refunds (
         out_request_no, order_id, amount_cny, status, reason,
         requested_by, entitlement_reserved, original_order_status
       ) VALUES ($1, $2, $3, 'requested', $4, $5, TRUE, $6)
       RETURNING *`,
      [`SCRF${createOutTradeNo().slice(2)}`, order.id, amountCny, reason, requestedBy || null, order.status]
    );
    const refund = refundResult.rows[0];
    const profileUpdate = await client.query(
      `UPDATE public.profiles
       SET member_diamonds = member_diamonds - $2, updated_at = NOW()
       WHERE id = $1
       RETURNING member_diamonds`,
      [order.user_id, order.diamonds_granted]
    );
    await client.query(
      `INSERT INTO public.wallet_ledger (
         user_id, asset_type, delta, business_type, business_id,
         idempotency_key, balance_after
       ) VALUES ($1, 'member_diamonds', $2, 'refund_reserve', $3, $4, $5)`,
      [order.user_id, -Number(order.diamonds_granted), refund.id, `refund-reserve:${refund.id}`, profileUpdate.rows[0].member_diamonds]
    );
    await client.query(
      `UPDATE public.payment_orders
       SET status = 'refund_pending', updated_at = NOW(), version = version + 1
       WHERE id = $1`,
      [order.id]
    );
    return {
      id: refund.id,
      outRequestNo: refund.out_request_no,
      amountCny: String(refund.amount_cny),
      status: refund.status,
      order: mapOrder(order),
    };
  });

  const markRefundProcessing = async ({ refundId, code, message }) => {
    await db.query(
      `UPDATE public.payment_refunds
       SET status = 'processing', provider_response_code = $2,
           provider_error_message = LEFT($3, 500), updated_at = NOW()
       WHERE id = $1 AND status IN ('requested', 'processing')`,
      [refundId, code || null, message || null]
    );
  };

  const markRefundSucceeded = async ({ refundId, code }) => transaction(async (client) => {
    const refundResult = await client.query(
      `SELECT r.*, o.user_id, o.membership_days
       FROM public.payment_refunds r
       JOIN public.payment_orders o ON o.id = r.order_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [refundId]
    );
    if (refundResult.rowCount !== 1 || refundResult.rows[0].status === 'succeeded') return;
    const refund = refundResult.rows[0];
    if (!['requested', 'processing'].includes(refund.status)) {
      throw createRepositoryError('REFUND_NOT_PROCESSING', '退款状态不允许确认成功');
    }
    await client.query(
      `UPDATE public.payment_refunds
       SET status = 'succeeded', provider_response_code = $2,
           refunded_at = COALESCE(refunded_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [refundId, code || '10000']
    );
    await client.query(
      `UPDATE public.payment_orders
       SET status = 'refunded', updated_at = NOW(), version = version + 1
       WHERE id = $1`,
      [refund.order_id]
    );
    await client.query(
      `UPDATE public.recharge_logs l
       SET status = 'refunded'
       FROM public.payment_orders o
       WHERE o.id = $1 AND l.transaction_id = o.alipay_trade_no`,
      [refund.order_id]
    );
    await client.query(
      `UPDATE public.profiles
       SET membership_expires_at = GREATEST(
             NOW(), COALESCE(membership_expires_at, NOW()) - ($2::text || ' days')::interval
           ),
           current_period_start = CASE
             WHEN COALESCE(current_period_end, NOW()) - ($2::text || ' days')::interval <= NOW() THEN NULL
             ELSE COALESCE(current_period_start, current_period_end - ($2::text || ' days')::interval)
                    - ($2::text || ' days')::interval
           END,
           current_period_end = GREATEST(
             NOW(), COALESCE(current_period_end, NOW()) - ($2::text || ' days')::interval
           ),
           membership_type = CASE
             WHEN COALESCE(membership_expires_at, NOW()) - ($2::text || ' days')::interval <= NOW() THEN 'free'
             ELSE membership_type
           END,
           subscription_status = CASE
             WHEN COALESCE(membership_expires_at, NOW()) - ($2::text || ' days')::interval <= NOW() THEN 'inactive'
             ELSE subscription_status
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [refund.user_id, refund.membership_days]
    );
  });

  const markRefundFailed = async ({ refundId, code, message }) => transaction(async (client) => {
    const refundResult = await client.query(
      `SELECT r.*, o.user_id, o.diamonds_granted
       FROM public.payment_refunds r
       JOIN public.payment_orders o ON o.id = r.order_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [refundId]
    );
    if (refundResult.rowCount !== 1 || refundResult.rows[0].status === 'failed') return;
    const refund = refundResult.rows[0];
    if (refund.status === 'succeeded') {
      throw createRepositoryError('REFUND_ALREADY_SUCCEEDED', '退款已经成功，不能恢复权益');
    }

    if (refund.entitlement_reserved) {
      const profile = await client.query(
        'UPDATE public.profiles SET member_diamonds = member_diamonds + $2, updated_at = NOW() WHERE id = $1 RETURNING member_diamonds',
        [refund.user_id, refund.diamonds_granted]
      );
      await client.query(
        `INSERT INTO public.wallet_ledger (
           user_id, asset_type, delta, business_type, business_id,
           idempotency_key, balance_after
         ) VALUES ($1, 'member_diamonds', $2, 'refund_restore', $3, $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [refund.user_id, refund.diamonds_granted, refund.id, `refund-restore:${refund.id}`, profile.rows[0].member_diamonds]
      );
    }
    await client.query(
      `UPDATE public.payment_refunds
       SET status = 'failed', provider_response_code = $2,
           provider_error_message = LEFT($3, 500), updated_at = NOW()
       WHERE id = $1`,
      [refundId, code || null, message || null]
    );
    await client.query(
      `UPDATE public.payment_orders
       SET status = $2, updated_at = NOW(), version = version + 1
       WHERE id = $1 AND status = 'refund_pending'`,
      [refund.order_id, refund.original_order_status]
    );
  });

  const listProcessingRefunds = async ({ limit = 50 }) => {
    const result = await db.query(
      `SELECT r.*, o.out_trade_no, o.alipay_trade_no
       FROM public.payment_refunds r
       JOIN public.payment_orders o ON o.id = r.order_id
       WHERE r.status IN ('requested', 'processing')
         AND r.updated_at < NOW() - INTERVAL '10 seconds'
       ORDER BY r.updated_at LIMIT $1`,
      [Math.min(Math.max(Number(limit) || 50, 1), 100)]
    );
    return result.rows;
  };

  return {
    createCheckoutDraft,
    markCheckoutReady,
    markOrderFailed,
    findOrderByOutTradeNo,
    getOrderForUser,
    listOrdersForUser,
    applyPaymentNotification,
    listReconcilableOrders,
    closeUnpaidOrder,
    createRefundDraft,
    markRefundProcessing,
    markRefundSucceeded,
    markRefundFailed,
    listProcessingRefunds,
    health: () => db.query('SELECT 1 AS ok'),
    close: () => db.end(),
  };
};
