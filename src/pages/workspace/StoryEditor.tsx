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
  ChevronDown
} from 'lucide-react';
import { aiService, MODEL_PRICING } from '@/services/ai';
import ModelSelector from '@/components/ModelSelector';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';

const StoryEditor = () => {
  const navigate = useNavigate();
  const { user, diamondBalance, fetchBalance } = useAuthStore();
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('deepseek');
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Fetch balance on mount and when user changes
  useEffect(() => {
    if (user) {
      fetchBalance();
    }
  }, [user]);

  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content: `
      <h2>第1章：风起云涌</h2>
      <p>天空阴沉沉的，仿佛要压下来一般。李青站在悬崖边，望着远处的云海，心中充满了迷茫。</p>
      <p>他手中的长剑微微颤抖，剑身上的血迹还未干涸。</p>
      <p>“这就结束了吗？”他低声自语。</p>
    `,
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] p-8 bg-white shadow-sm rounded-lg',
      },
    },
  });

  const handleAiContinue = async () => {
    if (!editor) return;
    
    // Auth Check
    if (!user) {
      if (confirm('使用 AI 续写功能需要登录，是否立即登录？')) {
        navigate('/login');
      }
      return;
    }

    setIsAiGenerating(true);
    
    try {
      // Get last 1000 characters as context
      const context = editor.getText().slice(-1000);
      
      const response = await aiService.generateText({
        prompt: "请续写这段小说情节，保持风格一致，情节紧凑。",
        model: selectedModel as any,
        context: context,
        userId: user.id
      });

      if (response.content) {
        editor.commands.insertContent(response.content);
        // Refresh balance after generation
        fetchBalance();
        
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
            onClick={() => editor.chain().focus().toggleBold().run()} 
            isActive={editor.isActive('bold')} 
            icon={<Bold className="w-4 h-4" />} 
          />
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleItalic().run()} 
            isActive={editor.isActive('italic')} 
            icon={<Italic className="w-4 h-4" />} 
          />
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
            isActive={editor.isActive('heading', { level: 1 })} 
            icon={<Heading1 className="w-4 h-4" />} 
          />
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
            isActive={editor.isActive('heading', { level: 2 })} 
            icon={<Heading2 className="w-4 h-4" />} 
          />
          
          <div className="flex-1" />

          {/* Model Selector Trigger */}
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
          
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors shadow-sm">
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#f9f9fb] flex justify-center">
          <div className="w-full max-w-3xl bg-white shadow-sm min-h-full rounded-lg">
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
    </div>
  );
};

const ToolbarButton = ({ onClick, isActive, icon }: { onClick: () => void, isActive: boolean, icon: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded transition-colors ${
      isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    {icon}
  </button>
);

export default StoryEditor;
