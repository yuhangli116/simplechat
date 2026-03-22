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
import { useNavigate, useParams } from 'react-router-dom';
import ContextSelectorDialog from '@/components/ContextSelectorDialog';
import { FileText } from 'lucide-react';

const StoryEditor = () => {
  const navigate = useNavigate();
  const { workId, chapterId } = useParams();
  const { user, diamondBalance, fetchBalance } = useAuthStore();
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('deepseek');
  const [showModelSelector, setShowModelSelector] = useState(false);
  
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

  const PLACEHOLDER_TEXT = "请先参考大纲，再写自己的提示词prompt...";

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
    if (editor && workId && chapterId) {
        const key = `story-${workId}-${chapterId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            editor.commands.setContent(saved);
        } else {
            // Default content for new chapter
            // Check if it's a "new" chapter (e.g. not chapter 1, or just empty)
            // User said: "新建的未命名章节" (New unnamed chapter)
            // We can just check if saved is null.
            // If chapterId is '1', maybe keep the demo text? 
            // User said "New unnamed chapter". Chapter 1 is usually named or started.
            // But let's apply this logic to all "new" chapters (where no content exists).
            
            if (chapterId === '1' && !saved) {
                 // Keep demo for chapter 1 if user hasn't edited it? 
                 // Or just use placeholder? 
                 // Let's use placeholder for consistency if it's "new".
                 // But previously I had demo text.
                 // I'll check if it's "newly created".
                 // For now, I'll use placeholder for all empty chapters.
                 editor.commands.setContent(`<p>${PLACEHOLDER_TEXT}</p>`);
            } else {
                 editor.commands.setContent(`<p>${PLACEHOLDER_TEXT}</p>`);
            }
        }
    }
  }, [editor, workId, chapterId]);

  const handleSave = () => {
      if (editor && workId && chapterId) {
          const key = `story-${workId}-${chapterId}`;
          const content = editor.getHTML();
          // Don't save if it's just placeholder
          if (editor.getText().trim() === PLACEHOLDER_TEXT) {
              return; 
          }
          localStorage.setItem(key, content);
          // Show toast or feedback?
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
    
    try {
      // Get last 1000 characters as context
      const textContext = editor.getText().slice(-1000);
      
      let finalContext = textContext;
      if (aiContexts.length > 0) {
          const references = aiContexts.map(c => `来源: ${c.sourceName}\n内容:\n${c.content}`).join('\n\n');
          finalContext = `【参考大纲/设定】\n${references}\n\n【当前章节内容】\n${textContext}`;
      }
      
      const response = await aiService.generateText({
        prompt: "请续写这段小说情节，保持风格一致，情节紧凑。",
        model: selectedModel as any,
        context: finalContext,
        userId: user?.id || 'guest-user' // Use guest ID if no user
      });

      if (response.content) {
        editor.commands.insertContent(response.content);
        // Refresh balance after generation
        if (user) fetchBalance();
        
        if (response.usage) {
           console.log(`Cost: ${response.usage.total_cost} diamonds`);
        }
      } else if (response.error) {
        alert(`AI生成失败: ${response.error}`);
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('AI生成发生错误，请重试');
    } finally {
      setIsAiGenerating(false);
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
            {isAiGenerating ? 'AI 续写中...' : 'AI 续写'}
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
