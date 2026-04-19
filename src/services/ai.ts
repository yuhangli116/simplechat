import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

interface AIResponse {
  content: string;
  error?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_cost: number;
  };
}

interface AIRequest {
  prompt: string;
  model: 'deepseek' | 'gpt-4' | 'gemini' | 'qwen' | 'claude';
  context?: string;
  userId?: string; // Required for billing
}

export const MODEL_PRICING = {
  'deepseek': {
    name: 'DeepSeek 标准版',
    input: 1,  // 1 Diamond / Token
    output: 1, // 1 Diamond / Token
    provider: 'deepseek',
    modelName: 'deepseek-chat',
    tags: ['免费试用', '效果一般']
  },
  'gpt-4': {
    name: 'GPT-4 Turbo',
    input: 30,  
    output: 60,
    provider: 'openai',
    modelName: 'gpt-4-turbo', 
    tags: ['推荐', '旗舰', '思考']
  },
  'claude': {
    name: 'Claude 3 Opus',
    input: 30,  
    output: 60,
    provider: 'anthropic',
    modelName: 'claude-3-opus-20240229',
    tags: ['推荐', '旗舰', '思考']
  },
  'qwen': {
    name: '通义千问 Turbo',
    input: 1,   
    output: 1,
    provider: 'qwen',
    modelName: 'qwen-turbo',
    tags: ['国产', '高性价比']
  },
  'gemini': {
    name: 'Gemini Pro',
    input: 1,
    output: 1,
    provider: 'openai',
    modelName: 'google/gemini-pro',
    tags: ['Google']
  }
};

const estimateTokens = (text: string) => Math.ceil(text.length / 1.5);
const GUEST_BALANCE_KEY = 'guest-diamond-balance';
const GUEST_DEFAULT_BALANCE = 9999;

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getGuestBalance = () => {
  if (typeof window === 'undefined') return GUEST_DEFAULT_BALANCE;
  const raw = localStorage.getItem(GUEST_BALANCE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : GUEST_DEFAULT_BALANCE;
};

const updateGuestBalance = (nextBalance: number) => {
  const safeBalance = Math.max(0, Math.floor(nextBalance));

  if (typeof window !== 'undefined') {
    localStorage.setItem(GUEST_BALANCE_KEY, String(safeBalance));
  }

  const { profile, setDiamondBalance, setProfile } = useAuthStore.getState();
  setDiamondBalance(safeBalance);
  if (profile?.id === 'guest') {
    setProfile({ ...profile, diamond_balance: safeBalance });
  }
};

const callAIEndpoint = async (
  endpoint: '/api/ai/generate' | '/api/ai/summarize',
  payload: Record<string, unknown>
): Promise<AIResponse> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  };
};

const getFriendlyErrorMessage = (error: any, provider: string): string => {
  const msg = error?.message || '';
  
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
  async summarizeContext(context: string, userId?: string): Promise<AIResponse> {
    if (!context || context.length < 10) return { content: context };

    const modelKey: keyof typeof MODEL_PRICING = 'deepseek';
    const config = MODEL_PRICING[modelKey];

    try {
      const response = await callAIEndpoint('/api/ai/summarize', { context });
      const content = response.content;

      if (userId) {
        const promptTokens = response.usage?.input_tokens ?? estimateTokens(context);
        const completionTokens = response.usage?.output_tokens ?? estimateTokens(content);
        const totalCost = Math.ceil(promptTokens * config.input + completionTokens * config.output);
        const canUseServerBilling = isUuid(userId);

        if (canUseServerBilling) {
          const { data: deductOk, error: deductError } = await supabase.rpc('deduct_diamonds', {
            p_user_id: userId,
            p_cost: totalCost,
            p_model_name: config.name + ' (总结)',
            p_input_tokens: promptTokens,
            p_output_tokens: completionTokens
          });

          if (deductError) {
            console.error('Summarization Billing Error:', deductError);
          } else if (deductOk === false) {
            return { content: '', error: '您的星石余额不足，请充值后继续使用。' };
          }
        } else {
          const currentGuestBalance = getGuestBalance();
          if (currentGuestBalance < totalCost) {
            return { content: '', error: '访客体验余额不足，请减少生成内容后重试。' };
          }
          updateGuestBalance(currentGuestBalance - totalCost);
        }

        return {
          content,
          usage: {
            input_tokens: promptTokens,
            output_tokens: completionTokens,
            total_cost: totalCost
          }
        };
      }

      return { content };
    } catch (error: any) {
      console.error('Summarization Error:', error);
      return { content: '', error: '总结上下文失败：' + (error.message || '未知错误') };
    }
  },

  async generateText(request: AIRequest): Promise<AIResponse> {
    const config = MODEL_PRICING[request.model];
    if (!config) return { content: '', error: `Model ${request.model} not supported` };

    const canUseServerBilling = Boolean(request.userId && isUuid(request.userId));

    if (request.userId) {
      if (canUseServerBilling) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('diamond_balance')
          .eq('id', request.userId)
          .single();

        if (profile && profile.diamond_balance <= 0) {
          return { content: '', error: '您的星石余额不足，请充值后继续使用。' };
        }
      } else {
        const guestBalance = getGuestBalance();
        if (guestBalance <= 0) {
          return { content: '', error: '访客体验余额不足，请减少生成内容后重试。' };
        }
      }
    }

    try {
      const response = await callAIEndpoint('/api/ai/generate', {
        prompt: request.prompt,
        model: request.model,
        context: request.context,
      });
      const content = response.content;

      if (request.userId) {
        const promptTokens =
          response.usage?.input_tokens ??
          estimateTokens(`${request.context || ''}${request.prompt}`);
        const completionTokens =
          response.usage?.output_tokens ??
          estimateTokens(content);
        const totalCost = Math.ceil(promptTokens * config.input + completionTokens * config.output);

        if (canUseServerBilling) {
          const { data: deductOk, error: deductError } = await supabase.rpc('deduct_diamonds', {
            p_user_id: request.userId,
            p_cost: totalCost,
            p_model_name: config.name,
            p_input_tokens: promptTokens,
            p_output_tokens: completionTokens
          });

          if (deductError) {
            console.error('Billing Error:', deductError);
          } else if (deductOk === false) {
            return { content: '', error: '您的星石余额不足，请充值后继续使用。' };
          }
        } else {
          const currentGuestBalance = getGuestBalance();
          if (currentGuestBalance < totalCost) {
            return { content: '', error: '访客体验余额不足，请减少生成内容后重试。' };
          }
          updateGuestBalance(currentGuestBalance - totalCost);
        }

        return {
          content,
          usage: {
            input_tokens: promptTokens,
            output_tokens: completionTokens,
            total_cost: totalCost
          }
        };
      }

      return { content };

    } catch (error: any) {
      console.error('AI Generation Error:', error);
      const friendlyMsg = getFriendlyErrorMessage(error, config.provider);
      return { 
        content: '', 
        error: friendlyMsg 
      };
    }
  },

  async generateOutline(prompt: string): Promise<{ nodes: Array<{ id: string; label: string }> }> {
    try {
      const response = await callAIEndpoint('/api/ai/generate', {
        model: 'deepseek',
        context: '无',
        prompt: `你是一个专业的小说大纲生成助手。请为这个主题生成 JSON 数组，每一项都包含 id 和 label 字段，只返回 JSON：${prompt}`,
      });
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
