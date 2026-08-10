import React, { useCallback, useEffect, useState } from 'react';
import { Check, Crown, ShieldCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { formatDiamonds, listActivePaymentProducts, PricingProduct } from '@/services/billing';
import { AlipayCheckoutDialog } from '@/components/AlipayCheckoutDialog';
import {
  createMembershipCheckout,
  getPaymentConfig,
  refreshPaymentOrder,
  MembershipCheckout,
  PaymentConfigStatus,
} from '@/services/payment';

const Membership = () => {
  const [activeTab, setActiveTab] = useState<'member' | 'fuel'>('member');
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);
  const [products, setProducts] = useState<{ membership: PricingProduct[]; fuelPacks: PricingProduct[] } | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [checkout, setCheckout] = useState<MembershipCheckout | null>(null);
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, fetchProfile } = useAuthStore();
  const { addToast } = useToastStore();

  useEffect(() => {
    let mounted = true;
    setProductsLoading(true);
    listActivePaymentProducts()
      .then((nextProducts) => {
        if (mounted) setProducts(nextProducts);
      })
      .catch(() => {
        if (mounted) addToast('商品价格读取失败，已临时使用默认配置', 'error');
      })
      .finally(() => {
        if (mounted) setProductsLoading(false);
      });

    getPaymentConfig()
      .then(setPaymentConfig)
      .catch(() => setPaymentConfig({
        configured: false,
        enabled: false,
        refundsEnabled: false,
        requestedEnabled: false,
        missing: [],
        refundMissing: [],
        gatewayHost: null,
        testModeEnabled: false,
      }));

    return () => {
      mounted = false;
    };
  }, [addToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('payment_order_id');
    if (!orderId || !user || isGuestUser(user)) return;
    refreshPaymentOrder(orderId)
      .then(async (order) => {
        if (order.status === 'succeeded') {
          await fetchProfile();
          addToast('支付成功，会员权益已到账', 'success');
        } else if (order.status === 'processing' || order.status === 'submitted') {
          addToast('支付结果正在确认，请勿重复付款', 'info');
        } else if (order.status === 'closed' || order.status === 'failed') {
          addToast('订单未支付成功，未产生权益', 'error');
        }
      })
      .catch(() => addToast('支付结果查询失败，请稍后在订单记录中刷新', 'error'))
      .finally(() => {
        params.delete('payment_order_id');
        params.delete('payment_status');
        const nextQuery = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      });
  }, [addToast, fetchProfile, user]);

  const handlePurchase = async (params: { orderType: 'membership' | 'fuel_pack'; productKey: string }) => {
    if (!user || isGuestUser(user)) {
      if (confirm('购买功能需要登录后才能使用，是否前往登录？')) {
        navigate('/login');
      }
      return;
    }

    if (params.orderType !== 'membership') {
      addToast('该商品暂未开放支付宝在线购买', 'info');
      return;
    }
    if (!paymentConfig?.enabled) {
      addToast('支付通道尚未完成配置', 'error');
      return;
    }
    setPurchasingKey(params.productKey);
    try {
      setCheckout(await createMembershipCheckout(params.productKey));
    } catch (error) {
      addToast(error instanceof Error ? error.message : '创建支付订单失败', 'error');
    } finally {
      setPurchasingKey(null);
    }
  };

  const handlePaymentSuccess = useCallback(async () => {
    await fetchProfile();
    addToast('购买成功，会员权益已到账', 'success');
  }, [addToast, fetchProfile]);

  const handleCheckoutClose = useCallback(() => {
    setCheckout(null);
  }, []);

  return (
    <div className="flex-1 h-full bg-gray-50 dark:bg-background overflow-y-auto p-8">
      {/* Header Tabs */}
      <div className="flex items-center space-x-8 border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab('member')}
          className={`pb-4 text-base font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === 'member' ? 'text-gray-900 dark:text-foreground' : 'text-gray-500 hover:text-gray-700 dark:hover:text-foreground'
          }`}
        >
          <Crown className="w-4 h-4" />
          购买会员
          {activeTab === 'member' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900 dark:bg-purple-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('fuel')}
          className={`pb-4 text-base font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === 'fuel' ? 'text-gray-900 dark:text-foreground' : 'text-gray-500 hover:text-gray-700 dark:hover:text-foreground'
          }`}
        >
          <Zap className="w-4 h-4" />
          加油包 (永久)
          {activeTab === 'fuel' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900 dark:bg-purple-400" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto">
        {paymentConfig && !paymentConfig.enabled && (
          <div className="mb-6 flex items-center gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldCheck className="h-5 w-5 flex-none" />
            支付通道正在配置，当前不会产生扣费。
          </div>
        )}
        {activeTab === 'member' && (
          <MemberPlans
            plans={products?.membership || []}
            loading={productsLoading}
            onPurchase={handlePurchase}
            paymentEnabled={Boolean(paymentConfig?.enabled)}
            purchasingKey={purchasingKey}
          />
        )}
        {activeTab === 'fuel' && (
          <FuelPacks
            packs={products?.fuelPacks || []}
            loading={productsLoading}
            onPurchase={handlePurchase}
            paymentEnabled={Boolean(paymentConfig?.enabled)}
            purchasingKey={purchasingKey}
          />
        )}
      </div>
      
      <div className="mt-8 text-right text-xs text-pink-500">
        * 若订单出现问题，请联系官方QQ群聊（QQ群号待补充）
      </div>
      <AlipayCheckoutDialog checkout={checkout} onClose={handleCheckoutClose} onSuccess={handlePaymentSuccess} />
    </div>
  );
};

const MemberPlans = ({ plans: products, loading, onPurchase, paymentEnabled, purchasingKey }: {
  plans: PricingProduct[];
  loading: boolean;
  onPurchase: (params: { orderType: 'membership' | 'fuel_pack'; productKey: string }) => void;
  paymentEnabled: boolean;
  purchasingKey: string | null;
}) => {
  if (loading) {
    return <ProductsLoadingState />;
  }

  if (!products.length) {
    return <ProductsEmptyState />;
  }

  const plans = products.map((plan) => ({
    title: plan.name,
    price: plan.price,
    originalPrice: '',
    tag: '一次性购买',
    tagColor: 'bg-purple-600',
    productKey: plan.key,
    orderType: 'membership' as const,
    features: [
      { title: '钻石额度', desc: `${formatDiamonds(plan.diamonds)} 钻石` },
      { title: '有效期', desc: `${plan.days || 0} 天（到期后未用完作废）` },
      { title: '购买方式', desc: '单次付款，不自动续费' },
      { title: '扣费规则', desc: '会员有效期内优先消耗会员钻石，其次消耗加油包钻石' },
      { title: '可叠加', desc: '未过期时购买自动顺延；已过期从当前时间起算' },
    ],
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map((plan, index) => (
        <PricingCard
          key={index}
          {...plan}
          disabled={!paymentEnabled || Boolean(purchasingKey)}
          buttonText={purchasingKey === plan.productKey ? '创建订单中' : '支付宝购买'}
          onPurchase={() => onPurchase({ orderType: plan.orderType, productKey: plan.productKey })}
        />
      ))}
    </div>
  );
};

const FuelPacks = ({ packs: products, loading, onPurchase, paymentEnabled, purchasingKey }: {
  packs: PricingProduct[];
  loading: boolean;
  onPurchase: (params: { orderType: 'membership' | 'fuel_pack'; productKey: string }) => void;
  paymentEnabled: boolean;
  purchasingKey: string | null;
}) => {
  if (loading) {
    return <ProductsLoadingState />;
  }

  if (!products.length) {
    return <ProductsEmptyState />;
  }

  const packs = products.map((pack) => ({
    title: pack.name,
    price: pack.price,
    originalPrice: '',
    tag: '永久有效',
    tagColor: 'bg-black',
    productKey: pack.key,
    orderType: 'fuel_pack' as const,
    features: [
      { title: '钻石额度', desc: `${formatDiamonds(pack.diamonds)} 钻石` },
      { title: '有效期', desc: '永久有效，需会员有效期内使用' },
      { title: '扣费规则', desc: '会员有效期内仅在会员钻石不足时才消耗加油包钻石' },
    ],
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {packs.map((pack, index) => (
        <PricingCard
          key={index}
          {...pack}
          activeTab="fuel"
          disabled={!paymentEnabled || Boolean(purchasingKey)}
          buttonText={purchasingKey === pack.productKey ? '创建订单中' : '支付宝购买'}
          onPurchase={() => onPurchase({ orderType: pack.orderType, productKey: pack.productKey })}
        />
      ))}
    </div>
  );
};

const ProductsLoadingState = () => (
  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-border dark:bg-card dark:text-muted-foreground">
    正在读取商品价格...
  </div>
);

const ProductsEmptyState = () => (
  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-border dark:bg-card dark:text-muted-foreground">
    暂无可购买商品，请稍后再试。
  </div>
);

type PricingCardFeature = { title: string; desc: string };
type PricingCardProps = {
  title: string;
  price: number;
  originalPrice?: string;
  tag: string;
  tagColor: string;
  features: PricingCardFeature[];
  activeTab?: 'fuel' | 'member';
  onPurchase: () => void;
  disabled?: boolean;
  buttonText?: string;
};

const PricingCard = ({ title, price, originalPrice, tag, tagColor, features, activeTab, onPurchase, disabled = false, buttonText = '立即购买' }: PricingCardProps) => {
  return (
    <div className="bg-white dark:bg-card rounded-xl p-8 shadow-sm dark:shadow-purple-950/10 border border-gray-100 dark:border-border flex flex-col hover:shadow-md dark:hover:shadow-purple-950/20 transition-shadow relative overflow-hidden">
      {/* Tag */}
      <div className={`absolute top-8 right-8 ${tagColor} text-white text-xs font-bold px-2 py-1 rounded-sm`}>
        {activeTab === 'fuel' && <span className="mr-1">🔥</span>}
        {activeTab === 'member' && <span className="mr-1">💎</span>}
        {tag}
      </div>

      {/* Header */}
      <h3 className="text-2xl font-bold text-gray-900 mb-6">{title}</h3>
      
      {/* Price */}
      <div className="flex items-baseline mb-8">
        <span className="text-4xl font-bold text-gray-900">{Number(price).toFixed(2)}</span>
        {originalPrice ? <span className="text-gray-400 text-sm ml-2 line-through">/ {originalPrice} 元</span> : <span className="text-gray-400 text-sm ml-2">元</span>}
      </div>

      {/* Features */}
      <div className="space-y-6 flex-1">
        {features.map((feature, idx) => (
          <div key={idx} className="flex items-start">
            <Check className="w-5 h-5 text-gray-900 dark:text-purple-300 mt-0.5 flex-shrink-0 mr-3" strokeWidth={1.5} />
            <div>
              <div className="font-bold text-gray-900 text-sm mb-1">{feature.title}</div>
              <div className="text-gray-500 text-xs leading-relaxed">{feature.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Button */}
      <button
        onClick={onPurchase}
        disabled={disabled}
        className="w-full mt-8 h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors shadow-lg hover:shadow-purple-500/30 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      >
        {buttonText}
      </button>
    </div>
  );
};

export default Membership;
