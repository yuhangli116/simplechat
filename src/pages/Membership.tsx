import React, { useState } from 'react';
import { Check, Zap, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { PRICING_CONFIG, formatDiamonds } from '@/services/billing';

const Membership = () => {
  const [activeTab, setActiveTab] = useState<'member' | 'fuel'>('member');
  const navigate = useNavigate();
  const { user, fetchProfile } = useAuthStore();
  const { addToast } = useToastStore();

  const handlePurchase = async (params: { orderType: 'membership' | 'fuel_pack'; productKey: string }) => {
    if (!user) {
      addToast('请先登录后再购买', 'info');
      navigate('/login');
      return;
    }

    const { data: orderData, error: orderError } = await supabase.rpc('create_recharge_order', {
      p_order_type: params.orderType,
      p_product_key: params.productKey,
    });

    if (orderError) {
      addToast(orderError.message || '创建订单失败', 'error');
      return;
    }

    if (!orderData?.success) {
      addToast(orderData?.error || '创建订单失败', 'error');
      return;
    }

    const ok = window.confirm(
      `模拟支付：${orderData.product_name}\n金额：¥${Number(orderData.amount_cny).toFixed(2)}\n到账：${formatDiamonds(Number(orderData.diamonds_granted))} 钻石\n\n是否确认支付成功？`
    );

    if (!ok) {
      addToast('已创建订单（待支付）', 'info');
      return;
    }

    const rpcName = params.orderType === 'membership' ? 'process_membership_purchase' : 'process_fuel_pack_purchase';
    const { data: payData, error: payError } = await supabase.rpc(rpcName, {
      p_order_id: orderData.order_id,
    });

    if (payError) {
      addToast(payError.message || '支付处理失败', 'error');
      return;
    }

    if (!payData?.success) {
      addToast(payData?.error || '支付处理失败', 'error');
      return;
    }

    await fetchProfile();
    addToast('购买成功，钻石已到账！', 'success');
  };

  return (
    <div className="flex-1 h-full bg-gray-50 overflow-y-auto p-8">
      {/* Header Tabs */}
      <div className="flex items-center space-x-8 border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab('member')}
          className={`pb-4 text-base font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === 'member' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Crown className="w-4 h-4" />
          购买会员
          {activeTab === 'member' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('fuel')}
          className={`pb-4 text-base font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === 'fuel' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Zap className="w-4 h-4" />
          加油包 (永久)
          {activeTab === 'fuel' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto">
        {activeTab === 'member' && <MemberPlans onPurchase={handlePurchase} />}
        {activeTab === 'fuel' && <FuelPacks onPurchase={handlePurchase} />}
      </div>
      
      <div className="mt-8 text-right text-xs text-pink-500">
        * 若订单出现问题，你可联系管理员 (QQ: 1572007316)
      </div>
    </div>
  );
};

const MemberPlans = ({ onPurchase }: { onPurchase: (params: { orderType: 'membership' | 'fuel_pack'; productKey: string }) => void }) => {
  const plans = Object.values(PRICING_CONFIG.MEMBERSHIP).map((plan) => ({
    title: plan.name,
    price: plan.price,
    originalPrice: '',
    tag: '会员套餐',
    tagColor: 'bg-amber-600',
    productKey: plan.key,
    orderType: 'membership' as const,
    features: [
      { title: '钻石额度', desc: `${formatDiamonds(plan.diamonds)} 钻石` },
      { title: '有效期', desc: `${plan.days} 天（到期后未用完作废）` },
      { title: '扣费规则', desc: '优先消耗会员钻石，其次消耗加油包钻石' },
      { title: '可叠加', desc: '未过期时购买自动顺延；已过期从当前时间起算' },
    ],
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map((plan, index) => (
        <PricingCard
          key={index}
          {...plan}
          onPurchase={() => onPurchase({ orderType: plan.orderType, productKey: plan.productKey })}
        />
      ))}
    </div>
  );
};

const FuelPacks = ({ onPurchase }: { onPurchase: (params: { orderType: 'membership' | 'fuel_pack'; productKey: string }) => void }) => {
  const packs = Object.values(PRICING_CONFIG.FUEL_PACKS).map((pack) => ({
    title: pack.name,
    price: pack.price,
    originalPrice: '',
    tag: '永久有效',
    tagColor: 'bg-black',
    productKey: pack.key,
    orderType: 'fuel_pack' as const,
    features: [
      { title: '钻石额度', desc: `${formatDiamonds(pack.diamonds)} 钻石` },
      { title: '有效期', desc: '永久有效，可叠加' },
      { title: '扣费规则', desc: '仅当会员钻石不足时才消耗加油包钻石' },
    ],
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {packs.map((pack, index) => (
        <PricingCard
          key={index}
          {...pack}
          activeTab="fuel"
          onPurchase={() => onPurchase({ orderType: pack.orderType, productKey: pack.productKey })}
        />
      ))}
    </div>
  );
};

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
};

const PricingCard = ({ title, price, originalPrice, tag, tagColor, features, activeTab, onPurchase }: PricingCardProps) => {
  return (
    <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow relative overflow-hidden">
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
            <Check className="w-5 h-5 text-gray-900 mt-0.5 flex-shrink-0 mr-3" strokeWidth={1.5} />
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
        className="w-full mt-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors shadow-lg hover:shadow-purple-500/30"
      >
        立即购买
      </button>
    </div>
  );
};

export default Membership;
