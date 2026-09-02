# P2-007 反向自审

审查对象：模型配置矩阵、路由收口、Guardrail 级联、Judge 策略、价格/预算门、离线测试。

## 最强反对意见

1. **目录存在不等于推理端可用**：本轮只信任 Human PI 提供的 HTTP 200 目录事实，未验证这些精确 model id 的 chat completion、JSON、usage、超时或限流语义。
2. **本地路由正确不等于实验有效**：136 项测试只能证明解析、门禁和 mock 行为，不能证明生成质量、Judge 可靠性或 RQ 结论。
3. **“本地规则优先”尚非整个 Guardrail 的形式化有限状态机**：A5 已做到 clean item 零调用，但 A2/A3 各有任务特定模型检查。不应宣称“所有项目都只在本地可疑后调 LLM”。
4. **Secondary Judge 策略需样本级执行证据**：API 默认不全量，但未来 runner 仍需 manifest 列明校准子集和触发原因。
5. **全库 TypeScript 基线不绿**：虽然本轮定向与项目测试全绿，但全库类型检查仍有历史错误。这阻止将“可构建”作为 smoke 准入证据。

## 证据、时间和成本

- 可复核证据：路由矩阵、配置源、schema、136 项 Vitest 输出，以及全库 typecheck 失败列表。
- 本轮已花/已承诺/最坏成本：0/0/0 CNY。
- 最小后续时间：P4 静态复核 0.5 天；价格核实与 manifest 预检 0.5 天；付费 smoke 必须另行授权。
- 无需为模型配置重新扩张 4 页短文主线；Judge/Guardrail 继续是补充/描述性证据。

## 裁决

**PASS_WITH_CONDITIONS，可交 P4 做静态复核，不可进入付费 smoke。**

准入条件：核实 e-flowcode 价格；冻结单一 profile 的 manifest；对每个新路由各做最小授权 smoke 计划；明确 Secondary Judge 子集/分歧触发；不得用测试通过替代人工盲评或论文有效性。
