import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Sparkles } from 'lucide-react';

const MindMapNode = ({ data, isConnectable, selected }: NodeProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (data.isLocked) {
      if (data.onLockedAction) {
        data.onLockedAction();
      }
      return;
    }
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    data.label = label; // Update data directly (or use a callback if provided)
    if (data.onChange) {
        data.onChange(label);
    }
  };

  const handleKeyDown = (evt: React.KeyboardEvent) => {
    if (evt.key === 'Enter') {
      handleBlur();
    }
  };

  const handleAiClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection/drag
    if (data.onAiClick) {
      data.onAiClick();
    }
  };

  const theme = data.theme || 'dark';
  
  const themeStyles: Record<string, { rootBg: string, nodeBg: string, text: string, border: string }> = {
    dark: { rootBg: 'bg-gradient-to-r from-blue-600 to-indigo-600', nodeBg: 'bg-white', text: 'text-gray-900', border: 'border-transparent' },
    light: { rootBg: 'bg-gradient-to-r from-blue-500 to-cyan-500', nodeBg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200 shadow-sm' },
    beige: { rootBg: 'bg-gradient-to-r from-orange-400 to-amber-500', nodeBg: 'bg-[#fffbeb]', text: 'text-amber-900', border: 'border-orange-200' },
    green: { rootBg: 'bg-gradient-to-r from-green-500 to-emerald-600', nodeBg: 'bg-[#f0fdf4]', text: 'text-green-900', border: 'border-green-200' },
  };
  
  const currentStyle = themeStyles[theme] || themeStyles.dark;

  // Determine styles based on level (root vs child)
  const isRoot = data.isRoot;
  const bgColor = isRoot ? currentStyle.rootBg : currentStyle.nodeBg;
  const textColor = isRoot ? 'text-white' : currentStyle.text;
  const isAiActive = Boolean(data.aiActive);
  const borderColor = selected || isAiActive ? 'ring-2 ring-purple-500 border-purple-500' : (isRoot ? 'border-transparent' : currentStyle.border);
  const shadow = selected || isAiActive ? 'shadow-lg shadow-purple-500/20' : 'shadow-sm';
  const contentPreview = typeof data.content === 'string' ? data.content.trim() : '';

  return (
    <div 
      className={`relative px-4 py-2 rounded-xl min-w-[120px] max-w-[220px] text-center transition-all duration-300 group border ${bgColor} ${borderColor} ${shadow}`}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-gray-400 !w-2 !h-2 !border-2 !border-white" />
      
      {isEditing ? (
        <input
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`w-full bg-transparent outline-none text-center ${textColor}`}
        />
      ) : (
        <div className="space-y-1.5">
          <div className={`font-medium select-none flex items-center justify-center gap-2 ${textColor}`}>
            {label}
          </div>
          {contentPreview && (
            <div className={`text-[11px] leading-4 opacity-75 line-clamp-3 whitespace-pre-wrap ${textColor}`}>
              {contentPreview}
            </div>
          )}
          {isAiActive && (
            <div className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
              <Sparkles className="w-3 h-3" />
              正在编辑该节点
            </div>
          )}
        </div>
      )}

      {/* AI Button - Visible on Hover or Selected */}
      {!isEditing && (selected || false) && (
        <button
          onClick={handleAiClick}
          className="absolute -top-3 -right-3 p-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-lg hover:scale-110 transition-transform z-50 opacity-0 group-hover:opacity-100 animate-in fade-in zoom-in duration-200"
          title="AI智能生成"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      )}

      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="!bg-gray-400 !w-2 !h-2 !border-2 !border-white" />
    </div>
  );
};

export default React.memo(MindMapNode);
