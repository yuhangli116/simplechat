import React, { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { MODEL_PRICING } from '@/services/ai';
import { X, HelpCircle, Send } from 'lucide-react';

interface AIGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (model: string, prompt: string) => void;
  nodeLabel: string;
  nodeId: string;
  balance: number;
  position?: { x: number, y: number };
}

const AIGenerationDialog: React.FC<AIGenerationDialogProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  nodeLabel,
  nodeId,
  balance,
  position 
}) => {
  const [selectedModel, setSelectedModel] = useState('deepseek-r1');
  const [prompt, setPrompt] = useState('');

  if (!isOpen) return null;

  // Calculate style for positioning if provided, otherwise center
  const style: React.CSSProperties = position 
    ? { 
        position: 'absolute', 
        left: position.x, 
        top: position.y - 150, // Position above the node by default
        transform: 'translate(-50%, -100%)',
        zIndex: 1000 
      } 
    : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000
      };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(selectedModel, prompt);
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-[400px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center space-x-2">
          <div className="flex items-center text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
             <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
             AI生成模式
          </div>
          
          <div className="flex items-center text-xs text-gray-500 bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-lg">
            <span className="mr-1">💎</span>
            <span>{balance?.toLocaleString() || 0}</span>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white">
        <div className="mb-3 text-xs text-gray-500 font-medium flex items-center justify-between">
           <div className="flex items-center">
             <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600 mr-2"></span>
             当前节点：<span className="text-gray-900 font-bold max-w-[150px] truncate">{nodeLabel}</span>
           </div>
           
           <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs border-none bg-gray-50 hover:bg-gray-100 rounded px-2 py-1 cursor-pointer outline-none text-gray-600 transition-colors"
          >
            {Object.entries(MODEL_PRICING).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name} ({config.price}💎)
              </option>
            ))}
          </select>
        </div>
        
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-32 p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none outline-none transition-all placeholder-gray-400 bg-gray-50/30"
            placeholder="描述你的需求，AI将为你生成子节点..."
            autoFocus
          />
          <button 
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className="absolute bottom-3 right-3 p-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
           <span>按 Enter 发送，Shift + Enter 换行</span>
        </div>
      </div>
    </div>
  );
};

export default AIGenerationDialog;
