# 开题与既有章节参考文献审计

## 范围说明

两份 `assets/*.docx` 经结构化文本检查未发现参考文献表。现有清单来自 `paper_assets/11_chapters/ch01_introduction.md`（4 条）与 `ch02_related_work.md`（10 条去重）。

## 逐条结论

| 条目 | 真实性/版本 | 当前适用性结论 |
|---|---|---|
| Chu et al. 2025 | 已核验；EMNLP 2025 Findings，ACL ID `2025.findings-emnlp.743`；arXiv 有前序版本 | 可支持教育 LLM agent 分类、技术模块和部署挑战；不能单凭综述证明本文多智能体优于公平单体。 |
| Edge et al. 2024 | 已核验 arXiv:2404.16130；作者清单应为 8 人，既有章节误列 10 人（多出 `Metropolitansky, Ness`） | 可支持 GraphRAG 的社区摘要/global QFS 管线；不能支持本文实现完整 GraphRAG。 |
| Godwin-Jones 2024 | 已核验 arXiv:2410.14395；未找到该题目的正式期刊版本，先前的 *Language Learning & Technology* 28(2), 32–61 线索属于其他文章 | 仅按 arXiv 预印本使用，可支持 GenAI 语用/文化真实性局限与英语—西方语料偏向。 |
| Liu 2025, DOI 10.1057/s41599-025-06033-x | 已核验；作者 Jie Liu，*HSSC* 12，文章号 1757（不是既有清单所写的 6033） | 原文引言第 86–90 行确实列出 LLM 的可控性、延迟和细粒度文化差异三类局限，可支持该句；但这些是该文的背景论证，不是其自身 LLM 实验结果。该文主体是对 262 名青年、三个月 AI 增强语言学习系统的实验，引用时应区分。 |
| Hymes 1972 | 元数据为经典章节，但本轮未取得并定位原文章节 | 标记 unverified；不得进入 approved 或支撑具体原文论断。 |
| Peng et al. 2024 | 已核验 arXiv:2408.08921v2 | 可支持 GraphRAG 三阶段分类；仅为预印本 survey，不能替代本文 KG 实验依据。 |
| Sun & Tai 2025 | 已核验 PMLR 273:174–190，iRAISE Workshop at AAAI 2025 | 可作为教育多智能体直接竞争工作；**否决泛化表述**“验证了多智能体分工优于单智能体”。其评价设置与预算公平性应在原文实验节单独审查。 |
| Thomas 1983 | 已核验 OUP DOI `10.1093/applin/4.2.91`, 4(2):91–112 | 可支持 pragmalinguistic/sociopragmatic failure 区分及避免规范主义；是 RQ2 理论基础而非 LLM 实证。 |
| Wang Xiaoling 2024 | 已核验期刊全文，*Sinología Hispánica* 18(1):71–98 | 可支持 ChatGPT 用于西语母语者中文会话学习的潜力；正文“提升”宜写成该研究报告/建议，避免因研究设计不清而作强因果结论。 |
| 顾小清、郝祥军 2025 | 本轮未打开权威期刊页或原文 | 标记 unverified；不得进入 approved。 |

## 必须纠正的引用风险

1. Edge et al. 的作者清单错误。
2. HSSC 2025 的作者与文章号写错；三类 LLM 局限位于原文引言而非其主要实验发现，须降低证据强度。
3. “MultiTutor 验证多智能体优于单智能体”过强；只能描述其系统、评价设置与所报告结果。
4. 章节页首“真实文献，已逐条核对”不成立：至少 2 条未核验，Edge 作者清单及 HSSC 作者/文章号有误，且 1 个具体论断泛化过强。
