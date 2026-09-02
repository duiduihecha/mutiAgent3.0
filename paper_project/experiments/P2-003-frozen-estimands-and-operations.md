# P2-003 冻结估计目标与操作定义

- 日期：2026-08-26
- 状态：在查看新 pilot 结果前冻结
- 成本：0 CNY
- 适用：RQ1–RQ3 核心实验；KG 仅探索性附录

## B1：Pilot 与 Formal 精度规划

### Pilot 的唯一定位

18 份材料 = 6 个独立 base case × 3 条件（Full、Monolith、NoA3）。实验单位是 base case，因此 RQ1 与 RQ2 各只有 6 个配对。两位评审者提高标注可靠性，不增加实验单位数。

该 pilot 只回答：协议是否可运行、映射是否忠实、方向是否一致、文化熟悉度是否足够、泄盲是否明显、RQ3 分母是否可能为零，以及是否值得进入 formal。不得用于确认性优越结论，不以 p<0.05 作为门。

### Formal 样本量方法（pilot 结果揭示前冻结）

主规划量采用 base-case 层面的“配对方向一致率”：对每个 case，比较两位评审者平均后的主评分；Full 高于对照记 1，否则记 0，平局单列并在保守分析中记 0。采用二项比例 Wilson 95% 区间目标半宽，不用 pilot 效应量估算样本量，避免 winner's curse。

预注册精度档：

| 目标最坏情形95%半宽 | 所需独立 base case（近似） | 定位 |
|---:|---:|---|
| ±20 percentage points | 24 | 最低 formal/短文可行档 |
| ±15 percentage points | 43 | 长文推荐档 |
| ±10 percentage points | 96 | 当前预算与人工负荷下不现实 |

正式选择规则：在不查看 pilot 质量差异的前提下，使用 5-case smoke 的**调用成本与失败率**估计剩余 100 CNY formal generation 可承受的最大 base-case 数；若可承受且 Human PI 批准人工负荷，则优先 n=43，最低不得低于 n=24。若 n<24 或两位评审者仍各只允许 15–20 份材料，则人工主证据无法形成 formal，必须降短文或由 Human PI 新增评审资源决定。

RQ3 比例同样按 Wilson 精度规划，但有效分母是人工 `exercise_qualified` 或 `exercise_unqualified` 数，而非总样本。formal 必须预留足够两类样本；不得按 pilot gate/人工结果挑样本。若冻结样本中任一真值类分母不足 20，RQ3 只作描述性/附录，不声称风险率得到精确估计。

## B2：RQ3 唯一主 Gate 与可计算定义

### 唯一主 gate

RQ3 的唯一主分类器是 `A5 final qualification gate`：保存的 A5 最终 `passed` 布尔值。

- `passed=true`：`gate_pass`；
- `passed=false`、缺失、异常或不可解析：ITT 下均为 `gate_block`；失败类型另报。

`confidence >= 0.85` 是次要缓存策略，不是主 gate；hard rules、grounding、A2/A3 guardrails 是诊断阶段，不得事后替换主 gate。

### 动作映射

| A5 final state | 主 gate | deliver | cache | review | reject |
|---|---|---:|---:|---:|---:|
| passed=true / PASS | pass | 1 | `confidence>=0.85` 才为1 | 0 | 0 |
| passed=false / FLAG_PENDING_REVIEW | block | 0 | 0 | 1 | 0 |
| passed=false / FLAG_REJECT | block | 0 | 0 | 0 | 1 |
| missing/error/invalid | block（ITT） | 0 | 0 | 1 | 0 |

NoGate 部署反事实：对同一保存输出 `deliver=1, cache=1, review=0, reject=0`，不重新生成、不改变内容。它只用于弱内容触达、合格内容阻断、缓存准入和成本对比，不比较平均生成质量。

### 人工真值范围

RQ3 使用独立字段 `exercise_qualified`，只覆盖 A5 声称检查的范围：

1. 拼音/答案等基本正确性；
2. 干扰项与答案可判定性；
3. 练习中的文化合规与明显刻板偏见；
4. HSK 等级适配；
5. 关键练习组件缺失导致不可使用。

文化背景解释的风格、A3 理论深度、整体材料美观等超出 A5 主 gate 范围，不得用于 RQ3 二元真值；它们仍可进入 RQ1/RQ2 的连续人工评分。

两位评审者均 `yes` → qualified；均 `no` → unqualified；分歧 → uncertain。

### 主率、分母与零分母

- 误杀率/false-block rate = `gate_block AND human qualified` / `human qualified`；
- 漏放率/false-pass rate = `gate_pass AND human unqualified` / `human unqualified`；
- 主分析排除 uncertain，但报告 uncertain 数量与比例；
- 分母为 0 时输出 `NA`，不得报告 0%、不得计算 Wilson CI；说明“样本中无该真值类，指标不可估计”。

### uncertain 真正极值

对每个 uncertain 样本独立允许赋值为 qualified 或 unqualified，保持该样本 gate 动作不变。枚举全部 `2^U` 种赋值，对每种赋值重新计算分子和分母；忽略该指标分母为0的赋值，在剩余定义值中取最小/最大。若所有赋值均为零分母，则界为 `NA`。不得把 uncertain 全部统一赋成同一类后直接声称上下界。

本地实现对 U≤24 做精确枚举；若 U>24，使用按 gate 动作分组的解析极值，并以单元测试与小 U 枚举对照。

## B3：RQ1 Estimand 与公平生成策略

### 冻结 estimand

RQ1 估计：在相同基础模型/版本、相同初始任务与外部知识、预先固定的总输入+输出 token 预算下，**角色化多阶段流水线（Full）相对于一次性单体生成策略（Monolith）**对人工整体质量评分的平均配对差。

它不估计纯“agent 架构”因果效应，不能分离角色分解、多阶段推理、调用次数与串行条件化。允许的结论只能是上述两种固定预算策略的比较。

主估计量：base-case 层面，两位评审者 `overall_quality_1_5` 均值后，`Full − Monolith` 的平均配对差。pilot 仅报告每 case 原始差、均值差和方向一致数；formal 方法在样本量冻结后确定。

### 两条件可见知识

两者获得完全相同的初始包：task、KP ID、domain、scene、pragmatic intent、learner native culture、HSK、anxiety、允许的外部知识文本及其 hash。Full 的 A2/A3 生成内容属于策略内部产生的上游上下文，不额外提供给 Monolith；这正是多阶段策略的一部分，必须计入 Full 输入 token。

Monolith 不得访问 Full 的中间输出，也不得被少给初始外部知识。两者均不得命中旧缓存；缓存状态写入 manifest。

### Prompt、配额与停止

- smoke 前冻结完整 system/user prompt 模板和 rendered hash；
- 最终用户任务、输出字段、题数和质量要求相同；
- 预先为 Full 各阶段和 Monolith 分配最大输入/输出 token，使计划总预算相同；
- 实际总 generation token 逐 case报告；主要准入容差为逐配对≤10%、条件均值≤5%；
- 不得查看质量后通过选择性重跑、截断或删样本满足容差；
- 正常停止、长度截断、provider stop 原因均原样记录；
- reasoning tokens 若 provider 返回则单列；未返回时明确不可比较。

### 失败、重试与 ITT

- 每个 case-condition 预先固定最多一次技术性重试，仅限 timeout/rate-limit/provider-5xx/空响应；内容低质、token 超差或格式差不得重试；
- 所有尝试 token、延迟与成本均记录；主要生成预算报告包括成功最终尝试及所有策略实际消耗，另报不含技术重试的敏感性成本；
- 最终失败保留为失败输出，canonical 空字段，不替换 case；
- ITT 主分析把不可用最终材料计为最低整体质量1分，并另报 complete-case；
- 任一条件 smoke 失败率>10%不得进入 pilot。

## B4：NoA3 操作冻结

NoA3 与 Full 使用完全相同的初始任务、外部知识、学习者画像、最终用户要求和 canonical schema。唯一操作是移除 A3 专业智能体产生的中间跨文化比较及其向 A4 的消息。

- A4 在 NoA3 中仍必须生成完整的最终 `cultural_context`、`comparison`、`language_points` 和 `exercises`；
- A4 prompt 中面向用户的跨文化比较要求与 Full 相同；不得删除“相似点/差异/文化适切”等任务要求；
- A4 不得收到 A3 内容、A3 占位符或暗示条件名称的字符串；
- A3 被移除产生的 token 节省照实报告，不用无意义 padding；RQ2 解释为移除专业中间过程的策略效应，不宣称等 token 的纯组件效应；
- `comparison` 为空、占位符或 schema failure 视为生成失败/处理结果，不能作为评价器输入设计，也不能通过回填 A3 内容修复；
- RQ2 主估计量是 base-case 层面人工 `cultural_theoretical_correctness_1_5` 的 `Full − NoA3` 平均配对差；`cross_cultural_comparison_quality` 为次要指标。

