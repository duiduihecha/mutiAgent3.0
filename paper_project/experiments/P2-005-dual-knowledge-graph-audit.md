# P2-005 双知识图谱零成本审计

**日期**: 2026-08-26  
**边界**: 只读代码、Cypher、种子 JSON 和已有文档；未连接 Neo4j/Supabase，未调用 LLM/API，未修改数据。因此“规模”分为可复核的本地种子规模与未核实的在库规模，不把 README 数字当成当前库事实。

## 1. 真实边界

代码支持 Human PI 的初始假设，但两者不是两个独立数据库，而是**同一 Neo4j 中相连的两个逻辑子图**：

1. **教学—文化—语言结构子图**：`Domain→Scene→KnowledgePoint`，并扩展 `CulturalConcept`、`CulturalDimension`、`HomeCulture`、`HSKWord`、`GrammarPoint`、`LanguagePoint`等。它负责 case 层级、文化维度与 HSK 词法约束。
2. **学习者认知/掌握度子图**：`Learner-[:BELONGS_TO]->HomeCulture`、`Learner-[:MASTERED]->KnowledgePoint`，依赖前一子图的 `HomeCulture/KnowledgePoint/CulturalDimension`；`PREREQUISITE`边和错误/干预类型服务学习路径与诊断。

`learning-graph.ts` 是 **LangGraph 编排图**，不是第三套知识图谱；Supabase 中的结构化缓存/知识表也不应与 Neo4j 子图混称。

## 2. 子图 A：教学—文化—语言结构

### Schema、来源与可核验规模

- 本地 `knowledge_graph_seed.json` 静态计数为 **14 Domain / 56 Scene / 166 KnowledgePoint**；`seed_neo4j.py` 用 `MERGE` 写入 `HAS_SCENE` 与 `HAS_KNOWLEDGE_POINT`。这是种子规模，不是当前云库规模证明。
- `neo4j_schema_v2.cypher` 声明 Domain、Scene、KnowledgePoint、LanguagePoint、CulturalConcept、GrammarPoint、CulturalDimension、HomeCulture、HSKWord 的唯一 ID；关系包括 `RELATES_TO`、`HAS_DIMENSION`、`MANIFESTED_IN`、`SCORES`、`REQUIRES_VOCAB`、`REQUIRES_GRAMMAR`、`PREREQUISITE`。
- 文化维度种子显式包含 12 个 `CulturalDimension` 与 9 个 `HomeCulture`；其中 Hofstede/Hall 类分数是手工种子，不能当作个体预测或无条件文化事实。
- `seed_cross_cultural_links.py`、`seed_manifested_in.py`、HSK 种子脚本是写入者；`diag-neo4j*.mjs` 已经暴露项目历史上需要检查 schema 对不上、`RELATES_TO/HAS_DIMENSION/MANIFESTED_IN` 缺边的风险。

### 实际生效路径

- `ExperimentRunner` 查 `Domain→Scene→KnowledgePoint` 生成 case，失败/空图则回退到硬编码 case。因此既有 156 条不能仅凭文件证明来自 KG。
- A4 通过 `getVocabularyConstraint()` 查 `REQUIRES_VOCAB/REQUIRES_GRAMMAR` 并注入 prompt；A5 的字级白名单使用 HSK 本地表∪KP 词表，Neo4j 不可用时回退到本地 HSK 字表。这是软 prompt 约束+部分离线硬检查，不是端到端 KG 硬约束。
- CIEval 构建脚本查 KP—文化维度—HomeCulture 和 HSK 词表，但它是数据集构建/评价路径，不证明在线生成每次真正 grounding。
- A2/A3 主路径仍主要使用 LLM 与 Supabase 缓存；代码不支持“每次 A2/A3 都被文化 KG 事实硬约束”。

### 失效模式

- **断边/死数据**：有节点无 `RELATES_TO/HAS_DIMENSION/REQUIRES_*` 时，查询安静返回空数组，生成仍可继续；“有 KG”不等于“该 case 用到 KG”。
- **ID 不一致**：种子 KP ID、Supabase knowledge point ID、场景模糊映射与历史 case ID 可不同。本轮 26 个历史 base case 仅 1 个在当前 168-case 清单中同 ID，证明版本漂移不能忽略。
- **文化错配**：语言别名未解析时曾默认 `en`；P2-005 转换诊断在 156 条中标出 108 条非英语目标却出现英语/西方文化指称。该诊断是高召回警报，需证据卡人工确认，但已足以废弃旧盲包。
- **回退不透明**：多处 catch 后返回 `[]`/本地表；如 manifest 不记录命中数，Full+KG 可实际退化为 NoKG。

## 3. 子图 B：学习者认知/掌握度

### Schema、写入与查询

- `upsertLearnerNode` 写 `Learner` 属性并用 `hc_${cultureCode}` 连 `BELONGS_TO HomeCulture`；`recordMastery` 仅在 Learner 与 KP 均存在时 `MERGE MASTERED`，属性为 score、last_updated_at、cumulative_correct。
- LangGraph 生成结束后把 **pipeline confidence** 写成 mastery；答题结果 API 又把 **correct rate** 写到同一条 `MASTERED` 边。两者 estimand 不同却相互覆盖，是明确的**时序/语义污染**。
- `getLearnerWeakDimensions` 聚合 MASTERED 并经 KP→CulturalConcept→CulturalDimension 找弱项；无维度边时回退到综合 mastery。A4 会调用该报告注入弱项提示。
- `/api/learning/results` 写 mastery；`/api/learners/[id]/recommendations` 读 mastery、遗忘衰减、前置边、动机与 HSK 后评分推荐。Neo4j 查询失败时推荐直接返回空，不是可验证的闭环降级。

### 风险

- `MATCH` HomeCulture/KP 不存在时不创建关系，而调用者只看到成功返回；容易出现孤立 Learner 和丢失 mastery。
- `writeLearnerGraph` 把 `native_language` 直接当 culture code；如值为“日语圈”而非 `ja`，将查 `hc_日语圈`，与种子 `hc_ja` 不一致。
- Learner ID、母语、HSK、行为掌握度与时间戳是可识别/画像数据。当前日志截断 ID 不等于库内匿名；论文数据导出必须伪名化，不应导出原始 Learner 子图。
- `accuracy_trend` 目前恒为 `stable`，不能声称已实现经验验证的趋势追踪；BKT/能力向量与该图的持久化也不足以支持完整个性化闭环主张。

## 4. 论文主张边界

**可写**：系统包含结构化教学/文化子图与相连的学习者 mastery 子图；某些路径可查词法约束、生成 case 或诊断弱项，并有明确回退。  
**不可写**：“391 节点已被每次生成硬约束”、“完整 GraphRAG”、“KG 使 A2/A3 事实正确”、“BKT—弱项—推荐已形成验证闭环”、“KG 有因果增益”。当前更准确的词是 **structured-knowledge-conditioned generation**，且须报告实际命中/回退。

## 5. 4 页短文的零/低成本利用

| 用途 | 可用性 | 额外时间 | API 成本 |
|---|---|---:|---:|
| 用 Domain/Scene/HSK/culture 做 6-case 分层与 ID 完整性检查 | 高，但以冻结种子文件为准 | 2–4h | 0 CNY |
| 用文化维度/关系生成事实证据卡的候选主张 | 中，必须人工核源，不把图谱当真值 | 4–8h | 0 CNY |
| 离线检查断边、ID、目标 culture、HSK 词表覆盖 | 高（对种子） | 3–6h | 0 CNY |
| 用 learner 图谱做 Pilot 主结果 | 低，mastery 语义污染且涉及隐私 | >2d | 0 API，但人工/工程成本高 |

建议：短文只把子图 A 用于 **Pilot 材料质控、case 分层、错误诊断**；子图 B 放 Limitations/未来工作，不增加 KG 主贡献。

## 6. KG/NoKG 最低成本可验证方案（附录候选）

1. 仅用已选 6 case，冻结同一模型、A4 任务/schema、温度、停止/失败规则和总 token 预算。
2. KG 条件只注入经证据卡核对的结构化片段；NoKG 不注入该片段，用相同 token 配额，不以无意义 padding 充数。
3. manifest 必须记录 query hash、返回节点/边数、空命中、回退原因、注入文本 hash；空命中 case 不得标成 KG 暴露。
4. 结果只做盲化事实错误/文化正确性诊断，不改变 RQ1/RQ2 主线。在本轮 0 CNY 下只能完成离线设计；任何新生成需 P0 批准后从未来 smoke/pilot 额度支出。

**准入门**：在库只读 schema/count 快照、六 case 非空命中、ID/culture 一致、来源卡完成、telemetry 记录回退、非 KG 主贡献。任一不满足，不运行 KG/NoKG。
