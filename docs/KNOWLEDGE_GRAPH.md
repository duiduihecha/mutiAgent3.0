# 知识图谱结构文档

> **最后更新**: 2026-06-03
> **更新触发**: MANIFESTED_IN 标注完成，96条边导入 Neo4j
> **验证方式**: `python3 scripts/seed_manifested_in.py --verify` + Neo4j Browser `MATCH ()-[r:MANIFESTED_IN]->() RETURN count(r)`

---

## 概述

知识图谱是系统的**结构化知识底座**，为 5 个 LLM Agent（A1-A5）提供可查询的事实数据，减少 LLM 幻觉。当前为 **4 层语义网络**，运行于 Neo4j AuraDB (`neo4j+s://990f6a94.databases.neo4j.io`)。

```
总节点数: ~16,000
总关系数: ~110,000
节点标签数: 18
关系类型数: 19
```

---

## Layer 1: 文化语用概念层

**定位**: 教学内容的骨架——领域→场景→语用任务的三级层级，加上从 `l1_conflict_points` 中提取的文化概念和语言点。

### 节点

| 标签 | 数量 | 关键属性 | 来源 |
|------|------|----------|------|
| **Domain** | 14 | `id`, `name`, `name_en`, `icon`, `description` | `knowledge_graph_seed.json` 手动定义 |
| **Scene** | 56 | `id`, `name`, `name_en`, `icon`, `description` | 同上，每 Domain 3-4 个 Scene |
| **KnowledgePoint** | 166 | `id`, `name`, `pragmatic_intent`, `hsk_level`(1-9), `cultural_complexity`(1-5), `high_context`(bool), `l1_conflict_points`(JSON) | 同上，每 Scene 2-4 个 Task |
| **CulturalConcept** | 55 | `id`, `name` | `extract_layer1_nodes.py` 从 `l1_conflict_points` 自动提取 |
| **LanguagePoint** | 55 | `id`, `name` | 同上 |
| **GrammarPoint** | 97 | `id`, `name` | `seed_hsk_vocab.py` + `layer3_links_config.json` |
| **CultureNode** | 378 | `name`, `group` | 早期种子数据（中国概况文化知识点） |
| **CrossCultureContrast** | 104 | `name` | 早期种子数据（跨文化对比条目） |

### 关系

| 关系类型 | 数量 | 方向 | 含义 |
|----------|------|------|------|
| **HAS_SCENE** | 56 | Domain→Scene | 领域包含场景 |
| **HAS_KNOWLEDGE_POINT** | 166 | Scene→KnowledgePoint | 场景包含语用任务 |
| **RELATES_TO** | 55 | KnowledgePoint→CulturalConcept | 语用任务涉及的文化概念（按母语区分） |
| **INVOLVES** | 55 | KnowledgePoint→LanguagePoint | 语用任务涉及的语言使用规则（按母语区分） |
| **HAS_CONTRAST** | 78 | CultureNode→CultureNode | 两个文化概念之间的对比关系 |
| **SAME_GROUP** | 225 | CultureNode→CultureNode | 两个文化概念属于同一主题分组 |
| **BELONGS_TO_CONTRAST** | 300 | CrossCultureContrast→CultureNode | 跨文化对比关联到文化节点 |
| **SCORES** | 108 | User→CultureNode | 用户对文化节点的评分（早期功能，当前未使用） |

### 当前 14 个 Domain 一览

| Domain ID | 名称 | Scenes | Tasks | 数据来源 |
|-----------|------|--------|-------|----------|
| food | 餐饮美食 | 4 | 11 | 人工标注 |
| workplace | 职场办公 | 4 | 11 | 人工标注 |
| daily | 日常社交 | 4 | 12 | MiniMax 生成 + 校验 |
| campus | 校园生活 | 4 | 12 | MiniMax 生成 + 校验 |
| travel | 旅游出行 | 4 | 12 | MiniMax 生成 + JSON修复 |
| shopping | 购物消费 | 4 | 12 | MiniMax 生成 + 校验 |
| transport | 交通出行 | 4 | 12 | MiniMax 生成 + 校验 |
| medical | 医疗健康 | 4 | 12 | MiniMax 生成 + 校验 |
| banking | 银行金融 | 4 | 12 | MiniMax 生成 + 校验 |
| housing | 租房住宿 | 4 | 11 | MiniMax 生成 + 校验 |
| entertainment | 休闲娱乐 | 4 | 12 | MiniMax 生成 + 补丁 |
| emergency | 紧急情况 | 4 | 12 | MiniMax 生成 + JSON修复 |
| family | 家庭与亲属 | 4 | 13 | MiniMax 生成 + JSON修复+补全 |
| festival | 节日与传统 | 4 | 12 | MiniMax 生成 + 补丁 |
| **合计** | | **56** | **166** | |

### 使用方

- **前端语用任务树**: `GET /api/admin/graph?action=pragmatic_tree` → 查询 `Domain→Scene→KnowledgePoint` 三级树
- **A3 CulturalComparator**: 查询 `(KnowledgePoint)-[:RELATES_TO]->(CulturalConcept)-[:HAS_DIMENSION]->(CulturalDimension)` 获取结构化文化维度数据
- **A2 MotherTongueExplainer**: 查询 `MANIFESTED_IN` 路径（目前该边为空，回退到 LLM 生成）

---

## Layer 2: 跨文化维度层

**定位**: 将文化概念映射到 Hofstede/Hall 等经典跨文化理论维度，使文化差异可量化、可对比。

### 节点

| 标签 | 数量 | 关键属性 | 来源 |
|------|------|----------|------|
| **CulturalDimension** | 12 | `id`, `name` | `seed_cultural_dimensions.cypher` |
| **HomeCulture** | 9 | `id`, `name` | 同上（1个中文文化圈 + 8个学习者文化圈） |

### 12 个文化维度

| ID | 维度名称 | 理论来源 |
|----|----------|----------|
| dim_power_distance | 权力距离 | Hofstede |
| dim_individualism | 个人/集体主义 | Hofstede |
| dim_masculinity | 竞争与关怀导向 | Hofstede |
| dim_uncertainty | 不确定性规避 | Hofstede |
| dim_long_term | 长期/短期导向 | Hofstede |
| dim_indulgence | 放纵与克制 | Hofstede |
| dim_high_context | 高低语境 | Hall |
| dim_proxemics | 空间距离 | Hall |
| dim_chronemics | 时间观念 | Hall |
| dim_specific_diffuse | 特定型与扩散型界限 | Trompenaars |
| dim_face_concern | 面子与尊严 | 自定（跨文化语用学） |
| dim_reciprocity | 互惠与人情规范 | 自定（跨文化语用学） |

### 9 个 HomeCulture

| ID | 名称 |
|----|------|
| hc_zh | 中文文化圈 |
| hc_en | 英语圈 |
| hc_ja | 日语圈 |
| hc_ko | 韩语圈 |
| hc_es | 西班牙语圈 |
| hc_ar | 阿拉伯语圈 |
| hc_ru | 俄语圈 |
| hc_fr | 法语圈 |
| hc_th | 东南亚文化圈 |

### 关系

| 关系类型 | 数量 | 方向 | 含义 |
|----------|------|------|------|
| **HAS_DIMENSION** | 73 | CulturalConcept→CulturalDimension | 一个文化概念涉及哪个理论维度，含 `weight`(0-1) |
| **MANIFESTED_IN** | 96 | CulturalDimension→HomeCulture | 该维度在某母语文化中的具体表现描述，含 `weight`, `manifestation`, `conflict_with_chinese`, `pragmatic_tip`, `example_scenario` |

### 完成度

- `HAS_DIMENSION`: **已填充 73 条** — 自动从 `l1_conflict_points` 分析得出
- `MANIFESTED_IN`: **已填充 96 条** — Coze 批量生成 + DeepSeek+MiniMax 双裁判评分（通过率 91%），通过 `scripts/seed_manifested_in.py` 导入

### 使用方

- **A3 CulturalComparator**: 读取 `HAS_DIMENSION` 作为权威维度标签注入 prompt
- **A2 MotherTongueExplainer**: 读取 `MANIFESTED_IN` 获取母语特定的文化表现、冲突描述、实用建议和场景示例，注入 prompt 的 `<graph_cultural_context>` 块

---

## Layer 3: HSK 语言体系层

**定位**: 为 A4 内容生成提供词汇和语法约束，确保生成的练习题目符合学习者的 HSK 等级。

### 节点

| 标签 | 数量 | 关键属性 | 来源 |
|------|------|----------|------|
| **HSKWord** | 15,246 | `id`, `lemma`, `level`(1-7), `pos` | `seed_hsk_vocab.py` 读取 `src/data/hsk_word_new.jsonl` |
| **GrammarPoint** | 97 | `id`, `name` | 同 Layer 1 中的 GrammarPoint（共享节点） |

### HSKWord 等级分布

| HSK 等级 | 词汇量 |
|----------|--------|
| 1 | 994 |
| 2 | 1,534 |
| 3 | 1,934 |
| 4 | 1,990 |
| 5 | 2,037 |
| 6 | 1,136 |
| 7-9 | 5,621 |
| **合计** | **15,246** |

### 关系

| 关系类型 | 数量 | 方向 | 含义 |
|----------|------|------|------|
| **REQUIRES_VOCAB** | 104,045 | KnowledgePoint→HSKWord | 该语用任务要求掌握该词汇。规则：KP 在 HSK N 级 → 关联所有 HSK 1~N 的词汇 |
| **REQUIRES_GRAMMAR** | 136 | KnowledgePoint→GrammarPoint | 该语用任务要求掌握该语法点（需人工绑定） |
| **HAS_POS** | 4,194 | HSKWord→GrammarPoint | 词汇的词性分类 |

### 完成度

- `REQUIRES_VOCAB`: **已全量填充**（自动规则，全覆盖）
- `REQUIRES_GRAMMAR`: **部分填充 136 条** — GrammarPoint 的人工标注不完整，`layer3_links_config.json` 仅覆盖了 food/workplace 的 KP

### 使用方

- **A4 ContentGenerator**: 查询 `REQUIRES_VOCAB` 获取词汇约束列表，注入 prompt 的 `<vocabulary_constraints>` 块
- **前端 HSK 词汇面板**: `GET /api/admin/graph?action=hsk_vocab&kp_id=xxx&hsk_level=N` → 查询图中的 HSKWord

---

## Layer 4: 学习者认知层

**定位**: 追踪学习者的掌握状态和偏误模式，支撑个性化推荐。

### 节点

| 标签 | 数量 | 关键属性 | 来源 |
|------|------|----------|------|
| **Learner** | 运行时增长 | `id`(UUID), `hsk_level`, `native_language`, `home_culture_code` | `upsertLearnerNode()` 在每次学习时 MERGE |
| **ErrorCategory** | 4 | `id`, `name` | `seed_error_patterns.cypher` |
| **ErrorPattern** | 10 | `id`, `name`, `description` | 同上 |
| **LinguisticFeature** | 28 | `id`, `name`, `category`(TMT/LCC) | 同上 |
| **Etiology** | 3 | `id`, `name` | 同上 |
| **InterventionStrategy** | 10 | `id`, `name`, `description` | 同上 |

### 4 个偏误大类

| ID | 名称 |
|----|------|
| ec_phonetic | 语音与汉字偏误 |
| ec_lexical | 词汇层面偏误 |
| ec_grammar | 语法层面偏误 |
| ec_pragmatic | 语用与文化偏误 |

### 10 个偏误模式

| ID | 名称 | 所属大类 |
|----|------|----------|
| ep_tone_confusion | 拼音声调混淆与语音偏差 | 语音与汉字偏误 |
| ep_char_confusion | 汉字部件混淆与拓扑结构错误 | 语音与汉字偏误 |
| ep_separable_word | 离合词使用与结构偏误 | 词汇层面偏误 |
| ep_noun_compound | 名词复合结构语序与机制偏差 | 词汇层面偏误 |
| ep_classifier | 量词缺失与语义错配 | 词汇层面偏误 |
| ep_aspect_marker | 时体标记混淆 | 语法层面偏误 |
| ep_ba_construction | 把字句回避与结构泛化 | 语法层面偏误 |
| ep_coverb_phrase | 介宾补语短语语序错位 | 语法层面偏误 |
| ep_speech_act | 言语行为实现与语境匹配错误 | 语用与文化偏误 |
| ep_politeness | 礼貌策略选择失误与语域混用 | 语用与文化偏误 |

### 关系

| 关系类型 | 数量 | 方向 | 含义 |
|----------|------|------|------|
| **BELONGS_TO** | 运行时 | Learner→HomeCulture | 学习者属于哪个母语文化圈 |
| **MASTERED** | 运行时 | Learner→KnowledgePoint | 学习者对某语用任务的掌握度，`score`(0-1), `last_updated_at` |
| **BELONGS_TO** | 10 | ErrorPattern→ErrorCategory | 偏误模式属于哪个大类 |
| **FREQUENT_ERROR** | 117 | KnowledgePoint→ErrorPattern | 某语用任务常见哪些偏误模式 |
| **CAUSED_BY** | 14 | ErrorPattern→Etiology | 偏误的成因（母语负迁移/训练迁移/交际策略） |
| **REMEDIATED_BY** | 10 | ErrorPattern→InterventionStrategy | 该偏误的纠正策略 |
| **HAS_FEATURE** | 19 | ErrorPattern→LinguisticFeature | 偏误涉及的语言学特征标记（TMT+LCC 双框架） |

### 完成度

- 偏误分类学: **完整** — 基于用户学术论文定义，已全部写入图谱
- `FREQUENT_ERROR`: **已填充 117 条** — 每个 KP 到 1-2 个 ErrorPattern 的关联已建立
- `MASTERED`: **运行时增长** — 每次答题后 `results/route.ts` STEP 4 写入，当前仅测试数据
- Learner 节点: **运行时增长** — 新用户首次学习时创建

### 使用方

- **results/route.ts STEP 4**: 每次提交答案后调用 `recordMastery(learnerId, kpId, correctRate)` 写入 MASTERED 边
- **A1 LearnerProfiler**: 计划读取 `MASTERED` 边 + `FREQUENT_ERROR` 做薄弱维度交叉分析（当前仍以 Supabase 的 `ability_vector` 为主要数据源）
- **A4 自适应内容**: 计划读取 `getLearnerWeakDimensions()` 调整练习题维度分布（当前未接入）

---

## 代码文件索引

| 文件 | 作用 |
|------|------|
| `scripts/knowledge_graph_seed.json` | 图谱种子数据（14 Domain, 56 Scene, 166 KP），**唯一数据源** |
| `scripts/seed_neo4j.py` | 将种子 JSON 导入 Neo4j，幂等（MERGE） |
| `scripts/neo4j_schema_v2.cypher` | Neo4j 约束和索引定义（18 个约束） |
| `scripts/seed_hsk_vocab.py` | 从 `src/data/hsk_word_new.jsonl` 批量创建 HSKWord 节点 |
| `scripts/seed_layer3_links.py` | 创建 REQUIRES_VOCAB / REQUIRES_GRAMMAR 关系 |
| `scripts/extract_layer1_nodes.py` | 从 l1_conflict_points 提取 CulturalConcept / LanguagePoint |
| `scripts/seed_error_patterns.cypher` | 偏误分类学种子数据 |
| `scripts/seed_cultural_dimensions.cypher` | CulturalDimension + HomeCulture 种子 |
| `scripts/generate_kps.py` | LLM 批量生成 KnowledgePoint（MiniMax API） |
| `src/lib/learner-graph.ts` | 学习者图谱服务（upsertLearnerNode, recordMastery, getLearnerWeakDimensions） |
| `src/lib/neo4j-service.ts` | Neo4j 驱动封装（连接池、查询/写入方法） |
| `src/lib/hsk-vocab-graph.ts` | HSK 词汇图谱查询服务 |
| `src/lib/constants.ts` | `SCENE_TYPE_MAP`, `SCENE_TO_KP_KEYWORDS`, `getSceneType()` |

---

## 更新记录

| 日期 | 变更 | 触发者 |
|------|------|--------|
| 2026-06-01 | 14 个 Domain 全部填充完成，166 个 KP 导入 Neo4j；entertainment/festival 补丁完成；创建本文档 | Claude |
| 2026-06-03 | MANIFESTED_IN 96条边全部导入；A2/A3 查询路径修复，已接入图谱数据 | Claude |
