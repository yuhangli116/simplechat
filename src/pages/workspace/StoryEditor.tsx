import React, { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension, Mark } from '@tiptap/core';
import { 
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold, 
  Sparkles,
  Save,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  Bot,
  FileText,
  Link as LinkIcon,
  FileCode,
  History,
  Heading1,
  List,
  ListOrdered,
  Strikethrough
} from 'lucide-react';
import { aiService, MODEL_PRICING } from '@/services/ai';
import { syncModelPricingFromDb } from '@/services/billing';
import ModelSelector from '@/components/ModelSelector';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { useFileStore } from '@/store/useFileStore';
import { useNavigate, useParams } from 'react-router-dom';
import ContextSelectorDialog from '@/components/ContextSelectorDialog';
import ExportDialog from '@/components/ExportDialog';
import { exportHtml, exportMarkdown, htmlToMarkdown } from '@/lib/fileExport';
import { loadChapterContent, saveChapterContent } from '@/lib/workspacePersistence';
import PromptPickerDialog from '@/components/PromptPickerDialog';
import { useWorkspacePrefsStore } from '@/store/useWorkspacePrefsStore';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, flushLogs } from '@/lib/logger';
import {
  createChapterVersion,
  deleteExpiredChapterVersions,
  loadChapterVersions,
  type ChapterVersion,
} from '@/lib/chapterVersions';

const log = createLogger('StoryEditor');

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

type PendingAiVersion = {
  currentContent: string;
  nextContent: string;
  generatedHtml: string;
  prompt: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number; total_cost: number } | null;
};

const STORY_SAVE_RETRY_DELAYS = [500, 1200, 2500];

const TEXT_COLOR_PALETTE = [
  '#111827',
  '#6b7280',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#6366f1',
  '#d1d5db',
  '#000000',
  '#dc2626',
  '#f97316',
  '#16a34a',
  '#2563eb',
  '#4f46e5',
];

const TextAlignExtension = Extension.create({
  name: 'simpleTextAlign',

  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) => {
              if (!attributes.textAlign) return {};
              return { style: `text-align: ${attributes.textAlign}` };
            },
          },
        },
      },
    ];
  },
});

const TextColorMark = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) => {
          if (!attributes.color) return {};
          return { style: `color: ${attributes.color}` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[style*="color"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});

const isMeaningfulHtml = (content: string | null | undefined) => {
  const plain = (content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 0;
};

const formatVersionDate = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const getVersionSourceLabel = (source: string) => {
  if (source === 'ai-current-before-replace') return 'AI替换前';
  if (source === 'ai-applied') return 'AI生成';
  if (source === 'restore-before') return '恢复前';
  return '手动版本';
};

const StoryEditor = () => {
  const { workId, chapterId } = useParams();
  const navigate = useNavigate();
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
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');
  const [pendingAiVersion, setPendingAiVersion] = useState<PendingAiVersion | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [chapterVersions, setChapterVersions] = useState<ChapterVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const saveTimerRef = React.useRef<number | null>(null);
  const latestContentRef = React.useRef('');
  const lastSavedSignatureRef = React.useRef('');
  const saveInFlightRef = React.useRef(false);
  const saveQueuedRef = React.useRef(false);
  const suppressEditorUpdateRef = React.useRef(false);

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

  const getStoryStorageKey = useCallback(() => {
    if (!workId || !chapterId) return '';
    return `story-${workId}-${chapterId}`;
  }, [workId, chapterId]);

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

  const persistChapterWithRetry = useCallback(async (content: string, reason: string) => {
    if (!workId || !chapterId) return;

    localStorage.setItem(getStoryStorageKey(), content);
    latestContentRef.current = content;

    if (!user || isGuestUser(user)) {
      lastSavedSignatureRef.current = content;
      setSaveState('saved');
      setLastSavedAt(Date.now());
      setSaveError('');
      log.info('Guest chapter content saved locally', { workId, chapterId, reason, contentLength: content.length });
      return;
    }

    if (content === lastSavedSignatureRef.current) {
      setSaveState('saved');
      return;
    }

    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      log.info('Chapter save queued while previous save is in flight', { workId, chapterId, reason });
      return;
    }

    saveInFlightRef.current = true;
    setSaveState('saving');
    setSaveError('');

    try {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < STORY_SAVE_RETRY_DELAYS.length; attempt += 1) {
        try {
          await saveChapterContent(workId, chapterId, currentChapterName, content);
          lastSavedSignatureRef.current = content;
          setSaveState('saved');
          setLastSavedAt(Date.now());
          setSaveError('');
          log.success('Chapter content auto-saved', {
            workId,
            chapterId,
            reason,
            attempt: attempt + 1,
            contentLength: content.length,
          });
          return;
        } catch (error) {
          lastError = error;
          log.warn('Chapter content save attempt failed', {
            workId,
            chapterId,
            reason,
            attempt: attempt + 1,
            maxAttempts: STORY_SAVE_RETRY_DELAYS.length,
          });
          if (attempt < STORY_SAVE_RETRY_DELAYS.length - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, STORY_SAVE_RETRY_DELAYS[attempt]));
          }
        }
      }

      const message = lastError instanceof Error ? lastError.message : '同步到数据库失败';
      setSaveState('error');
      setSaveError(message);
      log.error('Chapter content save failed after retries', { workId, chapterId, reason }, lastError);
    } finally {
      saveInFlightRef.current = false;
      if (saveQueuedRef.current && latestContentRef.current !== lastSavedSignatureRef.current) {
        saveQueuedRef.current = false;
        void persistChapterWithRetry(latestContentRef.current, 'queued');
      }
    }
  }, [chapterId, currentChapterName, getStoryStorageKey, user, workId]);

  const scheduleChapterSave = useCallback((content: string, reason: string) => {
    localStorage.setItem(getStoryStorageKey(), content);
    latestContentRef.current = content;

    if (!user || isGuestUser(user)) {
      lastSavedSignatureRef.current = content;
      setSaveState('saved');
      setLastSavedAt(Date.now());
      setSaveError('');
      return;
    }

    if (content === lastSavedSignatureRef.current) {
      setSaveState('saved');
      return;
    }

    setSaveState('dirty');
    setSaveError('');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistChapterWithRetry(latestContentRef.current, reason);
    }, 1000);
  }, [getStoryStorageKey, persistChapterWithRetry, user]);

  const flushChapterSave = useCallback((reason: string) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return persistChapterWithRetry(latestContentRef.current, reason);
  }, [persistChapterWithRetry]);

  // Main Content Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
        history: {
          depth: 100,
        },
      }),
      TextAlignExtension,
      TextColorMark,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[400px] p-6',
      },
    }
  });

  const snapshotChapterVersion = useCallback(async (
    content: string,
    source: Parameters<typeof createChapterVersion>[0]['source'],
    meta: { prompt?: string | null; model?: string | null } = {}
  ) => {
    if (!user || isGuestUser(user) || !workId || !chapterId || !isMeaningfulHtml(content)) {
      return null;
    }

    try {
      return await createChapterVersion({
        userId: user.id,
        workId,
        chapterId,
        title: currentChapterName,
        content,
        source,
        prompt: meta.prompt || null,
        model: meta.model || null,
      });
    } catch (error) {
      log.error('Chapter version snapshot failed', { workId, chapterId, source }, error);
      return null;
    }
  }, [chapterId, currentChapterName, user, workId]);

  const applyChapterContent = useCallback(async (
    content: string,
    reason: string,
    options: {
      snapshotCurrentAs?: Parameters<typeof createChapterVersion>[0]['source'];
      snapshotNextAs?: Parameters<typeof createChapterVersion>[0]['source'];
      prompt?: string | null;
      model?: string | null;
    } = {}
  ) => {
    if (!editor || !workId || !chapterId) return;

    const currentContent = latestContentRef.current || editor.getHTML();
    if (options.snapshotCurrentAs) {
      await snapshotChapterVersion(currentContent, options.snapshotCurrentAs, {
        prompt: options.prompt,
        model: options.model,
      });
    }

    suppressEditorUpdateRef.current = true;
    editor.commands.setContent(content || '');
    latestContentRef.current = content || '';
    localStorage.setItem(getStoryStorageKey(), content || '');
    setSaveState('dirty');
    setSaveError('');
    window.setTimeout(() => {
      suppressEditorUpdateRef.current = false;
    }, 0);

    await persistChapterWithRetry(content || '', reason);

    if (options.snapshotNextAs) {
      await snapshotChapterVersion(content || '', options.snapshotNextAs, {
        prompt: options.prompt,
        model: options.model,
      });
    }

    log.success('Chapter content applied', {
      workId,
      chapterId,
      reason,
      contentLength: content?.length || 0,
    });
  }, [chapterId, editor, getStoryStorageKey, persistChapterWithRetry, snapshotChapterVersion, workId]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      if (!workId || !chapterId) return;
      const content = editor.getHTML();
      latestContentRef.current = content;
      if (suppressEditorUpdateRef.current) return;
      scheduleChapterSave(content, 'editor-update');
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [chapterId, editor, scheduleChapterSave, workId]);

  // Load content
  useEffect(() => {
    if (!editor || !workId || !chapterId) return;

    const key = `story-${workId}-${chapterId}`;

    const applyContent = (content: string | null) => {
      suppressEditorUpdateRef.current = true;
      if (content) {
        editor.commands.setContent(content);
      } else {
        // 新建章节时保持空白，不预设任何内容
        editor.commands.clearContent();
      }
      const normalizedContent = editor.getHTML();
      latestContentRef.current = normalizedContent;
      lastSavedSignatureRef.current = normalizedContent;
      setSaveState('saved');
      setLastSavedAt(Date.now());
      setSaveError('');
      window.setTimeout(() => {
        suppressEditorUpdateRef.current = false;
      }, 0);
    };

    const loadContent = async () => {
      if (user && !isGuestUser(user)) {
        try {
          const remoteContent = await loadChapterContent(chapterId);
          if (remoteContent) {
            localStorage.setItem(key, remoteContent);
            applyContent(remoteContent);
            log.success('Chapter content loaded from database', { workId, chapterId, contentLength: remoteContent.length });
            return;
          }
        } catch (error) {
          log.error('Failed to load chapter from Supabase', { workId, chapterId }, error);
        }
      }

      const localContent = localStorage.getItem(key);
      applyContent(localContent);
      log.info('Chapter content loaded from local cache', { workId, chapterId, contentLength: localContent?.length || 0 });
    };

    loadContent();
  }, [editor, workId, chapterId, user?.id]);

  useEffect(() => {
    const flushIfDirty = (reason: string) => {
      if (latestContentRef.current && latestContentRef.current !== lastSavedSignatureRef.current) {
        void flushChapterSave(reason);
      }
      flushLogs(true);
    };

    const handleBeforeUnload = () => flushIfDirty('beforeunload');
    const handlePageHide = () => flushIfDirty('pagehide');
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushIfDirty('visibility-hidden');
      }
    };
    const handleOnline = () => {
      if (latestContentRef.current && latestContentRef.current !== lastSavedSignatureRef.current) {
        log.info('Network restored, retrying chapter save', { workId, chapterId });
        void flushChapterSave('network-restored');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [chapterId, flushChapterSave, workId]);

  const handleSave = async () => {
    if (editor && workId && chapterId) {
      const content = editor.getHTML();
      log.info('Manual chapter save requested', { workId, chapterId, contentLength: content.length });
      try {
        await persistChapterWithRetry(content, 'manual-save');
        if (user && !isGuestUser(user) && content !== lastSavedSignatureRef.current) {
          log.warn('Manual chapter save finished with database sync warning', { workId, chapterId });
          alert('已保存到本地，但同步到数据库失败，请稍后重试');
          return;
        }
        log.success('Manual chapter save completed', { workId, chapterId, contentLength: content.length });
        alert('保存成功');
      } catch (error) {
        log.error('Manual chapter save failed', { workId, chapterId }, error);
        alert('已保存到本地，但同步到数据库失败');
      }
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
    log.info('Chapter export requested', {
      workId,
      chapterId,
      format,
      contentLength: htmlContent.length,
    });
    
    if (format === 'html') {
      exportHtml(htmlContent, `${filename}.html`);
    } else {
      exportMarkdown(markdownContent, `${filename}.md`);
    }
    log.success('Chapter export completed', { workId, chapterId, format });
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

  const textToParagraphHtml = (content: string) => {
    const paragraphs = String(content || '')
      .trim()
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim().replace(/\n/g, ' '))
      .filter(Boolean);
    return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  };

  const openVersionHistory = async () => {
    if (!user || isGuestUser(user)) {
      if (window.confirm('历史版本功能需要登录后使用，是否前往登录？')) {
        navigate('/login');
      }
      return;
    }
    if (!chapterId) return;

    setShowVersionHistory(true);
    setLoadingVersions(true);
    try {
      await deleteExpiredChapterVersions(user.id);
      const versions = await loadChapterVersions({ userId: user.id, chapterId });
      setChapterVersions(versions);
      setSelectedVersionId(versions[0]?.id || null);
      log.success('Chapter version history opened', { chapterId, count: versions.length });
    } catch (error) {
      log.error('Failed to open chapter version history', { chapterId }, error);
      alert('加载历史版本失败，请稍后重试');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleCancelPendingAiVersion = () => {
    if (!pendingAiVersion) return;
    log.info('Pending AI version cancelled', {
      workId,
      chapterId,
      currentLength: pendingAiVersion.currentContent.length,
      nextLength: pendingAiVersion.nextContent.length,
    });
    setPendingAiVersion(null);
  };

  const handleApplyPendingAiVersion = async () => {
    if (!pendingAiVersion) return;
    try {
      await applyChapterContent(pendingAiVersion.nextContent, 'ai-version-apply', {
        snapshotCurrentAs: 'ai-current-before-replace',
        snapshotNextAs: 'ai-applied',
        prompt: pendingAiVersion.prompt,
        model: pendingAiVersion.model,
      });
      if (pendingAiVersion.usage) {
        setLastUsage(pendingAiVersion.usage);
        setTimeout(() => setLastUsage(null), 5000);
      }
      setPendingAiVersion(null);
      setPromptText('');
      if (user && !isGuestUser(user)) fetchBalance();
    } catch (error) {
      log.error('Failed to apply pending AI version', { workId, chapterId }, error);
      alert('应用 AI 新版本失败，请检查网络后重试');
    }
  };

  const handleRestoreVersion = async () => {
    const selected = chapterVersions.find((version) => version.id === selectedVersionId);
    if (!selected) return;

    setRestoringVersion(true);
    try {
      await applyChapterContent(selected.content, 'version-restore', {
        snapshotCurrentAs: 'restore-before',
      });
      setShowVersionHistory(false);
      log.success('Chapter version restored', {
        workId,
        chapterId,
        versionId: selected.id,
        contentLength: selected.content.length,
      });
    } catch (error) {
      log.error('Failed to restore chapter version', { workId, chapterId, versionId: selected.id }, error);
      alert('恢复历史版本失败，请稍后重试');
    } finally {
      setRestoringVersion(false);
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
        workId,
        chapterId,
        chapterTitle: currentChapterName,
        baseContentHtml: editor.getHTML(),
        deferChapterSave: true,
      });

      if (response.content) {
        setAiPhase('正在写入正文');
        const currentContent = editor.getHTML();
        const cleaned = sanitizeAiContinuationOutput(userPrompt, response.content);
        const generatedHtml = response.generatedHtml || textToParagraphHtml(cleaned);
        // 版本比较里的“继续应用”是用本次 AI 输出完整替换当前正文，不做旧正文合并。
        // 服务端 previewChapterContent 仅保留给其他预览场景，正文落库以 generatedHtml 为准。
        const nextContent = generatedHtml || '';
        const hasExistingContent = isMeaningfulHtml(currentContent);
        const combinedUsage = response.usage
          ? {
              input_tokens: response.usage.input_tokens + (summarizationUsage ? summarizationUsage.input_tokens : 0),
              output_tokens: response.usage.output_tokens + (summarizationUsage ? summarizationUsage.output_tokens : 0),
              total_cost: response.usage.total_cost + (summarizationUsage ? summarizationUsage.total_cost : 0),
            }
          : null;

        if (!nextContent) {
          alert('AI 没有返回可应用的正文内容，请重试');
          return;
        }

        if (hasExistingContent) {
          setPendingAiVersion({
            currentContent,
            nextContent,
            generatedHtml,
            prompt: userPrompt,
            model: modelKey,
            usage: combinedUsage,
          });
          log.info('Pending AI version comparison opened', {
            workId,
            chapterId,
            currentLength: currentContent.length,
            generatedLength: generatedHtml.length,
            nextLength: nextContent.length,
            replaceMode: 'replace-with-generated',
          });
        } else {
          await applyChapterContent(nextContent, 'ai-first-apply', {
            snapshotNextAs: 'ai-applied',
            prompt: userPrompt,
            model: modelKey,
          });
          if (combinedUsage) {
            setLastUsage(combinedUsage);
            setTimeout(() => setLastUsage(null), 5000);
          }
          setPromptText('');
          if (user && !isGuestUser(user)) fetchBalance();
        }
        setIsAiTiming(false);
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
  const selectedVersion = chapterVersions.find((version) => version.id === selectedVersionId) || null;
  const saveStateLabel =
    saveState === 'saving'
      ? '正在同步...'
      : saveState === 'dirty'
        ? '有未保存修改，正在等待自动保存'
        : saveState === 'error'
          ? `保存失败：${saveError || '请检查网络'}`
          : lastSavedAt
            ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString()}`
            : '已保存';
  const saveStateClass =
    saveState === 'error'
      ? 'text-red-600'
      : saveState === 'dirty'
        ? 'text-amber-600'
        : saveState === 'saving'
          ? 'text-blue-600'
          : 'text-emerald-600';
  const activeHeadingLevel = ([1, 2, 3, 4] as const).find((level) => editor.isActive('heading', { level }));
  const currentTextAlign =
    editor.getAttributes('heading').textAlign ||
    editor.getAttributes('paragraph').textAlign ||
    'left';
  const setHeadingLevel = (level: 0 | 1 | 2 | 3 | 4) => {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().setHeading({ level }).run();
    }
  };
  const setTextAlign = (align: 'left' | 'center' | 'right') => {
    editor
      .chain()
      .focus()
      .updateAttributes('paragraph', { textAlign: align })
      .updateAttributes('heading', { textAlign: align })
      .run();
  };
  const setTextColor = (color: string | null) => {
    if (color) {
      editor.chain().focus().setMark('textColor', { color }).run();
    } else {
      editor.chain().focus().unsetMark('textColor').run();
    }
  };

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
              title="从指令工坊选择并插入"
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
            <TextColorPicker
              title="字体颜色"
              isActive={editor.isActive('textColor')}
              colors={TEXT_COLOR_PALETTE}
              onSelect={setTextColor}
            />
            <ToolbarButton
              onAction={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              icon={<Strikethrough className="w-4 h-4" />}
              title="删除线"
            />
            <ToolbarDropdown
              title="标题级别"
              icon={<Heading1 className="w-4 h-4" />}
              isActive={Boolean(activeHeadingLevel)}
              options={[
                { label: '正文', active: !activeHeadingLevel, onSelect: () => setHeadingLevel(0) },
                { label: '一级标题', active: activeHeadingLevel === 1, onSelect: () => setHeadingLevel(1) },
                { label: '二级标题', active: activeHeadingLevel === 2, onSelect: () => setHeadingLevel(2) },
                { label: '三级标题', active: activeHeadingLevel === 3, onSelect: () => setHeadingLevel(3) },
                { label: '四级标题', active: activeHeadingLevel === 4, onSelect: () => setHeadingLevel(4) },
              ]}
            />
            <ToolbarDropdown
              title="对齐方式"
              icon={
                currentTextAlign === 'center'
                  ? <AlignCenter className="w-4 h-4" />
                  : currentTextAlign === 'right'
                    ? <AlignRight className="w-4 h-4" />
                    : <AlignLeft className="w-4 h-4" />
              }
              isActive={currentTextAlign !== 'left'}
              options={[
                { label: '左对齐', active: currentTextAlign === 'left', onSelect: () => setTextAlign('left') },
                { label: '居中对齐', active: currentTextAlign === 'center', onSelect: () => setTextAlign('center') },
                { label: '右对齐', active: currentTextAlign === 'right', onSelect: () => setTextAlign('right') },
              ]}
            />
            <ToolbarButton
              onAction={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              icon={<List className="w-4 h-4" />}
              title="无序列表"
            />
            <ToolbarButton
              onAction={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              icon={<ListOrdered className="w-4 h-4" />}
              title="有序列表"
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

          <IconActionButton
            onClick={openVersionHistory}
            title="历史版本"
            icon={<History className="w-4 h-4" />}
          />
          <IconActionButton
            onClick={handleSave}
            title="保存"
            icon={<Save className="w-4 h-4" />}
          />
          <IconActionButton
            onClick={handleExport}
            title="另存为"
            icon={<Download className="w-4 h-4" />}
          />
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
          <span className={saveStateClass}>
            {saveStateLabel}
            {user && !isGuestUser(user) ? '，看到已保存后再退出' : ''}
          </span>
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

      {pendingAiVersion && (
        <AiVersionCompareDialog
          version={pendingAiVersion}
          onCancel={handleCancelPendingAiVersion}
          onApply={handleApplyPendingAiVersion}
        />
      )}

      {showVersionHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-base font-bold text-gray-900">历史版本</div>
                <div className="mt-1 text-xs text-gray-500">仅保留最近 30 天的章节版本</div>
              </div>
              <button
                onClick={() => setShowVersionHistory(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[280px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-b border-gray-100 bg-gray-50 p-3 md:border-b-0 md:border-r">
                {loadingVersions ? (
                  <div className="py-12 text-center text-sm text-gray-400">正在加载...</div>
                ) : chapterVersions.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">暂无历史版本</div>
                ) : (
                  <div className="space-y-2">
                    {chapterVersions.map((version) => (
                      <button
                        key={version.id}
                        onClick={() => setSelectedVersionId(version.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          selectedVersionId === version.id
                            ? 'border-purple-200 bg-purple-50 text-purple-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold">{formatVersionDate(version.created_at)}</div>
                        <div className="mt-1 text-xs text-gray-500">{version.word_count} 字 · {getVersionSourceLabel(version.source)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-h-0 overflow-y-auto p-5">
                {selectedVersion ? (
                  <div
                    className="story-editor-content prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: selectedVersion.content,
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">请选择一个历史版本</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setShowVersionHistory(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRestoreVersion}
                disabled={!selectedVersionId || restoringVersion}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {restoringVersion ? '恢复中...' : '恢复'}
              </button>
            </div>
          </div>
        </div>
      )}
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

const AiVersionCompareDialog = ({
  version,
  onCancel,
  onApply,
}: {
  version: PendingAiVersion;
  onCancel: () => void;
  onApply: () => void;
}) => {
  const currentWords = React.useMemo(() => {
    const plain = version.currentContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').trim();
    return plain.length;
  }, [version.currentContent]);
  const generatedWords = React.useMemo(() => {
    const plain = version.generatedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').trim();
    return plain.length;
  }, [version.generatedHtml]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-[2px]">
      <div className="flex max-h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold tracking-normal text-gray-950">版本比较</h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="关闭"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden bg-slate-50 p-4 md:grid-cols-2">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">当前正文</div>
                <div className="mt-0.5 text-xs text-gray-500">{currentWords} 字</div>
              </div>
              <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700">旧版本</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfbfa] px-6 py-5">
              <div
                className="story-editor-content prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: version.currentContent }}
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-900/10 bg-white shadow-sm ring-1 ring-gray-950/5">
            <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50 px-5 py-3">
              <div>
                <div className="text-sm font-semibold text-emerald-950">新版本</div>
                <div className="mt-0.5 text-xs text-emerald-700">{generatedWords} 字</div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">待保存</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5">
              <div
                className="story-editor-content prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: version.generatedHtml }}
              />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            继续应用则会保存新版本内容，旧版本可以在历史版本中找到。
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              取消应用
            </button>
            <button
              onClick={onApply}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
            >
              继续应用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TextColorPicker = ({
  title,
  isActive,
  colors,
  onSelect,
}: {
  title: string;
  isActive: boolean;
  colors: string[];
  onSelect: (color: string | null) => void;
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => setIsOpen(true)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
          isActive ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
        }`}
        title={title}
        aria-label={title}
      >
        T
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[184px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 text-xs text-gray-500">字体颜色</div>
          <div className="grid grid-cols-7 gap-2">
            {colors.map((color) => (
              <button
                key={color}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(color);
                  setIsOpen(false);
                }}
                className="h-5 w-5 rounded-md border border-gray-200 transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`字体颜色 ${color}`}
              />
            ))}
          </div>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(null);
              setIsOpen(false);
            }}
            className="mt-3 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            恢复默认
          </button>
        </div>
      )}
    </div>
  );
};

const IconActionButton = ({
  onClick,
  icon,
  title,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
}) => (
  <button
    onClick={onClick}
    className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
    aria-label={title}
  >
    {icon}
    <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
      {title}
    </span>
  </button>
);

type ToolbarDropdownOption = {
  label: string;
  active: boolean;
  onSelect: () => void;
};

const ToolbarDropdown = ({
  title,
  icon,
  isActive,
  options,
}: {
  title: string;
  icon: React.ReactNode;
  isActive: boolean;
  options: ToolbarDropdownOption[];
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => setIsOpen(true)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          isActive ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100'
        }`}
        title={title}
      >
        {icon}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.label}
              onMouseDown={(e) => {
                e.preventDefault();
                option.onSelect();
                setIsOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                option.active
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StoryEditor;
