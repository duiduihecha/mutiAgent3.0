# P1-003/P1-005 主题增量检索与一层引用链核查

日期：2026-08-26；预算：0 CNY。P1-004 认定原记录多数是主题跳转而不是真实 citation snowballing。本文件据此改名：下表仅是不可完全重放的**主题增量检索摘要**；其数字不用于覆盖率、饱和度或缺失性判断。P1-005 另补一层可定位的真实 backward citation chain。

## 主题增量检索摘要（非系统检索、非引用滚雪球）

| 轴 | 数据库/站点与检索式 | 可见命中 | 标题/摘要筛选 | 原文/权威页核验 | approved | 主要排除理由 |
|---|---|---:|---:|---:|---:|---|
| RQ1 公平预算 | Web→arXiv：`"multi-agent versus single-agent LLM equal token budget evaluation education tutoring"`；定向复核 `site:arxiv.org/abs/2604.02460 matched token budget single-agent multi-agent systems Tran Kiela` | 11 | 5 | 2 | 1 | 未控制预算；仅学生反思场景；未完成正式状态核验；重复 |
| RQ2 文化适配消融 | Web→ACL：`"LLM cultural adaptation ablation component cross-cultural generation evaluation"`；`site:aclanthology.org/2025.acl-long.156 cultural learning culture adaptation ablation intent dialogue` | 9 | 4 | 2 | 1 | 只有整体模型比较、无组件消融；非生成；非权威页 |
| RQ3 门/缓存风险 | Web→ACL/arXiv/ACM：`"LLM output quality gate admission cache contamination risk evaluation generation"`；`"cache contamination" LLM generation quality gate`；CodeHelp 标题/DOI 定向检索 | 14 | 7 | 4 | 2 | 输入安全与输出质量不等价；非教育；仅工具介绍；原文未打开 |
| 中文二语生成 | Web→ACL：`site:aclanthology.org Chinese language learning large language model generated teaching materials exercises`；`site:aclanthology.org Chinese second language automatic exercise generation LLM` | 13 | 6 | 3 | 2 | 中文 L2 自动评分/反馈而非内容生成；中国学习者的英语材料；非跨文化 |

本轮新增 approved 6 篇：Tran & Kiela、CLCA、CLTE、CodeHelp、Spiral of Silence、Cui & Sachan。它们是已核验证据，不代表检索闭合；正文采用级别见 `reference_tiers.csv`。

## 原主题追踪记录（不得称 citation snowballing）

| 种子 | 类型 | 追踪链 | 结果 |
|---|---|---|---|
| MultiTutor / Chu 教育 agent 综述 | 主题跳转 | 教育 MAS → 公平 SAS/MAS 方法比较 → Tran & Kiela 2026 | 非引用链 |
| Singh 2024 / Havaldar 2025 | 主题跳转 | 文化适配生成/评价 → cultural learning → CLCA 2025 | 非引用链 |
| CLCA 2025 | 参考文献主题浏览 | prompting、文化价值适配与 role-playing | 未保存完整逐条链，不能作为可审计滚雪球证据 |
| Wang 2024 中文会话代理 | 主题跳转 | 中文学习代理 → 中文教师能力/内容设计 → CLTE 2025 | 非引用链 |
| NeMo Guardrails / CodeGuard | 主题跳转 | 通用 rails → CodeHelp → CodeGuard | 非引用链；仅保留 RQ3 背景 |

## P1-005 一层真实 backward citation chain

Seed：Tran & Kiela (2026), arXiv:2604.02460v2。来源位置：PDF Related Work pp.2-3 与 References pp.10-11。执行日期：2026-08-26。方法：只抽取与短文“公平预算/教育 SAS-MAS”直接相关的被 seed 引用条目，并逐条记录稳定标识与处置；不向第二层扩张。

| seed 中位置 | 被引工作 | 稳定标识/权威页 | 核验动作 | 处置与理由 |
|---|---|---|---|---|
| p.2 SAS vs. MAS；reference p.10 | Gao et al. (2025), *Single-agent or Multi-agent Systems? Why Not Both?* | arXiv:2505.18286 | 打开 arXiv 权威摘要页；未做全文证据定位 | candidate；通用 agentic applications，非教育内容生成，不进入短文核心 |
| p.2 education analytics；reference pp.10-11 | Li et al. (2025), *Single-Agent vs. Multi-Agent LLM Strategies for Automated Student Reflection Assessment* | DOI 10.1007/978-981-96-8186-0_24；PAKDD 2025 pp.300-311 | 打开作者机构出版页与附带原文入口，核验正式发表状态和任务摘要 | screened-out for direct slot；教育评估而非内容生成，且不是与本文相同的 budget-matched generation；作为漏检反例记录在 candidate 表 |
| p.2 budget-controlled evaluation；reference p.10 | Han et al. (2025), *Token-Budget-Aware LLM Reasoning* | ACL Anthology 2025.findings-acl.1274；DOI 10.18653/v1/2025.findings-acl.1274 | 打开 ACL 权威页和原文 | screened-out for direct slot；控制 CoT 推理 token，不比较教育 SAS/MAS；不进入 21 篇短文池 |

链停止依据：完成 seed 的一层相关引用抽取后，三个条目均不同时满足“教育内容生成 + SAS/MAS + 公平生成预算”。这一结果只说明该 seed 的相关参考文献中未识别到同任务工作，不支持领域级缺失性断言。

## 停止依据

1. D-016 已把任务改为四页 Pilot 短文；文献只需支持评价污染审计、统一评价协议和角色化 Pilot 的保守定位。
2. 一层真实 backward chain 已完成；继续第二层不会改变短文所需的引用边界，反而挤占 Pilot 与人工评审关键路径。
3. RQ3 已降为描述性背景，KG 与一般安全/RAG 文献不再扩张。
4. 这不是饱和标准。时效风险由 `submission_update_gate.md` 在 2026-09-29 至 10-02 处理。

## Gap 判定

可保留：本文审计已有 Pilot 中的评价字段污染，采用统一评价协议，并描述三个角色化条件的 6-case Pilot。相关文献分别用于说明教育 agent、文化适配、中文二语内容生成、Judge 偏差和预算控制已有明确先例。

禁止任何覆盖性或首次性表达。不能声称公平预算下 MAS 更优、A3 是主要增益来源，或质量门降低了低质量缓存准入风险；短文只能报告 Pilot 方向、原始配对与失败模式。
