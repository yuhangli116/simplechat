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
  status?: 'streaming' | 'output_ready' | 'ready' | 'error';
  phaseLabel?: string;
  error?: string;
};

type AiApplyOptions = {
  snapshotCurrentAs?: Parameters<typeof createChapterVersion>[0]['source'];
  snapshotNextAs?: Parameters<typeof createChapterVersion>[0]['source'];
  prompt?: string | null;
  model?: string | null;
};

type ReferenceSummaryNotice = {
  tone: 'info' | 'success' | 'warning';
  text: string;
};

const STORY_SAVE_RETRY_DELAYS = [500, 1200, 2500];
const AI_REFERENCE_SUMMARY_THRESHOLD = 3000;
const AI_REFERENCE_SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AI_REFERENCE_SUMMARY_CACHE_PREFIX = 'story-ai-summary-v2';
const AI_REFERENCE_SUMMARY_CACHE_MAX_ENTRIES = 20;
const AI_REFERENCE_SUMMARY_CACHE_MAX_BYTES = 500 * 1024;
const AI_REFERENCE_NODE_SUMMARY_THRESHOLD = 1200;

type ReferenceSummaryCacheEntry = {
  version: 2;
  userId: string;
  model: string;
  contentHash: string;
  sourceName: string;
  summary: string;
  originalLength: number;
  createdAt: number;
  lastUsedAt: number;
};

const hashText = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const getReferenceSummaryCacheKey = (userId: string | undefined, model: string, content: string) =>
  `${AI_REFERENCE_SUMMARY_CACHE_PREFIX}-${userId || 'anonymous'}-${model}-${hashText(content)}`;

const getLegacyReferenceSummaryCacheKey = (userId: string | undefined, model: string, references: string) =>
  `story-ai-summary-v1-${userId || 'anonymous'}-${model}-${hashText(references)}`;

const getLocalStorageSize = (value: string) => new Blob([value]).size;

const listReferenceSummaryCacheEntries = (userId?: string) => {
  if (typeof window === 'undefined') return [];
  const entries: Array<{ key: string; raw: string; value: ReferenceSummaryCacheEntry; size: number }> = [];
  const prefix = `${AI_REFERENCE_SUMMARY_CACHE_PREFIX}-${userId || 'anonymous'}-`;

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw) as ReferenceSummaryCacheEntry;
      if (!value.summary || !value.createdAt || !value.lastUsedAt) {
        window.localStorage.removeItem(key);
        continue;
      }
      entries.push({ key, raw, value, size: getLocalStorageSize(raw) });
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return entries;
};

const cleanupReferenceSummaryCache = (userId?: string, reason = 'maintenance') => {
  if (typeof window === 'undefined') return { removed: 0, kept: 0, totalBytes: 0 };
  const now = Date.now();
  let removed = 0;
  let entries = listReferenceSummaryCacheEntries(userId);

  for (const entry of entries) {
    if (now - entry.value.createdAt > AI_REFERENCE_SUMMARY_CACHE_TTL_MS) {
      window.localStorage.removeItem(entry.key);
      removed += 1;
    }
  }

  entries = listReferenceSummaryCacheEntries(userId).sort((a, b) => b.value.lastUsedAt - a.value.lastUsedAt);
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const overflow = entries.slice(AI_REFERENCE_SUMMARY_CACHE_MAX_ENTRIES);
  for (const entry of overflow) {
    window.localStorage.removeItem(entry.key);
    totalBytes -= entry.size;
    removed += 1;
  }

  entries = listReferenceSummaryCacheEntries(userId).sort((a, b) => a.value.lastUsedAt - b.value.lastUsedAt);
  totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of entries) {
    if (totalBytes <= AI_REFERENCE_SUMMARY_CACHE_MAX_BYTES) break;
    window.localStorage.removeItem(entry.key);
    totalBytes -= entry.size;
    removed += 1;
  }

  const kept = listReferenceSummaryCacheEntries(userId);
  const keptBytes = kept.reduce((sum, entry) => sum + entry.size, 0);
  log.info('AI reference summary cache cleanup completed', {
    userId,
    reason,
    removed,
    kept: kept.length,
    totalBytes: keptBytes,
    maxEntries: AI_REFERENCE_SUMMARY_CACHE_MAX_ENTRIES,
    maxBytes: AI_REFERENCE_SUMMARY_CACHE_MAX_BYTES,
  });
  return { removed, kept: kept.length, totalBytes: keptBytes };
};

const readReferenceSummaryCache = (params: {
  key: string;
  legacyKey?: string;
  userId?: string;
  traceId?: string;
  sourceName?: string;
}) => {
  if (typeof window === 'undefined') return null;
  cleanupReferenceSummaryCache(params.userId, 'read-before');
  try {
    const raw = window.localStorage.getItem(params.key);
    if (raw) {
      const parsed = JSON.parse(raw) as ReferenceSummaryCacheEntry;
      if (!parsed.summary || !parsed.createdAt) return null;
      if (Date.now() - parsed.createdAt > AI_REFERENCE_SUMMARY_CACHE_TTL_MS) {
        window.localStorage.removeItem(params.key);
        log.info('AI reference summary cache expired', {
          traceId: params.traceId,
          key: params.key,
          sourceName: params.sourceName,
          ageMs: Date.now() - parsed.createdAt,
        });
        return null;
      }
      const next: ReferenceSummaryCacheEntry = { ...parsed, lastUsedAt: Date.now() };
      window.localStorage.setItem(params.key, JSON.stringify(next));
      log.info('AI reference summary cache hit', {
        traceId: params.traceId,
        key: params.key,
        sourceName: params.sourceName || parsed.sourceName,
        summaryLength: parsed.summary.length,
        ageMs: Date.now() - parsed.createdAt,
        totalEntries: listReferenceSummaryCacheEntries(params.userId).length,
      });
      return parsed.summary;
    }

    if (params.legacyKey) {
      const legacyRaw = window.localStorage.getItem(params.legacyKey);
      if (!legacyRaw) return null;
      const legacy = JSON.parse(legacyRaw) as { content?: string; createdAt?: number };
      if (!legacy.content || !legacy.createdAt) return null;
      if (Date.now() - legacy.createdAt > AI_REFERENCE_SUMMARY_CACHE_TTL_MS) {
        window.localStorage.removeItem(params.legacyKey);
        return null;
      }
      log.info('AI reference summary legacy cache hit', {
        traceId: params.traceId,
        legacyKey: params.legacyKey,
        sourceName: params.sourceName,
        summaryLength: legacy.content.length,
      });
      return legacy.content;
    }

    return null;
  } catch {
    log.warn('AI reference summary cache read failed', {
      traceId: params.traceId,
      key: params.key,
      sourceName: params.sourceName,
    });
    return null;
  }
};

const writeReferenceSummaryCache = (params: {
  key: string;
  userId?: string;
  model: string;
  contentHash: string;
  sourceName: string;
  summary: string;
  originalLength: number;
  traceId?: string;
}) => {
  if (typeof window === 'undefined' || !params.summary.trim()) return;
  try {
    cleanupReferenceSummaryCache(params.userId, 'write-before');
    const entry: ReferenceSummaryCacheEntry = {
      version: 2,
      userId: params.userId || 'anonymous',
      model: params.model,
      contentHash: params.contentHash,
      sourceName: params.sourceName,
      summary: params.summary,
      originalLength: params.originalLength,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    const raw = JSON.stringify(entry);
    if (getLocalStorageSize(raw) > AI_REFERENCE_SUMMARY_CACHE_MAX_BYTES) {
      log.warn('AI reference summary cache write skipped: entry too large', {
        traceId: params.traceId,
        key: params.key,
        sourceName: params.sourceName,
        bytes: getLocalStorageSize(raw),
        maxBytes: AI_REFERENCE_SUMMARY_CACHE_MAX_BYTES,
      });
      return;
    }
    window.localStorage.setItem(params.key, raw);
    const stats = cleanupReferenceSummaryCache(params.userId, 'write-after');
    log.success('AI reference summary cached', {
      traceId: params.traceId,
      key: params.key,
      sourceName: params.sourceName,
      summaryLength: params.summary.length,
      originalLength: params.originalLength,
      totalEntries: stats.kept,
      totalBytes: stats.totalBytes,
    });
  } catch {
    log.warn('AI reference summary cache write failed', {
      traceId: params.traceId,
      key: params.key,
      sourceName: params.sourceName,
    });
  }
};

const readReferenceNodeSummaryCache = (params: {
  userId?: string;
  model: string;
  context: { nodeId: string; content: string; sourceName: string };
  traceId?: string;
}) => {
  const key = getReferenceSummaryCacheKey(params.userId, params.model, params.context.content);
  return readReferenceSummaryCache({
    key,
    userId: params.userId,
    traceId: params.traceId,
    sourceName: params.context.sourceName,
  });
};

const writeReferenceNodeSummaryCache = (params: {
  userId?: string;
  model: string;
  context: { nodeId: string; content: string; sourceName: string };
  summary: string;
  traceId?: string;
}) => {
  writeReferenceSummaryCache({
    key: getReferenceSummaryCacheKey(params.userId, params.model, params.context.content),
    userId: params.userId,
    model: params.model,
    contentHash: hashText(params.context.content),
    sourceName: params.context.sourceName,
    summary: params.summary,
    originalLength: params.context.content.length,
    traceId: params.traceId,
  });
};

const getReferenceCombinedCacheKeys = (userId: string | undefined, model: string, references: string) => ({
  key: getReferenceSummaryCacheKey(userId, model, references),
  legacyKey: getLegacyReferenceSummaryCacheKey(userId, model, references),
});

const buildReferenceContextWithCachedNodeSummaries = (params: {
  contexts: Array<{ nodeId: string; content: string; sourceName: string }>;
  userId?: string;
  model: string;
  traceId?: string;
}) => {
  const parts: string[] = [];
  let hits = 0;
  let misses = 0;
  for (const context of params.contexts) {
    if (context.content.length <= AI_REFERENCE_NODE_SUMMARY_THRESHOLD) {
      parts.push(`来源: ${context.sourceName}\n内容:\n${context.content}`);
      misses += 1;
      continue;
    }
    const summary = readReferenceNodeSummaryCache({
      userId: params.userId,
      model: params.model,
      context,
      traceId: params.traceId,
    });
    if (summary) {
      parts.push(`来源: ${context.sourceName}\n摘要:\n${summary}`);
      hits += 1;
    } else {
      parts.push(`来源: ${context.sourceName}\n内容:\n${context.content}`);
      misses += 1;
    }
  }
  return { references: parts.join('\n\n'), hits, misses };
};

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

const appendHtml = (baseContentHtml = '', generatedHtml = '') => {
  const base = String(baseContentHtml || '').trim();
  const generated = String(generatedHtml || '').trim();
  if (!base || base === '<p></p>') return generated;
  return `${base}${generated}`;
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
  const [pendingAiApplyRequested, setPendingAiApplyRequested] = useState(false);
  const [referenceSummaryNotice, setReferenceSummaryNotice] = useState<ReferenceSummaryNotice | null>(null);
  const pendingAiApplyRequestedRef = React.useRef(false);
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
  const aiVisibleCompletionRef = React.useRef(false);
  const referenceSummaryInflightRef = React.useRef<Map<string, Promise<{
    summary: string;
    usage: { input_tokens: number; output_tokens: number; total_cost: number } | null;
    billingGroupId: string;
  }>>>(new Map());

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
    options: AiApplyOptions & { deferSave?: boolean } = {}
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

    if (options.deferSave) {
      log.info('Chapter content preview applied without persistence', {
        workId,
        chapterId,
        reason,
        contentLength: content?.length || 0,
      });
      return;
    }

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
        log.info('AI reference context selection ignored because it already exists', {
          workId,
          chapterId,
          nodeId: context.nodeId,
          sourceName: context.sourceName,
        });
        return prev;
      }
      return [...prev, context];
    });

    if (!selectedModel || !(selectedModel in MODEL_PRICING)) {
      log.info('AI reference pre-summary skipped: no selected model', {
        workId,
        chapterId,
        nodeId: context.nodeId,
        sourceName: context.sourceName,
      });
      return;
    }

    if (context.content.length <= AI_REFERENCE_NODE_SUMMARY_THRESHOLD) {
      showReferenceSummaryNotice({
        tone: 'info',
        text: `「${context.sourceName}」参考内容较短，将直接用于续写，不需要单独总结`,
      }, { autoClearMs: 5000 });
      log.info('AI reference pre-summary skipped: content below node threshold', {
        workId,
        chapterId,
        nodeId: context.nodeId,
        sourceName: context.sourceName,
        contentLength: context.content.length,
        threshold: AI_REFERENCE_NODE_SUMMARY_THRESHOLD,
      });
      return;
    }

    const traceId = uuidv4();
    const cached = readReferenceNodeSummaryCache({
      userId: user?.id,
      model: selectedModel as LocalModelKey,
      context,
      traceId,
    });
    if (cached) {
      showReferenceSummaryNotice({
        tone: 'success',
        text: `已复用「${context.sourceName}」参考摘要，本次参考处理不消耗钻石`,
      }, { autoClearMs: 5000 });
      return;
    }

    void summarizeReferenceContext({
      context,
      model: selectedModel as LocalModelKey,
      traceId,
      reason: 'prewarm',
    }).catch(() => {
      // Failure is already logged and shown; AI 续写时仍可重试。
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
      const normalizedLineStripped = normalize(trimmed.replace(/^[-*\u2022>\s"'“”‘’]+/g, ''));

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

  const textToParagraphHtml = (content: string) => {
    const paragraphs = String(content || '')
      .trim()
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim().replace(/\n/g, ' '))
      .filter(Boolean);
    return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  };

  const setLastUsageTemporarily = (usage: PendingAiVersion['usage']) => {
    if (!usage) return;
    setLastUsage(usage);
    setTimeout(() => setLastUsage(null), 5000);
  };

  const showReferenceSummaryNotice = useCallback((
    notice: ReferenceSummaryNotice | null,
    options: { autoClearMs?: number } = {}
  ) => {
    setReferenceSummaryNotice(notice);
    if (notice && options.autoClearMs) {
      window.setTimeout(() => {
        setReferenceSummaryNotice((current) => current?.text === notice.text ? null : current);
      }, options.autoClearMs);
    }
  }, []);

  const summarizeReferenceContext = useCallback(async ({
    context,
    model,
    traceId,
    reason,
  }: {
    context: { nodeId: string; content: string; sourceName: string };
    model: LocalModelKey;
    traceId: string;
    reason: 'prewarm' | 'continue';
  }) => {
    const cacheKey = getReferenceSummaryCacheKey(user?.id, model, context.content);
    const cached = readReferenceSummaryCache({
      key: cacheKey,
      userId: user?.id,
      traceId,
      sourceName: context.sourceName,
    });
    if (cached) {
      showReferenceSummaryNotice({
        tone: 'success',
        text: `已复用「${context.sourceName}」参考摘要，本次参考处理不消耗钻石`,
      }, { autoClearMs: 5000 });
      log.info('AI reference summary reused without billing', {
        traceId,
        workId,
        chapterId,
        model,
        reason,
        nodeId: context.nodeId,
        sourceName: context.sourceName,
        contentLength: context.content.length,
        summaryLength: cached.length,
      });
      return { summary: cached, usage: null, billingGroupId: '' };
    }

    const existing = referenceSummaryInflightRef.current.get(cacheKey);
    if (existing) {
      showReferenceSummaryNotice({
        tone: 'info',
        text: `正在准备「${context.sourceName}」参考摘要，请稍候`,
      });
      log.info('AI reference summary awaiting in-flight request', {
        traceId,
        workId,
        chapterId,
        model,
        reason,
        nodeId: context.nodeId,
        sourceName: context.sourceName,
      });
      return existing;
    }

    const billingGroupId = uuidv4();
    showReferenceSummaryNotice({
      tone: 'warning',
      text: `正在总结「${context.sourceName}」参考大纲，本次总结会消耗钻石`,
    });
    log.info('AI reference summary started; billing will be charged', {
      traceId,
      workId,
      chapterId,
      model,
      reason,
      nodeId: context.nodeId,
      sourceName: context.sourceName,
      contentLength: context.content.length,
      billingGroupId,
    });

    const promise = aiService
      .summarizeContext(context.content, user?.id, model, billingGroupId, traceId)
      .then((summaryRes) => {
        if (summaryRes.error) {
          throw new Error(summaryRes.error);
        }
        writeReferenceNodeSummaryCache({
          userId: user?.id,
          model,
          context,
          summary: summaryRes.content,
          traceId,
        });
        showReferenceSummaryNotice({
          tone: 'success',
          text: `参考摘要已生成并缓存，下次相同参考可直接复用`,
        }, { autoClearMs: 6000 });
        log.success('AI reference summary completed and cached', {
          traceId,
          workId,
          chapterId,
          model,
          reason,
          nodeId: context.nodeId,
          sourceName: context.sourceName,
          contentLength: context.content.length,
          summaryLength: summaryRes.content.length,
          totalCost: summaryRes.usage?.total_cost,
          billingGroupId,
        });
        return {
          summary: summaryRes.content,
          usage: summaryRes.usage || null,
          billingGroupId,
        };
      })
      .catch((error) => {
        showReferenceSummaryNotice({
          tone: 'warning',
          text: `参考摘要生成失败，请重试`,
        }, { autoClearMs: 6000 });
        log.error('AI reference summary failed', {
          traceId,
          workId,
          chapterId,
          model,
          reason,
          nodeId: context.nodeId,
          sourceName: context.sourceName,
          billingGroupId,
        }, error);
        throw error;
      })
      .finally(() => {
        referenceSummaryInflightRef.current.delete(cacheKey);
      });

    referenceSummaryInflightRef.current.set(cacheKey, promise);
    return promise;
  }, [chapterId, showReferenceSummaryNotice, user, workId]);

  const setEditorPreviewContent = useCallback((content: string, traceId?: string) => {
    if (!editor || !workId || !chapterId) return;
    suppressEditorUpdateRef.current = true;
    editor.commands.setContent(content || '');
    latestContentRef.current = content || '';
    setSaveState('dirty');
    setSaveError('');
    window.setTimeout(() => {
      suppressEditorUpdateRef.current = false;
    }, 0);
    log.info('AI stream preview rendered in editor', {
      traceId,
      workId,
      chapterId,
      contentLength: content?.length || 0,
    });
  }, [chapterId, editor, workId]);

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
      status: pendingAiVersion.status,
      currentLength: pendingAiVersion.currentContent.length,
      nextLength: pendingAiVersion.nextContent.length,
      generatedLength: pendingAiVersion.generatedHtml.length,
    });
    setPendingAiVersion(null);
    setPendingAiApplyRequested(false);
    pendingAiApplyRequestedRef.current = false;
  };

  const applyPendingAiVersion = useCallback(async (version: PendingAiVersion) => {
    try {
      log.info('Applying pending AI version', {
        workId,
        chapterId,
        status: version.status,
        currentLength: version.currentContent.length,
        generatedLength: version.generatedHtml.length,
        nextLength: version.nextContent.length,
        totalCost: version.usage?.total_cost,
      });
      await applyChapterContent(version.nextContent, 'ai-version-apply', {
        snapshotCurrentAs: 'ai-current-before-replace',
        snapshotNextAs: 'ai-applied',
        prompt: version.prompt,
        model: version.model,
      });
      setLastUsageTemporarily(version.usage);
      setPendingAiVersion(null);
      setPendingAiApplyRequested(false);
      pendingAiApplyRequestedRef.current = false;
      setPromptText('');
      if (user && !isGuestUser(user)) fetchBalance();
      log.success('Pending AI version applied', { workId, chapterId });
    } catch (error) {
      log.error('Failed to apply pending AI version', { workId, chapterId }, error);
      alert('应用 AI 新版本失败，请检查网络后重试');
    }
  }, [applyChapterContent, chapterId, fetchBalance, setLastUsageTemporarily, user, workId]);

  const handleApplyPendingAiVersion = async () => {
    if (!pendingAiVersion) return;
    if ((pendingAiVersion.status || 'ready') === 'output_ready') {
      pendingAiApplyRequestedRef.current = true;
      setPendingAiApplyRequested(true);
      log.info('Pending AI version apply requested before billing completion', {
        workId,
        chapterId,
        generatedLength: pendingAiVersion.generatedHtml.length,
      });
      return;
    }
    if ((pendingAiVersion.status || 'ready') !== 'ready' || !pendingAiVersion.generatedHtml) {
      log.warn('Pending AI version apply blocked before ready', {
        workId,
        chapterId,
        status: pendingAiVersion.status,
        generatedLength: pendingAiVersion.generatedHtml.length,
      });
      return;
    }
    await applyPendingAiVersion(pendingAiVersion);
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
    aiVisibleCompletionRef.current = false;
    const traceId = uuidv4();
    
    try {
      const modelKey = selectedModel as LocalModelKey;
      const textContext = editor.getText().slice(-2000);
      const currentContentBeforeAi = editor.getHTML();
      const hasExistingContent = isMeaningfulHtml(currentContentBeforeAi);
      const saveStateBeforeAi = saveState;
      
      let finalContext = textContext;
      let summarizationUsage = null;
      let billingGroupId: string | undefined;
      
      // Combine user prompt with context
      const userPrompt = promptText.trim() || "请续写这段小说情节，保持风格一致，情节紧凑。";
      log.info('AI continue started', {
        traceId,
        workId,
        chapterId,
        model: modelKey,
        promptLength: userPrompt.length,
        textContextLength: textContext.length,
        referencedContextCount: aiContexts.length,
        hasExistingContent,
      });
      
      if (aiContexts.length > 0) {
        const cachedNodeContext = buildReferenceContextWithCachedNodeSummaries({
          contexts: aiContexts,
          userId: user?.id,
          model: modelKey,
          traceId,
        });
        let references = cachedNodeContext.references;
        log.info('AI reference context prepared with node cache', {
          traceId,
          workId,
          chapterId,
          model: modelKey,
          contextCount: aiContexts.length,
          nodeCacheHits: cachedNodeContext.hits,
          nodeCacheMisses: cachedNodeContext.misses,
          referencesLength: references.length,
        });
        
        if (references.length > AI_REFERENCE_SUMMARY_THRESHOLD) {
          const summaryCacheKey = getReferenceSummaryCacheKey(user?.id, modelKey, references);
          const { legacyKey } = getReferenceCombinedCacheKeys(user?.id, modelKey, references);
          const cachedSummary = readReferenceSummaryCache({
            key: summaryCacheKey,
            legacyKey,
            userId: user?.id,
            traceId,
            sourceName: '组合参考大纲',
          });

          if (cachedSummary) {
            finalContext = `【经过精简的参考大纲/设定】\n${cachedSummary}\n\n【当前章节前文内容】\n${textContext}`;
            showReferenceSummaryNotice({
              tone: 'success',
              text: '已复用参考摘要，本次参考处理不消耗钻石',
            }, { autoClearMs: 5000 });
            log.info('AI combined reference summary reused without billing', {
              traceId,
              workId,
              chapterId,
              model: modelKey,
              referencesLength: references.length,
              summaryLength: cachedSummary.length,
            });
          } else {
            const largeContexts = aiContexts.filter((context) => context.content.length > AI_REFERENCE_NODE_SUMMARY_THRESHOLD);
            const missingNodeContexts = largeContexts.filter((context) => !readReferenceNodeSummaryCache({
              userId: user?.id,
              model: modelKey,
              context,
              traceId,
            }));

            if (missingNodeContexts.length > 0) {
              setAiPhase('正在准备参考摘要');
              showReferenceSummaryNotice({
                tone: 'warning',
                text: '正在总结参考大纲，本次总结会消耗钻石',
              });
              let nodeSummaryFailed = false;
              const nodeSummaries = await Promise.all(missingNodeContexts.map((context) =>
                summarizeReferenceContext({
                  context,
                  model: modelKey,
                  traceId,
                  reason: 'continue',
                })
              )).catch((error) => {
                alert(`总结大纲/设定失败: ${error instanceof Error ? error.message : '请稍后重试'}`);
                setIsAiGenerating(false);
                setIsAiTiming(false);
                setAiPhase('等待开始');
                nodeSummaryFailed = true;
                return [];
              });
              if (nodeSummaryFailed) return;
              summarizationUsage = nodeSummaries.reduce((total, item) => {
                if (!item.usage) return total;
                return {
                  input_tokens: total.input_tokens + item.usage.input_tokens,
                  output_tokens: total.output_tokens + item.usage.output_tokens,
                  total_cost: total.total_cost + item.usage.total_cost,
                };
              }, { input_tokens: 0, output_tokens: 0, total_cost: 0 });
              const refreshed = buildReferenceContextWithCachedNodeSummaries({
                contexts: aiContexts,
                userId: user?.id,
                model: modelKey,
                traceId,
              });
              references = refreshed.references;
              log.info('AI reference context refreshed after node summaries', {
                traceId,
                workId,
                chapterId,
                model: modelKey,
                nodeCacheHits: refreshed.hits,
                nodeCacheMisses: refreshed.misses,
                referencesLength: references.length,
                summarizationCost: summarizationUsage.total_cost,
              });
            }

            if (references.length > AI_REFERENCE_SUMMARY_THRESHOLD) {
              const combinedCacheKey = getReferenceSummaryCacheKey(user?.id, modelKey, references);
              billingGroupId = uuidv4();
              setAiPhase('正在总结参考大纲');
              showReferenceSummaryNotice({
                tone: 'warning',
                text: '正在总结参考大纲，本次总结会消耗钻石',
              });
              log.info('AI combined reference summary cache miss; summarizing references', {
                traceId,
                workId,
                chapterId,
                model: modelKey,
                referencesLength: references.length,
                billingGroupId,
              });
              const summaryRes = await aiService.summarizeContext(references, user?.id, modelKey, billingGroupId, traceId);
              if (summaryRes.error) {
                alert(`总结大纲/设定失败: ${summaryRes.error}`);
                setIsAiGenerating(false);
                setIsAiTiming(false);
                setAiPhase('等待开始');
                return;
              }
              finalContext = `【经过精简的参考大纲/设定】\n${summaryRes.content}\n\n【当前章节前文内容】\n${textContext}`;
              writeReferenceSummaryCache({
                key: combinedCacheKey,
                userId: user?.id,
                model: modelKey,
                contentHash: hashText(references),
                sourceName: '组合参考大纲',
                summary: summaryRes.content,
                originalLength: references.length,
                traceId,
              });
              showReferenceSummaryNotice({
                tone: 'success',
                text: '参考摘要已生成并缓存，下次相同参考可直接复用',
              }, { autoClearMs: 6000 });
              if (summaryRes.usage) {
                summarizationUsage = summarizationUsage
                  ? {
                      input_tokens: summarizationUsage.input_tokens + summaryRes.usage.input_tokens,
                      output_tokens: summarizationUsage.output_tokens + summaryRes.usage.output_tokens,
                      total_cost: summarizationUsage.total_cost + summaryRes.usage.total_cost,
                    }
                  : summaryRes.usage;
              }
            } else {
              finalContext = `【参考大纲/设定摘要】\n${references}\n\n【当前章节前文内容】\n${textContext}`;
            }
          }
        } else {
          finalContext = `【参考大纲/设定】\n${references}\n\n【当前章节前文内容】\n${textContext}`;
        }
      } else {
        finalContext = `【当前章节前文内容】\n${textContext}`;
      }

      setAiPhase('正在创作正文');
      let streamedContent = '';
      let latestPreviewHtml = '';
      let firstDeltaAt = 0;
      const generationStartedAt = performance.now();

      if (hasExistingContent) {
        log.info('AI continue UX mode selected', {
          traceId,
          workId,
          chapterId,
          mode: 'dialog-stream-preview',
        });
        setPendingAiVersion({
          currentContent: currentContentBeforeAi,
          nextContent: '',
          generatedHtml: '',
          prompt: userPrompt,
          model: modelKey,
          usage: null,
          status: 'streaming',
          phaseLabel: '正在请求模型',
        });
      } else {
        log.info('AI continue UX mode selected', {
          traceId,
          workId,
          chapterId,
          mode: 'editor-direct-stream',
        });
      }
      
      const response = await aiService.generateTextStream(
        {
          prompt: userPrompt,
          model: modelKey,
          context: finalContext,
          userId: user?.id,
          billingGroupId,
          traceId,
          workId,
          chapterId,
          chapterTitle: currentChapterName,
          baseContentHtml: currentContentBeforeAi,
          deferChapterSave: true,
        },
        {
          onPhase: (event) => {
            if (event.phase === 'output_ready') {
              aiVisibleCompletionRef.current = true;
              if (hasExistingContent && latestPreviewHtml) {
                const appendedContent = appendHtml(currentContentBeforeAi, latestPreviewHtml);
                setPendingAiVersion((prev) => prev ? {
                  ...prev,
                  nextContent: appendedContent,
                  generatedHtml: latestPreviewHtml,
                  status: 'output_ready',
                  phaseLabel: 'AI 输出完成',
                } : prev);
              }
              setAiPhase('AI 输出完成');
              setIsAiGenerating(false);
              setIsAiTiming(false);
              log.info('AI continue marked complete for user; background billing/save continues', {
                traceId,
                workId,
                chapterId,
                hasExistingContent,
                generatedHtmlLength: latestPreviewHtml.length,
              });
              return;
            }
            if (event.phase === 'saving' || event.phase === 'billing') {
              log.info('AI continue background phase hidden from UI', {
                traceId,
                workId,
                chapterId,
                phase: event.phase,
                label: event.label,
                hasExistingContent,
              });
            } else if (hasExistingContent && event.label) {
              setPendingAiVersion((prev) => prev ? { ...prev, phaseLabel: event.label } : prev);
              setAiPhase(event.label);
            } else if (event.label) {
              setAiPhase(event.label);
            }
          },
          onDelta: (delta, event) => {
            if (!firstDeltaAt) {
              firstDeltaAt = performance.now();
              log.info('AI continue first delta rendered', {
                traceId,
                workId,
                chapterId,
                mode: hasExistingContent ? 'dialog-stream-preview' : 'editor-direct-stream',
                firstDeltaMs: Math.round(firstDeltaAt - generationStartedAt),
                deltaLength: delta.length,
              });
            }
            streamedContent += delta;
            const cleaned = sanitizeAiContinuationOutput(userPrompt, streamedContent);
            latestPreviewHtml = textToParagraphHtml(cleaned);
            setAiPhase(event.label || `AI 正在输出，已生成 ${event.generatedChars || cleaned.length} 字`);
            if (hasExistingContent) {
              setPendingAiVersion((prev) => prev ? {
                ...prev,
                nextContent: latestPreviewHtml,
                generatedHtml: latestPreviewHtml,
                status: 'streaming',
                phaseLabel: event.label || `AI 正在输出，已生成 ${event.generatedChars || cleaned.length} 字`,
              } : prev);
            } else {
              setEditorPreviewContent(latestPreviewHtml, traceId);
            }
          },
          onError: (message) => {
            if (hasExistingContent) {
              setPendingAiVersion((prev) => prev ? { ...prev, status: 'error', error: message, phaseLabel: message } : prev);
            } else {
              suppressEditorUpdateRef.current = true;
              editor.commands.setContent(currentContentBeforeAi || '');
              latestContentRef.current = currentContentBeforeAi || '';
              setSaveState(saveStateBeforeAi);
              window.setTimeout(() => {
                suppressEditorUpdateRef.current = false;
              }, 0);
              log.warn('AI stream failed; editor preview rolled back', {
                traceId,
                workId,
                chapterId,
                message,
                restoredLength: currentContentBeforeAi.length,
              });
            }
          },
        }
      );

      if (response.error) {
        log.warn('AI continue failed after stream response', {
          traceId,
          workId,
          chapterId,
          model: modelKey,
          error: response.error,
          streamedLength: streamedContent.length,
        });
        alert(`AI生成失败: ${response.error}`);
        return;
      }

      if (response.content) {
        log.info('AI continue stream response ready for client finalize', {
          traceId,
          workId,
          chapterId,
          hasExistingContent,
          contentLength: response.content.length,
        });
        const cleaned = sanitizeAiContinuationOutput(userPrompt, response.content);
        const generatedHtml = response.generatedHtml || latestPreviewHtml || textToParagraphHtml(cleaned);
        // 版本比较右侧只预览本次 AI 新增内容；点击继续应用时再追加到当前正文，避免覆盖用户原文。
        // 服务端 previewChapterContent 仅保留给其他预览场景，正文落库以客户端确认后的内容为准。
        const nextContent = generatedHtml || '';
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
          const appendedContent = appendHtml(currentContentBeforeAi, generatedHtml);
          const readyVersion: PendingAiVersion = {
            currentContent: currentContentBeforeAi,
            nextContent: appendedContent,
            generatedHtml,
            prompt: userPrompt,
            model: modelKey,
            usage: combinedUsage,
            status: 'ready',
            phaseLabel: 'AI 输出完成',
          };
          setPendingAiVersion(readyVersion);
          log.info('Pending AI version comparison opened', {
            traceId,
            workId,
            chapterId,
            currentLength: currentContentBeforeAi.length,
            generatedLength: generatedHtml.length,
            nextLength: appendedContent.length,
            applyMode: 'append-generated',
            applyRequested: pendingAiApplyRequestedRef.current,
          });
          if (pendingAiApplyRequestedRef.current) {
            await applyPendingAiVersion(readyVersion);
          }
        } else {
          await applyChapterContent(nextContent, 'ai-first-apply', {
            snapshotNextAs: 'ai-applied',
            prompt: userPrompt,
            model: modelKey,
          });
          setLastUsageTemporarily(combinedUsage);
          setPromptText('');
          if (user && !isGuestUser(user)) fetchBalance();
        }
        log.success('AI continue completed', {
          traceId,
          workId,
          chapterId,
          model: modelKey,
          hasExistingContent,
          outputHtmlLength: nextContent.length,
          totalCost: combinedUsage?.total_cost,
          elapsedMs: Math.round(performance.now() - generationStartedAt),
          firstDeltaMs: firstDeltaAt ? Math.round(firstDeltaAt - generationStartedAt) : null,
        });
        setIsAiTiming(false);
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('AI生成发生错误，请重试');
    } finally {
      if (!aiVisibleCompletionRef.current) {
        setIsAiGenerating(false);
        setIsAiTiming(false);
        setAiPhase('等待开始');
      }
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

            {referenceSummaryNotice && (
              <div className={`flex items-center text-xs px-3 py-1.5 rounded-lg border ${
                referenceSummaryNotice.tone === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : referenceSummaryNotice.tone === 'warning'
                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                    : 'bg-blue-50 text-blue-700 border-blue-100'
              }`}>
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                <span>{referenceSummaryNotice.text}</span>
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
            applyRequested={pendingAiApplyRequested}
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
  applyRequested,
  onCancel,
  onApply,
}: {
  version: PendingAiVersion;
  applyRequested: boolean;
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
  const status = version.status || 'ready';
  const canApply = (status === 'ready' || status === 'output_ready') && Boolean(version.generatedHtml) && !applyRequested;
  const isGenerating = status === 'streaming';
  const isOutputReady = status === 'ready' || status === 'output_ready';

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
                <div className="mt-0.5 text-xs text-emerald-700">
                  {isGenerating ? version.phaseLabel || 'AI 正在输出' : `${generatedWords} 字`}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                status === 'error'
                  ? 'bg-red-100 text-red-700'
                  : isOutputReady
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-purple-100 text-purple-700'
              }`}>
                {status === 'error' ? '生成失败' : isOutputReady ? '可应用' : '生成中'}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5">
              {version.generatedHtml ? (
                <div
                  className="story-editor-content prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: version.generatedHtml }}
                />
              ) : (
                <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-gray-400">
                  {status === 'error' ? version.error || 'AI 输出失败' : version.phaseLabel || '等待 AI 输出...'}
                </div>
              )}
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
              disabled={!canApply}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applyRequested ? '正在应用...' : isOutputReady ? '继续应用' : status === 'error' ? '无法应用' : '生成中...'}
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
