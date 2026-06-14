import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { createLogger } from '@/lib/logger';
import Pagination from '@/components/Pagination';
import { Receipt, Sparkles, Loader2 } from 'lucide-react';

const log = createLogger('Records');

type TabKey = 'usage' | 'recharge';

type UsageLog = {
  id: string;
  created_at: string;
  expires_at: string;
  model_name: string;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cache_tokens: number | null;
  diamonds_consumed: number | null;
  member_diamonds_used: number | null;
  permanent_diamonds_used: number | null;
  input_diamonds: number | null;
  output_diamonds: number | null;
  reasoning_diamonds: number | null;
  cache_diamonds: number | null;
  billing_group_id?: string | null;
  billing_step?: string | null;
};

type RechargeLog = {
  id: string;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  order_type: string | null;
  product_name: string | null;
  amount_cny: number;
  diamonds_granted: number | null;
  diamonds_obtained: number | null;
  status: string;
};

const PAGE_SIZE = 8;

const formatTime = (value: string) =>
  new Date(value)
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');

const Records: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const getRemainingDays = (expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

  const [activeTab, setActiveTab] = useState<TabKey>('usage');
  const [loading, setLoading] = useState(false);
  const [didCleanup, setDidCleanup] = useState(false);

  const [usagePage, setUsagePage] = useState(1);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);

  const [rechargePage, setRechargePage] = useState(1);
  const [rechargeTotal, setRechargeTotal] = useState(0);
  const [rechargeLogs, setRechargeLogs] = useState<RechargeLog[]>([]);

  const usageTotalPages = useMemo(() => Math.max(1, Math.ceil(usageTotal / PAGE_SIZE)), [usageTotal]);
  const rechargeTotalPages = useMemo(() => Math.max(1, Math.ceil(rechargeTotal / PAGE_SIZE)), [rechargeTotal]);

  const mergedUsageLogs = useMemo(() => {
    const byGroup = new Map<string, UsageLog[]>();
    const singles: UsageLog[] = [];

    for (const log of usageLogs) {
      const groupId = log.billing_group_id;
      if (groupId) {
        const bucket = byGroup.get(groupId) || [];
        bucket.push(log);
        byGroup.set(groupId, bucket);
      } else {
        singles.push(log);
      }
    }

    const merged = Array.from(byGroup.entries()).map(([groupId, logs]) => {
      const sorted = [...logs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const first = sorted[0];
      const latestExpiresAt = sorted.reduce((max, row) => {
        return new Date(row.expires_at).getTime() > new Date(max).getTime() ? row.expires_at : max;
      }, first.expires_at);
      const modelNames = Array.from(new Set(sorted.map((row) => row.model_name).filter(Boolean)));
      const mergedModelName = modelNames.length === 1 ? modelNames[0] : '多模型';

      const sum = (selector: (row: UsageLog) => number | null | undefined) =>
        sorted.reduce((acc, row) => acc + Number(selector(row) ?? 0), 0);

      return {
        ...first,
        id: groupId,
        created_at: first.created_at,
        expires_at: latestExpiresAt,
        model_name: mergedModelName,
        input_tokens: sum((row) => row.input_tokens),
        output_tokens: sum((row) => row.output_tokens),
        reasoning_tokens: sum((row) => row.reasoning_tokens),
        cache_tokens: sum((row) => row.cache_tokens),
        diamonds_consumed: sum((row) => row.diamonds_consumed),
        member_diamonds_used: sum((row) => row.member_diamonds_used),
        permanent_diamonds_used: sum((row) => row.permanent_diamonds_used),
        input_diamonds: sum((row) => row.input_diamonds),
        output_diamonds: sum((row) => row.output_diamonds),
        reasoning_diamonds: sum((row) => row.reasoning_diamonds),
        cache_diamonds: sum((row) => row.cache_diamonds),
        billing_group_id: groupId,
      } satisfies UsageLog;
    });

    return [...merged, ...singles].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [usageLogs]);

  useEffect(() => {
    if (!user || isGuestUser(user) || didCleanup) return;
    log.info('Running cleanup_expired_diamond_logs', { userId: user.id });
    supabase
      .rpc('cleanup_expired_diamond_logs')
      .then((res: { error: unknown | null }) => {
        if (res.error) throw res.error;
      })
      .catch(() => {})
      .finally(() => setDidCleanup(true));
  }, [user, didCleanup]);

  const fetchUsage = async (page: number) => {
    if (!user || isGuestUser(user)) {
      log.info('fetchUsage skipped: guest or no user', { isGuest: isGuestUser(user), hasUser: !!user });
      return;
    }
    log.info('fetchUsage called', { userId: user.id, page });
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const now = new Date().toISOString();

      const { data, error, count } = await supabase
        .from('usage_logs')
        .select(
          'id, created_at, expires_at, model_name, input_tokens, output_tokens, reasoning_tokens, cache_tokens, diamonds_consumed, member_diamonds_used, permanent_diamonds_used, input_diamonds, output_diamonds, reasoning_diamonds, cache_diamonds, billing_group_id, billing_step',
          { count: 'exact' }
        )
        .eq('user_id', user.id)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setUsageLogs((data || []) as UsageLog[]);
      setUsageTotal(count || 0);
    } catch (e) {
      log.error('fetchUsage failed', { error: e });
      const message = e instanceof Error ? e.message : '加载消费记录失败';
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecharge = async (page: number) => {
    if (!user || isGuestUser(user)) {
      log.info('fetchRecharge skipped: guest or no user', { isGuest: isGuestUser(user), hasUser: !!user });
      return;
    }
    log.info('fetchRecharge called', { userId: user.id, page });
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const now = new Date().toISOString();

      const { data, error, count } = await supabase
        .from('recharge_logs')
        .select(
          'id, created_at, expires_at, paid_at, order_type, product_name, amount_cny, diamonds_granted, diamonds_obtained, status',
          { count: 'exact' }
        )
        .eq('user_id', user.id)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setRechargeLogs((data || []) as RechargeLog[]);
      setRechargeTotal(count || 0);
    } catch (e) {
      log.error('fetchRecharge failed', { error: e });
      const message = e instanceof Error ? e.message : '加载充值记录失败';
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || isGuestUser(user)) {
      log.info('Data fetch useEffect skipped: guest or no user', { isGuest: isGuestUser(user), hasUser: !!user });
      return;
    }
    if (activeTab === 'usage') fetchUsage(usagePage);
    if (activeTab === 'recharge') fetchRecharge(rechargePage);
  }, [user, activeTab, usagePage, rechargePage]);

  // 只有当完全没有用户并且不是游客模式时，才显示登录提示
  if (!user) {
    return (
      <div className="flex-1 h-full bg-gray-50 dark:bg-background flex items-center justify-center">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border shadow-sm p-8 text-center">
          <div className="text-lg font-semibold text-gray-800">需要登录后查看</div>
          <div className="mt-2 text-sm text-gray-500">登录后可查看钻石消费与充值记录</div>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            去登录
          </button>
        </div>
      </div>
    );
  }

  // 游客模式：展示页面框架但不查数据库，显示暂无记录
  const isGuest = isGuestUser(user);

  return (
    <div className="flex-1 h-full bg-gray-50 dark:bg-background overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">消费明细</h1>
        </div>

        <div className="flex items-center gap-2 border-b border-gray-200 mb-6">
          <button
            onClick={() => {
              setActiveTab('usage');
              setUsagePage(1);
            }}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'usage' ? 'text-gray-900 dark:text-foreground' : 'text-gray-500 hover:text-gray-700 dark:hover:text-foreground'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            消费记录
            {activeTab === 'usage' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900 dark:bg-purple-400" />}
          </button>
          <button
            onClick={() => {
              setActiveTab('recharge');
              setRechargePage(1);
            }}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'recharge' ? 'text-gray-900 dark:text-foreground' : 'text-gray-500 hover:text-gray-700 dark:hover:text-foreground'
            }`}
          >
            <Receipt className="w-4 h-4" />
            充值记录
            {activeTab === 'recharge' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900 dark:bg-purple-400" />}
          </button>
        </div>

        <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
              <div className="text-sm text-gray-500">加载中...</div>
            </div>
          ) : activeTab === 'usage' ? (
            <div className="p-6">
              {isGuest || mergedUsageLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-12">暂无消费记录</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                        <th className="px-6 py-4 font-medium">发起时间</th>
                        <th className="px-6 py-4 font-medium">调用模型</th>
                        <th className="px-6 py-4 font-medium text-right">输入消耗</th>
                        <th className="px-6 py-4 font-medium text-right">输出消耗</th>
                        <th className="px-6 py-4 font-medium text-right">总消耗</th>
                        <th className="px-6 py-4 font-medium text-right">剩余天数</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-gray-100">
                      {mergedUsageLogs.map((log) => {
                        const diamonds = Number(log.diamonds_consumed ?? 0);
                        const memberUsed = Number(log.member_diamonds_used ?? 0);
                        const permanentUsed = Number(log.permanent_diamonds_used ?? 0);
                        const inputDiamonds = Number(log.input_diamonds ?? 0);
                        const outputDiamonds = Number(log.output_diamonds ?? 0);
                        const reasoningDiamonds = Number(log.reasoning_diamonds ?? 0);
                        const cacheDiamonds = Number(log.cache_diamonds ?? 0);
                        const inputCombined = inputDiamonds + cacheDiamonds;
                        const outputCombined = outputDiamonds + reasoningDiamonds;
                        const remainingDays = getRemainingDays(log.expires_at);
                        return (
                          <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="px-6 py-4 text-gray-500 font-mono text-xs">{formatTime(log.created_at)}</td>
                            <td className="px-6 py-4 font-medium text-gray-800">{log.model_name}</td>
                            <td className="px-6 py-4 text-right font-semibold text-gray-900">{inputCombined.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right font-semibold text-gray-900">{outputCombined.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="font-semibold text-gray-900">{diamonds.toLocaleString()}</div>
                              <div className="text-[10px] text-gray-400">
                                会员 {memberUsed.toLocaleString()} · 加油包 {permanentUsed.toLocaleString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600 font-mono text-xs">{remainingDays} 天</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 text-xs text-gray-500">
                说明：输入消耗 = 输入 + 缓存；输出消耗 = 输出 + 推理。
              </div>
              <div className="pt-4">
                <Pagination page={usagePage} totalPages={usageTotalPages} onChange={setUsagePage} />
              </div>
            </div>
          ) : (
            <div className="p-6">
              {isGuest || rechargeLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-12">暂无充值记录</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                        <th className="px-6 py-4 font-medium">发起时间</th>
                        <th className="px-6 py-4 font-medium">购买商品</th>
                        <th className="px-6 py-4 font-medium text-right">交易金额</th>
                        <th className="px-6 py-4 font-medium text-right">额度到账</th>
                        <th className="px-6 py-4 font-medium text-center">最终状态</th>
                        <th className="px-6 py-4 font-medium text-right">剩余天数</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-gray-100">
                      {rechargeLogs.map((log) => {
                        const diamonds = Number(log.diamonds_granted ?? log.diamonds_obtained ?? 0);
                        const time = log.created_at;
                        const remainingDays = getRemainingDays(log.expires_at);
                        const statusLabel =
                          log.status === 'success'
                            ? '支付成功'
                            : log.status === 'pending'
                              ? '待支付'
                              : log.status === 'refunded'
                                ? '已退款'
                                : '支付失败';
                        const statusClass =
                          log.status === 'success'
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : log.status === 'pending'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-red-100 text-red-700 border border-red-200';
                        const name =
                          log.order_type === 'membership'
                            ? `会员：${log.product_name || ''}`
                            : log.order_type === 'fuel_pack'
                              ? `加油包：${log.product_name || ''}`
                              : log.product_name || '充值';
                        return (
                          <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="px-6 py-4 text-gray-500 font-mono text-xs">{formatTime(time)}</td>
                            <td className="px-6 py-4 font-medium text-gray-800">{name}</td>
                            <td className="px-6 py-4 text-right font-medium text-gray-800">¥{Number(log.amount_cny).toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-semibold text-gray-900">+{diamonds.toLocaleString()}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium ${statusClass}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600 font-mono text-xs">{remainingDays} 天</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pt-4">
                <Pagination page={rechargePage} totalPages={rechargeTotalPages} onChange={setRechargePage} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Records;
