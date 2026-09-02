# P1-005 修复后反向自审

- 日期：2026-08-26
- 角色：P1（自审，不代替 P4 独立复审）
- 审查对象：P1-004 的五项 Blocker、短文引用分层、元数据、证据位置、定位语言和投稿前更新门
- 路线：D-016 四页短文；6-case × 3 条件仅为 Pilot
- 成本：已花费 0 CNY；已承诺 0 CNY；最坏 API 成本 0 CNY
- 裁决：**PASS_WITH_CONDITIONS**

## 1. 最强反对意见

即使完成本轮修复，21 篇仍不是系统综述或领域饱和样本。最危险的误用是下游作者把 `main-citable` 理解成“这些文献证明本文新颖”，或把一层 backward chain 理解成“已排除所有直接竞争”。本轮只能证明：短文所需的若干背景论断有可定位来源，原检索性质已被如实标注，且没有再用覆盖性语言包装 Pilot。

## 2. 对 P1-004 Blocker 的逐项复核

### B-P1-01：滚雪球链不可复现 — 已修复到短文所需程度

- `literature/P1-003_incremental_search_log.md` 已把原过程改名为“主题增量检索”，明确原命中数不可完全重放且不得用于覆盖率判断。
- 同文件新增一层真实 backward citation chain：seed 为 Tran & Kiela 2026，定位到 PDF Related Work pp.2-3 与 References pp.10-11；记录 Gao 2025、Li et al. 2025 PAKDD、Han et al. 2025 Findings ACL 的稳定标识、核验动作和处置理由。
- 限制：只完成一个 seed 的一层链，不允许据此作领域缺失性判断。D-016 已取消系统综述目标，因此不再扩张第二层。

### B-P1-02：CodeHelp 元数据冲突 — 已修复

- `approved_literature.csv` 与 `approved_references.bib` 统一为 2023、Koli Calling 2023、DOI `10.1145/3631802.3631830`、页码/文章编号 `8:1–8:11`。
- 核验交叉来源：作者手稿；DBLP `conf/kolicalling/LiffitonSS023`; Illinois Wesleyan 权威机构记录（Published 2023-11-13）。部分二手来源写 2024，未采用。
- 正文允许论断定位到作者手稿 Sections 1、3.2、5、Figure 4 和 Table 1；该文已降为 `background-only`。

### B-P1-03：同任务直接槽与中文/CALL 扩张不足 — 按 D-016 降级而关闭

- 真实 backward chain 找到正式 PAKDD 教育 SAS/MAS 评估工作，但其任务是 student-reflection assessment，不是教学内容生成，故记录为 `verified_not_approved_scope`。
- CLTE 已作为中文二语教学内容生成的直接任务背景；其证据位置补至 Section 3 和 Appendix A Figure 6。
- 短文不再声称没有同任务工作，也不以 Gap 覆盖作为贡献。主线改为评价污染审计、统一协议与角色化 Pilot，因此不继续扩张中文数据库或 CALL 系统综述。

### B-P1-04：覆盖性与 RQ3 语言 — 已修复

- `related_work_positioning.md` 的综合段已删除 `commonly` 类覆盖性归纳，只逐项列出已有先例并描述本文实际工作。
- 明确四页短文不主张一般架构优势或角色因果效应。
- RQ3 统一为 `low-quality cache admission risk`，只作描述性背景/Limitations；CodeHelp、CodeGuard、Spiral 均为 `background-only`。
- `novelty_risk_review.md` 与 `competitive_work_matrix.md` 已同步。

### B-P1-05：投稿前更新门缺失 — 已修复为计划门

- 新增 `literature/submission_update_gate.md`，执行窗口为 2026-09-29 至 10-02。
- 门包含新文献检索、main-citable 版本/撤稿检查、正文 citation-key 核对及 `material_competitor_found` 升级路径。
- 当前只能确认“门已建立”；执行结果要到窗口期后才能验收。

## 3. 引用池与证据准确性

- 21 篇 approved 与 21 条 BibTeX 一一对应；`reference_tiers.csv` 也覆盖同一组 citation IDs。
- 分层结果：7 篇 `main-citable`、6 篇 `optional`、8 篇 `background-only`。
- 短文核心引用的作用被限制为：教育 agent/角色系统背景、跨文化语用与文化适配先例、中文二语内容生成先例、Judge 偏差、预算控制。
- 核心论断的证据位置已补至权威摘要、页码、章节、图或表。Tran 明示为 under-review preprint，且其 thinking-token 预算与本项目“输入+输出 token”不等价。
- 最可能仍出错的是 MultiTutor 的细粒度框架/评价描述：当前 PMLR 权威摘要稳定，但若正文需要超过摘要的细节，P3 必须回到 PDF 指定段落，不能从矩阵转述。

## 4. 反例与替代解释

- 反例：投稿前出现直接研究，已经审计角色化中文二语生成中的字段污染或进行了更强的公平 SAS/MAS 实验。该情况不会推翻 Pilot 数据本身，但会要求删除任何方法差异暗示并把贡献进一步收缩为复现/审计案例。
- 替代解释：Pilot 条件差异来自 Prompt、字段映射、输出长度、token 或评分器，而不是角色架构。文献不能排除这些解释；统一协议和人工复核才是短文的证据路径。
- 替代解释：`native-culture-conditioned` 只是粗粒度标签条件，并不代表个体文化。必须在 Limitations 保留本质化风险说明。

## 5. 时间与成本可行性

- 当前修复已完成，不需要新增付费调用。
- 投稿前更新门预计 2–3 人时、0 CNY；只检查短文核心关键词和 main-citable 版本状态。
- 若窗口期发现 material competitor，预计 1–2 人时调整定位和引用边界；不触发新实验或系统扩张。
- 截止风险低于 P1-004 时的 8–12 人时方案，因为 D-016 已取消系统综述式扩张、KG/RQ3 核心检索和第二层滚雪球。

## 6. 剩余风险与条件

1. P4 尚未独立确认本轮文献分层和保守定位。
2. 投稿前更新门尚未到执行窗口，不能提前标记 `no_material_change`。
3. 论文正文尚未进入本任务范围；P3 实际引用时仍可能越过 claim map，需要投稿前 citation-key/claim 审计。
4. `main-citable` 表示适合支撑特定短文论断，不表示高相关性文献全集或新颖性证明。

## 7. 裁决与下一门条件

**PASS_WITH_CONDITIONS。** P1-004 的即时返工项已按四页短文的最小需要修复；文献节点可以提交 P4-002 独立复审，但不能由 P1 自行标记最终通过。

下一门准入条件：

1. P4-002 接受“主题增量检索 + 一层真实 backward chain”的范围降级和 21 篇分层。
2. P3 只从 `main-citable` 起草四页正文；使用 optional/background-only 时必须对应具体 claim-map 论断。
3. RQ3 在正文或附录统一使用 `low-quality cache admission risk`，只作描述性背景。
4. 2026-09-29 至 10-02 执行 `submission_update_gate.md`，保存结果并由 P4/P0 处理 material change。
5. 投稿前确认所有正文引用仍在 approved、所有预印本状态仍准确、所有 Pilot 结论均保留描述性限定。
