import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePromptStore, Prompt } from '@/store/usePromptStore';
import Pagination from '@/components/Pagination';

const CATEGORY_ITEMS = [
  { id: 'ai_role', label: 'AI角色扮演' },
  { id: 'book_positioning', label: '开书与定位' },
  { id: 'worldbuilding', label: '世界观与设定' },
  { id: 'character', label: '角色系统' },
  { id: 'plot_outline', label: '剧情结构与大纲' },
  { id: 'chapter_scene', label: '单章/段落写作' },
  { id: 'polish_rewrite', label: '润色与改写' },
  { id: 'consistency_proof', label: '一致性与校对' },
  { id: 'ideas_material', label: '素材与灵感' },
  { id: 'other', label: '其他/自定义' },
];

const normalizeIndexToCategoryId = (index: string) => {
  const raw = String(index || '').trim();
  if (!raw) return 'other';
  const byLabel = CATEGORY_ITEMS.find((c) => c.label === raw);
  if (byLabel) return byLabel.id;
  const byId = CATEGORY_ITEMS.find((c) => c.id === raw);
  if (byId) return byId.id;
  if (raw === '作家' || raw.includes('作家') || raw === '写作辅导') return 'ai_role';
  if (raw === '角色' || raw.includes('角色')) return 'character';
  if (raw === '世界观' || raw.includes('世界观')) return 'worldbuilding';
  if (raw === '大纲' || raw === '细纲' || raw.includes('大纲')) return 'plot_outline';
  if (raw === '润色修改' || raw.includes('润色') || raw.includes('改写')) return 'polish_rewrite';
  return 'other';
};

const getPromptTitle = (prompt: Prompt) => {
  const t = (prompt.title || '').trim();
  if (t) return t;
  const legacy = prompt.tags?.[0];
  return legacy || prompt.index || '未命名提示词';
};

const matchesPrompt = (prompt: Prompt, q: string) => {
  const title = (prompt.title || prompt.tags?.[0] || prompt.index || '').toLowerCase();
  const index = (prompt.index || '').toLowerCase();
  const tags = (prompt.tags || []).join(' ').toLowerCase();
  const content = (prompt.content || '').toLowerCase();
  return title.includes(q) || index.includes(q) || tags.includes(q) || content.includes(q);
};

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
  const prevKeywordRef = useRef<string>('');
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [didAutoSwitch, setDidAutoSwitch] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    prevKeywordRef.current = '';
    setKeyword('');
    setActiveTab('all');
    setDidAutoSwitch(false);
    setPage(1);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (prevKeywordRef.current === keyword) return;
    prevKeywordRef.current = keyword;

    const q = keyword.trim().toLowerCase();
    if (!q) {
      setDidAutoSwitch(false);
      return;
    }
    if (activeTab === 'all') {
      setDidAutoSwitch(false);
      return;
    }

    const tabBase = prompts.filter((p) => normalizeIndexToCategoryId(p.index) === activeTab);
    const tabMatches = tabBase.filter((p) => matchesPrompt(p, q));
    if (tabMatches.length > 0) {
      setDidAutoSwitch(false);
      return;
    }

    const allMatches = prompts.filter((p) => matchesPrompt(p, q));
    if (allMatches.length > 0) {
      setDidAutoSwitch(true);
      setActiveTab('all');
    }
  }, [keyword, activeTab, prompts, isOpen]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const base = activeTab === 'all'
      ? prompts
      : prompts.filter((p) => normalizeIndexToCategoryId(p.index) === activeTab);

    if (!q) return base;
    return base.filter((p) => matchesPrompt(p, q));
  }, [keyword, prompts, activeTab]);

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

      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
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
        <div className="mt-2 text-xs text-gray-400">
          共 {filtered.length} 条
          {didAutoSwitch && (
            <span className="ml-2 text-purple-600/80 bg-purple-50 px-2 py-0.5 rounded border border-purple-100/60">
              已切换到“全部”以展示匹配结果
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 max-h-[76px] overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 text-xs rounded-xl whitespace-nowrap transition-all ${
              activeTab === 'all'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
            }`}
          >
            全部
          </button>
          {CATEGORY_ITEMS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-xs rounded-xl whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className={`${compact ? 'h-[280px]' : 'h-[420px]'} overflow-y-auto space-y-2 pr-1 custom-scrollbar`}>
          {paged.map((p) => {
            const title = getPromptTitle(p);
            const categoryId = normalizeIndexToCategoryId(p.index);
            const categoryLabel = CATEGORY_ITEMS.find((c) => c.id === categoryId)?.label || '其他/自定义';
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
                      分类：{categoryLabel}；标签：{tags}
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
