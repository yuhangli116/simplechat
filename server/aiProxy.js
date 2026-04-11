const normalizeApiKey = (apiKey) => apiKey?.trim().replace(/^['"`]|['"`]$/g, '');

const getEnvValue = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return normalizeApiKey(value);
    }
  }
  return '';
};

const getModelRegistry = () => ({
  deepseek: {
    type: 'openai-compatible',
    provider: 'deepseek',
    modelName: 'deepseek-chat',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: getEnvValue('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY'),
  },
  'gpt-4': {
    type: 'openai-compatible',
    provider: 'openai',
    modelName: 'gpt-4-turbo',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: getEnvValue('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'),
  },
  qwen: {
    type: 'openai-compatible',
    provider: 'qwen',
    modelName: 'qwen-turbo',
    baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: getEnvValue('QWEN_API_KEY', 'VITE_QWEN_API_KEY'),
  },
  gemini: {
    type: 'openai-compatible',
    provider: 'openrouter',
    modelName: 'google/gemini-pro',
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: getEnvValue('OPENROUTER_API_KEY', 'VITE_OPENROUTER_API_KEY'),
    extraHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': process.env.APP_NAME || 'simplechat',
    },
  },
  claude: {
    type: 'anthropic',
    provider: 'anthropic',
    modelName: 'claude-3-opus-20240229',
    apiKey: getEnvValue('ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'),
  },
});

const normalizeUsage = (usage) => ({
  input_tokens:
    usage?.prompt_tokens ??
    usage?.input_tokens ??
    usage?.promptTokens ??
    0,
  output_tokens:
    usage?.completion_tokens ??
    usage?.output_tokens ??
    usage?.completionTokens ??
    0,
});

const extractMessageContent = (content) => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item?.type === 'text') {
          return item.text || '';
        }
        return '';
      })
      .join('');
  }

  return '';
};

const requestOpenAICompatible = async ({ config, messages, temperature }) => {
  if (!config.apiKey) {
    throw new Error(`${config.provider} API Key is missing`);
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(config.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      temperature,
      stream: false,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return {
    content: data?.choices?.[0]?.message?.content || '',
    usage: normalizeUsage(data?.usage),
    raw: data,
  };
};

const requestAnthropic = async ({ config, messages, temperature }) => {
  if (!config.apiKey) {
    throw new Error('Anthropic API Key is missing');
  }

  const systemMessage = messages.find((message) => message.role === 'system')?.content || '';
  const userMessages = messages.filter((message) => message.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelName,
      max_tokens: 2048,
      temperature,
      system: systemMessage,
      messages: userMessages,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return {
    content: extractMessageContent(data?.content),
    usage: normalizeUsage(data?.usage),
    raw: data,
  };
};

const requestModel = async ({ model, messages, temperature = 0.7 }) => {
  const modelRegistry = getModelRegistry();
  const config = modelRegistry[model];

  if (!config) {
    throw new Error(`Model ${model} not supported`);
  }

  if (config.type === 'anthropic') {
    return requestAnthropic({ config, messages, temperature });
  }

  return requestOpenAICompatible({ config, messages, temperature });
};

export const generateTextServer = async ({ prompt, model, context }) => {
  const messages = [
    {
      role: 'system',
      content:
        '你是一个专业的小说续写助手。请严格参考以下背景设定与前文剧情（Context），确保新生成的情节或节点符合既有的人物性格与剧情发展逻辑，同时满足用户的具体要求（Task）。如果要求生成思维导图子节点，请返回 JSON。',
    },
    {
      role: 'user',
      content: `Context: ${context || '无'}\n\nTask: ${prompt}`,
    },
  ];

  return requestModel({
    model,
    messages,
    temperature: 0.7,
  });
};

export const summarizeContextServer = async ({ context }) => {
  const messages = [
    {
      role: 'system',
      content: '你是一个专业的剧情与设定提炼助手。请提取以下章节或设定中的核心剧情、角色状态和关键设定，生成一份字数精简的背景摘要。',
    },
    {
      role: 'user',
      content: `需要总结的上下文：\n${context}`,
    },
  ];

  return requestModel({
    model: 'deepseek',
    messages,
    temperature: 0.3,
  });
};

export const parseRequestBody = async (req) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
};

export const sendJson = (res, statusCode, payload) => {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(payload);
  }

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};
