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
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [draftContent, setDraftContent] = useState(typeof data.content === 'string' ? data.content : '');
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditingContent) {
      setDraftContent(typeof data.content === 'string' ? data.content : '');
    }
  }, [data.content, isEditingContent]);

  useEffect(() => {
    if (!isEditingContent || !contentRef.current) return;
    contentRef.current.focus();
    const valueLength = contentRef.current.value.length;
    contentRef.current.setSelectionRange(valueLength, valueLength);
  }, [isEditingContent]);

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (data.isLocked) {
      if (data.onLockedAction) {
        data.onLockedAction();
      }
      return;
    }

    if (data.onStartContentEdit) {
      data.onStartContentEdit();
    }

    setIsEditingContent(true);
  };

  const commitContent = () => {
    const nextContent = draftContent.trim();
    setIsEditingContent(false);

    if (data.onContentChange) {
      data.onContentChange(nextContent);
    } else {
      data.content = nextContent;
    }

    if (data.onEndContentEdit) {
      data.onEndContentEdit();
    }
  };

  const cancelContentEdit = () => {
    setDraftContent(typeof data.content === 'string' ? data.content : '');
    setIsEditingContent(false);
    if (data.onEndContentEdit) {
      data.onEndContentEdit();
    }
  };

  const handleContentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelContentEdit();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      commitContent();
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
  const shapeClass = isRoot || (!isEditingContent && !shouldExpandHeight)
    ? 'rounded-[9999px]'
    : 'rounded-xl';
  const sizeClass = isRoot
    ? 'min-w-[72px] max-w-[160px] px-2 py-0.5'
    : shouldExpandWidth
      ? `min-w-[84px] max-w-[240px] px-2 ${shouldExpandHeight ? 'py-1.5' : 'py-1'}`
      : 'min-w-[64px] max-w-[128px] px-1.5 py-0.5';

  return (
    <div
      className={`relative ${shapeClass} text-center transition-all duration-300 group border ${sizeClass} ${bgColor} ${borderColor} ${shadow}`}
      onDoubleClickCapture={handleDoubleClick}
      title="双击可编辑节点内容"
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-slate-400 !w-[5px] !h-[5px] !border !border-white/90" />

      <div className="space-y-0.5">
        <div className={`font-semibold text-[11px] select-none break-words leading-[14px] tracking-normal ${textColor}`}>
          {data.label}
        </div>

        {isEditingContent ? (
          <textarea
            ref={contentRef}
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            onBlur={commitContent}
            onKeyDown={handleContentKeyDown}
            rows={3}
            className={`nodrag nopan w-full min-h-[64px] max-h-[200px] resize-y rounded-md border border-slate-200 bg-white/90 p-2 text-[11px] leading-4 outline-none focus:ring-2 focus:ring-purple-400/60 ${isRoot ? 'text-gray-900' : textColor}`}
            placeholder="输入节点内容，Ctrl/Cmd + Enter 保存"
          />
        ) : (
          wrappedPreview && (
            <div className={`text-[10px] leading-[13px] opacity-75 whitespace-pre-wrap break-words text-left ${textColor}`}>
              {wrappedPreview}
            </div>
          )
        )}
      </div>

      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="!bg-slate-400 !w-[5px] !h-[5px] !border !border-white/90" />
    </div>
  );
};

export default React.memo(MindMapNode);
