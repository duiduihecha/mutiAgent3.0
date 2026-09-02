# LLM 调用全景扫描报告（2026-08-27）

> 基于对 `src/`、`scripts/` 全量 grep + 关键文件逐行阅读得出，**不是**照抄说明文档。
> 目的：让所有 LLM 调用点一目了然，并记录本轮「规范化」改动与遗留问题。

---

## 1. 一句话结论

系统所有 TS 侧 LLM 调用**已经**收敛到单一统一边界（`UnifiedLLMService` + `llm-config` preset + `experiment-telemetry`），
没有 SDK 直连（coze-coding-dev-sdk 已废弃、无任何 import）。
真正"不统一"的只有两类：**Python/脚本侧的直接 HTTP 调用**（不经统一边界、不记遥测），以及**上一轮 502 暴露的模型输出格式问题**。

---

## 2. 统一边界（4 个文件，所有 TS 调用必经）

| 文件 | 职责 | 关键点 |
|---|---|---|
| `src/lib/llm-config.ts` | **唯一事实源**：preset → provider/model/key/endpoint 解析 | `MODEL_BY_ROLE` 每角色默认模型；env 覆盖 `LLM_<ROLE>_MODEL`；`assertVerifiedEflowModel` 白名单 fail-closed |
| `src/lib/llm-runtime-policy.ts` | fail-closed 准入 + 成本估算 | `assertLLMCallAllowed`（需 `LLM_REAL_CALLS_ENABLED=true` + 单价 + 预算）、`estimateCostCny`、`safeLLMConfigSnapshot` |
| `src/lib/unified-llm-service.ts` | 统一 chat / chatStream / 结构化输出边界 | 4 个 client：`OpenAIClient`(e-flowcode 实际在用) / `DeepSeekClient` / `MiniMaxClient` / `GLMClient`（后三者经 preset 路由**当前不可达**，见 §6）；`mockFixtureFor` 离线夹具 |
| `src/lib/experiment-telemetry.ts` | 每次调用落盘：次数/Token/延迟/成本/实验标识 | `runWithExperimentContext` 实验上下文；**本轮修复**：无上下文（web 请求）不再丢弃，默认写 `logs/llm-telemetry.jsonl` |

### 2.1 当前路由语义（规范化后）

- 非 mock 一律 provider=`openai`，走 OpenAI 兼容网关（默认 `https://e-flowcode.cc`），
  用**不同模型族**承担不同角色 = 论文"DeepSeek/Qwen/GLM/Kimi 多模型族"表述（同一网关聚合）。
- `LLM_PROVIDER` env 只影响 runtime snapshot 与 mock 判定，**不再**改变 chat 路由（`getLLMConfig` 恒返回 openai）。

---

## 3. 调用点清单（TS 侧，全部经统一边界）

### 3.1 主学习链路（LangGraph）
| 调用点 | 位置 | preset | 说明 |
|---|---|---|---|
| A1 LearnerProfiler | `multi-agent-system.ts` | 无 | 纯计算，**不调 LLM** |
| A2 MotherTongueExplainer | `multi-agent-system.ts:986` `unified_llm.chat` | `generation` | temperature 固定 0.0（`AGENT_CONFIGS`） |
| A3 CulturalComparator | 同上 | `generation` | 同上 |
| A4 ContentGenerator | 同上 | `generation` | 最大调用，超时 1200s |
| A5 QualityController | 同上 | `generation` | 质检，`response_format: json_object` |
| Guardrail（A4 后四道防线） | `guardrail-service.ts:272` `callLLM()` | `guardrail_solver/backtranslation/binary/final` | 本地规则优先，`llm_called` 可跳过；telemetry_label=`guardrail:${model}` |

### 3.2 其他业务服务
| 调用点 | 位置 | preset |
|---|---|---|
| 多语言阐释生成 | `multi-language-explanation-service.ts:231` | `generation`（构造时绑定） |
| 知识点生成 | `knowledge-base-service.ts:224` | `generation` |
| 跨文化对比生成 | `knowledge-base-service.ts:328` | `generation` |
| HumanEval 裁判 | `ai-judge.ts:162` | `judge`（构造时绑定）+ `response_format: json_object` |
| CIEval 裁判 | `cieval-judge.ts:480` | `judge/judge2`（env/override 可换） |
| API 连通测试 | `api/test/llm/route.ts:39` | 任意 preset（URL 参数） |
| 阐释 SSE 流式 | `api/explanations/route.ts:31` → `multiLanguageService.generateExplanationsStream()` | `generation`（内部走 chat，非真流式，见 §5） |

### 3.3 缓存 / 降级路径（学习链路）
| 路径 | 位置 | 说明 |
|---|---|---|
| 缓存命中短路 | `learning-graph.ts:206` `checkCache` → `queryKnowledgeBase`（Supabase `cultural_explanations` 表） | 命中则只跑 A4 生成练习题（`generateExercises`），**省 3 次 LLM 调用** |
| 消融 bypassCache | `learning-graph.ts:211` | `bypassCache=true` 强制 cache_miss + 不写缓存，保证消融条件独立 |
| Mock 离线 | `llm-config.isOfflineMockExecution` / `LLM_MOCK_MODE=true` / preset=`mock` | `mockFixtureFor` 返回确定性夹具，零成本可渲染 |
| 空响应重试 | `multi-agent-system.ts:979` | 8 次指数退避（kimi 族推理模型空 content 自愈） |
| reasoning_content 兜底 | `unified-llm-service.ts:399` + `extractJsonFromReasoning` | content 为空时从 reasoning 抽 JSON |

---

## 4. Mock / 夹具全景
- 入口：`isOfflineMockExecution()`（`LLM_MOCK_MODE=true` 或 `LLM_PROVIDER=mock` 且未放行真实调用）。
- 夹具：`unified-llm-service.ts:65` `mockFixtureFor`，按 `telemetry_label`（A2/A3/A4/A5）与 preset（guardrail_*）返回可渲染 JSON。
- 覆盖：A2 阐释 / A3 对比 / A4 内容+5 题 / A5 质检 / 4 个 guardrail preset。
- 测试：`experiment-telemetry.test.ts` 全链路 mock 渲染用例（143 个测试全部通过）。

---

## 5. 流式调用现状
| client | chatStream | 备注 |
|---|---|---|
| OpenAIClient（实际在用） | ❌ 未实现 | `chatStream` 对 openai provider 直接抛 `Streaming is not implemented`；`/api/explanations` 的"SSE"是**服务端分批**（`generateExplanationsStream` 内部多次 `chat`），非 token 级流式 |
| DeepSeekClient / MiniMaxClient | ✅ 有实现 | 当前路由不可达（见 §6） |

> ⚠️ 如需真流式（token 级），需为 OpenAIClient 补 `chatStream`（SSE 解析已具备 `data:` 分支）。当前无调用方需要，暂缓。

---

## 6. 不可达 / 死代码（保留但明确标注）
- `DeepSeekClient` / `MiniMaxClient` / `GLMClient`：`getLLMConfig` 恒返回 `provider:"openai"`，`resolveRoute` 只会选中 `openai` 或 `mock`，**这三个 client 的 switch 分支在真实路由中不可达**（仅 `chatStream` 的 legacy 路径与导出 `DeepSeekClient/MiniMaxClient` 可能被外部脚本引用）。
- `LLM_JUDGE_PROVIDER` / `LLM_JUDGE2_PROVIDER` / `LLM_GUARDRAIL_CHEAP_MODEL` / `LLM_GUARDRAIL_MM_MODEL`：代码均不读取，已从 `.env` 清除。

---

## 7. 不经过统一边界的调用（Python / 脚本直连）

| 文件 | 端点 | 说明 |
|---|---|---|
| `src/services/guardrail_runner.py:106` | `DEEPSEEK_API_URL` / `QWEN_API_URL` | Python 侧边车，A5 guardrail 的 Python 实现（是否有调用方？见待办） |
| `scripts/generate_kps.py` | `MINIMAX_API_KEY` / `DEEPSEEK_API_KEY` 直连 | 知识点批量生成 |
| `scripts/extend_manifested_in.py:48` | `DEEPSEEK_URL` / `MINIMAX_URL` 直连 | 语料扩展 |
| `scripts/seed-graph-edges.mjs` / `seed-graph-edges-patch.mjs` | `DEEPSEEK_API_URL` 直连 | 图谱边生成 |
| `scripts/simulate_students.mjs:117` | `LLM_TEST_BASE_URL`（kimi 网关）直连 | **6 persona 模拟**；依赖已删除的 `LLM_TEST_*`，当前不可用（见待办） |
| `scripts/run_gpt5_generate.ts` / `run_mini_step1_generate.ts` / `run_mini_experiment_cieval.ts` / `cieval_*.ts` / `run_a5_guardrail_eval.ts` / `cieval_leaderboard_run.ts` | 经 `UnifiedLLMService` | 实验脚本，**走统一边界** ✓ |

> 统一原则：实验/评测脚本也应走 `UnifiedLLMService`（多数已如此）；纯 Python 直连的 4 个脚本是历史遗留，建议后续迁移或显式标注"仅离线数据准备，不计入论文调用统计"。

---

## 8. 本轮规范化改动（2026-08-27）

| 文件 | 改动 |
|---|---|
| `src/lib/llm-config.ts` | 删 `TEST_MODE`；精简过期模型（移除 `deepseek-*-0731/0813`、`qwen3.6-max-preview`、`glm-5.2-fast-preview`）；目录只保留 `deepseek-v4-flash/pro`、`qwen3.6-flash/plus`、`qwen3.7-max`、`qwen3.8-max`、`glm-5/5.1/5.2/5.3`、`kimi-k2.5/2.6/k3` |
| `src/lib/experiment-telemetry.ts` | **修复缺口**：无实验上下文（web）时改用兜底上下文 `run_id=web`，不再静默丢弃；默认落盘 `logs/llm-telemetry.jsonl`（env `EXPERIMENT_TELEMETRY_PATH` 可覆盖；`LLM_TELEMETRY_ENABLED=false` 关闭）；懒建目录、尽力而为 |
| `src/lib/multi-agent-system.ts` | 删 4 处 `TEST_MODE()` 分支（超时下限/温度覆盖/response_format 置空/A5 降级放行）→ 统一为：`effTimeout=timeoutMs`、温度优先 agent 配置回落 preset、response_format 透传、A5 严格抛错 |
| `src/app/api/learning/route.ts` | 删 DEBUG 日志与 `LLM_TEST_MODE` 分支（质量网关一律硬拦截） |
| `src/app/api/feedback/route.ts` | 删 `used_test_mode` 字段 |
| `scripts/dev-test.sh` | 删 `export LLM_TEST_MODE=true` |
| `.env` | 规范化：删 banner 注释、`LLM_TEST_*` 段、死变量（`LLM_JUDGE_PROVIDER`/`LLM_JUDGE2_PROVIDER`/`LLM_GUARDRAIL_CHEAP_MODEL`/`LLM_GUARDRAIL_MM_MODEL`）；**修复非法 judge 模型**（`qwen3.7-plus` → `qwen3.8-max`）；新增 `EFLOWCODE_API_KEY` 主粘贴位 + 角色模型覆盖区 + 遥测开关 |
| `src/__tests__/experiment-telemetry.test.ts` | 断言改动态 `getGenerationModel()`（不依赖 .env 档位）；补 profile 锁复位 |
| `src/__tests__/llm-config-routing.test.ts` | 覆盖测试改用仍在目录内的 `glm-5.3` |
| `scripts/list_eflow_models.sh` | **新增**：贴 key 后对账现网模型与白名单 |

### 8.1 验证结果
- `tsc -p tsconfig.json`：改动文件 **0 新增错误**（全项目仍 51 条，均为 GPT 重构遗留：`experiment-runner` 强转、`evaluation-metrics` 字段、`learning/page.tsx` `{}` 访问）。
- `vitest run`：**6 文件 143/143 通过**（含 llm-config 路由、telemetry、A2→A5 mock 链路）。
- 说明：`next.config.ts` 的 `typescript.ignoreBuildErrors: true` 为上一轮加的**临时**开关（否则 `next build` 被上述 51 条阻塞），修完遗留类型错误后应撤销。

---

## 9. 遗留问题 / 待办（重要）

1. **`scripts/run-experiments.ts:27` 编译错误**（`groupAndAggregate` 已被 GPT 重构移除）→ 阻塞 COLING 消融实验，需修。
2. **51 条 TS 类型错误**（experiment-runner / evaluation-metrics / learning/page）→ 修完可撤 `ignoreBuildErrors`。
3. **`simulate_students.mjs` 依赖已删的 `LLM_TEST_*`** → 迁移到 eflowcode（`EFLOWCODE_API_KEY`）或删除；6 persona 模拟若还要做，换统一入口。
4. **上一轮 502 新形态**：`exercises must be an array`（A4 返回的 `exercises` 非数组）——预算闸门问题已解决，这是**模型输出格式**问题，与规范化无关；建议贴 key 后用 `list_eflow_models.sh` 对账、换 `deepseek-v4-pro` 试生成并抓原始响应。
5. **`LLM_RUN_BUDGET_CNY` 非真熔断**（调用后不累加 committed）——防超支需手动上调或看网关账单。
6. `guardrail_runner.py` 是否还有调用方需确认（若无 → 标注弃用）。

---

## 10. 贴 key 后第一步（清单）

1. 打开 `.env`，在 `EFLOWCODE_API_KEY=` 粘贴你的 e-flowcode key（可放多把轮换）。
2. `set -a; source .env; set +a; bash scripts/list_eflow_models.sh` 对账现网模型。
3. 若有新模型 → 追加进 `llm-config.ts` 的 `EFLOW_VERIFIED_MODELS`。
4. 重启服务（改动需重新 `pnpm next build` + `next start`；dev 模式直接 `pnpm dev`）。
5. 打开 `logs/llm-telemetry.jsonl` 确认每次调用的 provider/model/tokens/latency/cost 都落盘。
