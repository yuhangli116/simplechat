import React from 'react';
import { useToastStore } from '@/store/useToastStore';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg shadow-black/5 pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-300 ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
            toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
            'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
          {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
          
          <span className="text-sm font-medium">{toast.message}</span>
          
          <button
            onClick={() => removeToast(toast.id)}
            className={`p-1 rounded-lg transition-colors ${
              toast.type === 'success' ? 'hover:bg-green-100 text-green-600' :
              toast.type === 'error' ? 'hover:bg-red-100 text-red-600' :
              'hover:bg-blue-100 text-blue-600'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};