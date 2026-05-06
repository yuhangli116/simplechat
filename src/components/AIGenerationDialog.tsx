import React, { useState } from 'react';
import { MODEL_PRICING } from '@/services/ai';
import { X, Send, ChevronDown, Check } from 'lucide-react';

interface AIGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (model: string, prompt: string) => void;
  nodeLabel: string;
  nodeId: string;
  balance: number;
  position?: { x: number, y: number };
  embedded?: boolean;
  contexts?: Array<{ content: string, sourceName: string }>;
  onAddContext?: () => void;
  onRemoveContext?: (index: number) => void;
  isGenerating?: boolean;
  loadingText?: string;
  lastUsage?: {
    input_tokens: number;
    output_tokens: number;
    total_cost: number;
  } | null;
}

const AIGenerationDialog: React.FC<AIGenerationDialogProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  nodeLabel,
  nodeId,
  balance,
  position,
  embedded = false,
  contexts = [],
  onAddContext,
  onRemoveContext,
  isGenerating = false,
  loadingText = '正在生成...',
  lastUsage = null
}) => {
  const [selectedModel, setSelectedModel] = useState('deepseek-v3');
  const [prompt, setPrompt] = useState('');

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModelSelect = (modelKey: string) => {
    setSelectedModel(modelKey);
    setShowModelDropdown(false);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    setPrompt('');
  }, [isOpen, nodeId]);

  if (!isOpen) return null;

  // Embedded mode can still use custom placement; popup mode uses centered overlay.
  const style: React.CSSProperties | undefined = embedded
    ? position
      ? { position: 'absolute', left: position.x, top: position.y }
      : undefined
    : undefined;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onSubmit(selectedModel, prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const dialogContent = (
    <div
      style={style}
      className={`${embedded ? 'w-[600px] max-w-[66vw]' : 'w-[700px] max-w-[90vw]'} bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-visible animate-in fade-in zoom-in duration-200`}
    >
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

      {/* Context Area */}
      {onAddContext && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-500">上下文参考:</span>
            <button
              onClick={onAddContext}
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
            >
              添加
            </button>
          </div>

          {contexts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto custom-scrollbar">
              {contexts.map((ctx, idx) => (
                <span key={idx} className="flex items-center bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 max-w-full">
                  <span className="truncate max-w-[150px]">{ctx.sourceName}</span>
                  {onRemoveContext && (
                    <button
                      onClick={() => onRemoveContext(idx)}
                      className="ml-1 hover:bg-blue-200 rounded-full w-3 h-3 flex items-center justify-center"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 italic">无 (仅使用当前节点)</div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white">
        <div className="mb-3 text-xs text-gray-500 font-medium flex items-center justify-between">
          <div className="flex items-center relative" ref={dropdownRef}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600 mr-2"></span>
            <span className="text-gray-900 font-bold max-w-[260px] truncate mr-4">正在编辑节点：{nodeLabel || nodeId}</span>

            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 transition-colors"
            >
              <span>{MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING]?.name}</span>
              <span className="text-gray-400 ml-1">
                (输入 {MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING]?.input}x)
              </span>
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showModelDropdown && (
              <div className="absolute top-full right-0 mt-1 w-80 max-h-80 overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-100 z-[1200] animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                {Object.entries(MODEL_PRICING).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => handleModelSelect(key)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                      selectedModel === key ? 'bg-purple-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${selectedModel === key ? 'text-purple-700' : 'text-gray-800'}`}>
                          {config.name}
                        </span>
                        {config.tags?.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {selectedModel === key && <Check className="w-4 h-4 text-purple-600" />}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>输入:</span>
                        <span className="font-mono font-medium text-gray-700">{config.input}x</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>输出:</span>
                        <span className="font-mono font-medium text-gray-700">{config.output}x</span>
                      </div>
                      {(config.reasoning || 0) > 0 && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <span>思考:</span>
                          <span className="font-mono font-medium text-indigo-600">{config.reasoning}x</span>
                        </div>
                      )}
                      {(config.cache || 0) > 0 && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <span>缓存:</span>
                          <span className="font-mono font-medium text-green-600">{config.cache}x</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            className={`w-full ${embedded ? 'h-28' : 'h-40'} p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none outline-none transition-all placeholder-gray-400 bg-gray-50/30 disabled:opacity-50`}
            placeholder="描述你希望AI如何改写当前节点，并生成结构化子节点..."
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isGenerating}
            className="absolute bottom-3 right-3 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
          >
            {isGenerating ? (
              <div className="flex items-center text-xs whitespace-nowrap">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5"></div>
                {loadingText}
              </div>
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-gray-400">按 Enter 发送，Shift + Enter 换行</span>
          {lastUsage && (
            <span className="text-purple-600/80 bg-purple-50 px-2 py-0.5 rounded border border-purple-100/50">
              💎 -{lastUsage.total_cost} (In: {lastUsage.input_tokens}, Out: {lastUsage.output_tokens})
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return dialogContent;
  }

  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>{dialogContent}</div>
    </div>
  );
};

export default AIGenerationDialog;
