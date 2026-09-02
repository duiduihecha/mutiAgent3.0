# P2-006 全系统 LLM 调用审计

**日期**: 2026-08-26  
**方法**: 静态遍历 `src/`、`scripts/`、测试、实验工具和锁文件；追踪 `chat/chatStream`、OpenAI-compatible HTTP、SDK 名称、provider 环境变量、mock/回退与 API 入口。未发起任何网络/LLM/Judge 调用。

## 1. 总结

当前真实生成主路径已不是 AGENTS.md 所述的 Coze SDK 直连：`BaseAgent.generateResponse()` 实际调用 `UnifiedLLMService.chat()`。`coze-coding-dev-sdk` 仍在 lockfile/历史文档中，但本轮在 `src`/`scripts` 没有找到活跃 import、`LLMClient` 实例或 `.invoke()` SDK 模型调用；`learning-graph.ts` 的 `.invoke()` 是 LangGraph 本地编排，不是 LLM SDK。

调用实现分为三类：

1. **已走统一 TypeScript 边界**：生成 Agents、CIEval/AI Judge、文化知识生成、多语解释、测试 API、外部 Monolith 脚本。
2. **本轮迁移的核心旁路**：TypeScript guardrail 原来直接 `fetch /v1/chat/completions`，现通过统一 `chat()` 适配器，保留原模型、超时和失败降级语义。
3. **未强行迁移的独立运行时/一次性脚本**：Python guardrail runner、Python KG 数据生成，以及 Node `.mjs` 学生模拟/KG 补边。它们仍是 HTTP 直连，但已加默认关闭+正数 run budget 硬闸；详细 telemetry 仍是未迁移缺口。

## 2. 调用清单

| 入口/调用者 | 真实边界 | provider/model | stream | 超时/重试 | 结构化 | 缓存 | telemetry | 每项估计调用 | 论文实验 |
|---|---|---|---|---|---|---|---|---:|---|
| `/api/learning` → LangGraph/Coordinator → A2/A3/A4/A5 | `BaseAgent` → unified `chat` | config 解析；生成端通常 DeepSeek/OpenAI-compatible | 否 | Agent 超时；空响应最多 8 次+外层 retry | prompt JSON + `safeJsonParse` | `llm_content_cache`；实验 bypass | 是 | cache miss 基础 4；cache hit 通常 1 | RQ1/RQ2 生成主路 |
| 分阶段 guardrail | **现已迁移** unified `chat` | DeepSeek / MiniMax-M3 / OpenAI-compatible cheap judge | 否 | 10–45s；A2 回译可 MM→DS fallback | 文本/小 JSON/二元 | 无模型结果缓存 | 是 | 按启用门可约 1 A2 +1 A3 +每题 solver +1 grounding +2 joint；回退可多 1 | RQ3 描述；会增加 RQ1 成本 |
| `CIEvalJudge.evaluate` | unified `chat` | MiniMax/OpenAI/GLM 依配置 | 否 | Judge timeout/retry 由调用层 | JSON | 结果文件断点 | 是 | 1/待评输出 | 旧评价；当前不得单独作主证据 |
| `AIJudge` | unified `chat` | `llm-config` judge config | 否 | 内部超时 | JSON | 无 | 是 | 1/待评输出 | 补充 Judge，当前禁止运行 |
| `knowledge-base-service` 文化知识/比较 POST | unified `chat` | 默认 provider/model | 否 | unified/client timeout | JSON 提取 | Supabase 写入 | 边界有，但无实验 context 时不落记录 | 1/创建 | 非 Pilot 主路；潜在数据建设 |
| `multi-language-explanation-service` | unified `chat` | 默认 provider | 否 | service error handling | JSON | 先查/后写 Supabase | 同上 | 1/未缓存语言 | 不进本轮 RQ |
| `/api/test/llm` | unified `chat` | 请求指定 | 否 | unified/client | 否 | 无 | 无 context 时不落盘 | 1/请求 | 调试，非实验 |
| `/api/explanations` SSE | 业务层 `ReadableStream`，内部仍调非流式多语 service | 默认 provider | **HTTP SSE，非模型 token stream** | 逐语言 | JSON | Supabase | 单次 chat 边界 | 每个缺失语言 1 | 非实验 |
| `UnifiedLLMService.chatStream` | DeepSeek/MiniMax SSE；mock 本地 | DS/MM; OpenAI/GLM 显式不支持 | 是 | 底层暂无完整统一 timeout/retry | chunk text | 无 | **现已记成功/失败/输出 hash，但真实 usage/cost 通常为 null** | 1/stream | 当前无活跃 caller，不进 Pilot |
| `run_gpt5_generate` / leaderboard external monolith | unified `chat` | OpenAI gpt-5.5 / DS / GLM / MM | 否 | 脚本继续/断点 | JSON | 文件进度 | 边界有，脚本需 context 才完整 | 1/样本；leaderboard 另有 Judge | 旧/候选实验，当前未授权 |
| `run_mini_step1_generate` | ExperimentRunner → 主路 | 同主路 | 否 | 断点+限流等待 | JSON | bypass cache | 有 experiment context | 条件依主路；5/6 条件×case | 旧 RQ1 批处理入口 |
| `simulate_students.mjs` | Node HTTP 直连 Kimi | `LLM_TEST_MODEL` | 否 | 180s，4 retry | JSON | 无 | 无详细 telemetry；**已加硬闸** | 约 1/模拟学生反馈 | 不进论文 Pilot |
| `seed-graph-edges*.mjs` | Node fetch DeepSeek | deepseek-chat | 否 | 无标准 retry | JSON object | 本地批次/可写 Neo4j | 无详细 telemetry；**已加硬闸** | 1/批 | KG 数据建设，非实验 |
| `extend_manifested_in.py` | requests 直连 DS/MM | DS/MM | 否 | 60s | JSON/text | 可写 Neo4j | 无；**已加硬闸** | 生成+双 Judge，数量随缺口 | KG 数据建设，非 Pilot |
| `generate_kps.py` | urllib 直连 DS/MM | DS/MM | 否 | 180s，有重试循环 | JSON | 本地文件 | 无；**dry-run 免闸，真调用已加硬闸** | 1/批或 patch | 数据建设 |
| `src/services/guardrail_runner.py` | aiohttp 直连 DS/Qwen | DS/Qwen | 否 | 60s | text | 无 | 无；**已加硬闸** | 取决于 Python service | 备用运行时，非 TS 主路 |
| Local embedding server | sentence-transformers 本地推理 | local model | 否 | 本地 | vectors | process/model cache | 无 LLM 成本 telemetry | 本地 | 不是外部 LLM/API，不计付费调用 |

## 3. 原有关键风险

1. `LLM_PROVIDER=mock` 不在旧 provider union/switch 中，会落入 `default: deepseek`；配置名为 mock 却可联网。
2. 未知 provider 也默认 DeepSeek；`chatStream` 对 OpenAI/GLM/未知 provider 同样回退 DeepSeek。
3. 真实调用默认可开，没有单次 run budget 硬闸；所以误跑脚本可产生费用。
4. TypeScript guardrail 绕过统一 telemetry，且一个学习请求可额外产生多次 solver/judge 调用，旧调用数与成本被低估。
5. 多个 client 在构造时读 env，而脚本在 import 后修改 env；可造成 endpoint/model 快照与实际 client 不同步。
6. 结构化输出仍由 prompt + 容错 JSON 提取为主，不是所有 provider 都真正强制 JSON Schema。
7. telemetry 只在 experiment context 存在时写入；普通 API/数据建设调用仍可不留 call record。

## 4. P2-006 规范化后的边界

- provider 唯一标识：`mock|deepseek|minimax|openai|glm`；默认 `mock`，未知值抛 `LLMConfigurationError`。
- `mock` 是明确本地 client，返回 `LLM_MOCK_RESPONSE` 或固定 JSON，绝不执行 fetch。`LLM_MOCK_MODE=true` 与非 mock provider 组合直接拒绝。
- 所有 unified 真调用必须同时有 `LLM_REAL_CALLS_ENABLED=true`、正数 `LLM_RUN_BUDGET_CNY`且 committed < limit。默认关闭。
- 单次 call telemetry 包含 run/condition/case/category/agent label、provider/model、message/output/config/knowledge hash、temperature/max tokens、usage、latency、status/error 和估算成本。不写 API key、endpoint、完整 prompt/output 或 learner 个人字段。
- 价格由 `LLM_PRICE_<PROVIDER>_{INPUT,OUTPUT}_CNY_PER_M` 显式注入；未配置时 cost 为 null，后续实验 token/budget checker 应 fail closed，不伪造 0 成本。
- `getLLMRuntimeSnapshot()` 产生不含密钥/端点的 provider、默认模型、真调用开关、run budget、pricing 状态与 snapshot hash，可写入实验 manifest。

## 5. 未迁移项

- Python/standalone Node 脚本没有接入 AsyncLocalStorage telemetry；本轮只先防止误调用。若它们未来进入论文实验，必须迁到统一 CLI/sidecar 或实现同 schema call record。
- DeepSeek/MiniMax 底层 stream 还没有统一 usage 累积、超时和重试；由于当前无活跃 caller，选择显式不支持而不是跨 provider 回退。
- 客户端构造时 env 快照尚未完全改为每次 call 解析；实验必须在 process 启动前冻结 env，不得运行中切换 endpoint/provider。
- 统一服务本身不会给普通业务 API 自动伪造 case/condition；只有论文 ExperimentRunner 具备完整 context。

## 6. 论文边界

这份审计支持“调用路径与成本记录可被更完整审计”的工程主张，不支持任何模型质量、多智能体优越性或文化正确性结论。本轮没有生成新模型输出，成本为 0 CNY。
