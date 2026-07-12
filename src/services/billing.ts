import { supabase } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('Billing');

export const PRICING_VERSION = 'v4.1';

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

export type ModelKey = string;

export interface ModelPricingConfig {
  name: string;
  inputMultiplier: number;
  outputMultiplier: number;
  reasoningMultiplier: number;
  cacheMultiplier: number;
  provider: string;
  modelApiName: string;
  tags: string[];
  description?: string;
  apiType?: string;
  sortOrder?: number;
}

export let MODEL_ORDER: ModelKey[] = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-v3',
  'claude-haiku',
  'claude-sonnet',
  'claude-opus',
  'gpt-4-turbo',
  'gpt-4o',
  'gemini-2.5-pro',
  'gemini-3.1-pro',
];

const DEFAULT_MODEL_PRICING: Record<ModelKey, ModelPricingConfig> = {
  'deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash',
    inputMultiplier: 0.5,
    outputMultiplier: 1,
    reasoningMultiplier: 1,
    cacheMultiplier: 0.01,
    provider: 'deepseek',
    modelApiName: 'deepseek-v4-flash',
    tags: ['推荐', '高性价比'],
    description: '新一代轻量模型，速度快价格低，日常创作首选',
  },
  'deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro',
    inputMultiplier: 1.5,
    outputMultiplier: 3,
    reasoningMultiplier: 3,
    cacheMultiplier: 0.0125,
    provider: 'deepseek',
    modelApiName: 'deepseek-v4-pro',
    tags: ['旗舰'],
    description: '强推理能力，适合复杂剧情与长篇创作',
  },
  'deepseek-v3': {
    name: 'DeepSeek V3',
    inputMultiplier: 1,
    outputMultiplier: 4,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.25,
    provider: 'deepseek',
    modelApiName: 'deepseek-chat',
    tags: ['基准定价'],
    description: '基准模型（1x=V3输入价），V4系列已全面优于V3',
  },
  'claude-haiku': {
    name: 'Claude Haiku',
    inputMultiplier: 3.5,
    outputMultiplier: 17.5,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.35,
    provider: 'anthropic',
    modelApiName: 'claude-haiku-4-5-20251001',
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
    modelApiName: 'claude-sonnet-4-6',
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
    modelApiName: 'claude-opus-4-7',
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
    modelApiName: 'google/gemini-2.5-pro',
    tags: ['Google', '长上下文'],
    description: 'Google Gemini 2.5 Pro 路由',
  },
  'gemini-3.1-pro': {
    name: 'Gemini 3.1 Pro',
    inputMultiplier: 7,
    outputMultiplier: 42,
    reasoningMultiplier: 0,
    cacheMultiplier: 0.7,
    provider: 'google',
    modelApiName: 'google/gemini-3.1-pro',
    tags: ['旗舰', 'Google'],
    description: 'Google Gemini 3.1 Pro 路由',
  },
};

const DEFAULT_MODEL_ORDER = [...MODEL_ORDER];
const DEFAULT_MODEL_PRICING_RECORD = DEFAULT_MODEL_PRICING as Record<string, ModelPricingConfig>;

export const MODEL_PRICING: Record<ModelKey, ModelPricingConfig> = Object.fromEntries(
  MODEL_ORDER.map((key) => [key, { ...DEFAULT_MODEL_PRICING[key], tags: [...DEFAULT_MODEL_PRICING[key].tags] }])
) as Record<ModelKey, ModelPricingConfig>;

let pricingSyncPromise: Promise<Record<ModelKey, ModelPricingConfig>> | undefined;
let lastPricingSyncAt = 0;
const PRICING_SYNC_TTL_MS = 5 * 60 * 1000;

const isMembershipExpired = (membershipExpiresAt?: string | null) => {
  if (!membershipExpiresAt) return false;
  const expiresAt = new Date(membershipExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
};

export const getEffectiveProfileDiamonds = (profile: {
  member_diamonds?: number | null;
  permanent_diamonds?: number | null;
  membership_type?: string | null;
  membership_expires_at?: string | null;
}) => {
  const expired = isMembershipExpired(profile.membership_expires_at);
  const memberDiamonds = expired ? 0 : Number(profile.member_diamonds ?? 0);
  const permanentDiamonds = Number(profile.permanent_diamonds ?? 0);

  return {
    expired,
    memberDiamonds,
    permanentDiamonds,
    totalDiamonds: memberDiamonds + permanentDiamonds,
    membershipType: expired ? 'free' : profile.membership_type ?? 'free',
    membershipExpiresAt: expired ? null : profile.membership_expires_at ?? null,
  };
};

const applyRuntimePricing = (nextPricing: Record<ModelKey, ModelPricingConfig>, nextOrder?: ModelKey[]) => {
  Object.keys(MODEL_PRICING).forEach((key) => {
    delete MODEL_PRICING[key];
  });

  const orderedKeys = nextOrder?.length ? nextOrder : DEFAULT_MODEL_ORDER;
  MODEL_ORDER = [...orderedKeys];

  MODEL_ORDER.forEach((key) => {
    const source = nextPricing[key] ?? DEFAULT_MODEL_PRICING_RECORD[key];
    if (!source) return;
    MODEL_PRICING[key] = {
      ...source,
      tags: [...(source.tags ?? [])],
    };
  });
};

export const syncModelPricingFromDb = async (force = false): Promise<Record<ModelKey, ModelPricingConfig>> => {
  const shouldReuse =
    !force &&
    pricingSyncPromise &&
    Date.now() - lastPricingSyncAt < PRICING_SYNC_TTL_MS;

  if (shouldReuse) {
    return pricingSyncPromise!;
  }

  pricingSyncPromise = (async () => {
    try {
      const [{ data: pricingRows, error: pricingError }, { data: configRows, error: configError }] =
        await Promise.all([
          supabase
            .from('model_pricing')
            .select(
              'model_key, model_name, input_multiplier, output_multiplier, reasoning_multiplier, cache_multiplier, provider, model_api_name, tags, description, is_active, api_type, sort_order'
            )
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('provider', { ascending: true })
            .order('model_key', { ascending: true }),
          supabase
            .from('system_config')
            .select('key, value')
            .in('key', ['pricing_version']),
        ]);

      if (pricingError) throw pricingError;
      if (configError) throw configError;

      const pricingVersion = configRows?.find((row: { key: string; value: string }) => row.key === 'pricing_version')?.value;
      if (pricingVersion && pricingVersion !== PRICING_VERSION) {
        log.warn('Pricing version mismatch', { dbVersion: pricingVersion, localVersion: PRICING_VERSION });
      }

      const runtimePricing: Record<ModelKey, ModelPricingConfig> = {};
      const runtimeOrder: ModelKey[] = [];

      for (const row of pricingRows ?? []) {
        const key = String(row.model_key || '').trim();
        if (!key) continue;
        const defaults = DEFAULT_MODEL_PRICING_RECORD[key];

        runtimePricing[key] = {
          name: row.model_name,
          inputMultiplier: Number(row.input_multiplier ?? 0),
          outputMultiplier: Number(row.output_multiplier ?? 0),
          reasoningMultiplier: Number(row.reasoning_multiplier ?? 0),
          cacheMultiplier: Number(row.cache_multiplier ?? 0),
          provider: row.provider || defaults?.provider || 'unknown',
          modelApiName: row.model_api_name || defaults?.modelApiName || key,
          tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [...(defaults?.tags ?? [])],
          description: row.description || defaults?.description,
          apiType: row.api_type || undefined,
          sortOrder: Number(row.sort_order ?? 100),
        };
        runtimeOrder.push(key);
      }

      applyRuntimePricing(runtimePricing, runtimeOrder);
      lastPricingSyncAt = Date.now();
      log.success('Model pricing synced from DB', { modelCount: Object.keys(runtimePricing).length });
    } catch (error) {
      log.warn('Failed to sync pricing from database, using local defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
      applyRuntimePricing(DEFAULT_MODEL_PRICING_RECORD, DEFAULT_MODEL_ORDER);
      lastPricingSyncAt = Date.now();
    }

    return MODEL_PRICING;
  })();

  return pricingSyncPromise;
};

export function calculateDiamonds(
  modelKey: ModelKey,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number = 0,
  cacheTokens: number = 0
): number {
  const pricing = MODEL_PRICING[modelKey];
  if (!pricing) return 0;
  const safeInput = Math.max(0, Number(inputTokens ?? 0));
  const safeCacheHit = Math.max(0, Number(cacheTokens ?? 0));
  const cacheHit = Math.min(safeInput, safeCacheHit);
  const nonCachedInput = Math.max(0, safeInput - cacheHit);
  return Math.ceil(
    nonCachedInput * pricing.inputMultiplier +
      cacheHit * pricing.cacheMultiplier +
      Math.max(0, Number(outputTokens ?? 0)) * pricing.outputMultiplier +
      Math.max(0, Number(reasoningTokens ?? 0)) * pricing.reasoningMultiplier
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

  if (error) {
    log.error('Deduct diamonds V4 RPC error', { userId: params.userId, modelKey: params.modelKey, error: error.message });
    return { success: false, error: error.message };
  }

  const result = {
    success: Boolean(data?.success),
    error: data?.error,
    diamondsConsumed: data?.diamonds_consumed,
    totalRemaining: data?.total_remaining,
    needed: data?.needed,
    available: data?.available,
  };

  if (result.success) {
    log.info('Deduct diamonds V4 success', { userId: params.userId, modelKey: params.modelKey, diamondsConsumed: result.diamondsConsumed, totalRemaining: result.totalRemaining });
  } else {
    log.warn('Deduct diamonds V4 rejected', { userId: params.userId, modelKey: params.modelKey, error: result.error, needed: result.needed, available: result.available });
  }

  return result;
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
    log.warn('Failed to fetch user balance', { userId, error: error?.message });
    return { memberDiamonds: 0, permanentDiamonds: 0, totalDiamonds: 0 };
  }

  const effective = getEffectiveProfileDiamonds({
    member_diamonds: data.member_diamonds,
    permanent_diamonds: data.permanent_diamonds,
    membership_type: data.membership_type,
    membership_expires_at: data.membership_expires_at,
  });

  return {
    memberDiamonds: effective.memberDiamonds,
    permanentDiamonds: effective.permanentDiamonds,
    totalDiamonds: effective.totalDiamonds,
    membershipType: effective.membershipType,
    membershipExpiresAt: effective.membershipExpiresAt,
  };
}
