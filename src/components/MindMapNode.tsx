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
      data.onAiClick(data.id, data.label);
    }
  };

  // Determine styles based on level (root vs child)
  const isRoot = data.isRoot;
  const bgColor = isRoot ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-white';
  const textColor = isRoot ? 'text-white' : 'text-gray-800';
  const borderColor = selected ? 'ring-2 ring-purple-500 border-purple-500' : 'border-gray-200';
  const shadow = selected ? 'shadow-lg shadow-purple-500/20' : 'shadow-sm';

  return (
    <div 
      className={`relative px-6 py-3 rounded-xl min-w-[120px] text-center transition-all duration-300 group border ${bgColor} ${borderColor} ${shadow}`}
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
        <div className={`font-medium select-none flex items-center justify-center gap-2 ${textColor}`}>
          {label}
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
