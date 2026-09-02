# P2-006 LLM 调用规范化实施报告

## 结论

本轮在不发起任何真实 LLM/API 调用的前提下，完成了调用清单、核心 TypeScript 边界规范化、guardrail 旁路迁移、流式 telemetry、明确 mock、provider fail-closed、默认关闭真调用和 run budget 闸。独立 Python/Node 数据脚本采用渐进方案：不强行重写运行时，先加硬闸并在审计中列为未迁移 telemetry 项。

**实际新增 API 成本：0 CNY。**

## 实施内容

### 1. 统一 provider 与默认禁用

新增 `src/lib/llm-runtime-policy.ts`：

- provider 只允许 `mock|deepseek|minimax|openai|glm`；
- 未设置 `LLM_PROVIDER` 时默认 `mock`，不默认任何付费端；
- 未知 provider 抛 `LLMConfigurationError`；
- 真 provider 需 `LLM_REAL_CALLS_ENABLED=true`、`LLM_RUN_BUDGET_CNY>0`且 committed < limit；
- `mock` 返回本地固定内容，永不 fetch；
- `LLM_MOCK_MODE=true` 却显式指定真 provider 时直接失败。

这消除了“`LLM_PROVIDER=mock` 却从 switch default 落到 DeepSeek”的配置歧义。

### 2. 主路与 guardrail 边界

- A1→(A2+A3)→A4→A5 编排与业务 prompt 未改；A1 仍无 LLM，A2/A3/A4/A5 仍经 `BaseAgent` 调统一 `chat()`。
- `guardrail-service.ts` 的原生 `fetch` 已换成统一 `llmService.chat()` 适配器，保留原 provider/model/temperature/max tokens/AbortController 超时和上层安全降级。
- CIEval Judge、AI Judge、多语解释、知识库生成和外部 Monolith 原已走 unified 边界，本轮不更改其 prompt/模型/条件。

### 3. 流式接口

- 保留同一抽象下的 `chatStream()`；
- DeepSeek/MiniMax 保留原 token stream；mock 提供无网络 stream；
- OpenAI/GLM/未知 stream 不再回退 DeepSeek，而是显式 `LLMProviderError`；
- stream 开始记录 config/message hash，结束记 output hash、latency/status/error；真 stream 无 usage 时保留 null，不伪造 token/cost。

当前 `/api/explanations` 的 SSE 是业务进度流，内部仍一次次调非流式 `chat()`；本轮未改其语义。

### 4. telemetry 与隐私

每次有 experiment context 的 unified 调用可记：

- run/case/condition/category/agent label；
- provider/model；
- message/output/config/knowledge SHA-256；
- temperature/max tokens；
- prompt/completion/total tokens 及 estimated 状态；
- latency、success/failure、估算 cost CNY。

不记 API key、endpoint、完整 prompt/output 或 learner 原始资料。错误消息在 sink 前二次净化：仅保留 error name 和可识别 HTTP status，其他正文删除。

定价使用显式 `LLM_PRICE_<PROVIDER>_INPUT_CNY_PER_M` 和 `...OUTPUT...`。未配置价格的真调用记 `cost_cny=null`，不当作零成本。`getLLMRuntimeSnapshot()` 可为 manifest 生成不含密钥/端点的配置快照和 hash。

### 5. 独立脚本防误调用

下列仍保持原 HTTP 实现，但真调用前要求显式开关+正数 run budget：

- `simulate_students.mjs`；
- `seed-graph-edges.mjs` / `seed-graph-edges-patch.mjs`；
- `extend_manifested_in.py`；
- `generate_kps.py`（dry-run 仍允许零成本执行）；
- `src/services/guardrail_runner.py`。

这些脚本没有完整 telemetry，不得用于论文计费实验，除非后续迁移或实现同 schema sidecar。

## 本地验证

- Vitest：**130/130 passed**。
- Python protocol tools：**10/10 passed**。
- 新增/修改 Python 文件 `py_compile` 通过。
- 三个 `.mjs` 直连脚本与共享 gate `node --check` 通过。
- 离线测试验证：默认 mock 不 fetch；mock stream 不 fetch且产生 telemetry；未知 provider fail closed；真 provider 无授权/预算时被阻断；用本地 fetch stub 走过真 `chat()` 边界且无密钥/endpoint/prompt 落记录。
- 全库 `tsc` 仍有 70 行历史错误输出；按 P2-006 相关文件过滤后无新错误。本轮没有修改无关历史问题。

## 回滚点

主要变更可通过回退以下文件独立撤回：

1. `llm-runtime-policy.ts`与 `UnifiedLLMService` provider/gate/stream 变更；
2. `guardrail-service.ts` 的 `callLLM` 适配器；
3. `experiment-telemetry.ts` 新字段/错误净化；
4. standalone scripts 的 execution gate。

若 guardrail 适配器导致 provider endpoint 选择回归，应只回滚第 2 项，保留默认禁用和其他安全闸。

## 剩余 Blocker

1. 真实 provider 的 usage 返回、价格表和多调用预算扣减未经付费 smoke 验证。当前 budget gate 检查“有预算”，不是跨进程原子记账器。
2. DeepSeek/MiniMax stream 不能可靠得到 usage/cost，也尚未统一 retry。Pilot manifest 应冻结为非流式。
3. standalone Python/Node 旁路只加硬闸，无详细 telemetry。
4. provider client 部分配置仍在构造时读 env；不允许运行中改 endpoint/provider。
5. 全库 ts-check 历史基线未清零。

## 交付判定

**可交 P4 做静态审查，不可因此自动进入付费 smoke。** 任何真调用仍需冻结非流式配置、明确价格、通过 token/budget checker 并由 P0/Human PI 授权。
