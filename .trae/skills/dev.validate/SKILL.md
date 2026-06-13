---
name: "dev.validate"
description: "Provides a fast smoke-test workflow for this repo using the /validate page and basic diagnostics. Invoke when restarting dev server, validating core flows, or triaging regressions."
---

# Dev Validate

## 目标

用最短路径验证“能跑、能登录、能弹 Toast、能调用 AI 接口”，并把失败点映射到代码位置，便于快速修复。

## 推荐流程

1. 启动开发服务器
   - `npm run dev`
2. 打开验证页
   - 访问 `/validate`
3. 逐项点击
   - Toast：确认 UI 反馈链路正常
   - Supabase 会话：确认 auth session 读取正常
   - AI 生成 / AI 总结：确认 `/api/ai/*` 请求链路正常（需要登录）

## 失败点定位

- `/validate` 能打开但按钮无反应
  - 重点看组件：`Validate`（位于 [placeholders.tsx](file:///Users/liyuhang/Desktop/trae_projects/simplechat/src/pages/placeholders.tsx)）
  - 重点看 Toast：`useToastStore`（[useToastStore.ts](file:///Users/liyuhang/Desktop/trae_projects/simplechat/src/store/useToastStore.ts)）
- 会话读取失败
  - 重点看 Supabase 初始化：[supabase.ts](file:///Users/liyuhang/Desktop/trae_projects/simplechat/src/lib/supabase.ts)
- AI 生成/总结失败
  - 前端调用封装：[ai.ts](file:///Users/liyuhang/Desktop/trae_projects/simplechat/src/services/ai.ts)
  - 开发态代理实现：[aiProxy.js](file:///Users/liyuhang/Desktop/trae_projects/simplechat/server/aiProxy.js)
  - 模型与定价： [billing.ts](file:///Users/liyuhang/Desktop/trae_projects/simplechat/src/services/billing.ts)

## 常见结论

- 未登录导致 AI 按钮提示错误：符合预期（先登录）
- 401/403：优先查对应 Provider 的 API Key 环境变量 + 重启 dev server
- 定价表缺失：执行 Supabase migrations 并确保 `model_pricing` 有数据
