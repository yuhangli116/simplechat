---
name: "bugfix.triage"
description: "Standard bug triage + fix workflow for this repo (repro, locate, patch, verify). Invoke when user reports a bug or asks to optimize after finding issues."
---

# Bugfix Triage

## 输入（尽量收集）

- 复现路径（从哪个页面到哪个操作）
- 期望行为 vs 实际行为
- 控制台报错/网络请求失败信息（如果有）
- 是否登录、使用的模型、是否与计费/AI 调用相关

## 处理步骤

1. 复现最小步骤
   - 优先用 `/validate` 或最短路径触发问题
2. 快速定位代码
   - 路由与页面： [App.tsx](file:///Users/liyuhang/Desktop/trae_projects/simplechat/src/App.tsx) + `src/pages/**`
   - 状态：`src/store/**`
   - 接口：`src/services/**` + `server/aiProxy.js`
3. 修复策略
   - 先修 “必现崩溃/阻断流程”，再做体验优化
4. 轻量验证
   - IDE 诊断（TS/ESLint）
   - 手动验证 `/validate` + 相关业务页面

## 输出格式（建议）

- 根因：一句话定位到具体模块/函数
- 修复：改了哪些文件、为何这样改
- 验证：怎么证明已修复（点击路径/请求结果）
