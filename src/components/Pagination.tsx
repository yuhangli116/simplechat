import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';

type PaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onChange }) => {
  const [jump, setJump] = useState('');

  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const safeTotalPages = Math.max(1, totalPages);

  const pages = useMemo(() => {
    if (safeTotalPages <= 2) return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    return [1, safeTotalPages];
  }, [safeTotalPages]);

  const handleJump = () => {
    if (!jump.trim()) return;
    const raw = Number(jump);
    if (!Number.isFinite(raw)) return;
    const target = Math.min(safeTotalPages, Math.max(1, Math.floor(raw)));
    onChange(target);
    setJump('');
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-gray-500 whitespace-nowrap">
        第 {safePage} / {safeTotalPages} 页
      </div>

      <div className="flex items-center gap-2 justify-end flex-1">
        <button
          onClick={() => onChange(Math.max(1, safePage - 1))}
          className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={safePage <= 1}
          type="button"
          title="上一页"
          aria-label="上一页"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1">
          {pages.map((p, idx) => (
            <React.Fragment key={p}>
              <button
                onClick={() => onChange(p)}
                className={`min-w-8 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                  p === safePage
                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
                type="button"
                title={`第 ${p} 页`}
              >
                {p}
              </button>
              {safeTotalPages >= 3 && idx === 0 ? <span className="px-0.5 text-xs text-gray-400">...</span> : null}
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={() => onChange(Math.min(safeTotalPages, safePage + 1))}
          className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={safePage >= safeTotalPages}
          type="button"
          title="下一页"
          aria-label="下一页"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={safeTotalPages}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJump();
            }}
            className="w-16 px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
            placeholder="页码"
          />
          <button
            onClick={handleJump}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            type="button"
            title="跳转"
            aria-label="跳转"
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
