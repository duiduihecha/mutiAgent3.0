# 围绕 RQ1–RQ3 的检索与证据计划

## 1. 冻结边界

只检索能服务以下问题的工作：RQ1 公平预算下角色分解与单体比较；RQ2 跨文化比较 A3 的独立增益；RQ3 分阶段质量网关的拒绝、误杀、漏放、缓存与成本价值。KG 仅作方法组成/补充消融；不把 BKT、真实学习效果或完整 GraphRAG 扩为主线。

## 2. 数据源与优先级

1. ACL Anthology、PMLR、期刊/出版社官网与 DOI 落地页；
2. 作者公开全文或机构仓储；
3. arXiv 原文（明确标注预印本）；
4. 搜索结果、综述转述只作线索，不作 approved 证据。

访问日期统一为 2026-08-26。每条 approved 记录必须核对题目、作者、年份、venue/status、权威 URL，并给出页码/章节/表格或权威页面中的可定位段落。

## 3. 可复核检索式

### RQ1 / agent-based LLM education

- `("LLM agent" OR "multi-agent") AND (education OR tutor OR instructional) AND (evaluation OR baseline OR ablation)`
- `site:aclanthology.org multi-agent education tutor agent`
- `site:proceedings.mlr.press "multi-agent" tutor education`

### NLP for language learning / pragmatics / native-culture-aware generation

- `("large language model" OR ChatGPT) AND (second language OR language learning) AND (pragmatics OR intercultural)`
- `(cultural adaptation OR culturally-aware OR native culture) AND (generation OR conversation) AND LLM`
- `(Chinese language learning OR CSL) AND (ChatGPT OR LLM)`

### KG-grounded generation

- `(knowledge graph grounded OR GraphRAG OR graph retrieval augmented) AND generation`
- `(knowledge graph OR expert-defined standards) AND educational content generation`

### LLM-as-a-judge / quality gateways

- `("LLM-as-a-judge" OR "LLM judge") AND (bias OR reliability OR position)`
- `(guardrail OR quality gate OR staged gate) AND LLM AND education`
- `(reject OR false positive OR false negative) AND guardrail AND generation`

## 4. 纳排标准

纳入：直接定义相邻任务/系统；提供可审计方法或实验；能约束公平基线、A3 独立评价或网关风险指标；有可访问原文或权威出版页。

排除或降级：只凭标题推断；只有搜索摘要；把预印本误作正式发表；教育领域过远且不能约束 RQ；仅报告平均分、没有公平预算/人工验证；把安全拒答直接等同于教育内容质量准入。

## 5. 后续增量检索与停止规则

- 对每个主题做前向/后向滚雪球，优先近 5 年 NLP/AIED/教育技术论文，并保留 Thomas (1983) 等奠基理论。
- 新增候选先进入 candidate，不直接进入 `.bib`。
- 当连续两轮检索每个主题新增的“直接竞争工作”少于 2 篇，并且各 RQ 至少有 3 篇直接/方法邻近文献时，提交 P0 决定是否停止。
- 截稿前再做一次 2026-08-27 至冻结日的增量检索，防止 `first` 风险；即便如此仍不建议使用绝对首次措辞。
