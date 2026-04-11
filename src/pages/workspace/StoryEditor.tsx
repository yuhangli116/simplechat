import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Heading1, 
  Heading2, 
  Sparkles,
  Save,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Bot,
  Gem,
  ChevronDown,
  X,
  Link as LinkIcon
} from 'lucide-react';
import { aiService, MODEL_PRICING } from '@/services/ai';
import ModelSelector from '@/components/ModelSelector';
import { useAuthStore } from '@/store/useAuthStore';
import { useFileStore } from '@/store/useFileStore';
import { useNavigate, useParams } from 'react-router-dom';
import ContextSelectorDialog from '@/components/ContextSelectorDialog';
import { FileText } from 'lucide-react';
import { loadChapterContent, saveChapterContent } from '@/lib/workspacePersistence';

const StoryEditor = () => {
  const navigate = useNavigate();
  const { workId, chapterId } = useParams();
  const { user, diamondBalance, fetchBalance } = useAuthStore();
  const { files } = useFileStore();
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('deepseek');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [lastUsage, setLastUsage] = useState<{input_tokens: number, output_tokens: number, total_cost: number} | null>(null);
  const [aiPhase, setAiPhase] = useState('等待开始');
  const [aiElapsed, setAiElapsed] = useState(0);
  
  // AI Context
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [aiContexts, setAiContexts] = useState<Array<{ nodeId: string, content: string, sourceName: string }>>([]);
  const [isPlaceholderVisible, setIsPlaceholderVisible] = useState(false);

  // Fetch balance on mount and when user changes
  useEffect(() => {
    if (user) {
      fetchBalance();
    }
  }, [user]);

  useEffect(() => {
    if (!isAiGenerating) {
      setAiElapsed(0);
      return;
    }

    const timer = window.setInterval(() => {
      setAiElapsed((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isAiGenerating]);

  const PLACEHOLDER_TEXT = "请先参考大纲，再写自己的提示词prompt...";

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        }
      }),
    ],
    content: '', // Start empty, load in useEffect
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] p-8 bg-white shadow-sm rounded-lg',
      },
    },
    onFocus: ({ editor }) => {
        // If content is just the placeholder text (wrapped in p tag or raw), clear it.
        // Tiptap wraps text in <p>.
        const text = editor.getText().trim();
        if (text === PLACEHOLDER_TEXT) {
            editor.commands.clearContent();
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
      editor.commands.setContent(`<p>${PLACEHOLDER_TEXT}</p>`);
    };

    const loadContent = async () => {
      if (user) {
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
  }, [editor, workId, chapterId, user]);

  const handleSave = async () => {
      if (editor && workId && chapterId) {
          const key = `story-${workId}-${chapterId}`;
          const content = editor.getHTML();
          if (editor.getText().trim() === PLACEHOLDER_TEXT) {
              return; 
          }
          localStorage.setItem(key, content);
          if (user) {
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
          // Check for duplicates
          if (prev.some(c => c.nodeId === context.nodeId)) {
              return prev;
          }
          return [...prev, context];
      });
  };

  const handleRemoveContext = (nodeId: string) => {
      setAiContexts(prev => prev.filter(c => c.nodeId !== nodeId));
  };

  const insertContentGradually = async (content: string) => {
    if (!editor) return;

    const normalizedContent = content.trim();
    if (!normalizedContent) return;

    const chunkSize = normalizedContent.length > 1200 ? 80 : 40;

    for (let index = 0; index < normalizedContent.length; index += chunkSize) {
      const chunk = normalizedContent.slice(index, index + chunkSize);
      editor.commands.insertContent(chunk);
      await new Promise((resolve) => window.setTimeout(resolve, 18));
    }
  };

  const handleAiContinue = async () => {
    if (!editor) return;
    
    // Auth Check - Dev Mode: Allow without login
    // if (!user) {
    //   if (confirm('使用 AI 续写功能需要登录，是否立即登录？')) {
    //     navigate('/login');
    //   }
    //   return;
    // }

    setIsAiGenerating(true);
    setAiPhase('正在准备上下文');
    
    try {
      const textContext = editor.getText().slice(-2000);
      
      let finalContext = textContext;
      let summarizationUsage = null;
      
      if (aiContexts.length > 0) {
          const references = aiContexts.map(c => `来源: ${c.sourceName}\n内容:\n${c.content}`).join('\n\n');
          
          if (references.length > 3000) {
              setAiPhase('正在总结参考大纲');
              const summaryRes = await aiService.summarizeContext(references, user?.id);
              if (summaryRes.error) {
                  alert(`总结大纲/设定失败: ${summaryRes.error}`);
                  setIsAiGenerating(false);
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
        prompt: "请续写这段小说情节，保持风格一致，情节紧凑。",
        model: selectedModel as any,
        context: finalContext,
        userId: user?.id || 'guest-user' // Use guest ID if no user
      });

      if (response.content) {
        setAiPhase('正在写入正文');
        await insertContentGradually(response.content);
        
        if (workId && chapterId) {
            const content = editor.getHTML();
            localStorage.setItem(`story-${workId}-${chapterId}`, content);
            if (user) {
                try {
                    await saveChapterContent(workId, chapterId, currentChapterName, content);
                } catch (e) {
                    console.error('Auto-save failed:', e);
                }
            }
        }
        
        if (user) fetchBalance();
        
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
      } else if (response.error) {
        alert(`AI生成失败: ${response.error}`);
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('AI生成发生错误，请重试');
    } finally {
      setIsAiGenerating(false);
      setAiPhase('等待开始');
    }
  };

  if (!editor) {
    return null;
  }

  const currentModelConfig = MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING];

  return (
    <div className="flex h-full p-4">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        
        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 p-2 flex items-center gap-2 flex-wrap">
          <ToolbarButton 
            onAction={() => editor.chain().focus().toggleBold().run()} 
            isActive={editor.isActive('bold')} 
            icon={<Bold className="w-4 h-4" />} 
          />
          <ToolbarButton 
            onAction={() => editor.chain().focus().toggleItalic().run()} 
            isActive={editor.isActive('italic')} 
            icon={<Italic className="w-4 h-4" />} 
          />
          <ToolbarButton 
            onAction={() => editor.chain().focus().toggleBulletList().run()} 
            isActive={editor.isActive('bulletList')} 
            icon={<List className="w-4 h-4" />} 
          />
          <ToolbarButton 
            onAction={() => editor.chain().focus().toggleOrderedList().run()} 
            isActive={editor.isActive('orderedList')} 
            icon={<ListOrdered className="w-4 h-4" />} 
          />
          
          <div className="flex-1" />

          {/* Context Selector Trigger */}
          <div className="flex flex-wrap items-center gap-2 mr-2">
            <button
              onClick={() => setShowContextSelector(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                  aiContexts.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700'
              }`}
              title="添加参考大纲/设定"
            >
              <FileText className={`w-4 h-4 ${aiContexts.length > 0 ? 'text-blue-500' : 'text-gray-500'}`} />
              <span className="text-sm font-medium">
                  {aiContexts.length > 0 ? '继续添加' : '参考大纲'}
              </span>
            </button>
          </div>

          {/* Model Selector */}
          <button
            onClick={() => setShowModelSelector(true)}
            className="flex items-center gap-2 mr-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            <Bot className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{currentModelConfig?.name || '选择模型'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          <button 
            onClick={handleAiContinue}
            disabled={isAiGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 transition-colors disabled:opacity-70 shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            {isAiGenerating ? aiPhase : 'AI 续写'}
          </button>
          
          <button 
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#f9f9fb] flex justify-center relative">
          {isAiGenerating && (
            <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-sm flex items-center justify-center">
              <div className="w-full max-w-md mx-4 rounded-2xl border border-purple-100 bg-white/95 shadow-xl px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">AI 正在帮你续写这一章</div>
                    <div className="text-xs text-gray-500">{aiPhase} · 已等待 {aiElapsed}s</div>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-purple-100">
                  <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 animate-[pulse_1.6s_ease-in-out_infinite]" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-500">
                  <div className={`rounded-lg border px-3 py-2 ${aiPhase === '正在准备上下文' ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50'}`}>整理上下文</div>
                  <div className={`rounded-lg border px-3 py-2 ${aiPhase === '正在总结参考大纲' || aiPhase === '正在创作正文' ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50'}`}>模型创作</div>
                  <div className={`rounded-lg border px-3 py-2 ${aiPhase === '正在写入正文' ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50'}`}>写入章节</div>
                </div>
              </div>
            </div>
          )}
          
          {/* Left Sidebar for Contexts */}
          {aiContexts.length > 0 && (
            <div className="hidden xl:block absolute left-4 top-8 w-64 bg-white rounded-lg shadow-sm border border-gray-200 p-3 max-h-[calc(100%-4rem)] overflow-y-auto">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">参考上下文</h3>
                <div className="space-y-1">
                    {aiContexts.map((context) => (
                        <div key={context.nodeId} className="group flex items-center justify-between p-2 hover:bg-gray-50 rounded-md border border-transparent hover:border-gray-100 transition-all">
                            <div className="flex items-center gap-2 min-w-0">
                                <LinkIcon className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="text-sm text-gray-700 truncate" title={context.sourceName}>
                                    {context.sourceName.split(' > ').pop()}
                                </span>
                            </div>
                            <button 
                                onClick={() => handleRemoveContext(context.nodeId)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500 transition-all"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
          )}

          <div className="w-full max-w-5xl bg-white shadow-sm min-h-full rounded-lg">
            <EditorContent editor={editor} />
          </div>
        </div>
        
        {/* Status Bar */}
        <div className="bg-white border-t border-gray-200 px-4 py-1.5 text-xs text-gray-500 flex justify-between">
          <span>字数: {editor.storage.characterCount?.characters() || 0}</span>
          <span>已保存</span>
        </div>
      </div>

      {/* Model Selector Modal */}
      {showModelSelector && (
        <ModelSelector 
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
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

      {/* AI Usage Toast */}
      {lastUsage && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span>AI 续写成功</span>
                  <span className="text-purple-600/80 bg-purple-100/50 px-2 py-0.5 rounded-full text-xs border border-purple-200/50 ml-2">
                      消耗: {lastUsage.total_cost} 钻石 (In: {lastUsage.input_tokens}, Out: {lastUsage.output_tokens})
                  </span>
              </div>
          </div>
      )}
    </div>
  );
};

const ToolbarButton = ({ onAction, isActive, icon }: { onAction: () => void, isActive: boolean, icon: React.ReactNode }) => (
  <button
    onMouseDown={(e) => {
      e.preventDefault();
      onAction();
    }}
    className={`p-1.5 rounded transition-colors ${
      isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    {icon}
  </button>
);

export default StoryEditor;
