---
name: "claude.skill"
description: "Helps configure and troubleshoot Claude/Anthropic in this project (keys, models, errors). Invoke when user wants to use Claude models or Anthropic calls fail."
---

# Claude Skill

## 适用场景

- 需要在本项目中启用/切换 Claude（Haiku/Sonnet/Opus）
- AI 调用报错（401/403/429/超时/模型不可用）需要快速定位
- 需要写更适合 Claude 的提示词（更稳定的结构化输出）

## 本项目里 Claude 的关键点

- 模型键：`claude-haiku` / `claude-sonnet` / `claude-opus`
- 开发态 AI 入口：`/api/ai/generate`、`/api/ai/summarize`（由 Vite 中间件代理到 [aiProxy.js](file:///Users/liyuhang/Desktop/trae_projects/simplechat/server/aiProxy.js)）
- 读取的密钥环境变量：
  - `ANTHROPIC_API_KEY`（优先）
  - 或 `VITE_ANTHROPIC_API_KEY`

## 常见故障排查清单

1. 先验证路由与请求链路
   - 打开 `/validate`，点击 “Supabase 会话 / AI 生成 / AI 总结”
2. 401 鉴权失败
   - 检查 `ANTHROPIC_API_KEY` 是否存在且未带引号/空格
   - 修改 `.env` 后必须重启 `npm run dev`
3. 429 限流 / 请求过多
   - 降低并发、减少输出长度、稍后重试
4. 生成超时或响应慢
   - 减少上下文长度、降低 `AI_MAX_OUTPUT_TOKENS`（如已配置）
5. 模型不可用/权限不足
   - 核对模型键与 Anthropic 账号权限

## Claude 提示词模板（推荐）

### 结构化输出（JSON）

```
你是一个严格的 JSON 生成器。
任务：{任务描述}
约束：
1) 只输出 JSON，不要解释
2) 字段必须包含：{字段列表}
3) 如无法确定，用空字符串或 null
输入：{用户输入}
```

### 长文写作（分步但不暴露思考过程）

```
你是小说写作助手。
请按以下格式输出：
1) 结果正文（可直接使用）
2) 结尾给出 3 条可选优化方向（简短要点）
主题：...
风格：...
长度：...
```
