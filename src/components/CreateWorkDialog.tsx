import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

interface CreateWorkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateWorkData) => void;
}

export interface CreateWorkData {
  name: string;
  selectedPages: string[];
  chapterCount: number;
}

const PAGE_OPTIONS = [
  { id: 'outline', label: '作品大纲' },
  { id: 'world', label: '世界设定' },
  { id: 'character', label: '角色塑造' },
  { id: 'event', label: '事件细纲' },
];

const CHAPTER_OPTIONS = [
  { value: 3, label: '初始 1-3 章' },
  { value: 10, label: '初始 1-10 章' },
  { value: 50, label: '初始 1-50 章' },
  { value: 100, label: '初始 1-100 章' },
];

const CreateWorkDialog: React.FC<CreateWorkDialogProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [selectedPages, setSelectedPages] = useState<string[]>(['outline', 'world', 'character', 'event']);
  const [chapterCount, setChapterCount] = useState<number>(3);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('请输入作品名称');
      return;
    }
    onSubmit({
      name,
      selectedPages,
      chapterCount,
    });
    // Reset form
    setName('');
    setSelectedPages(['outline', 'world', 'character', 'event']);
    setChapterCount(3);
    onClose();
  };

  const togglePage = (id: string) => {
    setSelectedPages(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">新建作品</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Work Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">作品名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入作品名称"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              autoFocus
            />
          </div>

          {/* Related Pages Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">包含页面</label>
            <div className="grid grid-cols-2 gap-3">
              {PAGE_OPTIONS.map(page => (
                <div 
                  key={page.id}
                  onClick={() => togglePage(page.id)}
                  className={`
                    flex items-center p-3 rounded-lg border cursor-pointer transition-all select-none
                    ${selectedPages.includes(page.id) 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'}
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors
                    ${selectedPages.includes(page.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}
                  `}>
                    {selectedPages.includes(page.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm">{page.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Initial Chapters Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">初始章节</label>
            <select
              value={chapterCount}
              onChange={(e) => setChapterCount(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              {CHAPTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500">将自动为您创建对应数量的空白章节</p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-all"
            >
              立即创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateWorkDialog;
