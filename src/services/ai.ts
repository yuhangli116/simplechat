import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase';
import { calculateDiamonds, MODEL_PRICING, syncModelPricingFromDb, type ModelKey } from '@/services/billing';

interface AIResponse {
  content: string;
  error?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;
    cache_hit_tokens?: number;
    total_cost: number;
  };
  billing?: {
    totalRemaining?: number;
    warning?: string;
    estimatedRequired?: number;
    available?: number;
  };
}

interface AIRequest {
  prompt: string;
  model: ModelKey;
  context?: string;
  userId?: string; // Required for billing
  billingGroupId?: string;
}

const estimateTokens = (text: string) => {
  const normalized = text.trim();
  if (!normalized) return 0;

  const cjkChars = (normalized.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const latinWords = (normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) || []).length;
  const numbers = (normalized.match(/\d+(?:\.\d+)?/g) || []).length;
  const punctuation = (normalized.match(/[^\p{L}\p{N}\s]/gu) || []).length;
  const whitespace = (normalized.match(/\s+/g) || []).length;

  return Math.max(
    1,
    Math.ceil(
      cjkChars * 1.15 +
        latinWords * 1.3 +
        numbers * 0.6 +
        punctuation * 0.35 +
        whitespace * 0.1
    )
  );
};

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const applyServerBalance = (response: AIResponse) => {
  const totalRemaining = response.billing?.totalRemaining;
  if (typeof totalRemaining !== 'number') return;

  const { setDiamondBalance, profile, setProfile } = useAuthStore.getState();
  setDiamondBalance(totalRemaining);
  if (profile) {
    setProfile({ ...profile, diamond_balance: totalRemaining });
  }
};

const getStoreUserId = () => {
  const storeUserId = useAuthStore.getState().user?.id;
  return typeof storeUserId === 'string' ? storeUserId : '';
};

const resolveUserId = (userId?: string) => {
  if (userId && isUuid(userId)) return userId;
  const fallback = getStoreUserId();
  if (fallback && isUuid(fallback)) return fallback;
  return '';
};

const getAccessToken = async () => {
  const token = useAuthStore.getState().session?.access_token;
  if (token) return token;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
};

const callAIEndpoint = async (
  endpoint: '/api/ai/generate' | '/api/ai/summarize',
  payload: Record<string, unknown>
): Promise<AIResponse> => {
  const accessToken = await getAccessToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = result?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    content: result?.content || '',
    error: result?.error,
    usage: result?.usage,
    billing: result?.billing,
  };
};

const getFriendlyErrorMessage = (error: any, provider: string): string => {
  const msg = error?.message || '';

  if (msg.includes('模型定价配置不存在')) {
    return `计费配置缺失：${msg}。请确认已在当前 Supabase 项目执行模型定价迁移（model_pricing 表包含该 model_key 且 is_active=true）。`;
  }
  
  if (
    msg.includes('401') ||
    msg.includes('Authentication Fails') ||
    msg.includes('authentication_error') ||
    msg.includes('api key') ||
    msg.includes('API key')
  ) {
    if (provider === 'deepseek') {
      return '鉴权失败 (deepseek)：当前 API Key 被 DeepSeek 判定为无效。请确认它是 DeepSeek 开放平台生成的 API Key，而不是网页登录凭证；如果刚修改了 .env，请重启开发服务器后再试';
    }
    return `鉴权失败 (${provider})：请检查 API Key 是否正确配置`;
  }
  
  if (msg.includes('402') || msg.includes('Insufficient Balance')) {
    if (provider === 'deepseek') {
      return `余额不足 (${provider})：DeepSeek 即使是新用户也需要充值才能使用 API（不提供免费 API 额度）。请前往 deepseek.com 充值，或切换其他模型。`;
    }
    return `余额不足 (${provider})：您的账户余额已用尽，请充值或检查免费额度。`;
  }

  if (msg.includes('403') || msg.includes('Access to model denied')) {
    if (provider === 'qwen') {
      return `权限拒绝 (${provider})：请检查 API Key 是否已开通该模型权限，或模型名称是否正确（尝试使用 qwen-turbo 或 qwen-plus）。`;
    }
    return `权限拒绝 (${provider})：您没有访问该模型的权限。`;
  }

  if (msg.includes('404')) {
    return `模型不存在 (${provider})：您的账号可能没有权限访问该模型，或者模型名称错误。请尝试切换其他模型。`;
  }

  if (msg.includes('429')) {
    return `请求过多 (${provider})：已达到调用频率限制，请稍后再试。`;
  }

  return `AI 生成出错 (${provider}): ${msg.slice(0, 100)}...`;
};

export const aiService = {
  async summarizeContext(
    context: string,
    userId?: string,
    model: ModelKey = 'deepseek-v4-flash',
    billingGroupId?: string
  ): Promise<AIResponse> {
    if (!context || context.length < 10) return { content: context };
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId) {
      return { content: '', error: '请先登录后再使用 AI 创作功能。' };
    }

    await syncModelPricingFromDb();

    const modelKey: ModelKey = model;
    const config = MODEL_PRICING[modelKey];

    try {
      const response = await callAIEndpoint('/api/ai/summarize', {
        context,
        model: modelKey,
        userId: resolvedUserId,
        billingGroupId,
      });
      const content = response.content;
      const promptTokens = response.usage?.input_tokens ?? estimateTokens(context);
      const completionTokens = response.usage?.output_tokens ?? estimateTokens(content);
      const reasoningTokens = response.usage?.reasoning_tokens ?? 0;
      const cacheHitTokens = response.usage?.cache_hit_tokens ?? 0;
      const totalCost =
        response.usage?.total_cost ??
        calculateDiamonds(modelKey, promptTokens, completionTokens, reasoningTokens, cacheHitTokens);

      applyServerBalance(response);
      if (typeof window !== 'undefined' && !response.error) {
        window.dispatchEvent(new CustomEvent('welfare:ai_used'));
      }

      return {
        content,
        error: response.error,
        billing: response.billing,
        usage: {
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          reasoning_tokens: reasoningTokens,
          cache_hit_tokens: cacheHitTokens,
          total_cost: totalCost,
        },
      };
    } catch (error: any) {
      console.error('Summarization Error:', error);
      return { content: '', error: '总结上下文失败：' + (error.message || '未知错误') };
    }
  },

  async generateText(request: AIRequest): Promise<AIResponse> {
    const resolvedUserId = resolveUserId(request.userId);
    if (!resolvedUserId) {
      return { content: '', error: '请先登录后再使用 AI 创作功能。' };
    }

    await syncModelPricingFromDb();
    const config = MODEL_PRICING[request.model];
    if (!config) return { content: '', error: `Model ${request.model} not supported` };

    try {
      const response = await callAIEndpoint('/api/ai/generate', {
        prompt: request.prompt,
        model: request.model,
        context: request.context,
        userId: resolvedUserId,
        billingGroupId: request.billingGroupId,
      });
      const content = response.content;
      const promptTokens =
        response.usage?.input_tokens ??
        estimateTokens(`${request.context || ''}\n${request.prompt}`);
      const completionTokens = response.usage?.output_tokens ?? estimateTokens(content);
      const reasoningTokens = response.usage?.reasoning_tokens ?? 0;
      const cacheHitTokens = response.usage?.cache_hit_tokens ?? 0;
      const totalCost =
        response.usage?.total_cost ??
        calculateDiamonds(request.model, promptTokens, completionTokens, reasoningTokens, cacheHitTokens);

      applyServerBalance(response);
      if (typeof window !== 'undefined' && !response.error) {
        window.dispatchEvent(new CustomEvent('welfare:ai_used'));
      }

      return {
        content,
        error: response.error,
        billing: response.billing,
        usage: {
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          reasoning_tokens: reasoningTokens,
          cache_hit_tokens: cacheHitTokens,
          total_cost: totalCost,
        },
      };

    } catch (error: any) {
      console.error('AI Generation Error:', error);
      const friendlyMsg = getFriendlyErrorMessage(error, config.provider);
      return { 
        content: '', 
        error: friendlyMsg 
      };
    }
  },

  async generateOutline(
    prompt: string,
    userId?: string,
    model: ModelKey = 'deepseek-v4-flash'
  ): Promise<{ nodes: Array<{ id: string; label: string }> }> {
    try {
      const response = await this.generateText({
        model,
        userId,
        context: '无',
        prompt: `你是一个专业的小说大纲生成助手。请为这个主题生成 JSON 数组，每一项都包含 id 和 label 字段，只返回 JSON：${prompt}`,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const text = response.content || '';
      const nodes = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');

      return { nodes };
    } catch (error) {
      console.error('Outline Generation Error:', error);
      return {
        nodes: [
          { id: '1', label: 'Chapter 1 (Fallback)' },
          { id: '2', label: 'Chapter 2 (Fallback)' }
        ]
      };
    }
  }
};

export { MODEL_PRICING };
