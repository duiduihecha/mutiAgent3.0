# P2-007 模型配置矩阵（冻结草案）

日期：2026-08-26  
成本：0 CNY；本轮未发送 prompt，未执行真实生成或 Judge。

## 唯一路由矩阵

| 角色 | profile/触发 | provider | 精确 model id | 限制 |
|---|---|---|---|---|
| Generation | `daily` | e-flowcode OpenAI-compatible | `deepseek-v4-flash` | 同一 run 内禁止切换 profile |
| Generation | `quality` | e-flowcode OpenAI-compatible | `deepseek-v4-pro` | 同上 |
| Primary Judge | 补充证据 | e-flowcode OpenAI-compatible | `qwen3.8-max` | 不替代人工盲评 |
| Secondary Judge | 校准子集/分歧 | e-flowcode OpenAI-compatible | `glm-5.2` | 不允许默认全量 |
| Back-translation | 本地规则可疑后 | e-flowcode OpenAI-compatible | `kimi-k2.6` | 失败即 uncertain，不换模型 |
| Binary cheap Judge | 本地规则可疑后 | e-flowcode OpenAI-compatible | `qwen3.6-flash` | 无效 JSON 为 uncertain |
| Solver | 需求解算 | e-flowcode OpenAI-compatible | `qwen3.7-max` | 不得写成 `qwen3.7-plus` |
| Final review/adjudication | 仅 uncertain/冲突 | e-flowcode OpenAI-compatible | `glm-5.2` | 不全量调用 |

## 配置与门禁

- 单一配置源：`src/lib/llm-config.ts`。`LLM_GENERATION_PROFILE=daily|quality` 选 profile；角色级 override 仅接受已验证目录中的 model id。
- 运行政策只决定“是否可调用”：默认 provider=`mock`，`LLM_REAL_CALLS_ENABLED` 默认关闭。这解除了两个文件各自选默认模型的冲突。
- manifest 必须写 profile、精确 model id 与 `routing_sha256`；逐调用记录继承 profile 与路由 hash。
- 价格未配置：`cost_cny=null`，且真实调用在边界前失败。不以公网或其他渠道价格代替 e-flowcode 价格。
- `guardrail_ds`/`guardrail_mm` 仅保留为 legacy 配置名别名，分别映射到 solver/back-translation 新路由；不会路由到校内 MiniMax。

## Judge 盲化与顺序

Judge 输入仅使用 `blind_id`，不显示 Full/Monolith/NoA3。批处理样本用 seed+`blind_id` 做可复现乱序；`swapOrder=true` 生成反转顺序检查顺序效应。Secondary Judge 必须显式开启并限定到事先冻结的校准子集或主 Judge/人工分歧条目。
