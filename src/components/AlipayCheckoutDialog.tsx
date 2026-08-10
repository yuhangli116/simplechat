import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';

import {
  MembershipCheckout,
  PaymentOrder,
  refreshPaymentOrder,
} from '@/services/payment';

interface AlipayCheckoutDialogProps {
  checkout: MembershipCheckout | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

const terminalStatuses = new Set(['succeeded', 'failed', 'closed', 'refunded']);
const SUCCESS_AUTO_CLOSE_MS = 3000;

const statusCopy = (order: PaymentOrder | null) => {
  if (!order) return { title: '支付宝扫码支付', detail: '请在弹窗内使用支付宝扫码完成付款', tone: 'pending' as const };
  if (order.status === 'succeeded') return { title: '支付成功', detail: '会员权益已到账', tone: 'success' as const };
  if (order.status === 'failed') return { title: '支付失败', detail: '未产生权益，请重新下单', tone: 'error' as const };
  if (order.status === 'closed') return { title: '订单已关闭', detail: '订单未完成付款，没有产生扣费', tone: 'error' as const };
  if (order.status === 'refund_pending') return { title: '退款处理中', detail: '请勿重复提交退款', tone: 'warning' as const };
  if (order.status === 'refunded') return { title: '已退款', detail: '退款结果已确认', tone: 'success' as const };
  return { title: '正在确认支付', detail: '请勿重复付款，若已支付请点击查询结果', tone: 'pending' as const };
};

const submitAlipayForm = (paymentHtml: string, target: string) => {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.overflow = 'hidden';
  container.innerHTML = paymentHtml;
  document.body.appendChild(container);
  const form = container.querySelector('form');
  if (!form) {
    container.remove();
    throw new Error('支付宝支付表单格式无效');
  }
  form.setAttribute('target', target);
  form.submit();
  window.setTimeout(() => container.remove(), 1000);
};

const openAlipayInNewWindow = (paymentHtml: string) => {
  const target = `alipay_checkout_${Date.now()}`;
  window.open('about:blank', target, 'noopener,noreferrer,width=460,height=720');
  submitAlipayForm(paymentHtml, target);
};

export const AlipayCheckoutDialog = ({ checkout, onClose, onSuccess }: AlipayCheckoutDialogProps) => {
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState('');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const submitted = useRef(false);
  const successHandled = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const iframeName = useMemo(() => `alipay_checkout_frame_${checkout?.orderId || 'empty'}`, [checkout?.orderId]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const loadOrder = useCallback(async (manual = false) => {
    if (!checkout) return null;
    if (manual) setRefreshing(true);
    try {
      const next = await refreshPaymentOrder(checkout.orderId);
      setOrder(next);
      setError('');
      if (next.status === 'succeeded' && !successHandled.current) {
        successHandled.current = true;
        clearCloseTimer();
        await onSuccess();
        closeTimer.current = window.setTimeout(onClose, SUCCESS_AUTO_CLOSE_MS);
      }
      return next;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '订单查询失败');
      return null;
    } finally {
      if (manual) setRefreshing(false);
    }
  }, [checkout, clearCloseTimer, onClose, onSuccess]);

  useEffect(() => {
    if (!checkout) return;
    setOrder(null);
    setError('');
    setIframeLoaded(false);
    submitted.current = false;
    successHandled.current = false;
    clearCloseTimer();
    const timer = window.setTimeout(() => {
      if (submitted.current) return;
      submitted.current = true;
      try {
        submitAlipayForm(checkout.paymentHtml, iframeName);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : '跳转支付宝失败');
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [checkout, clearCloseTimer, iframeName]);

  useEffect(() => {
    if (!checkout) return;
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const poll = async () => {
      if (cancelled) return;
      const next = document.hidden ? null : await loadOrder(false);
      if (cancelled || (next && terminalStatuses.has(next.status))) return;
      attempts += 1;
      timer = window.setTimeout(poll, attempts < 15 ? 2000 : 5000);
    };
    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      clearCloseTimer();
    };
  }, [checkout, clearCloseTimer, loadOrder]);

  if (!checkout) return null;
  const copy = statusCopy(order);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-label="支付宝支付">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-card">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-border">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-foreground">支付宝支付</h2>
            <p className="mt-1 text-sm text-gray-500">{checkout.productName} · ¥{Number(checkout.amountCny).toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-muted" aria-label="关闭支付窗口">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col px-6 py-6">
          <div className="mb-4 text-center">
            <div className={`text-base font-semibold ${copy.tone === 'error' ? 'text-red-700' : copy.tone === 'success' ? 'text-emerald-700' : 'text-gray-900 dark:text-foreground'}`}>
              {copy.title}
            </div>
            <div className="mt-1 text-sm text-gray-500">{copy.detail}</div>
            {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
          </div>

          <div className="relative mx-auto flex h-[230px] w-[230px] items-center justify-center overflow-hidden rounded-lg bg-white">
            {!iframeLoaded && copy.tone === 'pending' ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 text-sm text-gray-500">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-purple-600" />
                正在加载二维码...
              </div>
            ) : null}
            {copy.tone === 'success' ? (
              <div className="flex h-full flex-col items-center justify-center">
                <CheckCircle2 className="h-16 w-16 text-emerald-600" />
                <div className="mt-4 text-sm text-emerald-700">支付成功，可以关闭窗口。</div>
              </div>
            ) : copy.tone === 'error' ? (
              <div className="flex h-full flex-col items-center justify-center">
                <AlertTriangle className="h-16 w-16 text-red-600" />
                <div className="mt-4 text-sm text-red-700">{copy.detail}</div>
              </div>
            ) : (
              <iframe
                title="支付宝扫码支付"
                name={iframeName}
                className="h-[210px] w-[185px] translate-x-[2px] border-0 bg-white"
                scrolling="no"
                onLoad={() => setIframeLoaded(true)}
              />
            )}
          </div>

          <div className="mt-5 grid w-full grid-cols-2 gap-3">
            <button
              onClick={() => {
                submitted.current = true;
                setIframeLoaded(false);
                try {
                  submitAlipayForm(checkout.paymentHtml, iframeName);
                } catch (submitError) {
                  setError(submitError instanceof Error ? submitError.message : '跳转支付宝失败');
                }
              }}
              disabled={Boolean(order && terminalStatuses.has(order.status))}
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-gray-300 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:text-foreground dark:hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" />
              重新加载
            </button>
            <button
              onClick={() => loadOrder(true)}
              disabled={refreshing || Boolean(order && terminalStatuses.has(order.status))}
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-purple-600 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              查询结果
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                openAlipayInNewWindow(checkout.paymentHtml);
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : '打开支付宝失败');
              }
            }}
            disabled={Boolean(order && terminalStatuses.has(order.status))}
            className="mt-3 text-center text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            二维码无法显示？在新窗口打开
          </button>
        </div>
      </div>
    </div>
  );
};
