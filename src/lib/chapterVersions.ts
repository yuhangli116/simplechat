import { supabase } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { Database } from '@/types/supabase';

const log = createLogger('ChapterVersions');

export type ChapterVersion = Database['public']['Tables']['chapter_versions']['Row'];

export type ChapterVersionSource = 'ai-current-before-replace' | 'ai-applied' | 'restore-before' | 'manual';

const isMissingChapterVersionsTable = (error: any) =>
  error?.code === 'PGRST205' || error?.status === 404 || String(error?.message || '').includes('chapter_versions');

export const stripHtmlForWordCount = (value: string | null | undefined) =>
  (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const getChapterWordCount = (value: string | null | undefined) => stripHtmlForWordCount(value).length;

export const createChapterVersion = async (params: {
  userId: string;
  workId: string;
  chapterId: string;
  title: string;
  content: string;
  source: ChapterVersionSource;
  operationKey?: string | null;
  prompt?: string | null;
  model?: string | null;
}): Promise<ChapterVersion | null> => {
  const content = params.content || '';
  if (!content.trim() || content === '<p></p>') {
    log.info('Skipped empty chapter version snapshot', {
      workId: params.workId,
      chapterId: params.chapterId,
      source: params.source,
    });
    return null;
  }

  // A double click, retry, or two UI events can reach this helper within the
  // same save window. Reuse an identical recent snapshot instead of creating
  // several history rows for one visible operation.
  const recentCutoff = new Date(Date.now() - 5000).toISOString();
  let recentQuery = supabase
    .from('chapter_versions')
    .select('*')
    .eq('user_id', params.userId)
    .eq('work_id', params.workId)
    .eq('chapter_id', params.chapterId)
    .eq('source', params.source)
    .eq('content', content)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: false })
    .limit(1);
  if (params.operationKey) {
    recentQuery = recentQuery.eq('operation_key', params.operationKey);
  }
  const { data: recentVersions, error: recentLookupError } = await recentQuery;

  if (!recentLookupError && recentVersions?.[0]) {
    log.info('Reusing recent identical chapter version snapshot', {
      versionId: recentVersions[0].id,
      chapterId: params.chapterId,
      source: params.source,
    });
    return recentVersions[0];
  }

  log.info('Creating chapter version snapshot', {
    userId: params.userId,
    workId: params.workId,
    chapterId: params.chapterId,
    source: params.source,
    contentLength: content.length,
  });

  const { data, error } = await supabase
    .from('chapter_versions')
    .insert({
      user_id: params.userId,
      work_id: params.workId,
      chapter_id: params.chapterId,
      title: params.title || '未命名章节',
      content,
      word_count: getChapterWordCount(content),
      source: params.source,
      operation_key: params.operationKey || null,
      prompt: params.prompt || null,
      model: params.model || null,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingChapterVersionsTable(error)) {
      log.warn('chapter_versions table missing, version snapshot skipped');
      return null;
    }
    if (params.operationKey && error.code === '23505') {
      const { data: existingVersion } = await supabase
        .from('chapter_versions')
        .select('*')
        .eq('chapter_id', params.chapterId)
        .eq('source', params.source)
        .eq('operation_key', params.operationKey)
        .maybeSingle();
      if (existingVersion) {
        log.info('Reused chapter version after idempotency conflict', {
          versionId: existingVersion.id,
          chapterId: params.chapterId,
          source: params.source,
          operationKey: params.operationKey,
        });
        return existingVersion;
      }
    }
    log.error('Failed to create chapter version snapshot', {
      userId: params.userId,
      workId: params.workId,
      chapterId: params.chapterId,
      source: params.source,
    }, error);
    throw error;
  }

  log.success('Chapter version snapshot created', {
    versionId: data.id,
    chapterId: params.chapterId,
    source: params.source,
    operationKey: params.operationKey || null,
  });
  return data;
};

export const loadChapterVersions = async (params: {
  userId: string;
  chapterId: string;
}): Promise<ChapterVersion[]> => {
  log.info('Loading chapter versions', { userId: params.userId, chapterId: params.chapterId });

  const { data, error } = await supabase
    .from('chapter_versions')
    .select('*')
    .eq('user_id', params.userId)
    .eq('chapter_id', params.chapterId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingChapterVersionsTable(error)) {
      log.warn('chapter_versions table missing, history unavailable');
      return [];
    }
    log.error('Failed to load chapter versions', params, error);
    throw error;
  }

  log.success('Chapter versions loaded', {
    userId: params.userId,
    chapterId: params.chapterId,
    count: data?.length || 0,
  });
  return data || [];
};

export const deleteExpiredChapterVersions = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('chapter_versions')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString());

  if (error) {
    if (isMissingChapterVersionsTable(error)) {
      log.warn('chapter_versions table missing, expired cleanup skipped');
      return;
    }
    log.error('Failed to delete expired chapter versions', { userId }, error);
  }
};
