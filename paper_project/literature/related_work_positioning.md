# P1-005 四页短文 Related Work 定位与引用边界

状态：按 D-016 与 P1-004 返工（2026-08-26）；待 P4/P0 复核  
论文任务定位：**native-culture-aware cross-cultural instructional content generation for Chinese language learning**。

## 1. 建议的 Related Work 结构

### 1.1 Educational LLM agents and role decomposition

教育 LLM agent 已覆盖教学任务自动化、个性化、记忆、工具使用和多智能体通信，不能宣称“首个教育多智能体系统” \cite{chu2025agents}。MultiTutor 已用专门智能体生成解释、可视化、资源与练习，并报告自动评价和案例结果 \cite{sun2025multitutor}。教育之外已有研究在相同 thinking-token 预算下比较单体和多智能体，说明预算控制会改变架构优劣判断 \cite{tran2026equalbudget}。因此，本文的可防守位置不是首次采用角色分解，而是在统一任务内做 budget-matched Full/Monolith 与角色级消融。

引用边界：Chu et al. 是综述，不能证明本文架构有效；MultiTutor 的 workshop 结果不能泛化为“多智能体天然优于单体”，也不能替代本文的 budget-matched baseline。

### 1.2 L2 pragmatics, Chinese learning, and cultural adaptation

跨文化语用研究区分 pragmalinguistic 与 sociopragmatic failure，并强调避免规范主义 \cite{thomas1983}。生成式 AI 能用于语言辅导和材料生成，但其社会语用真实性及英语—西方语料偏向构成局限 \cite{godwinjones2024}。针对西语母语者的中文学习研究已经考察 ChatGPT 作为会话代理的潜力 \cite{wang2024chatgpt}；CLTE 已直接评价 LLM 总结中文知识点并设计中文二语教学内容的能力 \cite{xu2025clte}。文化适配生成和多文化对话评价已有明确任务化工作 \cite{singh2024culture,havaldar2025culture}，CLCA 还通过 dialogue/intent 组件消融评价文化价值适配 \cite{liu2025clca}。

本文据此只主张：将学习者的母语文化背景作为显式条件，生成可审计的中外语用比较，并通过 Full/NoA3 和独立于 A3 输出结构的人工盲评/补充 Judge 检验其边际价值。不得写“首次文化适配”“首次跨文化中文学习系统”或“文化圈普遍有效”。“母语文化背景”是粗粒度条件，不等同于个体文化身份。

Liu (2025) 可谨慎保留为次级背景证据：其引言明确列出 LLM 在跨文化语言学习中的可控性、推理延迟与细粒度文化区分局限，而主体实验研究的是 BERT/Transformer/AORBCO 组合系统，不是对这些 LLM 局限的直接实验验证 \cite{liu2025intercultural}。元数据必须写为 Jie Liu，*Humanities and Social Sciences Communications* 12:1757，DOI `10.1057/s41599-025-06033-x`。

### 1.3 Structured-knowledge-conditioned generation（短文可删除）

GraphRAG 已用于面向全语料的 query-focused summarization，并以图索引、图引导检索与图增强生成描述相关方法空间 \cite{edge2024graphrag,peng2024graphrag}。教育材料的 KG 表示及 KG 与 LLM 的结合已有方法论研究 \cite{canal2024kg}；Standardize 还展示了从 CEFR/CCS 等专家标准提取知识 artifact 以控制教育内容生成 \cite{imperial2024standardize}。

本文统一使用 **KG-grounded** 或 **structured-knowledge-conditioned generation**。除非系统证据证明执行了图检索、可追踪 grounding 和相应公平消融，否则不得称完整 GraphRAG。KG 只作为方法组成与探索性补充，不作为核心新颖性。

### 1.4 Evaluation validity；RQ3 仅作描述性背景

LLM-as-a-judge 会受到多类偏差影响，自动 Judge 不能单独充当 A3 的独立真值 \cite{chen2024judge}。因此短文的相关工作重点是评价有效性：相同输出字段、相同 rubric、盲化条件、人工复核，以及把 18 份材料明确称为 Pilot。

RQ3 不再承担短文核心贡献，只能描述 **low-quality cache admission risk**。CodeHelp、CodeGuard 与开放域反馈环研究至多作为背景，不能被写成本文门控有效性的证据。短文不得报告确认性的误杀/漏放结论，也不得声称 A5 改善平均质量。

## 2. 可防守的综合定位段

> Educational role-decomposed agents, cultural adaptation tasks, Chinese-as-a-second-language instructional-content evaluation, judge-bias analyses, and budget-controlled agent comparisons provide distinct precedents for this study. We audit an evaluation-field mismatch in an existing role-decomposed system, apply a unified evaluation protocol, and report a 6-case, three-condition Pilot for native-culture-conditioned Chinese instructional content. The Pilot is descriptive and does not establish general architectural superiority or a causal role effect.

该段逐项陈述已核验先例，并把本文定位成评价污染审计、协议修复与 Pilot 报告；它不是新颖性或领域覆盖结论。任何首次性、研究缺失性或组合独特性暗示均不授权。

## 3. 写作硬边界

- Related Work 只能描述文献所做和所报告的结果；不得用相关工作替本文未完成的实验结论背书。
- RQ1 必须带 `budget-matched` / 公平知识输入限定。
- RQ2 必须说明文化适配已有研究；本文差异在 explicit comparison role 与独立边际验证。
- RQ3 统一写 `low-quality cache admission risk`，仅作描述性背景或 Limitations，不写平均质量提升。
- KG 统一写 KG-grounded 或 structured-knowledge-conditioned；GraphRAG 只用于描述他人工作或明确否定边界。
- CodeGuard 2026 是正式 Findings 论文，但任务是 CS 教育提示安全；只能作为评价设计邻近工作。
- Liu 2025 的三类 LLM 局限是引言背景陈述，不得写成该文通过实验“证明”。
