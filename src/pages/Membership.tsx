import React, { useState } from 'react';
import { Check, Gem, Zap, Crown, Gift } from 'lucide-react';

const Membership = () => {
  const [activeTab, setActiveTab] = useState<'member' | 'fuel' | 'invite'>('member');

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
        <button
          onClick={() => setActiveTab('invite')}
          className={`pb-4 text-base font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === 'invite' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Gem className="w-4 h-4" />
          邀请返现
          {activeTab === 'invite' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto">
        {activeTab === 'member' && <MemberPlans />}
        {activeTab === 'fuel' && <FuelPacks />}
        {activeTab === 'invite' && <InviteSection />}
      </div>
      
      <div className="mt-8 text-right text-xs text-pink-500">
        * 若订单出现问题，你可联系管理员 (QQ: 1572007316)
      </div>
    </div>
  );
};

const MemberPlans = () => {
  const plans = [
    {
      title: '旗舰尊享月卡',
      price: '99.00',
      originalPrice: '120.00',
      tag: '尊享专属',
      tagColor: 'bg-blue-600',
      features: [
        { title: '顶级模型库', desc: '白月光G系列、白月光C系列、满血版 DeepSeek 全家桶' },
        { title: '星石额度', desc: '周期月享有 5000万 星石额度' },
        { title: '有效期', desc: '自购买时刻起，有效期为1个月' },
        { title: '专业推荐', desc: '识货的、懂行的、有审美的作者，入就对了' },
      ]
    },
    {
      title: '旗舰尊享季卡',
      price: '258.00',
      originalPrice: '360.00',
      tag: '尊享推荐',
      tagColor: 'bg-black',
      features: [
        { title: '顶级模型库', desc: '白月光G系列、白月光C系列、满血版 DeepSeek 全家桶' },
        { title: '星石额度', desc: '每周期月享有 5000万 星石额度，总计 1.5亿' },
        { title: '有效期', desc: '自购买时刻起，有效期为3个月' },
        { title: '专业推荐', desc: '专注当下、渴望阶段性突破的作者，闭关首选' },
      ]
    },
    {
      title: '旗舰尊享年卡',
      price: '888.00',
      originalPrice: '1440.00',
      tag: '尊享至极',
      tagColor: 'bg-orange-500',
      features: [
        { title: '顶级模型库', desc: '白月光G系列、白月光C系列、满血版 DeepSeek 全家桶' },
        { title: '星石额度', desc: '每周期月额度 5000万，全年共 6亿' },
        { title: '有效期', desc: '自购买时刻起，有效期为12个月' },
        { title: '专业推荐', desc: '耐得住寂寞、坚持长期主义的创作者，身份标配' },
      ]
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map((plan, index) => (
        <PricingCard key={index} {...plan} />
      ))}
    </div>
  );
};

const FuelPacks = () => {
  const packs = [
    {
      title: '应急补给包',
      price: '9.00',
      originalPrice: '18.00',
      tag: '永不过期',
      tagColor: 'bg-black',
      features: [
        { title: '产品性质', desc: '使用高级模型，必须搭配会员来使用，若不是会员只抵扣Deepseek 标准版模型消耗' },
        { title: '适用范围', desc: '白月光G系列、白月光C系列、满血版 DeepSeek 全家桶' },
        { title: '星石额度', desc: '包含 300万 星石，即买即用' },
        { title: '有效期', desc: '【永久有效】购买后永久保留，直到用完为止，不会过期' },
      ]
    },
    {
      title: '进阶扩容包',
      price: '28.00',
      originalPrice: '40.00',
      tag: '人气囤货',
      tagColor: 'bg-black',
      features: [
        { title: '产品性质', desc: '使用高级模型，必须搭配会员来使用，若不是会员只抵扣Deepseek 标准版模型消耗' },
        { title: '适用范围', desc: '白月光G系列、白月光C系列、满血版 DeepSeek 全家桶' },
        { title: '星石额度', desc: '包含 1000万 星石，只有会员月额度耗尽才扣除' },
        { title: '有效期', desc: '【永久有效】购买后永久保留，本月用不完，下个月接着用' },
      ]
    },
    {
      title: '豪华堆叠包',
      price: '88.00',
      originalPrice: '100.00',
      tag: '巨无霸',
      tagColor: 'bg-black',
      features: [
        { title: '产品性质', desc: '使用高级模型，必须搭配会员来使用，若不是会员只抵扣Deepseek 标准版模型消耗' },
        { title: '适用范围', desc: '白月光G系列、白月光C系列、满血版 DeepSeek 全家桶' },
        { title: '星石额度', desc: '包含 3500万 星石，超大额度，一次囤货用半年' },
        { title: '有效期', desc: '【永久有效】支持无限叠加，额度不清零，传家宝级资产' },
      ]
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {packs.map((pack, index) => (
        <PricingCard key={index} {...pack} activeTab="fuel" />
      ))}
    </div>
  );
};

const InviteSection = () => (
  <div className="flex flex-col items-center justify-center h-96 text-gray-500">
    <Gift className="w-16 h-16 mb-4 text-gray-300" />
    <h3 className="text-xl font-medium text-gray-700">邀请好友赚星石</h3>
    <p className="mt-2">每邀请一位好友注册，双方各得 50万 星石</p>
  </div>
);

const PricingCard = ({ title, price, originalPrice, tag, tagColor, features, activeTab }: any) => {
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
        <span className="text-4xl font-bold text-gray-900">{price}</span>
        <span className="text-gray-400 text-sm ml-2 line-through">/ {originalPrice} 元</span>
      </div>

      {/* Features */}
      <div className="space-y-6 flex-1">
        {features.map((feature: any, idx: number) => (
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
      <button className="w-full mt-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors shadow-lg hover:shadow-purple-500/30">
        立即购买
      </button>
    </div>
  );
};

export default Membership;
