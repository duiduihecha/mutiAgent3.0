# P2-002 实验协议包

状态：设计完成，尚未实施。预算：0 CNY。

本目录冻结 P2-002 的三个协议组件：

1. `canonical-evaluation-schema.md`：所有实验条件的统一评价视图与映射规则；
2. `canonical-evaluation.schema.json`：机器可校验的 JSON Schema；
3. `experiment-manifest.md`、`experiment-manifest.schema.json` 与 `call-record.schema.json`：实验运行及逐调用追踪规范；
4. `human-blind-review-protocol.md`：两位评审者对同一批 15–20 份材料的盲评协议；
5. `human-review-form.csv`：可直接复制使用的空白评分表。

P4 B1–B4 的冻结修复见上级目录的 `P2-003-frozen-estimands-and-operations.md`；本地实现与验证结果见 `P2-003-implementation-report.md`。

本协议执行以下已批准决定：D-009 至 D-013。人工评价是 RQ1–RQ3 的主证据，独立 Judge 只能作为补充；KG 只进入探索性附录。

在 P0 确认 smoke 准入条件全部满足前，本目录中的设计不得触发模型、Judge 或 API 调用。
