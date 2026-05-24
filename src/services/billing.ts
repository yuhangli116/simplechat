import { supabase } from '@/lib/supabase';

export const PRICING_CONFIG = {
  DIAMONDS_PER_YUAN: 250000,
  NEW_USER_BONUS: 500000,
  MEMBERSHIP: {
    monthly: { key: 'monthly', name: '月卡', price: 49.9, diamonds: 12000000, days: 30 },
    quarterly: { key: 'quarterly', name: '季卡', price: 139.9, diamonds: 35000000, days: 90 },
    yearly: { key: 'yearly', name: '年卡', price: 579.9, diamonds: 150000000, days: 365 },
  },
  FUEL_PACKS: {
    starter: { key: 'starter', name: '体验包', price: 9.9, diamonds: 2500000 },
    standard: { key: 'standard', name: '标准包', price: 29.9, diamonds: 8000000 },
    value: { key: 'value', name: '超值包', price: 99.9, diamonds: 30000000 },
  },
} as const;

export type ModelKey =
  | 'deepseek-v3'
  | 'deepseek-v3.2'
  | 'deepseek-r1'
  | 'claude-haiku'
  | 'claude-sonnet'
  | 'claude-opus'
  | 'gpt-4-turbo'
  | 'gpt-4o'
  | 'gemini-2.5-pro'
  | 'gemini-3.1-pro';

export const MODEL_PRICING: Record<
  ModelKey,
  {
    name: string;
    inputMultiplier: number;
    outputMultiplier: number;
    reasoningMultiplier: number;
    cacheMultiplier: number;
    provider: string;
    modelApiName: string;
    tags: string[];
    description?: string;
  }
> = {
  'deepseek-v3': {
    name: 'DeepSeek-V3',
    inputMultiplier: 1,
    outputMultiplier: 4,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.4,
    provider: 'deepseek',
    modelApiName: 'deepseek-chat',
    tags: ['推荐', '高性价比'],
    description: '适合日常创作',
  },
  'deepseek-v3.2': {
    name: 'DeepSeek-V3.2',
    inputMultiplier: 1,
    outputMultiplier: 1.5,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.1,
    provider: 'deepseek',
    modelApiName: 'deepseek-chat',
    tags: ['特价', '性价比之王'],
    description: '限时特价，输出成本降低60%',
  },
  'deepseek-r1': {
    name: 'DeepSeek-R1',
    inputMultiplier: 2,
    outputMultiplier: 8,
    reasoningMultiplier: 8,
    cacheMultiplier: 0.8,
    provider: 'deepseek',
    modelApiName: 'deepseek-reasoner',
    tags: ['深度推理', '思考模型'],
    description: '适合复杂情节设计',
  },
  'claude-haiku': {
    name: 'Claude Haiku',
    inputMultiplier: 3.5,
    outputMultiplier: 17.5,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.35,
    provider: 'anthropic',
    modelApiName: 'claude-3-haiku-20240307',
    tags: ['快速', '入门级'],
    description: 'Claude入门款',
  },
  'claude-sonnet': {
    name: 'Claude Sonnet',
    inputMultiplier: 10.5,
    outputMultiplier: 52.5,
    reasoningMultiplier: 0,
    cacheMultiplier: 1.05,
    provider: 'anthropic',
    modelApiName: 'claude-3-5-sonnet-20240620',
    tags: ['推荐', '进阶'],
    description: '长篇创作首选',
  },
  'claude-opus': {
    name: 'Claude Opus',
    inputMultiplier: 17.5,
    outputMultiplier: 87.5,
    reasoningMultiplier: 0,
    cacheMultiplier: 1.75,
    provider: 'anthropic',
    modelApiName: 'claude-3-opus-20240229',
    tags: ['旗舰', '最强'],
    description: '追求极致质量',
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    inputMultiplier: 7,
    outputMultiplier: 28,
    reasoningMultiplier: 0,
    cacheMultiplier: 0,
    provider: 'openai',
    modelApiName: 'gpt-4-turbo',
    tags: ['OpenAI', '经典'],
    description: 'GPT-4经典款',
  },
  'gpt-4o': {
    name: 'GPT-4o',
    inputMultiplier: 8.75,
    outputMultiplier: 35,
    reasoningMultiplier: 0,
    cacheMultiplier: 0,
    provider: 'openai',
    modelApiName: 'gpt-4o',
    tags: ['旗舰', 'OpenAI'],
    description: 'OpenAI最新旗舰',
  },
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    inputMultiplier: 4.375,
    outputMultiplier: 35,
    reasoningMultiplier: 0,
    cacheMultiplier: 0,
    provider: 'google',
    modelApiName: 'google/gemini-1.5-flash',
    tags: ['Google', '长上下文'],
    description: '超长上下文支持',
  },
  'gemini-3.1-pro': {
    name: 'Gemini 3.1 Pro',
    inputMultiplier: 7,
    outputMultiplier: 42,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.7,
    provider: 'google',
    modelApiName: 'google/gemini-1.5-pro',
    tags: ['旗舰', 'Google'],
    description: 'Google旗舰模型',
  },
};

export function calculateDiamonds(
  modelKey: ModelKey,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number = 0,
  cacheTokens: number = 0
): number {
  const pricing = MODEL_PRICING[modelKey];
  return Math.ceil(
    inputTokens * pricing.inputMultiplier +
      outputTokens * pricing.outputMultiplier +
      reasoningTokens * pricing.reasoningMultiplier +
      cacheTokens * pricing.cacheMultiplier
  );
}

export function formatDiamonds(diamonds: number): string {
  if (diamonds >= 100000000) return `${(diamonds / 100000000).toFixed(2)}亿`;
  if (diamonds >= 10000) return `${(diamonds / 10000).toFixed(1)}万`;
  return Math.floor(diamonds).toLocaleString();
}

export function diamondsToYuan(diamonds: number): string {
  const yuan = diamonds / PRICING_CONFIG.DIAMONDS_PER_YUAN;
  if (yuan < 0.01) return '不到1分';
  if (yuan < 1) return `约${Math.ceil(yuan * 100)}分`;
  return `约¥${yuan.toFixed(2)}`;
}

export async function deductDiamondsV4(params: {
  userId: string;
  modelKey: ModelKey;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheTokens?: number;
}): Promise<{
  success: boolean;
  error?: string;
  diamondsConsumed?: number;
  totalRemaining?: number;
  needed?: number;
  available?: number;
}> {
  const { data, error } = await supabase.rpc('deduct_diamonds_v4', {
    p_user_id: params.userId,
    p_model_key: params.modelKey,
    p_input_tokens: params.inputTokens,
    p_output_tokens: params.outputTokens,
    p_reasoning_tokens: params.reasoningTokens ?? 0,
    p_cache_tokens: params.cacheTokens ?? 0,
  });

  if (error) return { success: false, error: error.message };

  return {
    success: Boolean(data?.success),
    error: data?.error,
    diamondsConsumed: data?.diamonds_consumed,
    totalRemaining: data?.total_remaining,
    needed: data?.needed,
    available: data?.available,
  };
}

export async function getUserBalance(userId: string): Promise<{
  memberDiamonds: number;
  permanentDiamonds: number;
  totalDiamonds: number;
  membershipType?: string;
  membershipExpiresAt?: string | null;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('member_diamonds, permanent_diamonds, membership_type, membership_expires_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { memberDiamonds: 0, permanentDiamonds: 0, totalDiamonds: 0 };
  }

  const memberDiamonds = Number(data.member_diamonds ?? 0);
  const permanentDiamonds = Number(data.permanent_diamonds ?? 0);

  return {
    memberDiamonds,
    permanentDiamonds,
    totalDiamonds: memberDiamonds + permanentDiamonds,
    membershipType: data.membership_type ?? undefined,
    membershipExpiresAt: data.membership_expires_at ?? null,
  };
}

