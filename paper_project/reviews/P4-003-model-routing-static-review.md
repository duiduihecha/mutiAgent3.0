# P4-003 模型路由与测试独立静态审查

- 日期：2026-08-26（Asia/Shanghai）
- 角色：P4 导师与红队审查 Agent
- 审查对象：P2-007 模型配置矩阵、实施报告、反向自审，以及实际生成、Judge、Guardrail、runtime policy、telemetry、测试和 TypeScript 门
- 外部事实边界：P0 已确认 e-flowcode `/v1/models` HTTP 200；精确 chat completion、usage、JSON 行为、限流及模型价格均未验证
- 成本：0 CNY；未运行真实 LLM、Judge 或外部 API
- 修改边界：未修改代码、配置或原始数据

## 1. 总裁决

**FAIL_REVISE。**

P2-007 已建立一个有价值的角色—模型白名单，并使主生成、AI/CIEval Judge 和 TypeScript Guardrail 在正常非测试路径上选择预期的精确 model ID。默认禁用真实调用也能阻止当前误触发付费请求。

但“单一配置源”“默认 mock”和“价格/预算 fail closed”三项表述目前均不完全属实：

1. `.env` 明确设置 `LLM_PROVIDER=deepseek`，所以所有未显式传 provider 的 `UnifiedLLMService.chat()` 调用默认走 DeepSeek，而不是 mock，也不走 `llm-config.ts` 的角色路由；
2. AI Judge/CIEval 虽显式传 `provider=openai` 和精确 model，却没有传中央配置的 `baseUrl/apiKey`，实际 endpoint 依赖 Unified 服务中 module-load-time 构造的 legacy OpenAI client 环境；
3. runtime policy 只检查“存在价格字符串、正预算、committed < limit”，不验证价格为有限非负数，也不按调用原子预留/扣减预算；连续多次调用可在 committed 不更新时越过 run limit；
4. Guardrail 在模块加载时冻结 endpoint/key/model/test-mode 常量，且保留大量 MiniMax、DeepSeek、`qwen3.6-plus` 过时命名和注释；当前矩阵中的真实模型可能与日志/维护者理解不一致；
5. 136 项测试没有验证每个角色最终发出的 endpoint+model 组合，也没有验证精确 e-flowcode chat completion。

因此当前只能说“静态路由草案和离线门禁已实现”，不能说“所有 LLM 调用已收口到唯一 e-flowcode 配置并具备可执行预算闭环”。任何付费 smoke 继续不获准。

## 2. 实际路由逐项核对

### 2.1 Generation daily / quality

主生成路径为 `BaseAgent.generateResponse()` → `UnifiedLLMService.chat()`，显式传入：

- provider：`getGenerationProvider()`，当前固定为 `openai`；
- model：`AGENT_CONFIGS` 在模块加载时通过 `getGenerationModel()` 取得；daily 为 `deepseek-v4-flash`，quality 为 `deepseek-v4-pro`；
- base URL/key：本次调用显式使用 `getLLMConfig('generation')` 的值；当前 `.env` 中 `OPENAI_API_URL` 的 host 静态确认是 `e-flowcode.cc`；
- profile：依赖进程启动前设置 `LLM_GENERATION_PROFILE`，run 内 Map 锁阻止之后切换。

所以在**进程启动前冻结 profile、非 TEST_MODE、中央 endpoint 未被错误 override**的条件下，daily/quality 主生成会走预期 e-flowcode 精确模型。

限制：`AGENT_CONFIGS` 在 import 时就冻结模型。profile lock 只能发现部分运行中切换，不能保证所有模块在同一时点读取；测试没有通过隔离进程分别证明 daily/quality 的最终 HTTP body。`TEST_MODE()` 还会改变温度和 response format，但生成调用本身没有像 Guardrail 那样改 endpoint/model。

### 2.2 Primary / Secondary Judge

`AIJudge` 的主/次 Judge 分别解析为 `qwen3.8-max` 与 `glm-5.2`，默认只运行主 Judge；Secondary 必须显式 `includeSecondary=true`。`CIEvalJudge` 也用 `judge`/`judge2` preset，未知模型受 whitelist 拒绝。

精确 model ID 会进入调用 options，但 `AIJudge.rateSample()` 和 `CIEvalJudge.callJudge()` **没有传 `baseUrl` 或 `apiKey`**。因此请求不是完整地由 `llm-config.ts` 注入，而是由 `UnifiedLLMService` 中早已构造的 `OpenAIClient` 读取 legacy `OPENAI_API_URL/OPENAI_API_KEY`。当前 `.env` 恰好使该 URL 指向 e-flowcode，所以当前静态环境看起来会到 e-flowcode；一旦仅配置推荐的 `EFLOWCODE_API_URL/KEY` 而未同步 legacy OpenAI 变量，Judge 可能与中央快照分裂。

结论：模型选择正确；endpoint 在当前环境正确，但“单一配置源”不成立。

### 2.3 Guardrail

正常非测试路径的静态绑定为：

| 角色 | 实际 model 参数 | endpoint 来源 |
|---|---|---|
| back-translation | `kimi-k2.6` | `BACKTRANSLATION_CFG.baseUrl` |
| binary cheap Judge | `qwen3.6-flash` | `BINARY_CFG.baseUrl` |
| solver | `qwen3.7-max` | `SOLVER_CFG.baseUrl` |
| final review/adjudication | `glm-5.2` | `FINAL_CFG.baseUrl` |

`callLLM()` 显式传 `provider=openai`、model、baseUrl、apiKey，因此正常路径会走 e-flowcode。A2/A3/grounding 的二元检查使用 `qwen3.6-flash`；填空语义等价也使用该 binary 路由；结构干净的 A5 item 可本地直接通过，只有可疑项进入 `glm-5.2` final review。

但如果模块加载时 `LLM_TEST_MODE=true`，所有 Guardrail 调用会被改写为 `LLM_TEST_BASE_URL/LLM_TEST_MODEL/LLM_TEST_API_KEY`。当前 `.env` 的测试 base host 静态确认为**非 e-flowcode**。所以“Guardrail 实际调用都走 e-flowcode 精确角色模型”只有在 `LLM_TEST_MODE != true` 时成立；manifest 必须记录该开关。

## 3. 中央配置与默认 mock 核对

### Blocker B1：未传 options 的 Unified 调用旁路中央路由

当前 `.env` 有 `LLM_PROVIDER=deepseek`。`resolveLLMProvider()` 的默认 mock 只在环境变量缺失且调用未传 provider 时生效；它不会覆盖显式 `.env`。以下活跃服务存在未传 provider/model 的调用：

- `knowledge-base-service.ts` 的文化知识生成与跨文化比较；
- `multi-language-explanation-service.ts`；
- `UnifiedLLMService` 内部分生成 helper；
- 其他调用若只传 temperature 也同样读取 `.env`。

这些调用会走 DeepSeek client，而不是 `llm-config.ts` 的 e-flowcode role matrix。真实调用目前仍会被 `LLM_REAL_CALLS_ENABLED` 拦住，但路由事实与“单一配置源”相冲突。

**判定：**“未设置 provider 时默认 mock”在函数级成立；“当前项目默认 mock”不成立；“所有生产调用只有一个配置源”不成立。

**解除条件：**所有活跃 unified 调用必须显式使用一个中央 preset，或 `UnifiedLLMService` 的默认解析必须改为中央 runtime route 而非直接读 `LLM_PROVIDER`。随后移除/改名 `.env` 的冲突变量，并增加静态扫描测试禁止无 preset 的真实调用。

### Major M1：中央 snapshot 可能与真实 Judge endpoint 不一致

`getModelRoutingSnapshot()` 不含 endpoint，Judge 又未注入中央 base URL。snapshot/hash 能证明角色模型表，却不能证明请求实际送往哪个兼容网关。至少需要记录一个不泄密的 endpoint ID/host alias hash，并让 Judge 显式传中央 baseUrl/key。

## 4. 真实调用、价格与预算门

### 可确认的 fail-closed 部分

- provider 非 mock 时，`LLM_REAL_CALLS_ENABLED` 不是字符串 `true` 会在 fetch 前抛错；
- provider price 环境字段缺失会在 fetch 前抛错；
- `LLM_RUN_BUDGET_CNY` 非正数或 `committed >= limit` 会阻断；
- mock 明确不 fetch；未知 provider 抛错；
- 当前 `.env` 未显示真实调用开关、正预算或价格，故当前状态确实禁止真实调用。

### Blocker B2：预算不是执行期 fail-closed 账本

当前实现不足以保证 run 不超支：

1. 价格只检查字符串存在；`abc`、负数等仍可通过 admission，之后 `estimateCostCny()` 可能返回 null 或负值；
2. 调用前不根据 `max_tokens` 计算最坏承诺成本；
3. `LLM_RUN_COMMITTED_CNY` 只从环境读取，没有在每次调用前原子预留、调用后结算；
4. 多 Agent、多 Guardrail、重试或并发调用都可重复看到同一个剩余额度；
5. 失败调用、空响应的八次内部重试和外层 retry 是否计费没有统一 committed ledger；
6. e-flowcode 价格尚未核实，当前不能配置可信价格。

所以准确表述应为“默认禁用和基础 admission fail closed”，不是“价格/预算执行 fail closed”。

**解除条件：**价格需验证为有限、非负且来源已核实；在 run 级 ledger 中按调用最坏上限原子 reserve，按实际 usage settle，所有重试/Guardrail 都使用同一 ledger；无法估价、无法 reserve、usage 缺失或 ledger 写入失败一律在下一调用前停止。单进程 Pilot 至少要有不可绕过的同步账本和 hard stop，不能只靠可变环境变量。

## 5. Guardrail 模块加载与过时命名

### Major M2：module-load-time 冻结掩盖运行时配置

`SOLVER_CFG`、`BACKTRANSLATION_CFG`、`BINARY_CFG`、`FINAL_CFG`、`GR_IS_TEST`、测试 URL/model/key 均在 import 时解析。进程启动后修改 env 或 manifest 配置不会改变这些常量。profile/run snapshot 若在之后生成，可能与已冻结的 Guardrail client 路由不同。

最小修复是在每个 run 初始化时显式构造不可变 `GuardrailRouting` 并注入服务；禁止模块全局捕获 key/endpoint/test-mode。健康检查也应接收同一 routing，而不是读取 legacy 常量。

### Major M3：legacy 名称和注释已经与实际模型冲突

当前代码仍使用：

- `DS_API_URL/DS_API_KEY` 指代 qwen3.7-max solver；
- `MINIMAX_API_URL/KEY/MODEL` 指代 kimi-k2.6 back-translation；
- 注释称 cheap Judge 为 `qwen3.6-plus`，实际是 `qwen3.6-flash`；
- 多处注释称“DeepSeek 语义等价”，实际是 binary qwen；
- 大段 MiniMax-M2.7/M3 校内网关历史说明已不再描述生产路由；
- “双模型联席仲裁”注释与当前 local-first + 单一 GLM final adjudication 不一致。

这些不一定改变请求，但会误导维护、论文方法描述和故障判断，属于 smoke 前必须清理的配置风险。变量应按角色命名，历史说明移入审计文档；运行日志输出 role+exact model+endpoint alias，而不是 DS/MM 旧标签。

## 6. 136/136 测试审计

P4 本地复跑：6 个测试文件、136/136 通过，未发生真实网络调用。

### 已覆盖

- whitelist 中各 preset 的默认精确 model ID；
- daily/quality 解析与同 run profile 切换拒绝；
- 未验证 override fail closed；
- routing snapshot 含 profile/model/hash 且不含 URL/key；
- A5 结构干净时零 LLM 调用；
- mock 不 fetch、未知 provider 拒绝、未授权真 provider 拒绝；
- mock stream 和 telemetry；
- offline fetch stub 下 usage/secret/prompt/endpoint 不落 telemetry；
- 既有 converter、NoA3、guardrail 和业务单元逻辑。

### 未覆盖

- daily 和 quality 各自在隔离进程中最终 HTTP body 的 model、endpoint 和 profile；
- AI Judge/CIEval 最终 endpoint 是否来自中央 e-flowcode 配置；
- Secondary Judge 的真实触发子集和 swap-order manifest；
- Guardrail 四个角色逐一发出的 endpoint+model+temperature+max tokens；
- `LLM_TEST_MODE=true/false` 两套路由与 manifest 一致性；
- 精确 model ID 的 e-flowcode chat completion、JSON mode、usage、timeout、rate limit 和错误语义；
- 真实价格、最坏承诺成本、并发/重试预算扣减和 20 CNY hard stop；
- module-load 后 env 改变造成的快照分裂；
- 无 provider/model options 的活跃调用静态禁止；
- Guardrail 可疑 item 触发 GLM final review 的离线路由集成测试；
- endpoint failover/错误 endpoint 不得静默回退。

因此 136/136 只能支持离线解析与门禁行为，不能支持真实路由可用性或成本闭环。

## 7. TypeScript 全库检查

P4 本地复跑 `npx tsc --noEmit --pretty false`：仍失败。错误位于：

- `scripts/cieval_consistency.ts`、`cieval_leaderboard_run.ts`、`run-experiments.ts`；
- `src/app/learning/page.tsx`；
- `src/lib/evaluation-metrics.ts`；
- `src/lib/experiment-runner.ts` 的既有 `PipelineMetadata` cast。

本次输出未包含 `llm-config.ts`、`llm-runtime-policy.ts`、`guardrail-service.ts`、`ai-judge.ts`、`cieval-judge.ts`、`unified-llm-service.ts` 或 telemetry schema 的类型错误。就当前静态证据看，没有发现 P2-007 核心路由文件新增的 TypeScript 报错。

但 `run-experiments.ts` 和 `experiment-runner.ts` 属于未来 smoke 执行入口，不应被归为完全无关。即使错误早于 P2-007，它们仍阻止用“可构建/可执行实验入口”作为 smoke 证据。

## 8. 付费 smoke 裁决

**不允许进入任何付费 smoke。当前仍未授权。** `/v1/models` HTTP 200 只证明目录端点可达，不证明列出的精确 model ID 能完成 chat completion，更不证明价格、usage 或预算语义。

在代码修复完成后，未来也必须先由 P0/Human PI 单独批准一个最小 provider smoke；不能因本报告或 136 项测试自动获得授权。

## 9. 最小修正清单

按优先级：

1. **统一真实配置源：**消除 `.env LLM_PROVIDER=deepseek` 与角色路由冲突；禁止活跃代码无 preset 调用 unified chat；所有 generation/Judge/Guardrail/知识生成/多语服务显式取得中央 route。
2. **Judge 注入完整 route：**AIJudge/CIEval 显式传中央 provider、model、baseUrl、apiKey；snapshot 增加安全 endpoint alias/hash，保证快照对应真实请求。
3. **重构 Guardrail 路由生命周期：**移除 module-load-time endpoint/key/test-mode 捕获；按 run 构造并注入 routing；`LLM_TEST_MODE` 写入 manifest。
4. **清理误导命名：**把 DS/MM 变量改为 solver/backtranslation；把 `qwen3.6-plus`、DeepSeek 语义判定、MiniMax M2.7/M3 和双模型仲裁等过时注释改为当前事实。
5. **补预算账本：**验证价格数值与来源；实现 reserve/settle、并发安全、重试累计、usage 缺失停止和 20 CNY hard stop；价格未核实前继续禁止真实调用。
6. **补离线路由集成测试：**逐角色断言最终 URL alias、model、temperature、max tokens、profile/test-mode 与 telemetry/manifest 一致；增加无 preset 调用扫描测试。
7. **修复 smoke 执行入口：**至少让 `run-experiments.ts`、`experiment-runner.ts` 及本轮实际 smoke 依赖的 TypeScript 路径通过类型检查。
8. **再申请授权：**精确 chat completion、JSON/usage 的最小验证计划与成本上限由 P0/Human PI 单独审批；Secondary Judge 和全部 Guardrail 不得在首个连通 smoke 中默认全开。

## 10. 最强反对意见、时间与成本

最强反对意见：当前矩阵可能在静态单元测试中完全正确，却因 legacy `.env`、module-load 快照、未注入 Judge endpoint 或 TEST_MODE 在真实运行时走向不同 provider/model；即便路由正确，非原子预算门仍可能在多 Agent/Guardrail 重试中超支。

- 本轮已花/已承诺/最坏 API 成本：0/0/0 CNY。
- 零成本修复可先完成 1–7；无需扩大四页短文研究范围。
- 精确 chat completion 和价格验证属于后续独立门，不得在本任务中偷跑。

**P4-003 最终状态：FAIL_REVISE；静态路由矩阵可保留，付费 smoke 门继续关闭。**
