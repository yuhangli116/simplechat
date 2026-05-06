import React from 'react';
import { X, Code, Mail, Github, Globe } from 'lucide-react';

interface AboutUsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutUsModal: React.FC<AboutUsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-gray-800">
            <Code className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold">关于我们</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 mb-4">
              <span className="text-3xl font-bold text-white">AI</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-800">SimpleChat</h3>
            <p className="text-sm text-gray-500 mt-1">让创作更简单，让灵感更闪耀</p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-800 border-b border-gray-100 pb-2">开发者信息</h4>
            
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                <Code className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-gray-800">开发团队</span>
                <span>SimpleChat 研发组</span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                <Mail className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-gray-800">联系邮箱</span>
                <a href="mailto:support@simplechat.ai" className="text-purple-600 hover:underline">support@simplechat.ai</a>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                <Globe className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-gray-800">官方网站</span>
                <a href="https://simplechat.ai" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">simplechat.ai</a>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} SimpleChat. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};