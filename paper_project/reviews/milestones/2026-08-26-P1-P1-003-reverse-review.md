# P1-004：P1-003 文献与 Gap 节点反向审查

- 审查日期：2026-08-26
- 审查角色：P1（自审，不构成独立批准）
- 审查对象：P1-003 增量检索、21 篇 approved 池、竞争工作矩阵、Gap 表述、BibTeX 与 citation-claim map
- 预算：已花费 0 CNY；已承诺 0 CNY；本审查未调用付费模型/API
- 裁决：**FAIL_REVISE**

## 1. 最强反对意见

P1-003 最可能错误的结论不是某一篇文献的具体摘要，而是“这一轮检索已经足以支持当前 Gap 定位”。日志只保存了搜索式和人工填写的可见命中数，没有保存逐条结果、去重表或真实引用链；所谓“前向/后向滚雪球”多处实际是主题关键词跳转。因此第三方无法复算 11/9/14/13 的分母，也无法确认没有漏掉最危险的直接竞争工作。21 篇 approved 只能解释为“已核验文献池”，不能解释为“覆盖充分的竞争集合”。

一个足以推翻当前定位的反例是：存在一篇已发表工作，同时做 native/L1-culture-conditioned Chinese-L2 content generation、角色或组件消融，并评价输出准入/复用风险。当前检索设计没有足够能力排除该反例。

## 2. 发现与证据位置

### F1 — Blocker：滚雪球记录名实不符，覆盖不可复核

- `P1-003_incremental_search_log.md:20-25` 将多条链明确写为“前向主题追踪”“关键词前向”，但没有记录 seed 的参考文献条目、citing-paper 列表、使用的 citation index、每层筛选数或稳定标识。这不是严格的前向/后向 citation snowballing。
- `P1-003_incremental_search_log.md:9-12` 的可见命中数没有原始结果导出、逐条题录或去重日志。搜索引擎排序可变，第三方不能重现这些数字。
- 后果：日志可证明“做过一轮定向发现”，不能证明检索覆盖率，也不能支撑“停止后未漏直接竞争工作”。

### F2 — Blocker：停止标准是“每槽一篇”，不是饱和或覆盖标准

- `P1-003_incremental_search_log.md:29` 以四个证据槽各有一篇为主要停止依据；这只能证明最小填槽完成，不能证明新增候选已经主题饱和。
- 检索主要通过公开 Web、ACL、arXiv 和 ACM 线索，没有可见的 Crossref/OpenAlex/Semantic Scholar 引用链核对，也没有系统的中文检索式和中文学术站点记录。
- `candidate_and_rejected.csv:3,7` 已经暴露两个可能改变 RQ1 覆盖判断的线索：中文教育多智能体工作和 student-reflection SAS/MAS 工作仍未核验。它们不能引用，但也意味着停止过早。

### F3 — Major：RQ1、RQ3 仍缺“同任务直接竞争”，矩阵把方法邻居写得过近

- RQ1 现有最接近的两条分别是教育 workshop MultiTutor 和非教育多跳推理预印本 Tran & Kiela；`competitive_work_matrix.md:5-6` 已承认二者各缺公平教育任务或教育场景。尚无已核验文献同时满足教育内容生成、MAS/SAS 与公平预算。
- RQ3 的 CodeHelp/CodeGuard 关注编程帮助或输入安全，Spiral of Silence 关注开放域检索反馈；`competitive_work_matrix.md:20-22` 均不是教育输出内容进入缓存前的准入评价。把它们称“direct neighbor”尚可，把它们当直接竞争证据则会被击穿。
- RQ2 的 CLCA 有真实组件消融，但目标是 WVS 文化价值对齐，不是母语文化条件下的中文教学内容；`approved_literature.csv:18` 已记录该边界。当前没有核验到 A3 等价组件的直接工作，不代表不存在。

### F4 — Major：新增 6 篇的核验强度与版本风险不一致

| 文献 | 反向风险 | 当前处置判断 |
|---|---|---|
| Tran & Kiela 2026 | arXiv v2；非教育、多跳推理；标题本身是强结论 | 可保留为 preprint 方法警示，只能写“该研究在其任务中报告”；不得用来定义教育任务的预期方向。 |
| CLCA 2025 | ACL 正式论文；消融真实，但文化价值对齐与教学语用不同 | 可保留，必须持续标注 task mismatch。 |
| CLTE 2025 | EMNLP 正式论文；直接覆盖中文二语内容设计 | 可保留；它显著削弱“中文二语自动生成不足/缺失”的 Gap。 |
| CodeHelp | approved 表写 2023，BibTeX 写 `pages={1--11}`；检索记录还出现 ACM article-number `8:1–8:11` 与部分二手来源标 2024 的冲突 | 在核对 ACM 原始 proceedings 元数据前，不应把当前 BibTeX 视为最终正确；正文论断仅限 arXiv 摘要/正式元数据能共同支持的部署与 guardrail 描述。 |
| Spiral of Silence 2024 | arXiv 预印本；开放域 RAG，不是教育缓存 | 可作为概念动机，不能作为 RQ3 直接竞争或 gate 有效性证据；正文非必需。 |
| Cui & Sachan 2023 | ACL 正式论文；语言练习生成但非中文、非跨文化 | 可保留为广义语言学习生成邻居，不能填补中文直接竞争槽。 |

此外，21 篇池中至少包含 5 条明确的 arXiv preprint（Edge、Godwin-Jones、Peng、Tran、Spiral）。`approved` 当前混合“真实性已核验”和“建议正文采用”两个概念，容易让下游误把预印本或低相关文献全部写入正文。应增加 `citation_recommendation` 或建立 main/optional/background 分层。

### F5 — Major：部分证据位置仍不足以支持逐句复核

- 新增记录中的 `PDF results section`、`deployment/evaluation description`、`PDF feedback-loop setup and discussion` 不是稳定页码/表号；见 `citation_claim_map.csv` 的 RW29、RW34、RW35。
- P1 合约要求事实论断定位到页码、章节、表格或实验段落。CLCA/CLTE 已较具体，Tran 结果、CodeHelp、Spiral 与 Cui 的证据位置仍应补成页码/节/表。
- `approved_literature.csv:20` 对 CodeHelp 同时使用“arXiv abstract；publisher metadata；deployment/evaluation description”，但没有说明哪个位置支持哪条论断，存在证据拼接风险。

### F6 — Major：现有 Gap 句仍可能被审稿人击穿

- `related_work_positioning.md:36` 的 “these strands are commonly evaluated under different tasks and assumptions” 是未量化的跨文献归纳。`commonly` 仍暗示覆盖性判断；更安全的是逐项列举已核验邻居，再说 “we therefore frame our contribution as an evaluation in this task setting”。
- `related_work_positioning.md:40` 的“在同一中文二语跨文化任务中联合评价三项 RQ”若被用于暗示组合新颖性，仍可能变成隐性 `novel combination`。必须明确这是论文的研究设计描述，不是文献空白断言。
- “native-culture-aware” 容易被审稿人质疑将语言、国籍和文化等同。文献池尚不足以支持八大“母语文化圈”的代表性；应把它写成输入条件/系统操作化，并在 Limitations 中承认粗粒度与本质化风险。
- RQ3 的 “cache contamination” 可能被认为把一次错误缓存命中夸大成生态污染。若实验只测准入率，应优先写 `low-quality cache admission` / `cache-entry risk`，只有观察到错误复用或下游传播时再写 contamination reduction。

### F7 — Minor：元数据一致性已改善，但仍不是投稿级冻结

- `liu2025intercultural` 已统一，Godwin-Jones 已按 arXiv 预印本记录；这两项修复可复核。
- BibTeX 与 approved ID 数量一致不等于元数据全部正确。CodeHelp article number/pages 是明确待核项；所有 arXiv 条目还应在投稿前复查是否出现正式版本。
- `publication_status=verified` 应与“元数据核验等级”分离：正式出版、正式 workshop、预印本、仅权威摘要支持的正文论断风险不同。

## 3. 哪个结论最可能错、替代解释是什么

最可能错的是“新增 6 篇后直接竞争工作覆盖已经足够”。更简单的替代解释是：检索引擎把高可见度英文 NLP/arXiv 工作排在前面，而中文教育技术、CALL、应用语言学和数据库收录工作没有被相同强度检索；所谓重复结果只是 Web 排序重复，不是领域饱和。

另一个替代解释是，当前 Gap 看似可防守，主要来自措辞极度收缩，而不是检索已经证明独特性。这种收缩可作为安全写作策略，但不能被报告为文献发现。

## 4. 时间可行性

有限返工可在不影响 2026-09-15 长短文门的情况下完成：

- 2026-08-29 前：修正 CodeHelp 元数据；为新增 6 篇补稳定证据位置；将 approved 分成 `main-citable / optional / background-only`。预计 2–3 人时。
- 2026-09-03 前：对 4 个种子各做一层真实 backward/forward citation snowballing，保存逐条题录、稳定 ID、纳排理由；同时补中文检索式。预计 4–6 人时。
- 2026-09-10 前：形成长短文门前的文献冻结快照。若仍找不到同任务直接竞争，只能报告“本次检索未识别到”，不得写 absence claim。
- 2026-09-29 至 2026-10-02：投稿前更新检索，复查 2026 新论文和预印本正式版本。预计 2–3 人时。

总计约 8–12 人时。若 2026-09-03 前无法完成，删除 KG 文献扩展和低相关背景核验，优先保证 RQ1–RQ3 三条直接竞争轴；不得挤占实验和人工评审关键路径。

## 5. 成本可行性

- 本节点模型/API 成本：0 CNY；承诺成本：0 CNY。
- 返工计划使用公开出版页、免费索引和本地 CSV，预计模型/API 成本仍为 0 CNY，不触及 500 CNY 上限或 350 CNY 缩减线。
- 最坏情况是部分中文数据库或 ACM 全文不可访问。零成本替代是使用权威题录页、作者存档和开放引用索引；仍无法取得原文则标记 `unverified`，不购买、不猜测、不进入 approved。
- 主要成本是 8–12 人时，而非 API 费用。应限制为一层滚雪球和两个固定更新点，避免演变为系统综述。

## 6. 剩余 Blocker

1. **B-P1-01：** 现有滚雪球链不可复现，命中数没有逐条审计底稿。
2. **B-P1-02：** CodeHelp 最终出版年、article number/页码尚未按 ACM 原始记录统一。
3. **B-P1-03：** 未对中文教育/CALL 来源和三个同任务直接竞争槽完成一层真实引用链检查。
4. **B-P1-04：** `commonly evaluated...`、三项 RQ “联合评价”及 `cache contamination` 仍可能被下游写作误用为覆盖性或新颖性断言。
5. **B-P1-05：** 缺少投稿前文献更新门，2026 年预印本/正式版本可能在截稿前变化。

## 7. 裁决

**FAIL_REVISE。**

P1-003 可以作为“零成本定向发现轮”的工作底稿，但不能作为最终检索闭合证据，21 篇池也不能整体视为正文推荐引用。现有保守定位可以暂供实验设计使用，但 Related Work/Gaps 不得标记为最终冻结，且不得据此批准任何 `first`、absence 或隐性组合新颖性表述。本自审不能代替 P4 独立复审。

## 8. 下一门准入条件

P1 文献与 Gap 节点重新进入 `PASS_WITH_CONDITIONS` 至少需要同时满足：

1. 为四条证据轴各完成一层真实前向或后向 citation snowballing，保存 seed、索引/站点、稳定 ID、逐条纳排和停止依据；无法取得引用链时明确写“主题增量检索”，不得冒称滚雪球。
2. 对 RQ1 教育公平 MAS/SAS、RQ2 native/L1-culture-conditioned 中文教学生成、RQ3 教育输出准入/缓存复用三个直接槽各给出“找到的直接工作”或可审计的未识别结果；后者仍不授权 absence claim。
3. 核正 CodeHelp 正式元数据，并为新增 6 篇每条正文可用结论补到页码/章节/表格；所有预印本显式标注版本和非正式状态。
4. 将 21 篇分层为正文核心、可选邻近、仅背景；BibTeX 可以保留 verified pool，但论文正文只引用与具体论断直接匹配的层级。
5. 将综合定位改为逐项事实描述；删除或限定 `commonly`，把三 RQ 联合表述明确标成本文设计而非新颖性结论；RQ3 优先使用 `low-quality cache admission risk`。
6. 在 2026-09-10 前完成一次门前快照，并在 2026-09-29 至 10-02 做一次投稿前更新检索与预印本版本核查。
7. 由 P4 独立复审，P0/Human PI 决定文献节点是否通过。
