import React, { useState, useRef, useEffect, useContext } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MindMapContext } from './MindMapEditor';

const CONTENT_WRAP_CHARS = 24;

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

const MindMapNodeInner = React.memo(({
  data, isConnectable, selected, id,
  isLocked, forceEdit, isAiActive, isMultiSelected, theme,
  setEditingNodeId, handleNodeDataChange, handleNodeLabelChange, handleNodeContentChange
}: NodeProps & {
  isLocked: boolean;
  forceEdit: boolean;
  isAiActive: boolean;
  isMultiSelected: boolean;
  theme: string;
  setEditingNodeId?: (id: string | null) => void;
  handleNodeDataChange?: (id: string, label: string, content: string) => void;
  handleNodeLabelChange?: (id: string, label: string) => void;
  handleNodeContentChange?: (id: string, content: string) => void;
}) => {
  // 编辑状态 - 完全由组件内部管理（参考 v0.1/v2.0 的工作方式）
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [content, setContent] = useState(typeof data.content === 'string' ? data.content : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 当 data 变化时同步到本地状态
  useEffect(() => {
    setLabel(data.label);
    setContent(typeof data.content === 'string' ? data.content : '');
  }, [data.label, data.content]);

  // Handle external force edit signal from ReactFlow wrapper
  useEffect(() => {
    if (forceEdit && !isEditing && !isLocked) {
      // Force an immediate update
      setIsEditing(true);
    } else if (!forceEdit && isEditing) {
      // Don't auto close here to avoid conflicts with onBlur handling
    }
  }, [forceEdit, isEditing, isLocked]);

  // 编辑模式开启时自动聚焦并选中文字
  useEffect(() => {
    if (isEditing) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Optional: we can select the text or just put cursor at the end
          inputRef.current.select();
        }
        
        // Auto resize textarea if it exists
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
      });
    }
  }, [isEditing]);

  // Handle blur
  const handleBlur = (e?: React.FocusEvent) => {
    // Give a small delay to allow click events to process before closing edit mode
    setTimeout(() => {
      // If active element is still inside our editing container, don't blur
      const activeElement = document.activeElement;
      if (
        activeElement === inputRef.current || 
        activeElement === textareaRef.current
      ) {
        return;
      }
      
      setIsEditing(false);
      if (setEditingNodeId) {
        setEditingNodeId(null);
      } else if (data.onEditEnd) {
        data.onEditEnd();
      }
      
      const newLabel = label.trim() || '新节点'; // Prevent empty label
      const newContent = content.trim();
      
      const labelChanged = newLabel !== data.label;
      const contentChanged = newContent !== (typeof data.content === 'string' ? data.content : '');

      if (handleNodeDataChange) {
        handleNodeDataChange(id, newLabel, newContent);
      } else if (data.onNodeDataChange) {
        data.onNodeDataChange(newLabel, newContent);
      } else {
        // 更新数据
        if (labelChanged) {
          if (handleNodeLabelChange) {
            handleNodeLabelChange(id, newLabel);
          } else if (data.onChange) {
            data.onChange(newLabel);
          } else {
            data.label = newLabel;
          }
        }
        
        if (contentChanged) {
          if (handleNodeContentChange) {
            handleNodeContentChange(id, newContent);
          } else if (data.onContentChange) {
            data.onContentChange(newContent);
          } else {
            data.content = newContent;
          }
        }
      }
    }, 200);
  };

  // 键盘事件处理
  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Stop propagation so ReactFlow doesn't intercept keys while editing
    evt.stopPropagation();
    
    // Check if it's shift+enter to allow newlines in textarea
    if (evt.key === 'Enter') {
      if (evt.shiftKey) {
        if (evt.target === inputRef.current) {
          evt.preventDefault();
          textareaRef.current?.focus();
        }
        return; // Let the default behavior happen (insert newline)
      } else {
        evt.preventDefault();
        
        // Ensure state updates take effect before blurring
        setTimeout(() => {
          handleBlur();
        }, 0);
      }
    }

    if (evt.key === 'ArrowDown' && evt.target === inputRef.current) {
      evt.preventDefault();
      textareaRef.current?.focus();
    }

    if (evt.key === 'ArrowUp' && evt.target === textareaRef.current) {
      const target = evt.target as HTMLTextAreaElement;
      if (target.selectionStart === 0) {
        evt.preventDefault();
        inputRef.current?.focus();
      }
    }
    
    if (evt.key === 'Escape') {
      evt.preventDefault();
      setLabel(data.label);
      setContent(typeof data.content === 'string' ? data.content : '');
      setIsEditing(false);
      if (setEditingNodeId) {
        setEditingNodeId(null);
      } else if (data.onEditEnd) {
        data.onEditEnd();
      }
    }
  };

  const themeStyles: Record<string, {
    rootBg: string;
    nodeBg: string;
    text: string;
    border: string;
    selected: string;
    shadow: string;
    selectedShadow: string;
    handle: string;
  }> = {
    dark: {
      rootBg: 'bg-blue-600',
      nodeBg: 'bg-white',
      text: 'text-slate-900',
      border: 'border-slate-200/90',
      selected: 'ring-1 ring-blue-400 border-blue-400',
      shadow: 'shadow-[0_3px_10px_rgba(15,23,42,0.12)]',
      selectedShadow: 'shadow-[0_6px_18px_rgba(37,99,235,0.22)]',
      handle: '!bg-slate-400',
    },
    light: {
      rootBg: 'bg-slate-700',
      nodeBg: 'bg-white',
      text: 'text-slate-800',
      border: 'border-slate-200',
      selected: 'ring-1 ring-slate-500 border-slate-500',
      shadow: 'shadow-[0_4px_12px_rgba(15,23,42,0.10)]',
      selectedShadow: 'shadow-[0_6px_18px_rgba(71,85,105,0.18)]',
      handle: '!bg-slate-400',
    },
    beige: {
      rootBg: 'bg-[#8a6f4d]',
      nodeBg: 'bg-[#fffaf0]',
      text: 'text-stone-800',
      border: 'border-stone-200',
      selected: 'ring-1 ring-[#8a6f4d] border-[#8a6f4d]',
      shadow: 'shadow-[0_4px_12px_rgba(120,85,40,0.10)]',
      selectedShadow: 'shadow-[0_6px_18px_rgba(120,85,40,0.18)]',
      handle: '!bg-[#8a6f4d]',
    },
    green: {
      rootBg: 'bg-[#3f7d62]',
      nodeBg: 'bg-white',
      text: 'text-slate-800',
      border: 'border-emerald-100',
      selected: 'ring-1 ring-[#3f7d62] border-[#3f7d62]',
      shadow: 'shadow-[0_4px_12px_rgba(28,83,62,0.10)]',
      selectedShadow: 'shadow-[0_6px_18px_rgba(28,83,62,0.18)]',
      handle: '!bg-[#3f7d62]',
    },
  };

  const currentStyle = themeStyles[theme] || themeStyles.dark;
  const isRoot = data.isRoot;
  const bgColor = isRoot ? currentStyle.rootBg : currentStyle.nodeBg;
  const textColor = isRoot ? 'text-white' : currentStyle.text;
  const isNodeSelected = !isLocked && (selected || isAiActive || isMultiSelected);

  const borderColor = isNodeSelected
    ? currentStyle.selected
    : (isRoot ? 'border-transparent' : currentStyle.border);
  const shadow = isNodeSelected
    ? currentStyle.selectedShadow
    : currentStyle.shadow;

  const contentPreview = isEditing ? content.trim() : (typeof data.content === 'string' ? data.content.trim() : '');
  const wrappedPreview = wrapTextByChars(contentPreview, CONTENT_WRAP_CHARS);
  const previewLines = wrappedPreview ? wrappedPreview.split('\n').length : 0;
  const shouldExpandWidth = wrappedPreview.length > CONTENT_WRAP_CHARS;
  const shouldExpandHeight = previewLines >= 3;
  const shapeClass = isRoot || !shouldExpandHeight
    ? 'rounded-2xl'
    : 'rounded-xl';
  const sizeClass = isRoot
    ? 'min-w-[64px] max-w-[148px] px-1.5 py-[2px]'
    : shouldExpandWidth
      ? `min-w-[88px] max-w-[320px] px-2 ${shouldExpandHeight ? 'py-1' : 'py-[4px]'}`
      : 'min-w-[56px] max-w-[116px] px-1.5 py-[2px]';

  return (
    <div
      className={`relative flex flex-col justify-center ${shapeClass} text-center transition-all duration-300 group border ${sizeClass} ${bgColor} ${borderColor} ${shadow}`}
      title="双击可编辑节点标题"
    >
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className={`${currentStyle.handle} !w-[2px] !h-[2px] !border !border-white/90`} />

      <div 
        className="flex-1 flex flex-col justify-center items-center w-full h-full"
      >
        {isEditing ? (
          <div 
            className="flex-1 flex flex-col gap-0 w-full justify-center cursor-text nodrag nopan relative"
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                setTimeout(() => {
                  if (document.activeElement !== textareaRef.current) {
                    handleBlur();
                  }
                }, 0);
              }}
              className={`w-full bg-transparent outline-none text-center font-semibold text-[10px] leading-[13px] tracking-normal p-0 m-0 border-none relative z-10 ${textColor}`}
              placeholder=""
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                setTimeout(() => {
                  if (document.activeElement !== inputRef.current) {
                    handleBlur();
                  }
                }, 0);
              }}
              className={`w-full bg-transparent outline-none text-center resize-none overflow-hidden break-words p-0 m-0 border-none ${textColor} ${
                content.length > 30 ? 'text-[8.5px] leading-[11px]' : 'text-[9px] leading-[12px]'
              } ${
                !content 
                  ? 'absolute bottom-0 left-0 h-[10px] opacity-0 cursor-text focus:relative focus:mt-0.5 focus:h-auto focus:opacity-100 z-20' 
                  : 'relative mt-0.5 z-10'
              }`}
              placeholder=""
              rows={1}
              style={{ minHeight: content ? '14px' : undefined }}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center w-full">
            <div className={`font-semibold text-[10px] select-none break-words leading-[13px] tracking-normal ${textColor}`}>
              {data.label}
            </div>
            {wrappedPreview && (
              <div className={`opacity-75 whitespace-pre-wrap break-words text-center mt-0.5 ${textColor} ${
                contentPreview.length > 30 ? 'text-[8.5px] leading-[11px]' : 'text-[9px] leading-[12px]'
              }`}>
                {wrappedPreview}
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className={`${currentStyle.handle} !w-[2px] !h-[2px] !border !border-white/90`} />
    </div>
  );
});

const MindMapNode = (props: NodeProps) => {
  const ctx = useContext(MindMapContext);
  const { data, id } = props;
  
  // Resolve properties from Context or default to data for fallback
  const isLocked = ctx?.isLocked || data.isLocked;
  const forceEdit = ctx?.editingNodeId === id || data.forceEdit;
  const isAiActive = (ctx?.selectedNodeId === id && ctx?.showAIDialog) || data.aiActive;
  const isMultiSelected = ctx?.multiSelectedNodeIds?.includes(id) || data.multiSelected;
  const theme = ctx?.theme || data.theme || 'dark';

  return (
    <MindMapNodeInner
      {...props}
      isLocked={!!isLocked}
      forceEdit={!!forceEdit}
      isAiActive={!!isAiActive}
      isMultiSelected={!!isMultiSelected}
      theme={theme}
      setEditingNodeId={ctx?.setEditingNodeId}
      handleNodeDataChange={ctx?.handleNodeDataChange}
      handleNodeLabelChange={ctx?.handleNodeLabelChange}
      handleNodeContentChange={ctx?.handleNodeContentChange}
    />
  );
};

export default React.memo(MindMapNode);
