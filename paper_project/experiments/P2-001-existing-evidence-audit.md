# P2-001 现有实验证据审计

- 审计日期：2026-08-26（Asia/Shanghai）
- 角色：P2 系统、实验与统计 Agent
- 审计成本：0 CNY；未调用外部 LLM、Judge 或付费 API
- 审计范围：现有代码、实验配置、156 条 RQ1 消融输出及 CIEval 评分、52 条 A5 裁决、KG/NoKG leaderboard、统计脚本
- 修改边界：未修改系统代码或实验原始数据；只新增本报告

## 1. 执行结论

当前证据尚不能支持公平的 RQ1 核心结论，也不能独立支持 RQ2；RQ3 可以计算拒绝率和缓存准入率，但没有独立质量真值，真正的误杀率与漏放率不能计算。KG/NoKG 有 30 条完整配对，可作为探索性结果复用，但缺少生成原文、调用元数据和可验证的 KG 注入证据，不能直接作为正式补充消融。

最严重的问题是 Full vs Monolith 的 CIEval A 维度输入不公平。Monolith 的 26 条输出都在 `generated_content.comparison` 中包含实质对比，但运行器把独立字段 `cross_cultural_comparison` 统一写成占位符；CIEval A 维度只读取后者。结果是 Monolith 有 16/26 条在 A 维度得到最低 1 分，而 Full 的 A 均值为 4.04、Monolith 仅 1.77。现有总分差 3.20 中，2.27 分来自这一受污染维度。因此 `C1_Full > C2_NoAgent_Monolith` 的现有显著性不能用于论文主结论。

## 2. 证据清单与完整性

| 资产 | 记录数 | 结构检查 | 当前用途 |
|---|---:|---|---|
| `experiment_results/rq1_mini_outputs.jsonl` | 156 | 全部可解析；26 case × 6 条件齐配 | 原始生成可保留 |
| `experiment_results/rq1_mini_cieval.jsonl` | 156 | 全部可解析；与输出一一对应 | 除受污染维度外可做探索性分析 |
| `experiment_results/rq1_a5_guardrail.jsonl` | 52 | 26 Full + 26 Monolith 齐配 | 拒绝率、准入率可算；误杀/漏放不可直接算 |
| `M1_Full_KG_Slot.jsonl` | 30 | 30 个唯一 ID | 探索性 KG 条件 |
| `M3_Full_NoKG.jsonl` | 30 | 与 M1 完全同 ID 配对 | 探索性 NoKG 条件 |
| 其余 leaderboard | 119 | M2/M4 各 30，M6 仅 29；M5 缺失 | 不构成完整 leaderboard |

156 条 RQ1 数据覆盖 13 个 domain（每个 2 条）、8 个母语文化圈和 HSK1/3/5；HSK 分布为 6/14/6。样本虽分层，但 n=26 仍属于 pilot 量级。

关键文件 SHA-256：

- RQ1 outputs：`b0b59d4edc1073b09f858b53fd1cba2461321a0d67b9cceb68ab30a7b8123b91`
- RQ1 CIEval：`703e8fb3815112adc889cd12ed42244614a0b5da9c1dc615025159666c0dfb3b`
- A5：`464286750ea56548348a4d2e37edd4713d43f4e1b4bdf7a0f27668084ffabdd9`
- M1 Full KG：`1236909f403a9b3ab326a78438646857eb7dcd0534f4c38ff79a1b07aabdff3b91`
- M3 NoKG：`08c8a374a77254a420e78780b6485d412714259b2459f30e41ee13e608b7555d`

## 3. Full vs Monolith 公平性

### 3.1 Blocker：评价字段不对称

`src/lib/experiment-runner.ts` 的 Monolith prompt 一次性要求文化阐释、跨文化对比和练习，实际 26/26 条均生成了 `generated_content.comparison`。但运行器随后把：

- `cultural_explanation` 写成占位符；
- `cross_cultural_comparison` 写成占位符；
- 实质内容仅保留在 `generated_content`。

`src/lib/cieval-judge.ts` 的 Dimension A 只评 `output.cross_cultural_comparison`，不读取 `generated_content.comparison`。因此它实际上在比较“Full 的真实 A3 输出”与“Monolith 占位符”，不是比较两种系统的跨文化内容。

NoA3 和 NoA2A3 也有同类构念风险：A 维度直接读取被消融的专用字段，因此 A3 的存在与评价输入结构几乎同义。现有 C1 vs C3 的总分差 2.86 中，A 维度差 2.35；这不能排除循环评价。

### 3.2 未证明 budget-matched

现有输出未保存模型、温度、max tokens、输入/输出 token、prompt 快照、seed、调用次数、延迟或成本。代码表明 Monolith 是一次调用，而 Full 是多阶段多次调用；没有总上下文与总生成预算核算。故“同模型”即使成立，也不等于“budget-matched”。

### 3.3 最低成本补全

先做零调用修复：建立统一 canonical evaluation view，把所有条件的最终解释、比较和练习映射到同一 schema；对现有 156 条只做本地结构检查。随后只对 5 条 smoke 和 10–15 条 pilot 运行冻结后的公平 Full/Monolith，保存逐调用 token 与 prompt。正式实验仅在 pilot 通过后执行。

## 4. A3 与 CIEval 循环评价

循环风险为高，不仅是理论上的同源偏好，而是代码层面的输入缺失：Dimension A 的唯一待评文本正是 A3 专用输出。去掉 A3 会直接让该字段为空或占位，即使最终 `generated_content.comparison` 仍有合理对比也不被读取。

因此：

- CIEval A 不能单独支持 C2；
- 现有 Full vs NoA3 可作为机制诊断，不可作为独立有效性证据；
- 最低成本独立证据应优先使用已经批准的 2 位人工盲评，每人 15–20 条；如使用独立 Judge，rubric 不得要求识别 A3 的显式结构或专用字段，并须盲化条件名称。

## 5. KG/NoKG 可用性

M1 与 M3 有 30 条完全配对。探索性均值为：

| 条件 | A | B | C | D | 总分 |
|---|---:|---:|---:|---:|---:|
| M1 Full+KG+Slot | 4.17 | 5.00 | 2.73 | 3.87 | 15.83 |
| M3 Full NoKG+Slot | 4.07 | 5.00 | 2.47 | 3.87 | 15.44 |

NoKG − KG 的配对总分均值为 −0.387，30 对中 16 对 KG 较高、6 对 NoKG 较高、8 对相同。该差异尚未在当前环境复算显著性，且不可直接正式使用，原因如下：

1. leaderboard 文件只保存 Judge 结果，不保存对应生成原文，无法核查事实锚定或失败案例；
2. 没有 token、prompt、模型版本、温度、时间戳、失败日志和代码提交；
3. `EXP_NO_KG_QUERY` 是进程级环境变量，虽按当前串行循环设置/删除，但缺少运行时 trace 证明 M1 确实取到 KG、M3 确实未取；
4. CIEval A 使用 KG 标注作为 rubric 参照，适合度量“与该 KG 的一致性”，但不足以独立证明事实正确性；
5. M1 同时名为 KG+Slot，正式 KG 对比只能与同样 Slot 的 M3 比较；不能把 M2 混入 KG 主效应。

结论：保留为探索性 pilot；除非能从日志或缓存恢复生成原文与配置，否则最低成本正式补全是对同一 10–15 条 pilot 重新运行严格配对 KG/NoKG，而不是扩展 leaderboard。

## 6. A5 误杀、漏放与成本

现有 52 条 A5 裁决显示：Full 拒绝 0/26，Monolith 拒绝 6/26；缓存阈值 0.85 下，Full 准入 19/26，Monolith 准入 4/26。它们是条件拒绝率和准入率，不是误杀率或漏放率。

真正的误杀/漏放需要独立二元质量标签：

- 误杀：独立评审认定合格但 A5 拒绝；
- 漏放：独立评审认定不合格但 A5 放行。

当前报告把 Full 近似称为“好内容”、Monolith 称为“弱内容”，这以系统条件代替真值，构成循环定义。用 CIEval 总分阈值做敏感性代理时，漏放率很高且随阈值变化：阈值 12/13/14/15/16 时，代理漏放率分别约为 71.4%/75.0%/75.0%/83.3%/82.9%；代理误杀率约为 5.3%/5.6%/5.6%/7.1%/0%。这些数字只用于证明结论依赖标签定义，不能写作正式性能。

此外，52 条记录中的 `ds_scores`、`minimax_scores` 与 `max_delta` 全为空；报告说明 MiniMax 不可用，实际是 DeepSeek 单模型降级。因此“双模型联席仲裁”不能作为本批数据的实现描述。

最低成本方案：让两位人工评审者对同一 15–20 条盲化样本给出合格/不合格标签和核心维度评分；预先冻结标签聚合规则，再计算 confusion matrix、Wilson 95% CI、缓存准入率和每个合格缓存条目的期望生成成本。

## 7. 统计与复现审计

### 可复现部分

- JSONL 数量、条件配对、均值、拒绝率和准入率可由保存文件本地复算；
- 4 个现有 Vitest 文件共 126 项测试全部通过；测试未触发外部调用；
- T45 字符相似度逻辑可从脚本审阅，但其“未显著不同”不等价于“内容相同”，且两个比较共享 C1，差值计算需明确配对关系。

### Blocker/缺口

- 当前工作目录无法解析 Git repository，`STATE.yaml` 也记录 `system_commit: unrecorded`；
- 原始输出无模型、版本、prompt、温度、seed、token、延迟、成本和时间戳；
- `ablation_stats.py` 声称使用 SciPy 得到 p 值，但当前 Python 环境没有 SciPy，项目也没有锁定统计依赖；
- 现有主报告仅做配对 t 检验，没有预先规定主指标、非参数检验、效应量或多重比较校正；
- A5 跨条件 confidence 使用独立样本 Welch t 检验，但 case 实际一一配对，应优先使用配对分析；
- leaderboard 缺 M5，M6 仅 29 条，不能声称 6 模型完整比较。

正式统计最低要求：冻结唯一主对比和主指标；配对数据报告均值差及 bootstrap CI、Wilcoxon signed-rank、配对效应量；次要维度使用 Holm 校正；二元率报告 Wilson CI；同时公开未校正和校正 p 值，不把不显著写成等效。

## 8. 最低成本证据补全顺序

1. **0 CNY：协议修复与冻结**。统一所有条件的 evaluation schema；冻结 Full/Monolith 输入知识、模型、采样、总 token/上下文预算、调用上限、超时与失败处理；生成 manifest 模板。
2. **0 CNY：既有数据再分析**。在不调用 Judge 的前提下重算结构指标、配对描述统计、效应量和多重校正框架；现有 CIEval A 结果明确标为 contaminated。
3. **人工优先：15–20 条盲评**。复用同一批样本同时支持 RQ1、RQ2、RQ3；不增加 API 成本。
4. **付费 smoke：5 条**。只验证 canonical schema、公平预算、日志与失败恢复；任何字段不对称立即停止。
5. **付费 pilot：10–15 条**。Full/Monolith/NoA3 为核心；Gate 在相同保存输出上离线应用；KG/NoKG 仅在生成原文不可恢复时加入。
6. **formal 条件执行**。只有 pilot 的方向、方差、失败率和成本均可接受，且 P0/Human PI 冻结设计后才运行。

## 9. 后续调用预算草案（待 P0 批准，当前不得执行）

预算采用阶段硬封顶，而不是先假设供应商单价。每阶段开始前用 smoke 的实际 token 账单更新估算；任何超额自动停止。

| 类别 | 目的 | 建议上限 | 停止条件 |
|---|---|---:|---|
| Smoke | 5 条，验证公平 schema、日志、缓存和失败恢复 | 20 CNY | 任一条件输入/预算不对称 |
| Pilot generation | 10–15 条核心条件 | 60 CNY | 失败率 >10% 或预算差无法匹配 |
| Pilot judge | 独立、盲化 rubric；仅补人工覆盖不足部分 | 20 CNY | 与人工方向严重冲突或循环风险未解 |
| Formal generation | 仅冻结后的 RQ1/RQ2 核心条件 | 100 CNY | 累计承诺触及 250 CNY 长文门 |
| Formal judge | 只评保存输出，不重生成 | 40 CNY | 关键结论已由人工充分支持则取消 |
| 预留 | 重试/失败，不得用于扩范围 | 10 CNY | 未经 P0 批准不得动用 |
| **总承诺上限** |  | **250 CNY** | 保持低于 350 CNY 缩减审查线 |

建议把 KG formal 设为可选包（最多从 Formal generation 的 100 CNY 内部划拨，不新增预算），而非叠加。Judge 与 generation 必须分别记账。现有累计新增支出仍为 0 CNY。

## 10. 2026-09-15 长文/短文门风险

| 长文要求 | 当前状态 | 风险 |
|---|---|---|
| 公平 Full vs Monolith pilot | 未满足；现有 A 维度输入不公平且无 token 匹配 | Blocker |
| A3 独立支持 | 未满足；现有 CIEval A 与 A3 字段循环 | Blocker |
| RQ3 风险指标可运行 | 部分满足；率可算但无独立真值 | High |
| 完整论文骨架 | 非 P2 审计范围，当前未核验 | Unknown |
| 支出 ≤250 CNY | 满足；当前 0 CNY | Low |
| 无 P4 核心 Blocker | 尚未评审 | Unknown |

按已冻结门规则，当前状态应预设为“短文风险高”。如果公平 baseline 与 A3 独立证据不能在 2026-09-15 前形成，必须降级；不能用现有显著 p 值绕过门。

## 11. 需要 P0/Human PI 决策

1. 是否正式判定现有 RQ1 CIEval A 与总分比较为 contaminated，并禁止进入主结果表？
2. 公平 baseline 采用哪种预算定义：总输入+输出 token 匹配、最大上下文匹配，还是固定货币成本匹配？P2 建议以总 token 为主、调用数与成本另报。
3. 人工盲评是否优先承担 RQ1/RQ2/RQ3 共用标签，并确认两位评审者与日期？
4. 独立 Judge 是人工评审的补充还是替代；若与人工冲突，以何者为主证据？
5. 是否允许把现有 KG/NoKG 仅列探索性附录，并取消正式重跑以节省预算？
6. A5 的“合格”二元标注阈值和评审聚合规则由谁冻结？
7. 是否批准 250 CNY 的阶段预算上限；正式调用仍需在 smoke/pilot 审查后另行放行。

## 12. 本轮验证记录

- 外部模型/Judge/API 调用：0
- 新增费用：0 CNY
- 本地单元测试：4 files passed，126 tests passed
- 原始数据改动：无
- 系统代码改动：无

