# 双评审者盲评协议 v1.1（短文 Pilot）

## 1. 目的与证据优先级

人工评价是 RQ1–RQ2 Pilot 的主证据；独立 Judge 只能作为补充。RQ3 仅作描述性/附录，KG 仅作质控或探索性补充。

## 2. 样本设计

推荐选择 6 个 base case，每个 case 包含三个核心条件：Full、budget-matched Monolith、NoA3，共 18 份材料。两位评审者评价完全相同的 18 份材料。**这只是 6-case pilot，不是18个独立实验单位，也不是确认性 formal。** 旧 18 份盲包已废弃，不得发放；新材料须通过来源卡与严格完整性门后另行冻结。Formal 精度规划与最低 n 见 `../P2-003-frozen-estimands-and-operations.md`。

6 个 case 在冻结前按以下维度分层：

- 至少覆盖 3 个 domain；
- HSK1、HSK3、HSK5 各 2 个；
- 至少覆盖 4 个母语文化圈；
- 不按已有 CIEval 得分或 A5 结果挑样本；
- case list 在生成或查看条件结果前冻结并保存 SHA-256。

如某条件生成失败，仍以空缺/失败材料进入评价和主分析，不补抽“更好”的替代样本。允许在附加 complete-case 分析中排除，但必须同时报告 intention-to-treat。

## 3. 盲化

- 条件名映射为随机 `evaluation_item_id`；
- 去除仅由实验包装添加且不属于用户可见内容的 agent/condition/model 标签；
- 评审材料不显示调用数、延迟、成本、A5 判定、CIEval 分数或 KG 来源；
- 两位评审者使用不同随机顺序；同一 base case 的三个条件不连续出现；
- 评审者不得互相讨论，提交后不得修改原评分；
- key file 由 P2/P0 保管，所有评分冻结后才揭盲。

每份材料展示相同任务上下文：domain、scene、pragmatic intent、学习者母语文化、HSK 等级和焦虑档；不展示系统条件。

## 4. 评审者资格与培训

优先选择国际中文教育、语言学、跨文化交际或相关背景人员。记录专业背景、年限、母语和潜在利益冲突，但论文中只报告匿名汇总。

正式评价前进行一次不计入结果的 2 份训练材料校准：讲解 rubric，不讨论正式样本；评审者独立完成后只澄清规则含义，不要求形成相同观点。

## 5. 评分维度

每项均为 1–5 分，并要求填写简短证据：

1. **文化与理论正确性**：事实是否可靠，文化维度或解释是否合理，是否避免生硬套理论；
2. **跨文化比较质量**：是否同时呈现异同、承认文化内部差异、避免优劣暗示和刻板印象；
3. **教学适切性**：解释、语言点和练习是否有助于目标学习者理解并应用；
4. **HSK 等级适配**：词汇、句法、说明复杂度与目标 HSK 是否匹配；
5. **整体质量**：若实际用于教学，整体是否可靠、清晰、可用。

锚点：

- 1：严重错误/基本不可用；
- 2：明显缺陷，需大幅修改；
- 3：基本可用但有实质问题；
- 4：质量良好，仅需小修；
- 5：可靠且高度适用，几乎无需修改。

评审者另给两个独立二元判断：`overall_qualified` 用于整体材料诊断；`exercise_qualified` 是 RQ3 唯一人工标签，只覆盖拼音/答案、干扰项、文化合规、HSK适配和关键练习组件完整性。

- `yes`：不存在严重事实错误、明显刻板偏见、关键任务缺失或导致无法教学使用的练习/等级问题；允许小修；
- `no`：至少存在一项上述严重问题，正式使用前必须实质修改；
- 不提供 `uncertain` 给单个评审者，避免回避判断；可使用备注说明犹豫。

二元判断不能由五维平均分机械推导，必须由评审者直接给出。每份材料还记录 `cultural_familiarity_1_3`（1不熟悉、2一般、3熟悉）、`suspected_pattern` 和 `suspected_group`，用于文化能力与泄盲敏感性诊断；不要求猜真实条件名。

## 6. 二人标签聚合

冻结规则：

| Reviewer 1 | Reviewer 2 | 聚合真值 |
|---|---|---|
| yes | yes | qualified |
| no | no | unqualified |
| yes | no | uncertain |
| no | yes | uncertain |

主分析排除 `uncertain`，并报告其数量和比例。不得通过第三人事后裁决把分歧样本强制归类。RQ3 聚合只使用 `exercise_qualified`。

敏感性上下界：

- 对每个 uncertain 样本独立枚举 qualified/unqualified，并保持其 gate 动作不变；对每种赋值重新计算分子与分母，在所有分母非零的结果中取真正最小值和最大值；
- 分母为零时该赋值的该指标记为 NA；所有赋值均为零分母则整个界为 NA；
- 对条件 qualified rate 可直接把 uncertain 分别计为0或1得到界；
- 连续评分使用两位评审者均值，不因二元标签 uncertain 而删除，并同时报告单评审者结果。

## 7. RQ 分析映射

### RQ1：Full vs Monolith

- 主结果：同 base case 的盲化整体质量评分配对差；不设“总体偏好”题；
- 次要结果：文化正确性、跨文化比较、教学适切性和 HSK 适配；
- 同时报 token 差、调用数、延迟与成本；未通过 token 公平门则不做优越性结论。

### RQ2：Full vs NoA3

- 主结果：人工文化与理论正确性、跨文化比较质量的配对差；
- 评价对象只含 canonical 最终材料，不含 A3 专用字段；
- 独立 Judge 若运行，仅作为方向一致性补充。

### RQ3：A5

当前实际 API 只把 `FLAG_REJECT` 作为阻断动作；`PASS` 与 `FLAG_PENDING_REVIEW` 均会交付，后者只降低 pipeline confidence/缓存准入概率。因此 RQ3 只描述 action 计数、交付/阻断和缓存准入；不把 `passed=false` 等同于未交付。如后续连接人工标签：

- 误杀：human qualified 且 A5 reject；
- 漏放：human unqualified 且 A5 pass；
- 报 confusion matrix、率及 Wilson 95% CI；
- uncertain 按上一节报告上下界；
- 报缓存准入率、每个合格准入项的生成次数、token 和 CNY。

## 8. 一致性与统计

- 二元标签：报告原始一致率和 Cohen's kappa；
- 1–5 连续/有序评分：报告 weighted kappa 或 ICC（预先选定一种作为主一致性指标）；
- 主对比使用配对分析，报告配对差、bootstrap 95% CI、Wilcoxon signed-rank 和配对效应量；
- 多个次要维度使用 Holm 校正；
- n=6 个 base case 时明确标为小样本 pilot，不把不显著解释为等效；
- 保存原始评分、冻结后的清洗表和分析脚本，任何排除均留审计轨迹。

## 9. 评分表字段

`human-review-form.csv` 每位评审者复制一份。必填字段：reviewer、匿名 item ID、文化熟悉度、五维评分、两个二元 qualified、问题标签、证据说明、泄盲诊断和完成时间。`base_case_id` 与 condition 不进入评审表，由揭盲 key 在分析阶段连接。

问题标签可多选，以 `|` 分隔：`FACTUAL_ERROR`、`THEORY_MISUSE`、`STEREOTYPE`、`IMBALANCED_COMPARISON`、`MISSING_COMPONENT`、`HSK_MISMATCH`、`EXERCISE_INVALID`、`LANGUAGE_ISSUE`、`OTHER`、`NONE`。

## 10. 数据管理

## D-016 短文 Pilot 界面修正（覆盖上述五维表）

必答量表简化为 `cultural_theoretical_correctness_1_5` 和盲化 `overall_quality_1_5`。跨文化平衡、教学适切和 HSK 问题改用 `issue_tags` 复选；另保留文化熟悉度、两个 yes/no、泄盲诊断与可选证据文本。不设任何条件间“总体偏好”选择。`human-review-form.csv` 的简化列是唯一实施接口。

- 评审者签署知情说明与利益冲突声明；不收集无关个人数据；
- 原始表提交后只读保存并计算 SHA-256；
- reviewer ID 使用匿名代码；身份映射由 Human PI 单独保管；
- 论文披露评审者数量、背景类别、样本量、盲化和聚合规则，以及 uncertain 比例。
