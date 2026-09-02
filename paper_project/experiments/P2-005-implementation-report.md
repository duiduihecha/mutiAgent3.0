# P2-005 实施报告（0 CNY）

## 结论

P2-005 已完成零成本修复与本地诊断，但**既有 156 条不能当新 Pilot 效果证据**。它们现在能作为数据质量/错误模式证据：156/156 保留、156/156 通过锁定代码实现的静态 schema 验证、141/156 严格完整，Monolith 26/26 最终 comparison 正确映射，`native_ratio` 材料泄漏从旧转换的 130/156 降为 0/156。同时 108/156 被高召回规则标记为非英语目标下的英语/西方文化指称，需人工证据卡核对。

## 代码与协议修复

- `constants.ts` 补全 8 个“…圈”别名并增加 strict resolver；A4 不再对未知文化静默回退 `en`。
- NoA3 的 A4 最终任务、comparison 要求和输出 schema 与 Full 一致；唯一差异是 `<cross_cultural_comparison>` 是否含 A3 中间产物。已删除“本实验条件已移除 A3”和“请勿编造比较”。
- converter v1.1 只从 `generated_content`/回退 `learning_content` 构造 condition-invariant generated instructional artifact，不声称复现部署 UI；记录每个字段的来源与排除字段。
- 结构合法与内容有效分离：`validate_canonical_static` 严格检查顶层键/类型/版本；`strict_complete` 另查 3–5 语言点、5 道练习与题型约束。锁定依赖无 AJV/jsonschema，故使用明确静态替代，没有临时下载依赖。
- 时间遥测已接入 `UnifiedLLMService.chat()` 真实非流式 LLM 边界，由 `AsyncLocalStorage` 携带 run/case/condition/knowledge hash；只记 provider/model/message hash/config/usage/延迟/状态，不记 prompt、API key 或 endpoint。离线 fetch mock 端到端测试已证明不泄密。
- token checker 现检查 planned case 缺对、usage 和、成功/失败、重试引用、唯一 call ID、message/model hash、未知成本与预算超限；Judge 不进生成 token 公平性分母。
- RQ3 对齐真实 API：仅 `FLAG_REJECT` 阻断，`FLAG_PENDING_REVIEW` 交付但降低 confidence/缓存准入；短文只描述。
- 旧 18 份盲包已加 `DEPRECATED—DO NOT DISTRIBUTE`；本轮未生成新问卷/盲包。评分接口去除总体偏好，保留文化正确性、盲化整体质量、yes/no 和问题标签。
- 已建 6 个候选 case 的 `UNVERIFIED` 来源证据卡模板，未伪造来源。双图谱审计见 `P2-005-dual-knowledge-graph-audit.md`。

## 156 条诊断

| condition | n | 平均材料字符 | strict complete | 文化错配警报 |
|---|---:|---:|---:|---:|
| C1 Full | 26 | 1828.4 | 26 | 22 |
| C2 Monolith | 26 | 1405.4 | 11 | 1 |
| C3 NoA3 | 26 | 1934.1 | 26 | 21 |
| C4 NoA5 | 26 | 1750.6 | 26 | 22 |
| C5 NoA2A3 | 26 | 1763.4 | 26 | 21 |
| C1 Full repeat | 26 | 1797.5 | 26 | 21 |

这一分布本身是隐性泄盲诊断：Monolith 平均长度明显较短、完整性缺口集中，文化错配模式也与其他条件强相关。即使删除显式 Agent 名，评审者仍可能从长度、完整性和文化模板推断条件。故旧材料不发放。

## 本地验证

- Python protocol tools: **10/10 passed**。
- Vitest 全部：**128/128 passed**，其中新增真实 chat 边界的无网络 mock 遥测测试与 NoA3 任务同一性源码契约测试。
- 156 条转换：156/156 输出，156/156 静态 schema-valid，Monolith comparison 26/26，native_ratio 0/156。
- 全库 `tsc` 仍失败；错误包括历史 scripts、learning UI、evaluation metrics 等既有类型问题，以及 `experiment-runner` 既有 `PipelineMetadata` cast。新增 Vitest 通过，但 ts-check 仍是 smoke blocker，不得写成全库类型门已过。

## 剩余 Blocker / smoke 准入

1. P4 复核 converter 语义、NoA3 任务同一性、telemetry 和双图谱主张边界。
2. 人工完成 6 张文化来源卡；所有 Pilot 材料 strict complete，无目标 culture 错配且隐性泄盲风险可报告。
3. 修复或冻结与 smoke 相关的 ts-check 基线；manifest 必须有实际定价，任一 `cost_cny=null` 不得通过预算门。
4. P0/Human PI 另行批准付费 smoke。本任务未申请、未运行。

**交 P4 结论**：可交 P4 做静态复核；不可进入付费 smoke 或问卷发放。
