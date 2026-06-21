import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase';
import { calculateDiamonds, MODEL_PRICING, syncModelPricingFromDb, type ModelKey } from '@/services/billing';
import { createLogger } from '@/lib/logger';

const log = createLogger('AIService');

interface AIResponse {
  content: string;
  error?: string;
  savedChapterContent?: string;
  savedToChapter?: boolean;
  generatedHtml?: string;
  previewChapterContent?: string;
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
  traceId?: string;
  workId?: string;
  chapterId?: string;
  chapterTitle?: string;
  baseContentHtml?: string;
  deferChapterSave?: boolean;
}

interface AIStreamCallbacks {
  onPhase?: (event: { phase?: string; label?: string; generatedChars?: number }) => void;
  onDelta?: (delta: string, event: { generatedChars?: number; label?: string }) => void;
  onError?: (message: string) => void;
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
  log.info('Server balance synced', { totalRemaining });
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
  log.info('Calling AI endpoint', { endpoint, model: payload.model as string, hasToken: !!accessToken });

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
    log.error('AI endpoint returned error', { endpoint, status: response.status, error: message?.slice(0, 200) });
    throw new Error(message);
  }

  return {
    content: result?.content || '',
    error: result?.error,
    savedChapterContent: result?.savedChapterContent,
    savedToChapter: result?.savedToChapter,
    generatedHtml: result?.generatedHtml,
    previewChapterContent: result?.previewChapterContent,
    usage: result?.usage,
    billing: result?.billing,
  };
};

const parseNdjsonStream = async (
  response: Response,
  onEvent: (event: any) => void
) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前浏览器不支持流式读取');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed));
    }
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  if (tail) {
    onEvent(JSON.parse(tail));
  }
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

  if (msg.toLowerCase().includes('fetch failed') || msg.includes('网络异常')) {
    return `网络连接异常 (${provider})：AI 生成或扣费确认过程中网络中断，请稍后重试。`;
  }

  return `AI 生成出错 (${provider}): ${msg.slice(0, 100)}...`;
};

export const aiService = {
  async summarizeContext(
    context: string,
    userId?: string,
    model: ModelKey = 'deepseek-v4-flash',
    billingGroupId?: string,
    traceId?: string
  ): Promise<AIResponse> {
    if (!context || context.length < 10) return { content: context };
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId) {
      log.warn('Summarize rejected: user not authenticated');
      return { content: '', error: '请先登录后再使用 AI 创作功能。' };
    }

    log.info('Summarize context started', { traceId, model, contextLength: context.length, billingGroupId });
    await syncModelPricingFromDb();

    const modelKey: ModelKey = model;
    const config = MODEL_PRICING[modelKey];

    try {
      const response = await callAIEndpoint('/api/ai/summarize', {
        context,
        model: modelKey,
        userId: resolvedUserId,
        billingGroupId,
        traceId,
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

      if (response.error) {
        log.warn('Summarize context returned error', { traceId, model, error: response.error?.slice(0, 200) });
      } else {
        log.success('Summarize context completed', { traceId, model, promptTokens, completionTokens, totalCost });
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
      log.error('Summarize context failed', { traceId, model }, error);
      return { content: '', error: '总结上下文失败：' + (error.message || '未知错误') };
    }
  },

  async generateText(request: AIRequest): Promise<AIResponse> {
    const resolvedUserId = resolveUserId(request.userId);
    if (!resolvedUserId) {
      log.warn('Generate text rejected: user not authenticated');
      return { content: '', error: '请先登录后再使用 AI 创作功能。' };
    }

    await syncModelPricingFromDb();
    const config = MODEL_PRICING[request.model];
    if (!config) {
      log.warn('Generate text rejected: model not supported', { model: request.model });
      return { content: '', error: `Model ${request.model} not supported` };
    }

    log.info('Generate text started', { model: request.model, promptLength: request.prompt?.length, contextLength: request.context?.length });

    try {
      const response = await callAIEndpoint('/api/ai/generate', {
        prompt: request.prompt,
        model: request.model,
        context: request.context,
        userId: resolvedUserId,
        billingGroupId: request.billingGroupId,
        workId: request.workId,
        chapterId: request.chapterId,
        chapterTitle: request.chapterTitle,
        baseContentHtml: request.baseContentHtml,
        deferChapterSave: request.deferChapterSave,
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

      if (response.error) {
        log.warn('Generate text returned error', { model: request.model, error: response.error?.slice(0, 200) });
      } else {
        log.success('Generate text completed', {
          model: request.model,
          promptTokens,
          completionTokens,
          totalCost,
          contentLength: content?.length,
        });
      }

      return {
        content,
        error: response.error,
        savedChapterContent: response.savedChapterContent,
        savedToChapter: response.savedToChapter,
        generatedHtml: response.generatedHtml,
        previewChapterContent: response.previewChapterContent,
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
      const friendlyMsg = getFriendlyErrorMessage(error, config.provider);
      log.error('Generate text failed', { model: request.model, provider: config.provider }, error);
      return { 
        content: '', 
        error: friendlyMsg 
      };
    }
  },

  async generateTextStream(request: AIRequest, callbacks: AIStreamCallbacks = {}): Promise<AIResponse> {
    const resolvedUserId = resolveUserId(request.userId);
    if (!resolvedUserId) {
      log.warn('Generate text stream rejected: user not authenticated');
      return { content: '', error: '请先登录后再使用 AI 创作功能。' };
    }

    await syncModelPricingFromDb();
    const config = MODEL_PRICING[request.model];
    if (!config) {
      log.warn('Generate text stream rejected: model not supported', { model: request.model });
      return { content: '', error: `Model ${request.model} not supported` };
    }

    const accessToken = await getAccessToken();
    let streamedContent = '';
    let finalResponse: AIResponse | null = null;
    let streamError = '';
    let firstDeltaAt = 0;
    const startedAt = performance.now();

    log.info('Generate text stream started', {
      traceId: request.traceId,
      model: request.model,
      promptLength: request.prompt?.length,
      contextLength: request.context?.length,
      hasToken: !!accessToken,
    });

    try {
      const response = await fetch('/api/ai/generate-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          prompt: request.prompt,
          model: request.model,
          context: request.context,
          userId: resolvedUserId,
          billingGroupId: request.billingGroupId,
          traceId: request.traceId,
          workId: request.workId,
          chapterId: request.chapterId,
          chapterTitle: request.chapterTitle,
          baseContentHtml: request.baseContentHtml,
          deferChapterSave: request.deferChapterSave,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `HTTP ${response.status}`);
      }

      await parseNdjsonStream(response, (event) => {
        if (!event || typeof event !== 'object') return;

        if (event.type === 'phase') {
          log.info('Generate text stream phase', {
            traceId: request.traceId,
            phase: event.phase,
            label: event.label,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          callbacks.onPhase?.({
            phase: event.phase,
            label: event.label,
            generatedChars: event.generatedChars,
          });
          return;
        }

        if (event.type === 'delta') {
          const delta = String(event.delta || '');
          if (!firstDeltaAt) {
            firstDeltaAt = performance.now();
            log.info('Generate text stream first delta received', {
              traceId: request.traceId,
              firstDeltaMs: Math.round(firstDeltaAt - startedAt),
              deltaLength: delta.length,
            });
          }
          streamedContent += delta;
          callbacks.onDelta?.(delta, {
            generatedChars: event.generatedChars,
            label: event.label,
          });
          return;
        }

        if (event.type === 'error') {
          streamError = event.error || 'AI生成失败';
          log.warn('Generate text stream error event received', {
            traceId: request.traceId,
            error: streamError,
            streamedLength: streamedContent.length,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          callbacks.onError?.(streamError);
          finalResponse = {
            content: streamedContent,
            error: streamError,
            billing: event.billing,
          };
          return;
        }

        if (event.type === 'done') {
          log.info('Generate text stream done event received', {
            traceId: request.traceId,
            contentLength: event.content?.length || streamedContent.length,
            usage: event.usage,
            billing: event.billing,
            elapsedMs: Math.round(performance.now() - startedAt),
            firstDeltaMs: firstDeltaAt ? Math.round(firstDeltaAt - startedAt) : null,
          });
          finalResponse = {
            content: event.content || streamedContent,
            error: event.error,
            savedChapterContent: event.savedChapterContent,
            savedToChapter: event.savedToChapter,
            generatedHtml: event.generatedHtml,
            previewChapterContent: event.previewChapterContent,
            usage: event.usage,
            billing: event.billing,
          };
        }
      });

      const responsePayload: AIResponse = finalResponse || { content: streamedContent };
      if (responsePayload.error) {
        log.warn('Generate text stream returned error', { model: request.model, error: responsePayload.error?.slice(0, 200) });
        return responsePayload;
      }

      const promptTokens =
        responsePayload.usage?.input_tokens ??
        estimateTokens(`${request.context || ''}\n${request.prompt}`);
      const completionTokens = responsePayload.usage?.output_tokens ?? estimateTokens(responsePayload.content);
      const reasoningTokens = responsePayload.usage?.reasoning_tokens ?? 0;
      const cacheHitTokens = responsePayload.usage?.cache_hit_tokens ?? 0;
      const totalCost =
        responsePayload.usage?.total_cost ??
        calculateDiamonds(request.model, promptTokens, completionTokens, reasoningTokens, cacheHitTokens);

      const normalizedResponse = {
        ...responsePayload,
        usage: {
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          reasoning_tokens: reasoningTokens,
          cache_hit_tokens: cacheHitTokens,
          total_cost: totalCost,
        },
      };

      applyServerBalance(normalizedResponse);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('welfare:ai_used'));
      }

      log.success('Generate text stream completed', {
        traceId: request.traceId,
        model: request.model,
        promptTokens,
        completionTokens,
        totalCost,
        contentLength: normalizedResponse.content?.length,
        elapsedMs: Math.round(performance.now() - startedAt),
        firstDeltaMs: firstDeltaAt ? Math.round(firstDeltaAt - startedAt) : null,
      });

      return normalizedResponse;
    } catch (error: any) {
      const friendlyMsg = getFriendlyErrorMessage(error, config.provider);
      log.error('Generate text stream failed', { model: request.model, provider: config.provider }, error);
      callbacks.onError?.(friendlyMsg);
      return {
        content: streamedContent,
        error: friendlyMsg,
      };
    }
  },

  async generateOutline(
    prompt: string,
    userId?: string,
    model: ModelKey = 'deepseek-v4-flash'
  ): Promise<{ nodes: Array<{ id: string; label: string }> }> {
    log.info('Generate outline started', { model, promptLength: prompt?.length });
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

      log.success('Generate outline completed', { nodeCount: nodes.length });
      return { nodes };
    } catch (error) {
      log.error('Generate outline failed, using fallback', { model }, error);
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
