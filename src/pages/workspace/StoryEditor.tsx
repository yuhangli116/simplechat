import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { 
  Bold, 
  Italic, 
  Sparkles,
  Save,
  Download,
  ChevronDown,
  ChevronUp,
  Undo2,
  Redo2,
  X,
  Bot,
  FileText,
  Link as LinkIcon,
  FileCode
} from 'lucide-react';
import { aiService, MODEL_PRICING } from '@/services/ai';
import { syncModelPricingFromDb } from '@/services/billing';
import ModelSelector from '@/components/ModelSelector';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { useFileStore } from '@/store/useFileStore';
import { useParams } from 'react-router-dom';
import ContextSelectorDialog from '@/components/ContextSelectorDialog';
import ExportDialog from '@/components/ExportDialog';
import { exportHtml, exportMarkdown, htmlToMarkdown } from '@/lib/fileExport';
import { loadChapterContent, saveChapterContent } from '@/lib/workspacePersistence';
import PromptPickerDialog from '@/components/PromptPickerDialog';
import { useWorkspacePrefsStore } from '@/store/useWorkspacePrefsStore';
import { v4 as uuidv4 } from 'uuid';

const StoryEditor = () => {
  const { workId, chapterId } = useParams();
  const { user, diamondBalance, fetchBalance } = useAuthStore();
  const { files } = useFileStore();
  type LocalModelKey = keyof typeof MODEL_PRICING;
  const { modelMemoryScope } = useWorkspacePrefsStore();
  
  // Prompt Dialog State
  const [isPromptExpanded, setIsPromptExpanded] = useState(true);
  const [promptText, setPromptText] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiTiming, setIsAiTiming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LocalModelKey | ''>('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [lastUsage, setLastUsage] = useState<{input_tokens: number, output_tokens: number, total_cost: number} | null>(null);
  const [aiPhase, setAiPhase] = useState('等待开始');
  const [aiElapsed, setAiElapsed] = useState(0);

  useEffect(() => {
    syncModelPricingFromDb().catch((error) => {
      console.warn('[StoryEditor] sync pricing failed', error);
    });
  }, []);

  useEffect(() => {
    if (!workId) return;
    const globalKey = `story-selected-model`;
    const perWorkKey = `story-selected-model-${workId}`;
    const perChapterKey = chapterId ? `story-selected-model-${workId}-${chapterId}` : '';

    const stored =
      modelMemoryScope === 'global'
        ? localStorage.getItem(globalKey) || ''
        : modelMemoryScope === 'chapter'
          ? (perChapterKey ? localStorage.getItem(perChapterKey) : '') || localStorage.getItem(globalKey) || ''
          : localStorage.getItem(perWorkKey) || localStorage.getItem(globalKey) || '';

    if (stored && stored in MODEL_PRICING) {
      setSelectedModel(stored as LocalModelKey);
    } else {
      setSelectedModel('deepseek-v4-flash' as LocalModelKey);
    }
  }, [workId, chapterId, modelMemoryScope]);

  useEffect(() => {
    if (!workId) return;
    if (!selectedModel) return;
    const globalKey = `story-selected-model`;
    const perWorkKey = `story-selected-model-${workId}`;
    const perChapterKey = chapterId ? `story-selected-model-${workId}-${chapterId}` : '';

    localStorage.setItem(globalKey, selectedModel);
    if (modelMemoryScope === 'work') {
      localStorage.setItem(perWorkKey, selectedModel);
    }
    if (modelMemoryScope === 'chapter' && perChapterKey) {
      localStorage.setItem(perChapterKey, selectedModel);
    }
  }, [selectedModel, workId, chapterId, modelMemoryScope]);
  
  // AI Context
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [aiContexts, setAiContexts] = useState<Array<{ nodeId: string, content: string, sourceName: string }>>([]);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const promptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Fetch balance on mount
  useEffect(() => {
    if (user) {
      fetchBalance();
    }
  }, [user]);

  useEffect(() => {
    if (!isAiTiming) {
      setAiElapsed(0);
      return;
    }

    const timer = window.setInterval(() => {
      setAiElapsed((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAiTiming]);

  const currentChapterName = React.useMemo(() => {
    const findByPath = (nodes: typeof files): string | null => {
      for (const node of nodes) {
        if (node.path === `/workspace/p/${workId}/story/${chapterId}`) {
          return node.name;
        }
        if (node.children?.length) {
          const found = findByPath(node.children as typeof files);
          if (found) return found;
        }
      }
      return null;
    };

    if (!workId || !chapterId) return '未命名章节';
    return findByPath(files) || '未命名章节';
  }, [files, workId, chapterId]);

  // Main Content Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        history: {
          depth: 100,
        },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[400px] p-6',
      },
    },
    onUpdate: ({ editor }) => {
      if (workId && chapterId) {
        const key = `story-${workId}-${chapterId}`;
        const content = editor.getHTML();
        localStorage.setItem(key, content);
      }
    }
  });

  // Load content
  useEffect(() => {
    if (!editor || !workId || !chapterId) return;

    const key = `story-${workId}-${chapterId}`;

    const applyContent = (content: string | null) => {
      if (content) {
        editor.commands.setContent(content);
        return;
      }
      // 新建章节时保持空白，不预设任何内容
      editor.commands.clearContent();
    };

    const loadContent = async () => {
      if (user && !isGuestUser(user)) {
        try {
          const remoteContent = await loadChapterContent(chapterId);
          if (remoteContent) {
            localStorage.setItem(key, remoteContent);
            applyContent(remoteContent);
            return;
          }
        } catch (error) {
          console.error('Failed to load chapter from Supabase:', error);
        }
      }

      applyContent(localStorage.getItem(key));
    };

    loadContent();
  }, [editor, workId, chapterId, user, currentChapterName]);

  const handleSave = async () => {
    if (editor && workId && chapterId) {
      const key = `story-${workId}-${chapterId}`;
      const content = editor.getHTML();
      localStorage.setItem(key, content);
      if (user && !isGuestUser(user)) {
        try {
          await saveChapterContent(workId, chapterId, currentChapterName, content);
        } catch (error) {
          console.error('Failed to save chapter to Supabase:', error);
          alert('已保存到本地，但同步到数据库失败');
          return;
        }
      }
      alert('保存成功');
    }
  };

  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleExport = () => {
    setShowExportDialog(true);
  };

  const handleExportFormat = (format: string) => {
    if (!editor) return;
    const htmlContent = editor.getHTML();
    const markdownContent = htmlToMarkdown(htmlContent);
    const filename = `${currentChapterName || '未命名章节'}`;
    
    if (format === 'html') {
      exportHtml(htmlContent, `${filename}.html`);
    } else {
      exportMarkdown(markdownContent, `${filename}.md`);
    }
  };

  const exportOptions = [
    {
      value: 'html',
      label: 'HTML 格式',
      description: '保留富文本格式，可直接在浏览器打开',
      icon: <FileCode className="w-5 h-5" />
    },
    {
      value: 'markdown',
      label: 'Markdown 格式',
      description: '简洁的文本格式，易于编辑和阅读',
      icon: <FileText className="w-5 h-5" />
    }
  ];

  // Load aiContexts
  useEffect(() => {
    if (workId && chapterId) {
      const key = `story-context-${workId}-${chapterId}`;
      const savedContexts = localStorage.getItem(key);
      if (savedContexts) {
        try {
          setAiContexts(JSON.parse(savedContexts));
        } catch (e) {
          console.error("Failed to parse saved contexts", e);
        }
      } else {
        setAiContexts([]);
      }
    }
  }, [workId, chapterId]);

  // Save aiContexts when changed
  useEffect(() => {
    if (workId && chapterId) {
      const key = `story-context-${workId}-${chapterId}`;
      localStorage.setItem(key, JSON.stringify(aiContexts));
    }
  }, [aiContexts, workId, chapterId]);

  const handleContextSelect = (context: { nodeId: string, content: string, sourceName: string }) => {
    setAiContexts(prev => {
      if (prev.some(c => c.nodeId === context.nodeId)) {
        return prev;
      }
      return [...prev, context];
    });
  };

  const handleRemoveContext = (nodeId: string) => {
    setAiContexts(prev => prev.filter(c => c.nodeId !== nodeId));
  };

  /**
   * 将 AI 返回的纯文本内容转换为段落分明的 HTML 格式
   * 并逐步插入到编辑器中，保持段落结构
   */
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const sanitizeAiContinuationOutput = (userPrompt: string, content: string) => {
    const prompt = String(userPrompt ?? '').trim();
    const raw = String(content ?? '');
    if (!prompt || !raw.trim()) return raw;

    const normalize = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const normalizedPrompt = normalize(prompt);
    if (!normalizedPrompt) return raw;

    const lines = raw.split(/\r?\n/);
    while (lines.length > 0 && !normalize(lines[0])) lines.shift();

    const prefixes = [/^(task|prompt|instruction|任务|提示词|用户需求|需求|指令)\s*[:：]\s*/i];

    while (lines.length > 0) {
      const line = lines[0];
      const trimmed = String(line ?? '').trim();
      const normalizedLine = normalize(trimmed);
      const normalizedLineStripped = normalize(trimmed.replace(/^[\-\*\u2022>\s"'“”‘’]+/g, ''));

      const isExact =
        normalizedLine === normalizedPrompt || normalizedLineStripped === normalizedPrompt;
      const isNearExact =
        normalizedPrompt.length >= 12 &&
        normalizedLine.includes(normalizedPrompt) &&
        normalizedLine.length <= normalizedPrompt.length + 10;

      if (isExact || isNearExact) {
        lines.shift();
        while (lines.length > 0 && !normalize(lines[0])) lines.shift();
        continue;
      }

      let removedPrefixed = false;
      for (const re of prefixes) {
        if (re.test(trimmed)) {
          const rest = trimmed.replace(re, '');
          const normalizedRest = normalize(rest);
          if (normalizedRest === normalizedPrompt || normalizedLine.includes(normalizedPrompt)) {
            lines.shift();
            while (lines.length > 0 && !normalize(lines[0])) lines.shift();
            removedPrefixed = true;
          }
          break;
        }
      }
      if (removedPrefixed) continue;
      break;
    }

    return lines.join('\n').trimStart();
  };

  const insertContentGradually = async (content: string) => {
    if (!editor) return;

    const normalizedContent = content.trim();
    if (!normalizedContent) return;

    // 按双换行符分割段落（支持 \n\n 或 \r\n\r\n）
    const paragraphs = normalizedContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // 逐段落插入
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      // 将段落内的单个换行符替换为空格（处理行内换行）
      const paragraphText = paragraph.replace(/\n/g, ' ');
      
      // 插入新段落
      editor.commands.insertContent(`<p>${escapeHtml(paragraphText)}</p>`);
      
      // 添加短暂延迟，让用户看到插入过程
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  };

  const handleAiContinue = async () => {
    if (!editor) return;

    // 游客模式下禁止使用 AI 功能
    if (isGuestUser(user)) {
      if (confirm('AI 创作功能需要登录后才能使用，是否前往登录？')) {
        navigate('/login');
      }
      return;
    }

    if (!selectedModel || !(selectedModel in MODEL_PRICING)) {
      alert('请先选择一个具体的模型');
      setShowModelSelector(true);
      return;
    }

    setIsAiGenerating(true);
    setIsAiTiming(true);
    setAiPhase('正在准备上下文');
    
    try {
      const modelKey = selectedModel as LocalModelKey;
      const textContext = editor.getText().slice(-2000);
      
      let finalContext = textContext;
      let summarizationUsage = null;
      let billingGroupId: string | undefined;
      
      // Combine user prompt with context
      const userPrompt = promptText.trim() || "请续写这段小说情节，保持风格一致，情节紧凑。";
      
      if (aiContexts.length > 0) {
        const references = aiContexts.map(c => `来源: ${c.sourceName}\n内容:\n${c.content}`).join('\n\n');
        
        if (references.length > 3000) {
          billingGroupId = uuidv4();
          setAiPhase('正在总结参考大纲');
          const summaryRes = await aiService.summarizeContext(references, user?.id, modelKey, billingGroupId);
          if (summaryRes.error) {
            alert(`总结大纲/设定失败: ${summaryRes.error}`);
            setIsAiGenerating(false);
            setIsAiTiming(false);
            setAiPhase('等待开始');
            return;
          }
          finalContext = `【经过精简的参考大纲/设定】\n${summaryRes.content}\n\n【当前章节前文内容】\n${textContext}`;
          if (summaryRes.usage) summarizationUsage = summaryRes.usage;
        } else {
          finalContext = `【参考大纲/设定】\n${references}\n\n【当前章节前文内容】\n${textContext}`;
        }
      } else {
        finalContext = `【当前章节前文内容】\n${textContext}`;
      }

      setAiPhase('正在创作正文');
      
      const response = await aiService.generateText({
        prompt: userPrompt,
        model: modelKey,
        context: finalContext,
        userId: user?.id,
        billingGroupId,
      });

      if (response.content) {
        setAiPhase('正在写入正文');
        const cleaned = sanitizeAiContinuationOutput(userPrompt, response.content);
        await insertContentGradually(cleaned);
        setIsAiTiming(false);
        
        if (workId && chapterId) {
          const content = editor.getHTML();
          localStorage.setItem(`story-${workId}-${chapterId}`, content);
          if (user && !isGuestUser(user)) {
            try {
              setAiPhase('正在保存');
              await saveChapterContent(workId, chapterId, currentChapterName, content);
            } catch (e) {
              console.error('Auto-save failed:', e);
            }
          }
        }
        
        if (user && !isGuestUser(user)) fetchBalance();
        
        if (response.usage) {
          const totalCost = response.usage.total_cost + (summarizationUsage ? summarizationUsage.total_cost : 0);
          const inputTokens = response.usage.input_tokens + (summarizationUsage ? summarizationUsage.input_tokens : 0);
          const outputTokens = response.usage.output_tokens + (summarizationUsage ? summarizationUsage.output_tokens : 0);
          setLastUsage({
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_cost: totalCost
          });
          setTimeout(() => setLastUsage(null), 5000);
        }
        
        // Clear prompt after successful generation
        setPromptText('');
      } else if (response.error) {
        alert(`AI生成失败: ${response.error}`);
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('AI生成发生错误，请重试');
    } finally {
      setIsAiGenerating(false);
      setIsAiTiming(false);
      setAiPhase('等待开始');
    }
  };

  if (!editor) {
    return null;
  }

  const currentModelConfig = MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING];

  const insertPromptContent = (text: string) => {
    const el = promptTextareaRef.current;
    const start = el?.selectionStart ?? undefined;
    const end = el?.selectionEnd ?? undefined;
    setPromptText((prev) => {
      const current = String(prev ?? '');
      if (start === undefined || end === undefined) {
        return current ? `${current}\n${text}` : text;
      }
      const safeStart = Math.min(Math.max(0, start), current.length);
      const safeEnd = Math.min(Math.max(0, end), current.length);
      const insertingAtEnd = safeStart === safeEnd && safeStart === current.length;
      const prefix = insertingAtEnd && current && !current.endsWith('\n') ? '\n' : '';
      const inserted = `${prefix}${text}`;
      return current.slice(0, safeStart) + inserted + current.slice(safeEnd);
    });

    if (el) {
      requestAnimationFrame(() => {
        const current = el.value;
        const baseStart = start ?? current.length;
        const insertingAtEnd = baseStart === current.length;
        const prefix = insertingAtEnd && current && !current.endsWith('\n') ? '\n' : '';
        const pos = Math.min(current.length, baseStart + prefix.length + text.length);
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-4 overflow-hidden">
      {/* Prompt Dialog (Top) - Collapsible */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header - Always visible */}
        <div 
          className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-100 cursor-pointer hover:from-purple-100 hover:to-indigo-100 transition-colors"
          onClick={() => setIsPromptExpanded(!isPromptExpanded)}
        >
          {/* Left Side: Label, Model, Balance */}
          <div className="flex items-center gap-3">
            {/* Model Selector - Quick access */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowModelSelector(true);
              }}
              className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-xs"
            >
              <Bot className="w-3.5 h-3.5 text-gray-500" />
              <span className="font-medium text-gray-700">{currentModelConfig?.name || '选择模型'}</span>
            </button>
            
            {/* Balance */}
            <div className="flex items-center text-xs text-purple-600 bg-white border border-purple-100 px-3 py-2 rounded-lg">
              <span className="mr-1">💎</span>
              <span className="font-medium">{diamondBalance?.toLocaleString() || 0}</span>
            </div>
          </div>
          
          {/* Right Side: Reference, AI Continue, Expand/Collapse */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPromptPicker(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors text-xs font-medium bg-white border-purple-200 hover:bg-purple-50 text-purple-700"
              title="从提示词库选择并插入"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>选择提示词</span>
            </button>
            {/* Reference Outline Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowContextSelector(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors text-xs font-medium ${
                aiContexts.length > 0 
                  ? 'bg-blue-50 border-blue-200 text-blue-700' 
                  : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
              title="添加参考大纲/设定"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>参考大纲</span>
              {aiContexts.length > 0 && (
                <span className="bg-blue-200 text-blue-800 px-1.5 rounded-full text-[10px]">{aiContexts.length}</span>
              )}
            </button>
            
            {/* AI Continue Button */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleAiContinue();
              }}
              disabled={isAiGenerating}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-xs font-medium hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {isAiGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{aiPhase}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 续写</span>
                </>
              )}
            </button>
            
            {/* Expand/Collapse Button */}
            <button 
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsPromptExpanded(!isPromptExpanded);
              }}
            >
              {isPromptExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>
        </div>
        
        {/* Collapsible Content */}
        {isPromptExpanded && (
          <div className="p-4 space-y-3">
            {/* Context Tags */}
            {aiContexts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aiContexts.map((context) => (
                  <span 
                    key={context.nodeId} 
                    className="flex items-center bg-blue-50 text-blue-700 px-2 py-1 rounded-lg border border-blue-100 text-xs"
                  >
                    <LinkIcon className="w-3 h-3 mr-1 text-blue-500" />
                    <span className="max-w-[150px] truncate">{context.sourceName.split(' > ').pop()}</span>
                    <button
                      onClick={() => handleRemoveContext(context.nodeId)}
                      className="ml-1.5 hover:bg-blue-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            {/* Prompt Input Area */}
            <div className="relative">
              <textarea
                ref={promptTextareaRef}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAiContinue();
                  }
                }}
                disabled={isAiGenerating}
                placeholder="输入你的提示词，例如：续写主角与反派对决的场景..."
                className="w-full h-20 p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none outline-none transition-all placeholder-gray-400 bg-gray-50/50 disabled:opacity-50"
              />
              
              {/* AI Generating Progress */}
              {isAiGenerating && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span>
                      {aiPhase}
                      {isAiTiming ? ` (${aiElapsed}s)` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Usage Info */}
            {lastUsage && (
              <div className="flex items-center text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                <span>上次消耗: {lastUsage.total_cost} 钻石</span>
                <span className="text-purple-400 mx-1.5">|</span>
                <span>输入: {lastUsage.input_tokens} / 输出: {lastUsage.output_tokens}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Collapsed State - Show summary */}
        {!isPromptExpanded && (
          <div className="px-4 py-2 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <span>提示词: {promptText.slice(0, 50) || '无'}</span>
              {aiContexts.length > 0 && (
                <span className="flex items-center text-blue-600">
                  <FileText className="w-3 h-3 mr-1" />
                  {aiContexts.length} 个参考
                </span>
              )}
            </div>
            <span className="text-gray-400">点击展开</span>
          </div>
        )}
      </div>

      {/* Content Dialog (Bottom) - Main Editor */}
      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100 gap-2">
          <div className="flex items-center gap-1">
            <ToolbarButton 
              onAction={() => editor.chain().focus().toggleBold().run()} 
              isActive={editor.isActive('bold')} 
              icon={<Bold className="w-4 h-4" />} 
              title="加粗"
            />
            <ToolbarButton 
              onAction={() => editor.chain().focus().toggleItalic().run()} 
              isActive={editor.isActive('italic')} 
              icon={<Italic className="w-4 h-4" />} 
              title="斜体"
            />
            <ToolbarButton 
              onAction={() => editor.chain().focus().undo().run()} 
              isActive={false} 
              icon={<Undo2 className="w-4 h-4" />} 
              title="撤销"
              disabled={!editor.can().undo()}
            />
            <ToolbarButton 
              onAction={() => editor.chain().focus().redo().run()} 
              isActive={false} 
              icon={<Redo2 className="w-4 h-4" />} 
              title="重做"
              disabled={!editor.can().redo()}
            />
          </div>
          
          {/* Divider */}
          <div className="w-px h-5 bg-gray-300 mx-1" />
          
          {/* Chapter Name */}
          <div className="flex items-center">
            <span className="text-sm font-bold text-gray-800 truncate max-w-[200px]" title={currentChapterName}>
              {currentChapterName}
            </span>
          </div>
          
          <div className="flex-1" />
          
          <button 
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            另存为
          </button>
        </div>
        
        {/* Editor Content */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#fafafa]">
          <div className="max-w-4xl mx-auto bg-white shadow-sm">
            <EditorContent 
              editor={editor} 
              className="story-editor-content p-6"
            />
          </div>
        </div>
        
        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          <span>字数: {editor.getText().length}</span>
          <span>已自动保存</span>
        </div>
      </div>

      {/* Model Selector Modal */}
      {showModelSelector && (
        <ModelSelector 
          selectedModel={selectedModel}
          onSelect={(model) => {
            if (model in MODEL_PRICING) {
              setSelectedModel(model as LocalModelKey);
            }
          }}
          onClose={() => setShowModelSelector(false)}
        />
      )}
      
      {/* Context Selector Dialog */}
      <ContextSelectorDialog 
        isOpen={showContextSelector}
        onClose={() => setShowContextSelector(false)}
        onSelect={handleContextSelect}
        workId={workId}
      />
      
      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExportFormat}
        options={exportOptions}
        title="选择导出格式"
      />

      <PromptPickerDialog
        isOpen={showPromptPicker}
        onClose={() => setShowPromptPicker(false)}
        onPick={(content) => {
          insertPromptContent(content);
          setShowPromptPicker(false);
        }}
        pageSize={6}
      />
    </div>
  );
};

const ToolbarButton = ({ 
  onAction, 
  isActive, 
  icon, 
  title,
  disabled = false 
}: { 
  onAction: () => void; 
  isActive: boolean; 
  icon: React.ReactNode; 
  title?: string;
  disabled?: boolean;
}) => (
  <button
    onMouseDown={(e) => {
      e.preventDefault();
      if (!disabled) onAction();
    }}
    disabled={disabled}
    className={`relative p-2 rounded-lg transition-colors group ${
      disabled 
        ? 'text-gray-300 cursor-not-allowed' 
        : isActive 
          ? 'bg-purple-100 text-purple-600' 
          : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    {icon}
    {/* Tooltip */}
    {title && (
      <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 text-[10px] font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
        {title}
      </span>
    )}
  </button>
);

export default StoryEditor;
