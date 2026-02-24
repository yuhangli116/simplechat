import React from 'react';
import { MODEL_PRICING } from '@/services/ai';
import { X, Sparkles, Zap, Flame } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: string;
  onSelect: (model: string) => void;
  onClose: () => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">选择模型</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grid Content */}
        <div className="overflow-y-auto p-6 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(MODEL_PRICING).map(([key, config]) => {
              const isSelected = selectedModel === key;
              return (
                <div
                  key={key}
                  onClick={() => {
                    onSelect(key);
                    onClose();
                  }}
                  className={`
                    relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200
                    hover:shadow-md hover:border-purple-300
                    ${isSelected 
                      ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500' 
                      : 'bg-white border-gray-100 text-gray-600'
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-bold text-lg ${isSelected ? 'text-purple-900' : 'text-gray-900'}`}>
                        {config.name}
                      </h3>
                      {/* Tags */}
                      <div className="flex gap-1.5">
                        {config.tags.map((tag) => (
                          <Badge key={tag} text={tag} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <span className="text-gray-400">输入:</span>
                      <span className="font-mono font-medium text-gray-900">{config.input}</span>
                      <span className="text-xs text-gray-500">星石/token</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <span className="text-gray-400">输出:</span>
                      <span className="font-mono font-medium text-gray-900">{config.output}</span>
                      <span className="text-xs text-gray-500">星石/token</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-6 flex justify-end text-xs text-gray-400">
            * 一个 token 通常对应 1 到 1.8 个中文汉字
          </div>
        </div>
      </div>
    </div>
  );
};

const Badge = ({ text }: { text: string }) => {
  let style = "bg-gray-100 text-gray-600";
  
  if (text === '免费试用') style = "bg-pink-100 text-pink-600";
  else if (text === '推荐' || text === '旗舰') style = "bg-purple-100 text-purple-600";
  else if (text === '热门') style = "bg-orange-100 text-orange-600";
  else if (text === '思考') style = "bg-indigo-100 text-indigo-600";
  else if (text === '效果一般') style = "bg-green-100 text-green-600";

  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border border-black/5 ${style}`}>
      {text}
    </span>
  );
};

export default ModelSelector;
