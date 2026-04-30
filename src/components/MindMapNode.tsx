import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const CONTENT_WRAP_CHARS = 18;

const wrapTextByChars = (text: string, charsPerLine: number) => {
  if (!text) return '';

  return text
    .split('\n')
    .map((line) => {
      if (line.length <= charsPerLine) return line;
      const chunks = line.match(new RegExp(`.{1,${charsPerLine}}`, 'g'));
      return chunks ? chunks.join('\n') : line;
    })
    .join('\n');
};

const MindMapNode = ({ data, isConnectable, selected }: NodeProps) => {
  // 编辑状态 - 完全由组件内部管理（参考 v0.1/v2.0 的工作方式）
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当 data.label 变化时同步到本地状态
  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  // 编辑模式开启时自动聚焦并选中文字
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 双击进入编辑模式
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[MindMapNode] handleDoubleClick triggered, isLocked:', data.isLocked);
    
    if (data.isLocked) {
      if (data.onLockedAction) {
        data.onLockedAction();
      }
      return;
    }
    console.log('[MindMapNode] Setting isEditing to true');
    setIsEditing(true);
  };

  // 提交标签修改
  const handleBlur = () => {
    setIsEditing(false);
    const newLabel = label.trim();
    
    // 更新数据
    if (data.onChange) {
      data.onChange(newLabel);
    } else {
      data.label = newLabel;
    }
  };

  // 键盘事件处理
  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      handleBlur();
    }
    if (evt.key === 'Escape') {
      evt.preventDefault();
      setLabel(data.label);
      setIsEditing(false);
    }
  };

  const theme = data.theme || 'dark';

  const themeStyles: Record<string, { rootBg: string; nodeBg: string; text: string; border: string }> = {
    dark: { rootBg: 'bg-gradient-to-r from-blue-600 to-indigo-600', nodeBg: 'bg-white', text: 'text-gray-900', border: 'border-slate-200/90' },
    light: { rootBg: 'bg-gradient-to-r from-blue-500 to-cyan-500', nodeBg: 'bg-white', text: 'text-gray-900', border: 'border-slate-200/90' },
    beige: { rootBg: 'bg-gradient-to-r from-orange-400 to-amber-500', nodeBg: 'bg-[#fffbeb]', text: 'text-amber-900', border: 'border-orange-200/90' },
    green: { rootBg: 'bg-gradient-to-r from-green-500 to-emerald-600', nodeBg: 'bg-[#f0fdf4]', text: 'text-green-900', border: 'border-green-200/90' },
  };

  const currentStyle = themeStyles[theme] || themeStyles.dark;
  const isRoot = data.isRoot;
  const bgColor = isRoot ? currentStyle.rootBg : currentStyle.nodeBg;
  const textColor = isRoot ? 'text-white' : currentStyle.text;
  const isAiActive = Boolean(data.aiActive);
  const isMultiSelected = Boolean(data.multiSelected);
  const borderColor = selected || isAiActive
    ? 'ring-1 ring-purple-500 border-purple-500'
    : isMultiSelected
      ? 'ring-1 ring-purple-500 border-purple-500'
      : (isRoot ? 'border-transparent' : currentStyle.border);
  const shadow = selected || isAiActive
    ? 'shadow-md shadow-purple-500/20'
    : isMultiSelected
      ? 'shadow-md shadow-purple-500/20'
      : 'shadow-[0_3px_10px_rgba(15,23,42,0.12)]';

  const contentPreview = typeof data.content === 'string' ? data.content.trim() : '';
  const wrappedPreview = wrapTextByChars(contentPreview, CONTENT_WRAP_CHARS);
  const previewLines = wrappedPreview ? wrappedPreview.split('\n').length : 0;
  const shouldExpandWidth = wrappedPreview.length > CONTENT_WRAP_CHARS;
  const shouldExpandHeight = previewLines >= 3;
  const shapeClass = isRoot || (!isEditing && !shouldExpandHeight)
    ? 'rounded-2xl'
    : 'rounded-xl';
  const sizeClass = isRoot
    ? 'min-w-[72px] max-w-[160px] px-2 py-[3px]'
    : shouldExpandWidth
      ? `min-w-[84px] max-w-[240px] px-2 ${shouldExpandHeight ? 'py-1.5' : 'py-[5px]'}`
      : 'min-w-[64px] max-w-[128px] px-1.5 py-[3px]';

  return (
    <div
      className={`relative ${shapeClass} text-center transition-all duration-300 group border ${sizeClass} ${bgColor} ${borderColor} ${shadow}`}
      onDoubleClickCapture={handleDoubleClick}
      title="双击可编辑节点标题"
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-slate-400 !w-[2px] !h-[2px] !border !border-white/90" />

      <div className="space-y-0.5">
        {isEditing ? (
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`w-full bg-transparent outline-none text-center font-semibold text-[11px] leading-[14px] ${textColor}`}
          />
        ) : (
          <>
            <div className={`font-semibold text-[11px] select-none break-words leading-[14px] tracking-normal ${textColor}`}>
              {data.label}
            </div>
            {wrappedPreview && (
              <div className={`text-[10px] leading-[13px] opacity-75 whitespace-pre-wrap break-words text-left ${textColor}`}>
                {wrappedPreview}
              </div>
            )}
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="!bg-slate-400 !w-[2px] !h-[2px] !border !border-white/90" />
    </div>
  );
};

export default React.memo(MindMapNode);
