import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { supabase } from '@/lib/supabase';

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

const API_KEYS = {
  openai: import.meta.env.VITE_OPENAI_API_KEY,
  anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY,
  deepseek: import.meta.env.VITE_DEEPSEEK_API_KEY,
  qwen: import.meta.env.VITE_QWEN_API_KEY,
};

// Pricing Configuration (Diamond Cost per Token)
// Calibrated Rates: DeepSeek (1/2), GPT-4 (30/60)
export const MODEL_PRICING = {
  'deepseek': {
    name: 'DeepSeek 标准版',
    input: 1,  // 1 Diamond / Token
    output: 2, // 2 Diamonds / Token
    provider: 'deepseek',
    modelName: 'deepseek-chat',
    tags: ['免费试用', '效果一般']
  },
  'gpt-4': {
    name: 'GPT-4 Turbo',
    input: 30,  // Calibrated: ~30x DeepSeek
    output: 60,
    provider: 'openai',
    modelName: 'gpt-4-turbo', 
    tags: ['推荐', '旗舰', '思考']
  },
  'claude': {
    name: 'Claude 3 Opus',
    input: 30,  // Calibrated: ~30x DeepSeek
    output: 60,
    provider: 'anthropic',
    modelName: 'claude-3-opus-20240229',
    tags: ['推荐', '旗舰', '思考']
  },
  'qwen': {
    name: '通义千问 Turbo',
    input: 2,   // Calibrated: ~2x DeepSeek
    output: 4,
    provider: 'qwen',
    modelName: 'qwen-turbo',
    tags: ['国产', '高性价比']
  },
  'gemini': {
    name: 'Gemini Pro',
    input: 2,
    output: 4,
    provider: 'openai',
    modelName: 'google/gemini-pro',
    tags: ['Google']
  }
};

const getFriendlyErrorMessage = (error: any, provider: string): string => {
  const msg = error?.message || '';
  
  if (msg.includes('401')) {
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
  async generateText(request: AIRequest): Promise<AIResponse> {
    console.log(`Generating text with model: ${request.model}`);
    
    const config = MODEL_PRICING[request.model];
    if (!config) return { content: '', error: `Model ${request.model} not supported` };

    // 1. Check Balance (Optimistic Check)
    if (request.userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('diamond_balance')
        .eq('id', request.userId)
        .single();
      
      if (profile && profile.diamond_balance <= 0) {
        return { content: '', error: '您的星石余额不足，请充值后继续使用。' };
      }
    }

    try {
      let model;

      // Initialize appropriate LangChain model
      if (config.provider === 'openai') {
        if (!API_KEYS.openai) throw new Error('OpenAI API Key is missing');
        model = new ChatOpenAI({
          apiKey: API_KEYS.openai,
          modelName: config.modelName === 'gpt-4-turbo' ? 'gpt-3.5-turbo' : config.modelName, // Temp fallback
          temperature: 0.7,
        });
      } else if (config.provider === 'anthropic') {
        if (!API_KEYS.anthropic) throw new Error('Anthropic API Key is missing');
        model = new ChatAnthropic({
          apiKey: API_KEYS.anthropic,
          modelName: config.modelName,
          temperature: 0.7,
        });
      } else if (config.provider === 'deepseek') {
        if (!API_KEYS.deepseek) throw new Error('DeepSeek API Key is missing');
        model = new ChatOpenAI({
          apiKey: API_KEYS.deepseek,
          modelName: config.modelName,
          configuration: {
            baseURL: "https://api.deepseek.com",
          },
          temperature: 0.7,
        });
      } else if (config.provider === 'qwen') {
        if (!API_KEYS.qwen) throw new Error('Qwen API Key is missing');
        model = new ChatOpenAI({
          apiKey: API_KEYS.qwen,
          modelName: config.modelName,
          configuration: {
            baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          },
          temperature: 0.7,
        });
      } else {
        throw new Error(`Provider ${config.provider} not implemented`);
      }

      // Prepare messages
      const messages = [
        new SystemMessage("You are a professional creative writing assistant. Continue the story based on the context provided. Maintain the style and tone."),
        new HumanMessage(`Context: ${request.context || 'No previous context'}\n\nTask: ${request.prompt}`)
      ];

      // Execute generation
      const response = await model.invoke(messages);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // 2. Calculate Cost & Deduct Balance
      if (request.userId) {
        // Estimate tokens (LangChain response usage is sometimes missing, so we estimate roughly if needed)
        // 1 Chinese char ~= 1-2 tokens. Simple estimation: length.
        const inputTokens = Math.ceil((request.context?.length || 0 + request.prompt.length) / 1.5);
        const outputTokens = Math.ceil(content.length / 1.5);
        
        const usageFromResponse = (response as any)?.response_metadata?.tokenUsage;
        const promptTokens =
          usageFromResponse?.promptTokens ??
          usageFromResponse?.prompt_tokens ??
          usageFromResponse?.input_tokens ??
          inputTokens;
        const completionTokens =
          usageFromResponse?.completionTokens ??
          usageFromResponse?.completion_tokens ??
          usageFromResponse?.output_tokens ??
          outputTokens;

        const totalCost = Math.ceil(promptTokens * config.input + completionTokens * config.output);

        // Call RPC to deduct
        const { error: deductError } = await supabase.rpc('deduct_diamonds', {
          p_user_id: request.userId,
          p_cost: totalCost,
          p_model_name: config.name,
          p_input_tokens: promptTokens,
          p_output_tokens: completionTokens
        });

        if (deductError) {
          console.error('Billing Error:', deductError);
          // We don't block the user content if billing fails, but log it
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

  async generateOutline(prompt: string): Promise<any> {
    try {
      if (!API_KEYS.openai) {
        console.warn('OpenAI Key missing for outline generation, using fallback');
        throw new Error('OpenAI Key missing');
      }
      
      const model = new ChatOpenAI({
        apiKey: API_KEYS.openai,
        modelName: 'gpt-3.5-turbo',
        temperature: 0.3,
      });

      const response = await model.invoke([
        new SystemMessage("You are an expert novel plotter. Generate a JSON array of chapter objects. Each object must have 'id' (string) and 'label' (string) properties. Return ONLY the JSON array."),
        new HumanMessage(`Create an outline for: ${prompt}`)
      ]);

      const text = typeof response.content === 'string' ? response.content : '';
      const nodes = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
      
      return { nodes };
    } catch (e) {
      console.error('Outline Generation Error:', e);
      return {
        nodes: [
          { id: '1', label: 'Chapter 1 (Fallback)' },
          { id: '2', label: 'Chapter 2 (Fallback)' }
        ]
      };
    }
  }
};
