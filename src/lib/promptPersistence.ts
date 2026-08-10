import { supabase } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { Prompt } from '@/store/usePromptStore';
import type { Database } from '@/types/supabase';

const log = createLogger('PromptPersistence');

type UserPromptRow = Database['public']['Tables']['user_prompts']['Row'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const mapUserPromptRow = (row: UserPromptRow): Prompt => ({
  id: row.id,
  title: row.title,
  index: row.category,
  tags: Array.isArray(row.tags) ? row.tags : [],
  content: row.content,
  sourceSkillTemplateId: row.source_skill_template_id,
});

export const loadUserPrompts = async (userId: string): Promise<Prompt[]> => {
  log.info('Loading user prompts', { userId });
  const { data, error } = await supabase
    .from('user_prompts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to load user prompts', { userId, error: error.message }, error);
    throw error;
  }

  const prompts = (data || []).map(mapUserPromptRow);
  log.success('User prompts loaded', { userId, count: prompts.length });
  return prompts;
};

export const createUserPrompt = async (
  userId: string,
  prompt: Omit<Prompt, 'id'> & { id?: string }
): Promise<Prompt> => {
  log.info('Creating user prompt', { userId, title: prompt.title, category: prompt.index });
  const shouldUseProvidedId = typeof prompt.id === 'string' && UUID_RE.test(prompt.id);
  if (prompt.id && !shouldUseProvidedId) {
    log.warn('Ignoring non-UUID prompt id before database insert', {
      userId,
      promptId: prompt.id,
      title: prompt.title,
    });
  }

  const { data, error } = await supabase
    .from('user_prompts')
    .insert({
      ...(shouldUseProvidedId ? { id: prompt.id } : {}),
      user_id: userId,
      title: prompt.title || '未命名指令',
      category: prompt.index,
      tags: prompt.tags || [],
      content: prompt.content,
      source_skill_template_id: prompt.sourceSkillTemplateId || null,
    })
    .select('*')
    .single();

  if (error || !data) {
    log.error('Failed to create user prompt', { userId, error: error?.message }, error);
    if (error?.code === 'P0001' || String(error?.message || '').includes('USER_PROMPTS_LIMIT_REACHED')) {
      throw new Error('你的指令工坊最多保存 100 个指令，请先删除不用的指令后再导入');
    }
    throw error || new Error('创建指令失败');
  }

  log.success('User prompt created', { userId, promptId: data.id });
  return mapUserPromptRow(data);
};

export const updateUserPrompt = async (
  userId: string,
  id: string,
  updates: Partial<Prompt>
): Promise<Prompt> => {
  log.info('Updating user prompt', { userId, promptId: id });
  const { data, error } = await supabase
    .from('user_prompts')
    .update({
      ...(updates.title !== undefined ? { title: updates.title || '未命名指令' } : {}),
      ...(updates.index !== undefined ? { category: updates.index } : {}),
      ...(updates.tags !== undefined ? { tags: updates.tags || [] } : {}),
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      ...(updates.sourceSkillTemplateId !== undefined ? { source_skill_template_id: updates.sourceSkillTemplateId || null } : {}),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    log.error('Failed to update user prompt', { userId, promptId: id, error: error?.message }, error);
    throw error || new Error('更新指令失败');
  }

  log.success('User prompt updated', { userId, promptId: id });
  return mapUserPromptRow(data);
};

export const deleteUserPrompt = async (userId: string, id: string): Promise<void> => {
  log.info('Deleting user prompt', { userId, promptId: id });
  const { error } = await supabase
    .from('user_prompts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    log.error('Failed to delete user prompt', { userId, promptId: id, error: error.message }, error);
    throw error;
  }

  log.success('User prompt deleted', { userId, promptId: id });
};
