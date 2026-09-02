# Experiment Manifest Protocol v1.0

## 1. 文件层级

每个实验批次保存一个 immutable run manifest；每次模型/API 调用保存一条 call record。建议目录：

```text
experiments/<experiment_id>/<run_id>/
  manifest.json
  calls.jsonl
  raw_outputs.jsonl
  canonical_outputs.jsonl
  failures.jsonl
  blind/
    items.jsonl
    reviewer-order-r1.csv
    reviewer-order-r2.csv
  checksums.sha256
```

不得覆盖旧 run。重试产生新的 `call_id`，并用 `retry_of` 指向原调用。

## 2. Run manifest 必填内容

P2-007 追加冻结项：`generation_config.profile` 必须是 `daily` 或 `quality`，并与精确 `model` 及 `routing_sha256` 一起写入 manifest。同一 `run_id` 不得切换 profile。e-flowcode 价格未核实时，`estimated_cny`/`actual_cny` 可为 `null`，`status=pricing_unconfigured`；在价格补齐前真实调用 fail closed。

- 标识：experiment/run ID、阶段（smoke/pilot/formal/judge）、RQ、条件、UTC 与本地时间；
- 版本：代码提交或源码归档 hash、dirty 状态、数据集版本/hash、case-list hash、schema 版本、converter hash；
- 模型：provider、模型名、可获得的精确版本/发布日期、endpoint 标识；
- 生成设置：temperature、top_p、seed、max input/output tokens、response format、timeout、retry policy；
- Prompt：system/user/template 的 SHA-256、模板版本、渲染后 prompt hash；正式 manifest 不必保存密钥；
- 公平预算：各条件输入、输出及总 token 汇总，配对差、容差判定；
- 运行量：计划/完成/失败/重试调用数；
- 性能与成本：端到端及逐调用延迟、供应商 usage、单价来源版本、估算/实际 CNY；
- 失败：错误类型、HTTP 状态、可重试性、截断/解析/超时信息；
- 产物：每个文件路径、记录数和 SHA-256；
- 审批：设计冻结人、执行批准人、预算上限和停止原因。

## 3. Token 公平规则

主要匹配量：

```text
total_tokens(condition, case)
  = sum(prompt_tokens + completion_tokens over all calls)
```

必须同时保存：

- `prompt_tokens`、`completion_tokens`、`total_tokens`；
- provider 返回的 usage 原值；
- 若 provider 不返回 usage，使用冻结 tokenizer 本地估算，并标 `estimated=true`；
- Full 的所有 agent 调用累加，Monolith 的全部调用累加；
- Judge、重试和 guardrail token 与 generation 分开统计，不得混入主要生成预算。

建议 smoke 准入容差：每个配对总 token 相对差 ≤10%，条件均值相对差 ≤5%。若需 padding，不得用无意义输出；应调整统一输出预算或上下文配额并重新 smoke。

## 4. Prompt hash

分别记录：

- `template_sha256`：源模板文件或模板字符串；
- `rendered_system_sha256`；
- `rendered_user_sha256`；
- `messages_sha256`：规范 JSON（UTF-8、固定键序、无多余空白）；
- 可选保存去密钥后的完整 prompt 快照。

任何 prompt 文字变化均创建新 protocol/run 版本，不得沿用同一 run ID。

## 5. 成本账本

按 smoke、pilot generation、pilot judge、formal generation、formal judge、故障预留分别累计。每条 call record保存：

- 计费输入/输出 token；
- 单价及计价单位；
- 原币种成本；
- 汇率来源与日期（若需要）；
- 换算 CNY；
- `estimated` 或 `billed` 状态。

累计支出达到 350 CNY 时立即停止非关键调用并通知 P0；500 CNY 为不可突破硬上限。本阶段为 0 CNY，不执行任何调用。

## 6. 失败分类

标准错误类别：`TIMEOUT`、`RATE_LIMIT`、`AUTH`、`PROVIDER_5XX`、`EMPTY_RESPONSE`、`TRUNCATED`、`INVALID_JSON`、`SCHEMA_INVALID`、`CONTENT_FILTER`、`KG_UNAVAILABLE`、`CACHE_LEAK`、`UNKNOWN`。

失败样本保留在主分析分母；同时报告 complete-case 敏感性结果。重试策略必须在运行前冻结。
