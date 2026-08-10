BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_products (
  product_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('membership', 'fuel_pack')),
  amount_cny NUMERIC(10, 2) NOT NULL CHECK (amount_cny > 0),
  diamonds_granted INTEGER NOT NULL CHECK (diamonds_granted >= 0),
  membership_days INTEGER CHECK (membership_days IS NULL OR membership_days > 0),
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.payment_products (
  product_key,
  name,
  order_type,
  amount_cny,
  diamonds_granted,
  membership_days
) VALUES
  ('monthly', '月卡', 'membership', 0.01, 12000000, 30),
  ('quarterly', '季卡', 'membership', 0.01, 35000000, 90),
  ('yearly', '年卡', 'membership', 0.01, 150000000, 365)
ON CONFLICT (product_key) DO UPDATE SET
  name = EXCLUDED.name,
  order_type = EXCLUDED.order_type,
  amount_cny = EXCLUDED.amount_cny,
  diamonds_granted = EXCLUDED.diamonds_granted,
  membership_days = EXCLUDED.membership_days,
  version = public.payment_products.version + 1,
  active = TRUE,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  out_trade_no VARCHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_key TEXT NOT NULL REFERENCES public.payment_products(product_key),
  product_name TEXT NOT NULL,
  amount_cny NUMERIC(10, 2) NOT NULL CHECK (amount_cny > 0 AND amount_cny <= 100),
  diamonds_granted INTEGER NOT NULL CHECK (diamonds_granted >= 0),
  membership_days INTEGER CHECK (membership_days IS NULL OR membership_days > 0),
  product_version INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose = 'purchase'),
  status TEXT NOT NULL CHECK (status IN (
    'created', 'submitted', 'processing', 'succeeded', 'failed',
    'closed', 'refund_pending', 'partially_refunded', 'refunded'
  )),
  alipay_trade_no VARCHAR(64),
  provider_status TEXT,
  provider_error_code TEXT,
  provider_error_message TEXT,
  test_mode BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_alipay_trade_no_uq
  ON public.payment_orders(alipay_trade_no)
  WHERE alipay_trade_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON public.payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_pending_idx
  ON public.payment_orders(status, expires_at)
  WHERE status IN ('created', 'submitted', 'processing');

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'alipay',
  event_type TEXT NOT NULL,
  notify_id TEXT NOT NULL,
  out_trade_no VARCHAR(64),
  signature_verified BOOLEAN NOT NULL,
  payload_sha256 TEXT NOT NULL,
  payload_redacted JSONB NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN (
    'received', 'processed', 'ignored', 'failed'
  )),
  error_code TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, event_type, notify_id)
);

CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON public.payment_events(out_trade_no, received_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  out_request_no VARCHAR(64) NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  amount_cny NUMERIC(10, 2) NOT NULL CHECK (amount_cny > 0),
  status TEXT NOT NULL CHECK (status IN ('requested', 'processing', 'succeeded', 'failed')),
  reason TEXT NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_response_code TEXT,
  provider_error_message TEXT,
  entitlement_reserved BOOLEAN NOT NULL DEFAULT FALSE,
  original_order_status TEXT NOT NULL CHECK (original_order_status = 'succeeded'),
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_refunds_status_updated_idx
  ON public.payment_refunds(status, updated_at)
  WHERE status IN ('requested', 'processing');

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('member_diamonds', 'permanent_diamonds')),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  business_type TEXT NOT NULL,
  business_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx
  ON public.wallet_ledger(user_id, created_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
  CHECK (subscription_status IN ('inactive', 'active'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_grace_until TIMESTAMPTZ;

ALTER TABLE public.payment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active payment products are readable" ON public.payment_products;
CREATE POLICY "Active payment products are readable"
  ON public.payment_products FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders"
  ON public.payment_orders FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payment refunds" ON public.payment_refunds;
CREATE POLICY "Users can view own payment refunds"
  ON public.payment_refunds FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payment_orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own wallet ledger" ON public.wallet_ledger;
CREATE POLICY "Users can view own wallet ledger"
  ON public.wallet_ledger FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.payment_orders, public.payment_events, public.payment_refunds, public.wallet_ledger
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_products TO anon, authenticated;
GRANT SELECT ON public.payment_orders, public.payment_refunds, public.wallet_ledger TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_recharge_order(VARCHAR, VARCHAR)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_membership_purchase(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_fuel_pack_purchase(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_recharge_callback(UUID)
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can insert their own recharge logs" ON public.recharge_logs;
REVOKE INSERT, UPDATE, DELETE ON public.recharge_logs FROM PUBLIC, anon, authenticated;

COMMIT;
