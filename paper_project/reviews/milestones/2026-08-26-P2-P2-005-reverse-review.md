# P2-005 反向自审

## 审查对象与最强反对意见

审查 converter v1.1、NoA3 操作、telemetry/token 工具、156 条诊断、简化盲评接口、6-case 证据卡与双图谱审计。最强反对意见是：这些工具只能证明“数据能被一致整形”，不能证明历史内容正确、条件真正可比或新 Pilot 可发放。

## 主动证伪结果

1. **converter 可以忠实映射错内容**：156/156 schema-valid，但 108 条触发文化错配警报，15 条不 strict-complete。结构通过不是内容有效。
2. **历史 case registry 不可复原**：26 个历史 base ID 仅 1 个与当前 168-case registry 同 ID。converter 只从冻结 ID 后缀恢复 culture/HSK，并不猜 domain/scene；来源完整性仍有缺口。
3. **隐性泄盲未消失**：Monolith 平均 1405.4 字符，Full 1828.4；Monolith 仅 11/26 strict-complete，其他主要条件 26/26。评审可从长度/缺字段推测条件。旧 18 份盲包废弃是必要的，不是保守选择。
4. **NoA3 代码操作已改正，但未经真模型 smoke**：静态代码显示 A4 任务/schema 同一，只缺 A3 中间文本；模型是否在空 XML 下产生系统性格式差仍是未验证假设。
5. **telemetry 已接边界但未具备付费准入**：离线 mock 证明记录与不泄密，但实际记录 `cost_cny=null`、未验证每个供应商 usage 总是返回，流式边界也未纳入。token checker 会对未知成本 fail closed，这是正确的 blocker。
6. **双图谱不支持主贡献**：文化/语言子图有空命中回退、ID 漂移和文化别名错配；学习者子图把 pipeline confidence 与答题正确率覆盖写入同一 `MASTERED.score`，且 `hc_${native_language}` 可与 `hc_ja` 等种子 ID 失配。因此 GraphRAG、硬 grounding、掌握度推荐闭环都不能作现有结论。
7. **RQ3 只能描述**：API 真正阻断分母是 `FLAG_REJECT`，`FLAG_PENDING_REVIEW` 仍交付。旧“passed=false=拒绝”会虚构误杀。D-016 降级后只报 action/交付/缓存计数是唯一安全说法。

## 测试覆盖缺口

- Python 10 项和 Vitest 128 项均通过，但没有真实 Neo4j/Supabase 只读快照、没有真模型、没有真评审者。
- 全库 ts-check 仍有多处历史错误，不能宣称 build gate 通过。
- 文化语言检查对日/韩/阿/俄/泰仅用 script heuristic，对英/西/法标成不可仅凭字符集判定；108 是警报而非 108 个已证实错误。
- 静态 schema 替代已锁定但与 JSON Schema 2020-12 引擎不等价；P4 应检查两者字段漂移。

## 时间、成本与关键路径

- 本节点已花 API 成本：**0 CNY**；已承诺：0；未授权最坏 API 成本：0。仍在 500 CNY 总上限/350 CNY 缩减线内。
- 交 P4 静态复核：立即；预计 0.5–1 天。
- 最快 Pilot 准入：P4 问题修复（0.5–1 天）→六张证据卡人工核对（1–2 天）→修复相关 ts/build 门与定价（0.5–1 天）→P0/Human PI 单独批准。最坏 4 天，不含付费生成/人评。
- KG 在库只读快照+断边诊断增 0.5 天/0 API CNY；六 case KG/NoKG 实验增至少 1–2 天工程/评审及未批准生成费。对 4 页短文不值得进入关键路径，只保留附录方案。

## 裁决

**PASS_WITH_CONDITIONS（仅限交 P4 静态复核）**。不是 smoke PASS，不是问卷发放 PASS，更不是实验结论 PASS。

P4 必须独立核对：(1) research object 语义；(2) NoA3 是否只缺中间证据；(3) 108 条警报的规则与抽样手核；(4) telemetry/token fail-closed；(5) RQ3 真实 action；(6) 双图谱不被写成 GraphRAG/已验证闭环。
