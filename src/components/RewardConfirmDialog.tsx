import React from 'react';
import { X, Coins } from 'lucide-react';

type RewardConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  rewardDiamonds: number;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
};

const RewardConfirmDialog: React.FC<RewardConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  rewardDiamonds,
  confirmText = '确认领取',
  cancelText = '稍后再说',
  onConfirm,
  onClose,
  loading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="text-lg font-semibold text-gray-900">任务奖励</div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
              <Coins className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex flex-col">
              <div className="text-base font-semibold text-gray-900">{title}</div>
              {description ? <div className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</div> : null}
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-900 text-white text-sm font-semibold w-fit">
                +{rewardDiamonds.toLocaleString()} 钻石
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors"
              disabled={loading}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:hover:bg-gray-900"
              disabled={loading}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewardConfirmDialog;

