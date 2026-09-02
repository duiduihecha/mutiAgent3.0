# 最小实施改动与 Smoke 准入门

本文件只描述后续实现；P2-002 未执行这些改动，也未运行付费测试。

## 1. 最小代码改动

### A. Canonical converter（新增，纯本地）

新增一个无网络、确定性的转换模块和命令行脚本：

- 输入：现有/新实验 raw output JSONL 与 case metadata；
- 输出：符合 `canonical-evaluation.schema.json` 的 JSONL；
- 只读取最终 `generated_content` 或 `learning_content`；
- 固定对象渲染顺序、旧字段别名和 warning；
- 输出 blind item、独立 key file、SHA-256；
- 单元测试覆盖 Full、Monolith、NoA3、NoA2A3、NoA5、缺字段和非法题型。

不得修改旧原始 JSONL；converter 输出到新 run 目录。

### B. Experiment telemetry（小范围修改运行器/LLM 封装）

在统一 LLM 调用边界记录逐调用 `calls.jsonl`：

- provider/model/version/endpoint；
- prompt template 与 rendered message hash；
- temperature/top_p/seed/max tokens；
- provider usage token；
- start/end/latency；
- status/error/retry_of；
- billed/estimated cost。

在 batch runner 开始和结束时生成/封存 manifest 与 artifact hash。密钥和完整 Authorization header 永不落盘。

### C. 公平 token controller（最小策略）

- 先只测量，不自动循环调用补齐预算；
- Full 累加所有 generation agent token，Monolith 累加其 generation token；
- guardrail/Judge/重试单列；
- smoke 后据实际分布调整统一输出上限和 prompt 配额；
- 只有每配对 ≤10%、条件均值 ≤5% 才准入 pilot。

### D. Blind pack builder（新增，纯本地）

- 从 canonical JSONL 和冻结 case list 生成 18 个匿名 item；
- 使用记录 seed 的随机化；
- 为 R1/R2 产生不同顺序；
- 生成 key file，但不把 condition 写入评审材料；
- 校验每位评审者收到完全相同的 item 集合。

### E. Human aggregation/statistics（新增，纯本地）

- 校验评分范围和缺失值；
- 按 D-011 生成 qualified/unqualified/uncertain；
- 计算一致性、配对统计、Holm 校正、A5 confusion matrix、Wilson CI 与 uncertain 上下界；
- 输出表格只能由冻结输入重新生成。

## 2. Smoke 前静态准入条件（0 CNY）

以下全部通过后才能请求 P0 批准 5 条付费 smoke：

1. canonical JSON Schema 和 manifest JSON Schema 可被本地 validator 加载；
2. converter 单元测试覆盖所有核心条件和缺失/非法输入；
3. 用现有 156 条数据本地转换成功，156 条全部保留，无条件选择性丢失；
4. Monolith 的 26 条最终 `comparison` 被正确映射，主评价不再读取占位符；
5. 所有条件的 canonical 字段来源完全一致；
6. blind pack 不含 condition、agent、model、A5、CIEval 或成本标签；
7. manifest 能在 mock/fixture 上完整记录 token、hash、延迟、失败与 0 成本；
8. API key/环境变量值不会写入任何产物；
9. 5 条 smoke case list 已分层冻结并计算 hash；
10. P0 批准具体模型、版本、prompt、重试规则和 20 CNY smoke 上限。

## 3. Smoke → Pilot 准入条件

5 个 base case 的 Full、Monolith、NoA3 全部完成后，只有同时满足以下条件才允许 10–15 条 pilot：

1. raw output、canonical output、calls、failures、manifest 和 checksums 全部存在且 schema-valid；
2. 每个 case/condition 恰有一个最终结果；失败保留且无静默替换；
3. Full vs Monolith 每配对总 generation token 相对差 ≤10%，条件均值差 ≤5%；
4. 相同模型/版本、知识输入和采样设置得到 trace 证明；
5. canonical 主评价文本不含 A2/A3 中间字段，且无条件标签泄漏；
6. 失败率 ≤10%，无认证、缓存泄漏、KG 意外访问或不可解释截断；
7. 实际 smoke 成本 ≤20 CNY，且账单可追溯到 call；
8. 端到端延迟和调用数记录完整；
9. 人工抽查 5 条确认映射忠实、未补写或删改内容；
10. P0 对 smoke 验收并单独授权 pilot。预算已批准不等于自动授权。

任一条件失败即停止，修复协议或实现后重新申请 smoke；不得直接扩大样本掩盖问题。

