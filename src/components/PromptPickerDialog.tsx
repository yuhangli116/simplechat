import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePromptStore, Prompt } from '@/store/usePromptStore';
import Pagination from '@/components/Pagination';

type PromptPickerDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onPick: (content: string, prompt: Prompt) => void;
  pageSize?: number;
  mode?: 'modal' | 'popover';
  variant?: 'default' | 'compact';
  overlayClassName?: string;
};

const PromptPickerDialog: React.FC<PromptPickerDialogProps> = ({
  isOpen,
  onClose,
  onPick,
  pageSize = 6,
  mode = 'modal',
  variant = 'default',
  overlayClassName,
}) => {
  const { prompts } = usePromptStore();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setKeyword('');
    setPage(1);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter((p) => {
      const title = (p.title || p.tags?.[0] || p.index || '').toLowerCase();
      const index = (p.index || '').toLowerCase();
      const tags = (p.tags || []).join(' ').toLowerCase();
      const content = (p.content || '').toLowerCase();
      return title.includes(q) || index.includes(q) || tags.includes(q) || content.includes(q);
    });
  }, [keyword, prompts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  if (!isOpen) return null;

  const compact = mode === 'popover' || variant === 'compact';

  const panel = (
    <div
      className={`bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 ${
        mode === 'modal' ? (compact ? 'w-full max-w-xl' : 'w-full max-w-3xl') : 'w-[520px] max-w-[80vw]'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="text-base font-bold text-gray-900">选择提示词</div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          type="button"
          aria-label="关闭"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            className="flex-1 bg-transparent outline-none text-sm"
            placeholder="搜索标题 / 分类 / 标签 / 内容"
          />
        </div>
        <div className="mt-2 text-xs text-gray-400">共 {filtered.length} 条</div>
      </div>

      <div className="p-5">
        <div className={`${compact ? 'max-h-[280px]' : 'max-h-[420px]'} overflow-y-auto space-y-2 pr-1 custom-scrollbar`}>
          {paged.map((p) => {
            const title = p.title || p.tags?.[0] || p.index || '未命名提示词';
            const tags = (p.tags || []).join(' / ') || '-';
            return (
              <button
                key={p.id}
                onClick={() => onPick(p.content, p)}
                type="button"
                className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate" title={title}>
                      {title}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1 truncate">
                      分类：{p.index || '-'}；标签：{tags}
                    </div>
                  </div>
                </div>
                <div
                  className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words max-h-28 overflow-y-auto custom-scrollbar"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {p.content}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && <div className="text-center py-16 text-sm text-gray-400">暂无提示词</div>}
        </div>

        <div className="mt-4">
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  );

  if (mode === 'popover') {
    return <div className="absolute top-full right-0 mt-2 z-[1300]">{panel}</div>;
  }

  return (
    <div
      className={`fixed inset-0 z-[1200] flex items-center justify-center p-4 ${overlayClassName || 'bg-black/50'}`}
      onClick={onClose}
    >
      {panel}
    </div>
  );
};

export default PromptPickerDialog;
