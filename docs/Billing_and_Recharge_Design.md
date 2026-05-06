# 简单写作 (SimpleChat) - 计费与充值系统设计文档 
 
**文档版本**: v3.2 
**角色**: Token 中转站与支付系统架构师 
**状态**: 待开发 / 规划中 
 
**v3.2 更新说明**：全面修复计费与流程风险，新增缓存倍率字段，移除前置校验依赖，强化流式结算的原子性与充值幂等锁机制，并校准所有模型倍率至最新精确值。 
 
---

## 1. 核心业务模型与加权计费原则 
 
### 1.1 大池子与小池子 
- **大池子（平台成本池）**：平台持有 DeepSeek、Anthropic、Google、OpenAI 等厂商的 API KEY，承担实际调用成本。 
- **小池子（用户代币池）**：用户以 钻石 (Diamonds) 为统一计价单位，账户完全隔离。 
 
### 1.2 加权扣费机制 
**基准锚定**：1 钻石 = 1 个基准 Token，基准模型为 DeepSeek-V3-0324 的输入 Token（官方售价 2 元/百万 Token）。 
 
**倍率公式**： 
```text 
实际扣除钻石 = (输入Token × 输入倍率) + (输出Token × 输出倍率) + (思考Token × 思考倍率) + (缓存命中Token × 缓存倍率) 
```
**钻石售价**：1 元人民币 = 200,000 钻石（基准模型毛利率约 60%，高端模型毛利更高）。 
 
---

## 2. 主流模型官方定价与平台计费表 
所有价格均基于 2026 年 5 月官方数据，美元按 1 USD ≈ 7.0 CNY 换算。 
 
### 2.1 官方成本价（元/百万 Token） 
| 模型 | 厂商 | 输入 | 输出 | 思考 | 缓存命中 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DeepSeek-V3-0324 | DeepSeek | 2 | 8 | — | 0.8 |
| DeepSeek-V3.1 | DeepSeek | 4 | 12 | — | 1.6 |
| DeepSeek-V3.2 | DeepSeek | 2 | 3 | — | 0.2 |
| DeepSeek-R1-0528 | DeepSeek | 4 | 16 | 16 | 1.6 |
| Claude Sonnet 4.6 | Anthropic | 21 | 105 | — | 2.1 |
| Claude Opus 4.6 | Anthropic | 35 | 175 | — | 3.5 |
| Claude Haiku 4.5 | Anthropic | 7 | 35 | — | 0.7 |
| Gemini 2.5 Pro | Google | 8.75 | 70 | — | — |
| Gemini 3.1 Pro | Google | 14 | 84 | — | 1.4 |
| GPT-4.1 | OpenAI | 14 | 56 | — | — |
| GPT-5.4 | OpenAI | 17.5 | 70 | — | — |

### 2.2 平台扣费倍率表（v3.2 精确版） 
以 DeepSeek-V3-0324 输入价格（2元/百万Token）为除数，所有倍率四舍五入至小数点后三位： 
 
| 模型 | 输入倍率 | 输出倍率 | 思考倍率 | 缓存命中倍率 |
| :--- | :--- | :--- | :--- | :--- |
| DeepSeek-V3-0324 | 1x | 4x | — | 0.4x |
| DeepSeek-V3.1 | 2x | 6x | — | 0.8x |
| DeepSeek-V3.2 | 1x | 1.5x | — | 0.1x |
| DeepSeek-R1-0528 | 2x | 8x | 8x | 0.8x |
| Claude Sonnet 4.6 | 10.5x | 52.5x | — | 1.05x |
| Claude Opus 4.6 | 17.5x | 87.5x | — | 1.75x |
| Claude Haiku 4.5 | 3.5x | 17.5x | — | 0.35x |
| Gemini 2.5 Pro | 4.375x | 35x | — | — |
| Gemini 3.1 Pro | 7x | 42x | — | 0.7x |
| GPT-4.1 | 7x | 28x | — | — |
| GPT-5.4 | 8.75x | 35x | — | — |

> **计算示例**：Claude Opus 4.6 输入 2,000 Token，无缓存，输出 1,000 Token。 
> 扣费 = (2000×17.5) + (1000×87.5) = 122,500 钻石 
 
---

## 3. 新用户体验额度 
新注册用户默认获得 1,000,000 钻石（≈ 100万基准 Token），平台成本低于 1 元，足以深度体验。 
 
---

## 4. 核心流程设计与并发安全（v3.2 关键修正） 

### 4.1 消费扣减流程（完全依赖原子结算，移除前置校验） 
**1. 请求受理**
接收到调用请求后，记录请求元数据，直接进入流式转发，不进行任何余额校验。 
 
**2. 流式转发与临时用量记录**
代理层将请求转发至厂商 API，实时透传生成内容给用户。在此过程中，服务端仅将 API 返回的分片数据（含临时 Token 统计，若有）缓存在内存中，绝不执行任何扣减操作。 
 
**3. 终结原子结算（并发安全核心）**
流式响应完全结束后，从 API 返回的 usage 中提取精确的： 
- `prompt_tokens`
- `completion_tokens`
- `reasoning_tokens`（如有）
- `cache_read_input_tokens`（如有） 
 
匹配当前生效的倍率版本，计算 `total_cost`。 
在单个数据库事务中执行： 
 
```sql 
-- 1. 原子扣减，行级锁保证绝对不超卖 
UPDATE profiles 
SET diamond_balance = diamond_balance - :total_cost 
WHERE id = :user_id AND diamond_balance >= :total_cost; 
 
-- 2. 检查 affected_rows 
-- 若为 0，则说明余额不足（被并发耗尽） 
-- 此时应： 
--   a. 终止正在生成的流（若仍在进行） 
--   b. 返回用户“余额不足”错误 
--   c. 记录异常日志 
 
-- 3. 扣减成功后，在同一事务中写入消费流水 
INSERT INTO usage_logs (user_id, model_name, input_tokens, output_tokens, 
                        reasoning_tokens, cache_hit_tokens, multiplier_version, 
                        total_deducted, created_at) 
VALUES (:user_id, :model_name, :input_tokens, :output_tokens, 
        :reasoning_tokens, :cache_hit_tokens, :multiplier_version, 
        :total_cost, NOW()); 
```

**关键修正**：不再使用“前置校验最低门槛”，完全依赖数据库 `WHERE diamond_balance >= total_cost` 的原子性条件防止超卖。应用层仅需处理 `affected_rows=0` 的情况。 
 
**熔断保护**：如果模型允许超长输出（如 Claude 的 128K 输出），可在流式转发过程中累计已传输的 Token 数，当估算消耗超过当前余额时，可提前主动断开上游连接，避免无效传输。但最终结算仍以实际 usage 为准，确保计费精确。 
 
### 4.2 充值购买流程（增加并发锁，彻底杜绝重复加款） 
**1. 创建订单**
用户选择套餐，后端生成订单，插入 `recharge_logs`，状态为 `pending`。 
 
**2. 支付回调幂等处理**
支付网关回调接口收到通知后，执行以下事务： 
 
```sql 
-- 悲观锁保证同一订单严格串行处理 
BEGIN; 
SELECT id, status FROM recharge_logs WHERE id = :order_id FOR UPDATE; 
 
-- 应用层判断 status 
-- 若 status != 'pending'，直接 ROLLBACK 返回成功（幂等） 
-- 若 status = 'pending'，则继续 
 
UPDATE recharge_logs SET status = 'success', paid_at = NOW() 
WHERE id = :order_id; 
 
UPDATE profiles SET diamond_balance = diamond_balance + :diamonds_obtained 
WHERE id = :user_id; 
 
INSERT INTO user_recharge_record (...) VALUES (...);  -- 可选明细记录 
 
COMMIT; 
```

**修正点**：使用 `SELECT ... FOR UPDATE` 悲观锁，确保并发回调时只有一个事务能拿到锁并推进状态，其余事务因锁释放后发现状态已变而直接幂等返回。彻底杜绝重复加钻石。 
 
**3. 补偿机制**
若回调处理过程中事务失败（如数据库异常），订单状态保持 `pending`，由定时任务扫描长时间未完成的订单，主动查询支付网关状态进行补单。 
 
---

## 5. 数据库支撑结构（v3.2 更新） 

| 表名 | 核心字段 | 说明 |
| :--- | :--- | :--- |
| **profiles** | `id`, `diamond_balance` | `diamond_balance` 默认值 1,000,000 |
| **usage_logs** | `id`, `user_id`, `model_name`, `input_tokens`, `output_tokens`, `reasoning_tokens`, `cache_hit_tokens`, `multiplier_version`, `total_deducted`, `created_at` | 新增 `cache_hit_tokens` 字段；`multiplier_version` 关联定价版本 |
| **recharge_logs** | `id`, `user_id`, `amount_cny`, `diamonds_obtained`, `status`, `paid_at`, `created_at` | `status`: pending/success/failed；回调接口使用行锁保证幂等 |
| **pricing_multipliers** | `version`, `model_name`, `input_multiplier`, `output_multiplier`, `reasoning_multiplier`, `cache_hit_multiplier`, `effective_from` | 补全缓存倍率字段；每次调价新增一个版本号 |

**索引优化**
```sql 
CREATE INDEX idx_usage_user_created ON usage_logs(user_id, created_at DESC); 
CREATE INDEX idx_recharge_id_status ON recharge_logs(id, status); 
```

---

## 6. 验收标准 
- **计费准确性**：所有模型根据 usage 及最新倍率版本精确扣费，缓存 Token 按缓存倍率独立计算，结果可反复验算。 
- **并发安全**：同用户 100 并发请求，最终余额扣减总和严格等于所有成功请求的独立结算值，不出现负数余额。 
- **充值幂等**：同一订单并发 10 次回调，`recharge_logs` 仅一条记录变为 `success`，余额只增加一次。 
- **用户隔离**：高频扣费不产生表级锁，对其他用户无影响。 
- **流式熔断**：超长生成过程中若预判余额不足，应尽早中止上游连接，并保证最终不产生负余额结算。 
 
---

## 7. 变更记录 
| 版本 | 日期 | 变更内容 |
| :--- | :--- | :--- |
| v3.2 | 2026-05-06 | 1. 补全 pricing_multipliers 表 cache_hit_multiplier 字段及所有模型缓存倍率；2. 移除前置余额校验，完全依赖原子 SQL 防超卖；3. 明确流式过程不扣减、终结一次性结算；4. 充值回调增加 SELECT FOR UPDATE 悲观锁保证幂等；5. 校准 Gemini 2.5 Pro 输入倍率为 4.375x |