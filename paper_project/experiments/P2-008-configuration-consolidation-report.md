# P2-008 LLM 配置彻底收口报告

日期：2026-08-26  
预算/实际成本：0/0 CNY  
执行边界：未调用真实 generation、Judge、Guardrail 或其他外部 API。

## 1. 收口结果

`UnifiedLLMService` 现在构造时必须绑定一个 `llm-config` preset（为兼容保留的构造默认也固定为 `generation`，不读 `LLM_PROVIDER`）。每次 `chat/chatStream` 会重新从 preset 解析 provider、model、endpoint 和 key；调用方如传入 provider/model，只能作为与角色路由完全相同的断言，不一致即 fail closed。

`.env` 只修改了非秘密开关：

- `LLM_PROVIDER=mock`
- `LLM_MOCK_MODE=true`
- `LLM_REAL_CALLS_ENABLED=false`
- `LLM_GENERATION_PROFILE=daily`

未显示、删除或改写任何 key。

## 2. 冻结角色

| preset | 模型 |
|---|---|
| `generation` + `daily` | `deepseek-v4-flash` |
| `generation` + `quality` | `deepseek-v4-pro` |
| `judge` | `qwen3.8-max` |
| `judge2` | `glm-5.2` |
| `guardrail_backtranslation` | `kimi-k2.6` |
| `guardrail_binary` | `qwen3.6-flash` |
| `guardrail_solver` | `qwen3.7-max` |
| `guardrail_final` | `glm-5.2` |
| `mock` | `offline-mock`（永不联网） |

## 3. `src` 活跃调用清单

| 调用者 | preset | 说明 |
|---|---|---|
| `multi-agent-system.ts` | `generation` | A2/A3/A4/A5 保持原编排，模型由 profile 决定 |
| `knowledge-base-service.ts` 两个生成服务 | `generation` | 原无 options 调用不再读旧 provider |
| `multi-language-explanation-service.ts` | `generation` | 同上 |
| `ai-judge.ts` | `judge` | provider/model 必须匹配 `qwen3.8-max` |
| `cieval-judge.ts` | `judge`/`judge2` | 只允许两个 Judge preset，删除 provider/model 代码级 override |
| `guardrail-service.ts` | 四个 guardrail preset | 按精确 model 映射到唯一角色；未知 model 拒绝 |
| `/api/test/llm` | 显式 allowlist，默认 `mock` | 不再接受 deepseek/minimax provider 选择；GET 不披露 key/endpoint |
| `UnifiedLLMService.generateCulturalExplanation` | `generation` | 内部显式 preset |

静态扫描结果：`src` 中没有参数为空的 `new UnifiedLLMService()`；业务调用者之外的 `chat/completions` fetch 只存在于 `unified-llm-service.ts` 内部 client。DeepSeek/MiniMax/GLM legacy clients 保留代码兼容，但当前任一活跃 preset 都不会选中它们。

`chatStream` 当前无活跃业务 caller。`mock` stream 离线可用；e-flowcode/OpenAI-compatible stream 尚未实现，会显式报错，不换 provider。

## 4. 仍存的 legacy 路径

| 文件 | 类型 | 状态/门禁 |
|---|---|---|
| `scripts/seed-graph-edges.mjs` / `seed-graph-edges-patch.mjs` | Node HTTP 直连 | 需 real-call=true、正预算、未耗尽 committed 且 `LLM_LEGACY_PRICE_VERIFIED=true` |
| `scripts/simulate_students.mjs` | Node HTTP 直连 | 同上；默认关闭 |
| `scripts/generate_kps.py` | Python HTTP 直连 | 新增 real-call+预算+历史价格核验三重门 |
| `scripts/extend_manifested_in.py` | Python HTTP 直连 | 同上 |
| `scripts/run_gpt5_generate.ts` | 过时 TS 实验 | 显式进 `generation` preset；其未验证 `gpt-5.5` override 必然在 fetch 前被拒绝 |
| `scripts/cieval_leaderboard_run.ts` | 过时 TS 外部 provider 比较 | 显式进 `generation` preset；deepseek/glm/minimax override 在 fetch 前被拒绝 |

这些脚本不进入当前论文 Pilot，不应被当作新配置的使用示例。

## 5. 验证

- P2-007/008 定向 Vitest：13/13 通过。
- 全 Vitest：6 files，139/139 通过。
- 离线覆盖：旧 `LLM_PROVIDER=deepseek` 不影响无 options 调用；默认真实调用禁用；未定价在 fetch 前失败；mock chat/stream 均不 fetch；路由快照覆盖所有角色精确 model id。
- legacy Node gate 在默认环境下本地抛错，未联网。两个 Python legacy 脚本通过语法编译。
- `ts-check`：失败，剩余错误位于旧 run-experiments、learning UI、evaluation metrics 与 experiment-runner 类型。本轮触及的 CIEval legacy 脚本中两个已有类型错误已修复；配置/路由文件没有新增 type error。

## 6. 改动文件

- `.env`
- `src/lib/llm-config.ts`
- `src/lib/unified-llm-service.ts`
- `src/lib/knowledge-base-service.ts`
- `src/lib/multi-language-explanation-service.ts`
- `src/lib/multi-agent-system.ts`
- `src/lib/ai-judge.ts`
- `src/lib/cieval-judge.ts`
- `src/services/guardrail-service.ts`
- `src/app/api/test/llm/route.ts`
- `src/__tests__/experiment-telemetry.test.ts`
- `src/__tests__/llm-config-routing.test.ts`
- `scripts/lib/llm-execution-gate.mjs`
- `scripts/generate_kps.py`
- `scripts/extend_manifested_in.py`
- `scripts/run_gpt5_generate.ts`
- `scripts/cieval_leaderboard_run.ts`
- `scripts/cieval_consistency.ts`
- 本报告、P2-008 反向自审、`TASKS.yaml`、`STATE.yaml`
