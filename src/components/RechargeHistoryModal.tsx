import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase';
import { X, Loader2, Receipt } from 'lucide-react';
import Pagination from '@/components/Pagination';

interface RechargeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RechargeLog {
  id: string;
  amount_cny: number;
  diamonds_granted?: number | null;
  diamonds_obtained?: number | null;
  payment_method: string;
  status: string;
  order_type?: string | null;
  product_name?: string | null;
  created_at: string;
  paid_at?: string | null;
  expires_at: string;
}

export const RechargeHistoryModal: React.FC<RechargeHistoryModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<RechargeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (isOpen && user) {
      fetchLogs();
    }
  }, [isOpen, user]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      await supabase.rpc('cleanup_expired_diamond_logs');
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('recharge_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
      setPage(1);
    } catch (error) {
      console.error('Failed to fetch recharge logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-gray-800">
            <Receipt className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold">充值记录对账单</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 flex-1">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-500 text-sm">加载数据中...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 flex-1">
              <Receipt className="w-12 h-12 text-gray-300 mb-4" />
              <p>暂无充值记录</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                        <th className="px-6 py-4 font-medium">行为</th>
                        <th className="px-6 py-4 font-medium">时间</th>
                        <th className="px-6 py-4 font-medium text-right">充值金额 (元)</th>
                        <th className="px-6 py-4 font-medium text-right">钻石到账</th>
                        <th className="px-6 py-4 font-medium text-center">最终状态</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-gray-100">
                      {pagedLogs.map((log) => (
                        (() => {
                          const diamonds = Number(log.diamonds_granted ?? log.diamonds_obtained ?? 0);
                          const createdAt = log.paid_at || log.created_at;
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
                          const actionLabel =
                            log.order_type === 'membership'
                              ? `购买会员：${log.product_name || ''}`
                              : log.order_type === 'fuel_pack'
                                ? `购买加油包：${log.product_name || ''}`
                                : '充值获得钻石';

                          return (
                        <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                <span className="text-purple-600 font-bold text-xs">充</span>
                              </div>
                              <span className="font-medium text-gray-800">{actionLabel}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                            {new Date(createdAt)
                              .toLocaleString('zh-CN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false,
                              })
                              .replace(/\//g, '-')}
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-800">¥{log.amount_cny.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">
                              +{diamonds.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                statusClass
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                          );
                        })()
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="pt-4">
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
