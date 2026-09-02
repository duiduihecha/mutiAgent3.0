# “first / novel” 表述风险审查

## 结论

当前证据不支持任何绝对 `first`：教育多智能体、文化适配生成、中文会话代理、教育 KG、标准约束内容生成、LLM guardrails 与教育 guardrails 均已有相邻工作。冻结计划中禁用 `first` 是正确的。

## 风险分级

- **禁止**：“首个教育多智能体系统”“首个跨文化中文学习系统”“首次提出母语文化感知生成”“首个教育质量网关”“完整 GraphRAG”。
- **高风险**：“全新范式”“填补空白”“证明 A3 是核心”“硬约束杜绝幻觉”。
- **可用但需证据限定**：“我们研究/评估……”“在受控设置中考察……”“据我们的检索，较少工作同时……”“面向跨文化中文教学的一个角色分解框架”。

## 建议英文表述

> We study a role-decomposed, native-culture-aware pipeline for generating cross-cultural instructional content for Chinese language learning, and evaluate its components through budget-conscious controlled ablations.

> Educational agents, cultural-adaptation tasks, Chinese-L2 content evaluation, and judge-bias studies motivate our protocol choices. We report an evaluation-contamination audit, a unified protocol, and a small role-decomposition Pilot; we do not claim a general architecture advantage.

该表述只描述本文工作和已核验先例，不推断领域覆盖率。RQ3 如出现，只写 `low-quality cache admission risk` 的描述性背景。

## 需要 P0/Human PI 决定

1. 是否批准把论文任务名从泛化的“母语文化圈”收窄为 `native-culture-aware cross-cultural instructional content generation for Chinese learning`，并在 Limitations 明示文化圈标签是粗粒度条件而非个人文化身份。
2. 是否保留 HSSC 2025 作为“LLM 局限”的次级背景证据；若保留，应明确这些陈述位于其引言，优先再补直接 LLM 文化能力实验。
3. 是否把 KG 统一表述为 `structured-knowledge-conditioned` / `KG-grounded`，除非 P2 证明确有图检索链和公平 NoKG 消融。
4. 是否批准 RQ3 的主要新颖性定位为“education-content admission and cache-risk evaluation”，而不是 guardrail 架构本身。
5. 是否要求最终 Related Work 纳入 2026 年 CodeGuard 等截止前工作；它直接压缩“教育 guardrail”新颖性空间，但也能强化 RQ3 指标设计。
