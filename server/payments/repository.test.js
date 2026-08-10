import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaymentRepository } from './repository.js';

test('payment notification fulfillment uses a stable transaction_id type cast', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO public.payment_events')) return { rowCount: 1, rows: [{ id: 'event-1' }] };
      if (sql.includes('SELECT * FROM public.payment_orders')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'order-1',
            user_id: 'user-1',
            product_key: 'monthly',
            product_name: '月卡',
            amount_cny: 0.01,
            diamonds_granted: 12000000,
            membership_days: 30,
            status: 'submitted',
            fulfilled_at: null,
            out_trade_no: 'SC1',
          }],
        };
      }
      if (sql.includes('SELECT member_diamonds, membership_expires_at, current_period_end')) {
        return { rowCount: 1, rows: [{ member_diamonds: 12000000, membership_expires_at: new Date('2026-09-01T00:00:00Z'), current_period_end: new Date('2026-09-01T00:00:00Z') }] };
      }
      if (sql.includes('UPDATE public.profiles')) {
        return { rowCount: 1, rows: [{ member_diamonds: 12000000, membership_expires_at: new Date('2026-09-01T00:00:00Z') }] };
      }
      if (sql.includes('INSERT INTO public.wallet_ledger')) return { rowCount: 1, rows: [] };
      if (sql.includes('INSERT INTO public.member_diamond_logs')) return { rowCount: 1, rows: [] };
      if (sql.includes('INSERT INTO public.recharge_logs')) return { rowCount: 1, rows: [] };
      if (sql.includes('UPDATE public.payment_orders')) return { rowCount: 1, rows: [] };
      if (sql.includes('UPDATE public.payment_events')) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };

  const repository = createPaymentRepository({
    databaseUrl: 'postgresql://user:pass@localhost/db',
    pool: {
      connect: async () => client,
      query: async (...args) => client.query(...args),
      end: async () => {},
    },
  });

  await repository.applyPaymentNotification({
    eventType: 'trade_query',
    notifyId: 'query:trade-1:TRADE_SUCCESS',
    outTradeNo: 'SC1',
    tradeNo: 'trade-1',
    tradeStatus: 'TRADE_SUCCESS',
    outcome: 'paid',
    paidAt: new Date('2026-08-03T13:28:45Z'),
    payloadHash: 'hash',
    payload: { foo: 'bar' },
  });

  const rechargeSql = queries.find(({ sql }) => String(sql).includes('INSERT INTO public.recharge_logs'))?.sql || '';
  assert.match(rechargeSql, /transaction_id = \$7::varchar/);
});
