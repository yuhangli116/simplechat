import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Info, ChevronDown, Copy, CheckCircle } from 'lucide-react';
import { usePromptStore, Prompt } from '@/store/usePromptStore';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { useTrashStore } from '@/store/useTrashStore';
import { useToastStore } from '@/store/useToastStore';
import Pagination from '@/components/Pagination';
import { createUserPrompt, deleteUserPrompt, loadUserPrompts, updateUserPrompt } from '@/lib/promptPersistence';
import { createLogger, flushLogs } from '@/lib/logger';

const log = createLogger('Prompts');

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

const PRESET_INDEXES = CATEGORY_ITEMS.map((c) => c.label);

const PRESET_TAGS: Record<string, string[]> = {
  'AI角色扮演': ['网文作家', '编辑', '剧情策划', '世界观设定师', '角色塑造师', '对话写手'],
  '开书与定位': ['题材定位', '卖点设计', '黄金三章', '书名简介'],
  '世界观与设定': ['力量体系', '地理势力', '历史年表', '组织阵营'],
  '角色系统': ['主角弧光', '反派动机', '人物关系网', '人物小传'],
  '剧情结构与大纲': ['三幕式', '章节大纲', '冲突升级', '伏笔回收'],
  '单章/段落写作': ['开头抓人', '高潮段落', '对话推进', '场景描写'],
  '润色与改写': ['降AI味', '扩写', '精简', '风格统一'],
  '一致性与校对': ['时间线校验', '设定矛盾', '人设一致性'],
  '素材与灵感': ['情节点子', '反转点', '命名', '桥段'],
};

const Prompts = () => {
  const { prompts, addPrompt, updatePrompt, removePrompt, setPrompts } = usePromptStore();
  const { user } = useAuthStore();
  const { addToTrash } = useTrashStore();
  const addToast = useToastStore((state) => state.addToast);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [previewPrompt, setPreviewPrompt] = useState<Prompt | null>(null);
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Modal State
  const [titleInput, setTitleInput] = useState('');
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
    if (!user) {
      setPrompts([]);
      return;
    }
    if (isGuestUser(user)) {
      log.info('Using local prompts for guest user', { count: prompts.length });
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingPrompts(true);
      try {
        const data = await loadUserPrompts(user.id);
        if (!cancelled) {
          setPrompts(data);
        }
      } catch (error) {
        if (!cancelled) {
          addToast('加载指令失败，请稍后重试', 'error');
        }
      } finally {
        if (!cancelled) {
          setLoadingPrompts(false);
          flushLogs();
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, setPrompts, addToast]);

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

  const handleCopy = async (id: string, content: string) => {
    const text = String(content ?? '');
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      addToast('复制成功', 'success');
      log.success('Prompt copied', {
        userId: user?.id,
        promptId: id,
        contentLength: text.length,
      });
    } else {
      addToast('复制失败，请手动复制', 'error');
      log.error('Prompt copy failed', {
        userId: user?.id,
        promptId: id,
        contentLength: text.length,
      });
    }
    flushLogs();
  };

  const handleOpenModal = (prompt?: Prompt) => {
    if (prompt) {
      setEditingPrompt(prompt);
      const derivedTitle = (prompt.title || '').trim() || prompt.tags?.[0] || '';
      const derivedTags = prompt.title ? prompt.tags || [] : (prompt.tags || []).slice(1);
      setTitleInput(derivedTitle);
      const normalizedId = normalizeIndexToCategoryId(prompt.index);
      const normalizedLabel = CATEGORY_ITEMS.find((c) => c.id === normalizedId)?.label;
      setIndexInput(normalizedLabel || prompt.index);
      setTagInput(derivedTags.join(' '));
      setContentInput(prompt.content);
    } else {
      setEditingPrompt(null);
      setTitleInput('');
      setIndexInput('');
      setTagInput('');
      setContentInput('');
    }
    setIsModalOpen(true);
  };

  const openPreview = (prompt: Prompt) => {
    log.info('Prompt preview opened', {
      userId: user?.id,
      promptId: prompt.id,
      title: getPromptTitle(prompt),
    });
    flushLogs();
    setPreviewPrompt(prompt);
  };

  const closePreview = () => {
    setPreviewPrompt(null);
  };

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

  const getPromptSecondaryTags = (prompt: Prompt) => {
    if (prompt.title) return prompt.tags || [];
    return (prompt.tags || []).slice(1);
  };

  const filteredPrompts = useMemo(() => {
    if (activeTab === 'all') return prompts;
    return prompts.filter((p) => normalizeIndexToCategoryId(p.index) === activeTab);
  }, [activeTab, prompts]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const PAGE_SIZE = 6;
  const totalPages = Math.max(1, Math.ceil(filteredPrompts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedPrompts = filteredPrompts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSave = async () => {
    const title = titleInput.trim();
    const index = indexInput.trim();
    const content = contentInput.trim();
    if (!title) {
      addToast('请输入标题', 'error');
      return;
    }
    if (!index) {
      addToast('请选择或输入一级标签', 'error');
      return;
    }
    if (!content) {
      addToast('请输入提示词内容', 'error');
      return;
    }

    const normalizedTitle = title.toLocaleLowerCase();
    const duplicate = prompts.find((prompt) => {
      if (editingPrompt && prompt.id === editingPrompt.id) return false;
      return getPromptTitle(prompt).trim().toLocaleLowerCase() === normalizedTitle;
    });

    if (duplicate) {
      log.warn('Prompt duplicate blocked', {
        userId: user?.id,
        title,
        existingPromptId: duplicate.id,
        editingPromptId: editingPrompt?.id || null,
      });
      flushLogs();
      addToast('已存在同名指令，请修改标题后再保存', 'error');
      return;
    }

    const newPrompt: Prompt = {
      id: editingPrompt ? editingPrompt.id : Date.now().toString(),
      title,
      index,
      tags: tagInput.split(' ').filter((t) => t),
      content,
      sourceSkillTemplateId: editingPrompt?.sourceSkillTemplateId || null,
    };

    setSavingPrompt(true);
    let persistedPromptId = newPrompt.id;
    try {
      if (user && !isGuestUser(user)) {
        if (editingPrompt) {
          const saved = await updateUserPrompt(user.id, editingPrompt.id, newPrompt);
          updatePrompt(editingPrompt.id, saved);
          persistedPromptId = saved.id;
          addToast('指令已保存', 'success');
        } else {
          const saved = await createUserPrompt(user.id, newPrompt);
          addPrompt(saved);
          persistedPromptId = saved.id;
          addToast('指令已新增', 'success');
        }
      } else if (editingPrompt) {
        updatePrompt(editingPrompt.id, newPrompt);
        addToast('指令已保存到本地', 'success');
      } else {
        addPrompt(newPrompt);
        addToast('指令已新增到本地', 'success');
      }
      log.success('Prompt saved from Prompts page', {
        promptId: persistedPromptId,
        isGuest: isGuestUser(user),
        editing: Boolean(editingPrompt),
      });
      setIsModalOpen(false);
    } catch (error) {
      log.error('Failed to save prompt from Prompts page', { promptId: newPrompt.id }, error);
      addToast(error instanceof Error ? error.message : '保存指令失败', 'error');
    } finally {
      setSavingPrompt(false);
      flushLogs();
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const promptToDelete = prompts.find((p) => p.id === confirmDeleteId);
    if (promptToDelete) {
      const trashTitle = (promptToDelete.title || '').trim() || promptToDelete.tags?.[0] || promptToDelete.index;
      log.info('Prompt delete confirmed', {
        userId: user?.id,
        promptId: confirmDeleteId,
        title: trashTitle,
      });
      try {
        await addToTrash({
          originalId: confirmDeleteId,
          type: 'prompt',
          title: trashTitle,
          content: promptToDelete,
        });
        if (user && !isGuestUser(user)) {
          await deleteUserPrompt(user.id, confirmDeleteId);
        }
        removePrompt(confirmDeleteId);
        if (previewPrompt?.id === confirmDeleteId) {
          setPreviewPrompt(null);
        }
        addToast('指令已移入废稿箱', 'success');
      } catch (error) {
        log.error('Failed to delete prompt', { promptId: confirmDeleteId }, error);
        addToast(error instanceof Error ? error.message : '删除指令失败，请稍后重试', 'error');
        flushLogs();
        return;
      }
    }
    setConfirmDeleteId(null);
  };

  const cancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const availablePresetTags = (() => {
    const normalizedId = normalizeIndexToCategoryId(indexInput);
    const label = CATEGORY_ITEMS.find((c) => c.id === normalizedId)?.label;
    return label ? PRESET_TAGS[label] : undefined;
  })();

  return (
    <div className="h-full min-h-0 bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-xl font-bold text-gray-800 mb-4">指令工坊</h1>
        
        <div className="flex items-center justify-between">
          <div className="flex-1 bg-green-50 border border-green-100 rounded-lg p-3 flex items-center text-sm text-green-700 mr-4">
            <Info className="w-4 h-4 mr-2 text-green-600" />
            你可以在模版广场一键导入喜欢的指令到这里；AI 创作时也可以直接从“指令工坊”选择。
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 shadow-sm hover:shadow-md transition-all font-medium"
          >
            <Plus className="w-4.5 h-4.5 mr-2" />
            新增指令
          </button>
        </div>
      </div>

      <div className="px-6 pt-4 pb-2 flex gap-2 border-b border-gray-100 bg-gray-50/50 overflow-x-auto shrink-0">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-2 text-xs rounded-xl whitespace-nowrap transition-all ${
            activeTab === 'all' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
          }`}
        >
          全部
        </button>
        {CATEGORY_ITEMS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 text-xs rounded-xl whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-gray-50">
        {/* 列表滚动区 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-2">
          {loadingPrompts ? (
            <div className="text-center py-20 text-gray-400">正在加载指令...</div>
          ) : filteredPrompts.length === 0 ? (
            <div className="text-center py-20 text-gray-400">暂无指令</div>
          ) : (
            <div className="flex flex-col gap-2.5">
            {pagedPrompts.map((prompt) => {
              const categoryId = normalizeIndexToCategoryId(prompt.index);
              const categoryLabel = CATEGORY_ITEMS.find((c) => c.id === categoryId)?.label || '其他/自定义';
              const title = getPromptTitle(prompt);
              const tags = getPromptSecondaryTags(prompt);
              return (
                <div
                  key={prompt.id}
                  onClick={() => openPreview(prompt)}
                  className="bg-white rounded-2xl border border-gray-100 hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/5 transition-all cursor-pointer p-4 flex items-start gap-4"
                >
                  {/* 左侧：标题 + 分类 */}
                  <div className="w-56 shrink-0 min-w-0 flex flex-col gap-2">
                    <div className="text-sm font-semibold text-gray-900 truncate" title={title}>
                      {title}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 border border-purple-100 text-[11px] px-2.5 py-0.5">
                        {categoryLabel}
                      </span>
                      {tags.map((tag, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-gray-50 text-gray-600 border border-gray-100 text-[11px] px-2.5 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 中间：提示词内容预览 */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs text-gray-600 bg-gray-50/60 border border-gray-100 rounded-xl p-3 whitespace-pre-wrap break-words overflow-y-auto h-20 leading-relaxed"
                    >
                      {prompt.content}
                    </div>
                  </div>

                  {/* 右侧：操作按钮（仅图标，更简洁） */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(prompt.id, prompt.content);
                      }}
                      className={`p-2 rounded-lg border transition-all ${
                        copiedId === prompt.id
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200 text-gray-500 hover:text-gray-700'
                      }`}
                      title="复制提示词内容"
                      type="button"
                    >
                      {copiedId === prompt.id ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(prompt);
                      }}
                      className="p-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200 text-gray-500 hover:text-gray-700 transition-all"
                      type="button"
                      title="修改"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(prompt.id);
                      }}
                      className="p-2 rounded-lg border border-gray-100 bg-white hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 transition-all"
                      type="button"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>

        {/* 分页控件：固定在右下角 */}
        {filteredPrompts.length > 0 && (
          <div className="sticky bottom-0 px-6 pb-6 pt-2 bg-gray-50/95 backdrop-blur border-t border-gray-100 shrink-0">
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingPrompt ? '修改指令' : '新增指令'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="flex items-start">
                <label className="w-24 text-right mr-4 text-sm font-medium text-gray-600 mt-2">
                  <span className="text-red-500 mr-1">*</span>标题：
                </label>
                <div className="flex-1">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="请输入指令标题（用于列表展示）"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
              </div>
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
                  {showTagDropdown && availablePresetTags && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {availablePresetTags.map((tag) => (
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
                  <p className="text-xs text-gray-400 mt-1">更细分的指令标签，支持多个，用空格分隔</p>
                </div>
              </div>

              {/* Content Input */}
              <div className="flex items-start">
                <label className="w-24 text-right mr-4 text-sm font-medium text-gray-600 mt-2">
                  <span className="text-red-500 mr-1">*</span>指令：
                </label>
                <div className="flex-1 relative">
                  <textarea 
                    value={contentInput}
                    onChange={(e) => setContentInput(e.target.value)}
                    placeholder="请输入详细的指令内容..."
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
                disabled={savingPrompt}
                className="px-6 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                {savingPrompt ? '保存中...' : editingPrompt ? '保存修改' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closePreview}>
          <div
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <div className="min-w-0">
                <div className="text-lg font-bold text-gray-900 truncate">{getPromptTitle(previewPrompt)}</div>
                <div className="text-xs text-gray-500 mt-1">{previewPrompt.index}</div>
              </div>
              <button onClick={closePreview} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="flex flex-wrap gap-2 mb-4">
                {getPromptSecondaryTags(previewPrompt).map((t, i) => (
                  <span key={`${previewPrompt.id}-ptag-${i}`} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">
                {previewPrompt.content}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => handleCopy(previewPrompt.id, previewPrompt.content)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  {copiedId === previewPrompt.id ? '已复制' : '复制'}
                </button>
                <button
                  onClick={() => {
                    closePreview();
                    handleOpenModal(previewPrompt);
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                >
                  修改
                </button>
                <button
                  onClick={() => handleDelete(previewPrompt.id)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={cancelDelete}>
          <div
            className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-lg font-bold text-gray-900">确定要删除这个指令吗？</div>
            <div className="text-sm text-gray-600 mt-2">删除后将进入废稿箱，可在废稿箱恢复。</div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                type="button"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                type="button"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Prompts;
