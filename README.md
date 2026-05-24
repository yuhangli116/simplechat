# Simple Writing (简单写作) - AI Novel Creation Platform

一个现代化的 AI 小说创作平台，集成了思维导图、富文本编辑、AI 辅助写作等功能。用户通过订阅会员获取钻石(星石)额度，调用大模型实现大纲创建、正文生成等功能。

## 核心定位

SimpleChat 本质上是一个 **AI 中转站**：
- **开发者**：从大模型厂商充值获取 Token 额度，作为网站总 Token 池
- **用户**：通过订阅会员/加油包获取钻石，作为个人小 Token 池
- **计费**：每次 AI 调用按模型倍率精确扣减钻石

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户层                                   │
│    Web Browser (React SPA)  │  访客模式 / 注册用户 / VIP会员      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       前端应用层                                  │
│  React 18 + TypeScript + Vite + Zustand + Tailwind CSS          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 工作区   │ │ 会员中心 │ │ 福利中心 │ │ 社区     │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       服务网关层                                  │
│        Vercel Serverless Functions / Vite Dev Proxy             │
│              /api/ai/generate  │  /api/ai/summarize              │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│    BaaS 服务层            │   │      AI 代理层                 │
│    Supabase               │   │    server/aiProxy.js          │
│  ┌─────────────────────┐  │   │  ┌─────────────────────────┐  │
│  │ 认证 (Auth)         │  │   │  │ DeepSeek API            │  │
│  │ 数据库 (PostgreSQL) │  │   │  │ Anthropic API           │  │
│  │ 存储 (Storage)      │  │   │  │ OpenAI API              │  │
│  └─────────────────────┘  │   │  │ OpenRouter (Gemini)     │  │
│                           │   │  └─────────────────────────┘  │
└───────────────────────────┘   └───────────────────────────────┘
```

---

## 核心功能模块

| 功能模块 | 说明 | 关键文件 |
|---------|------|---------|
| **思维导图编辑** | 小说大纲可视化编辑，支持 AI 智能生成子节点 | `src/components/MindMapEditor.tsx` |
| **正文编辑器** | 富文本编辑器，支持 AI 续写、润色、改写 | `src/pages/workspace/StoryEditor.tsx` |
| **世界观/角色** | 世界设定、角色塑造、事件细纲管理 | `src/pages/workspace/World.tsx`、`Characters.tsx` |
| **会员系统** | 订阅套餐、加油包购买 | `src/pages/Membership.tsx` |
| **计费系统** | 钻石(星石)充值、消费、记录 | `src/services/ai.ts`、`supabase/migrations/` |
| **福利系统** | 每日签到、任务奖励 | `src/pages/Welfare.tsx` |
| **社区** | 模板分享、创作交流 | `src/pages/Community.tsx` |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript |
| **构建工具** | Vite 5 |
| **路由** | React Router DOM 6 |
| **样式** | Tailwind CSS 3 + PostCSS |
| **状态管理** | Zustand 5 |
| **UI组件** | Lucide React (图标), Radix UI, Framer Motion |
| **富文本编辑** | Tiptap 2 |
| **思维导图** | ReactFlow 11 + Dagre (布局) |
| **BaaS** | Supabase (认证、数据库、存储) |
| **AI集成** | LangChain (OpenAI, Anthropic, Community) |
| **部署** | Vercel (Serverless Functions) |

---

## 计费系统详解

### 钻石(星石)流转模型

```
┌─────────────────────────────────────────────────────────────────┐
│                      网站总Token池                               │
│        开发者从大模型厂商充值获取 (API Key额度)                    │
│        DeepSeek / Claude / Gemini / GPT                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 分配/充值
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      用户钻石池                                  │
│        存储在 profiles.diamond_balance                          │
│        ┌─────────────────────────────────────────────┐          │
│        │ 来源：                                       │          │
│        │  • 注册赠送：1,000,000 钻石                  │          │
│        │  • 会员订阅：按月发放额度                    │          │
│        │  • 加油包：永久有效的钻石包                  │          │
│        │  • 签到/任务：福利奖励                       │          │
│        └─────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ AI调用消费
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      消费记录                                    │
│        usage_logs 表 (每次 AI 调用精确计费)                      │
│        扣费公式：                                                │
│        总扣除 = 输入Token×输入倍率 + 输出Token×输出倍率          │
│              + 思考Token×思考倍率 + 缓存Token×缓存倍率           │
└─────────────────────────────────────────────────────────────────┘
```

### 定价基准与倍率

**核心设计理念**：以 DeepSeek-V3 输入 Token (2元/百万) 为**基准锚定**

- **1 钻石 = 1 个基准 Token**
- **1 元人民币 = 200,000 钻石**
- 注册即送 100万 钻石 (约 5 元额度)

| 模型 | 输入倍率 | 输出倍率 | 思考倍率 | 缓存倍率 |
|------|---------|---------|---------|---------|
| DeepSeek-V3 | 1x (基准) | 4x | - | 0.4x |
| DeepSeek-R1 | 2x | 8x | 8x | 0.8x |
| Claude Sonnet 4.6 | 10.5x | 52.5x | - | 1.05x |
| Claude Opus 4.6 | 17.5x | 87.5x | - | 1.75x |
| Claude Haiku 4.5 | 3.5x | 17.5x | - | 0.35x |
| Gemini 2.5 Pro | 4.375x | 35x | - | - |
| Gemini 3.1 Pro | 7x | 42x | - | 0.7x |
| GPT-4.1 | 7x | 28x | - | - |
| GPT-5.4 | 8.75x | 35x | - | - |

### 原子扣减机制

**关键代码**: `supabase/migrations/20260506000001_billing_system_v3_2.sql`

```sql
-- 使用 WHERE 条件原子性防止超卖
UPDATE profiles
SET diamond_balance = diamond_balance - v_total_cost,
    updated_at = NOW()
WHERE id = p_user_id AND diamond_balance >= v_total_cost;

-- 如果更新影响行数为 0，说明余额不足
IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', '余额不足');
END IF;
```

### 充值幂等性保证

```sql
-- 使用 SELECT ... FOR UPDATE 悲观锁
SELECT * FROM recharge_logs WHERE id = p_order_id FOR UPDATE;

-- 只有 pending 状态的订单才能处理
IF order_record.status != 'pending' THEN
    RETURN json_build_object('success', false, 'message', '订单已处理');
END IF;
```

---

## 会员订阅与充值

### 会员套餐

| 套餐 | 价格 | 星石额度 | 有效期 |
|------|------|---------|--------|
| 旗舰尊享月卡 | ¥99 | 5000万/月 | 1个月 |
| 旗舰尊享季卡 | ¥258 | 5000万/月 | 3个月 |
| 旗舰尊享年卡 | ¥888 | 5000万/月 | 12个月 |

### 加油包（永久有效）

| 包名 | 价格 | 星石数量 |
|------|------|---------|
| 应急补给包 | ¥9 | 300万 |
| 进阶扩容包 | ¥28 | 1000万 |
| 豪华堆叠包 | ¥88 | 3500万 |

### 福利系统

**签到奖励**:
| 天数 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|-----|---|---|---|---|---|---|---|
| 星石 | 10 | 10 | 20 | 20 | 30 | 30 | 50 |

**任务奖励**:
- 完善个人信息: +20 星石 (一次性)
- 分享网站: +30 星石 (每日)
- 观看视频: +50 星石 (每日)

---

## AI 调用架构

```
┌─────────────────────────────────────────────────────────────────┐
│  前端调用 (src/services/ai.ts)                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ generateText() → 计算预估费用 → 扣减钻石 → 返回结果         ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ 1. 估算 Token 数量                                       │ ││
│  │ │ 2. 计算预估费用 (输入×倍率 + 输出×倍率)                  │ ││
│  │ │ 3. 调用 API 后获取实际 Token 消耗                        │ ││
│  │ │ 4. 调用 Supabase RPC deduct_diamonds 精确扣减            │ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  服务端代理 (server/aiProxy.js)                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ getModelRegistry() → 路由到对应厂商 API                     ││
│  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         ││
│  │ │ DeepSeek     │ │ Anthropic    │ │ OpenRouter   │         ││
│  │ │ OpenAI兼容   │ │ 原生 API     │ │ Gemini/GPT   │         ││
│  │ └──────────────┘ └──────────────┘ └──────────────┘         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据库核心表结构

```sql
-- 用户资料表
profiles (
  id UUID PRIMARY KEY,
  username TEXT,
  membership_type TEXT DEFAULT 'free',  -- free/pro/max
  diamond_balance INTEGER DEFAULT 1000000,  -- 钻石余额
  ...
)

-- 消费记录表
usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  model_name VARCHAR,          -- 使用的模型
  input_tokens INTEGER,        -- 输入Token
  output_tokens INTEGER,       -- 输出Token
  reasoning_tokens INTEGER,    -- 思考Token (R1模型)
  cache_hit_tokens INTEGER,    -- 缓存命中Token
  total_deducted DECIMAL,      -- 扣除钻石数
  multiplier_version VARCHAR,  -- 定价版本
  created_at TIMESTAMP
)

-- 充值记录表
recharge_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  amount_cny DECIMAL,          -- 充值金额(元)
  diamonds_obtained INTEGER,   -- 获得钻石数
  payment_method VARCHAR,      -- 支付方式
  status VARCHAR,              -- pending/success/failed
  ...
)

-- 定价倍率配置表
pricing_multipliers (
  version VARCHAR,             -- 版本号 (如 v3.2)
  model_name VARCHAR,          -- 模型名
  input_multiplier DECIMAL,    -- 输入倍率
  output_multiplier DECIMAL,   -- 输出倍率
  reasoning_multiplier DECIMAL,-- 思考倍率
  cache_hit_multiplier DECIMAL,-- 缓存倍率
  effective_from TIMESTAMP,    -- 生效时间
  PRIMARY KEY (version, model_name)
)
```

---

## 项目结构

```
simplechat/
├── api/                          # Vercel Serverless Functions
│   └── ai/
│       ├── generate.js           # AI文本生成API
│       └── summarize.js          # AI摘要API
├── server/                       # 服务端代码
│   └── aiProxy.js               # AI代理核心逻辑
├── src/                         # 前端源代码
│   ├── components/              # 可复用UI组件
│   ├── layouts/                 # 布局组件
│   ├── lib/                     # 工具库和客户端
│   ├── pages/                   # 页面组件
│   │   ├── workspace/           # 工作区页面
│   │   └── auth/                # 认证页面
│   ├── services/                # 服务层 (AI服务)
│   ├── store/                   # 状态管理 (Zustand)
│   ├── styles/                  # 样式文件
│   └── types/                   # TypeScript类型定义
├── supabase/                    # Supabase配置和迁移
│   ├── migrations/              # 数据库迁移文件
│   └── config.toml              # Supabase配置
├── docs/                        # 文档
├── .env                         # 环境变量
├── vite.config.ts               # Vite配置
└── vercel.json                  # Vercel部署配置
```

---

## Getting Started

### 1. 安装依赖

```bash
npm install
```

### 2. 环境变量配置

创建 `.env` 文件：

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI API Keys
VITE_DEEPSEEK_API_KEY=your_deepseek_key
VITE_ANTHROPIC_API_KEY=your_anthropic_key
VITE_OPENAI_API_KEY=your_openai_key
VITE_OPENROUTER_API_KEY=your_openrouter_key
```

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 构建生产版本

```bash
npm run build
```

---

## 关键设计亮点

| 设计点 | 说明 | 优势 |
|--------|------|------|
| **原子扣减** | `WHERE diamond_balance >= total_cost` | 并发安全，绝对不超卖 |
| **充值幂等** | `SELECT ... FOR UPDATE` 悲观锁 | 防止重复加钻石 |
| **倍率版本管理** | `pricing_multipliers` 表带版本号 | 方便调价、可追溯 |
| **访客模式** | localStorage 存储虚拟余额 | 降低体验门槛 |
| **流式结算** | 响应结束后一次性精确扣减 | 避免"扣了但没返回"的问题 |
| **多维度计费** | 输入/输出/思考/缓存独立倍率 | 精细化成本核算 |

---

## 路由结构

| 路径 | 说明 |
|------|------|
| `/login` | 登录 |
| `/register` | 注册 |
| `/workspace` | 工作区 |
| `/workspace/p/:workId/story/:chapterId` | 章节编辑 |
| `/workspace/p/:workId/outline` | 作品大纲 |
| `/workspace/p/:workId/world` | 世界设定 |
| `/workspace/p/:workId/characters` | 角色塑造 |
| `/community` | 创作社区 |
| `/welfare` | 福利中心 |
| `/membership` | 充值会员 |
| `/prompts` | 提示词库 |

---

## License

MIT
