import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Info, ChevronDown, Copy, CheckCircle } from 'lucide-react';
import { usePromptStore, Prompt } from '@/store/usePromptStore';
import { useTrashStore } from '@/store/useTrashStore';

const PRESET_INDEXES = ['作家', '角色', '世界观', '大纲', '细纲', '写作辅导', '润色修改'];
const PRESET_TAGS: Record<string, string[]> = {
  '作家': ['短篇小说作家', '网文小说作家', '玄幻小说作家', '科幻小说作家', '言情小说作家'],
  '角色': ['反派角色', '正派角色', '主角', '配角', '智者', '喜剧角色'],
  '世界观': ['修仙体系', '魔法体系', '赛博朋克', '废土', '末日', '异世界'],
  '大纲': ['主线大纲', '分卷大纲', '单章大纲', '感情线', '升级线'],
  '细纲': ['战斗场面', '日常互动', '解谜推理', '情感爆发', '场景描写'],
};

const Prompts = () => {
  const { prompts, addPrompt, updatePrompt, removePrompt } = usePromptStore();
  const { addToTrash } = useTrashStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  // Modal State
  const [indexInput, setIndexInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [contentInput, setContentInput] = useState('');

  // Dropdown States
  const [showIndexDropdown, setShowIndexDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const indexRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  
  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (indexRef.current && !indexRef.current.contains(event.target as Node)) {
        setShowIndexDropdown(false);
      }
      if (tagRef.current && !tagRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleOpenModal = (prompt?: Prompt) => {
    if (prompt) {
      setEditingPrompt(prompt);
      setIndexInput(prompt.index);
      setTagInput(prompt.tags.join(' ')); // Simple join for demo
      setContentInput(prompt.content);
    } else {
      setEditingPrompt(null);
      setIndexInput('');
      setTagInput('');
      setContentInput('');
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const newPrompt: Prompt = {
      id: editingPrompt ? editingPrompt.id : Date.now().toString(),
      index: indexInput,
      tags: tagInput.split(' ').filter(t => t),
      content: contentInput
    };

    if (editingPrompt) {
      updatePrompt(editingPrompt.id, newPrompt);
    } else {
      addPrompt(newPrompt);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个提示词吗？')) {
      const promptToDelete = prompts.find(p => p.id === id);
      if (promptToDelete) {
        addToTrash({
          originalId: id,
          type: 'prompt',
          title: promptToDelete.index,
          content: promptToDelete
        });
        removePrompt(id);
      }
    }
  };

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-800 mb-4">我的提示词</h1>
        
        <div className="flex items-center justify-between">
          <div className="flex-1 bg-green-50 border border-green-100 rounded-lg p-3 flex items-center text-sm text-green-700 mr-4">
            <Info className="w-4 h-4 mr-2 text-green-600" />
            提前预设好提示词模版，在大模型交互时，你只需要在指令框中输入 / ，即可快速导入预设的提示词模版！
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增提示词
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 bg-gray-50 text-sm font-medium text-gray-500">
            <div className="col-span-3">一级标签</div>
            <div className="col-span-3">二级标签</div>
            <div className="col-span-4">提示词预览</div>
            <div className="col-span-2 text-right">操作</div>
          </div>

          {/* Table Body */}
          {prompts.map(prompt => (
            <div key={prompt.id} className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 items-center hover:bg-gray-50 transition-colors">
              <div className="col-span-3 font-medium text-gray-900">{prompt.index}</div>
              <div className="col-span-3 flex flex-wrap gap-2">
                {prompt.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="col-span-4 text-gray-500 text-sm truncate">
                {prompt.content}
              </div>
              <div className="col-span-2 flex justify-end space-x-2">
                <button                   onClick={() => handleCopy(prompt.id, prompt.content)}
                  className={`p-1.5 rounded-md transition-colors text-xs flex items-center ${
                    copiedId === prompt.id 
                      ? 'text-green-600 bg-green-50' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title="复制提示词内容"
                >
                  {copiedId === prompt.id ? <CheckCircle className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  {copiedId === prompt.id ? '已复制' : '复制'}
                </button>
                <button 
                  onClick={() => handleOpenModal(prompt)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-xs flex items-center"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  修改
                </button>
                <button 
                  onClick={() => handleDelete(prompt.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors text-xs flex items-center"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  删除
                </button>
              </div>
            </div>
          ))}
          
          {prompts.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              暂无提示词，点击右上角新增
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingPrompt ? '修改提示词' : '新增提示词'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Index Input */}
              <div className="flex items-start">
                <label className="w-24 text-right mr-4 text-sm font-medium text-gray-600 mt-2">
                  <span className="text-red-500 mr-1">*</span>一级标签：
                </label>
                <div className="flex-1 relative" ref={indexRef}>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={indexInput}
                      onChange={(e) => setIndexInput(e.target.value)}
                      onFocus={() => setShowIndexDropdown(true)}
                      placeholder="请选择或输入一级标签 (如: AI作家)"
                      className="w-full p-2 pr-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {showIndexDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {PRESET_INDEXES.map((idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer text-gray-700"
                          onClick={() => {
                            setIndexInput(idx);
                            setShowIndexDropdown(false);
                          }}
                        >
                          {idx}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">从宏观角度分类，支持自定义输入</p>
                </div>
              </div>

              {/* Tags Input */}
              <div className="flex items-start">
                <label className="w-24 text-right mr-4 text-sm font-medium text-gray-600 mt-2">
                  <span className="text-red-500 mr-1">*</span>二级标签：
                </label>
                <div className="flex-1 relative" ref={tagRef}>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onFocus={() => setShowTagDropdown(true)}
                      placeholder="请选择或输入二级标签，用空格分隔"
                      className="w-full p-2 pr-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                    />
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {showTagDropdown && PRESET_TAGS[indexInput] && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {PRESET_TAGS[indexInput].map((tag) => (
                        <div
                          key={tag}
                          className="px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer text-gray-700"
                          onClick={() => {
                            const currentTags = tagInput.split(' ').filter(t => t);
                            if (!currentTags.includes(tag)) {
                              setTagInput([...currentTags, tag].join(' '));
                            }
                            setShowTagDropdown(false);
                          }}
                        >
                          {tag}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">更细分的提示词标签，支持多个，用空格分隔</p>
                </div>
              </div>

              {/* Content Input */}
              <div className="flex items-start">
                <label className="w-24 text-right mr-4 text-sm font-medium text-gray-600 mt-2">
                  <span className="text-red-500 mr-1">*</span>提示词：
                </label>
                <div className="flex-1 relative">
                  <textarea 
                    value={contentInput}
                    onChange={(e) => setContentInput(e.target.value)}
                    placeholder="请输入详细的提示词内容..."
                    className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm resize-none"
                  />
                  <div className="absolute bottom-3 right-3 flex space-x-2">
                    {/* Toolbar placeholders */}
                    <button className="p-1 bg-gray-100 rounded hover:bg-gray-200 text-xs text-gray-600">@</button>
                    <button className="p-1 bg-gray-100 rounded hover:bg-gray-200 text-xs text-gray-600">:</button>
                    <button className="p-1 bg-gray-100 rounded hover:bg-gray-200 text-xs text-gray-600">/</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSave}
                className="px-6 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                {editingPrompt ? '保存修改' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Prompts;
