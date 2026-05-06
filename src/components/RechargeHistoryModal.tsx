import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase';
import { X, Loader2, Receipt } from 'lucide-react';

interface RechargeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RechargeLog {
  id: string;
  amount_cny: number;
  diamonds_obtained: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export const RechargeHistoryModal: React.FC<RechargeHistoryModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<RechargeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && user) {
      fetchLogs();
    }
  }, [isOpen, user]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recharge_logs')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Failed to fetch recharge logs:', error);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-500 text-sm">加载数据中...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Receipt className="w-12 h-12 text-gray-300 mb-4" />
              <p>暂无充值记录</p>
            </div>
          ) : (
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
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <span className="text-purple-600 font-bold text-xs">充</span>
                          </div>
                          <span className="font-medium text-gray-800">充值获取星石</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                        {new Date(log.created_at).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        }).replace(/\//g, '-')}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-800">
                        ¥{log.amount_cny.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">
                          +{log.diamonds_obtained} 💎
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          log.status === 'success' 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : 'bg-red-100 text-red-700 border border-red-200'
                        }`}>
                          {log.status === 'success' ? '支付成功' : '支付失败'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};