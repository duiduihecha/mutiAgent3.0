# 知识图谱节点与关系生成方法

> 本文档汇总知识图谱中所有节点标签和关系类型的定义、数量与生成方法。
> 最后更新: 2026-07-01

---

## 目录

1. [生成方法总览](#1-生成方法总览)
2. [Layer 1 — 文化语用概念层](#2-layer-1--文化语用概念层)
3. [Layer 2 — 跨文化维度层](#3-layer-2--跨文化维度层)
4. [Layer 3 — HSK语言体系层](#4-layer-3--hsk语言体系层)
5. [Layer 4 — 学习者认知层](#5-layer-4--学习者认知层)
6. [关系图谱 — Agent使用的查询路径](#6-关系图谱--agent使用的查询路径)
7. [数量汇总](#7-数量汇总)
8. [相关文件索引](#8-相关文件索引)

---

## 1. 生成方法总览

整个知识图谱通过 **5种方法** 构建，各司其职：

| 方法 | 适用场景 | 工作量特征 | 示例 |
|------|---------|-----------|------|
| **人工标注** | 领域骨架、学术分类体系 | 质量高，量小 | Domain节点、CulturalDimension、ErrorPattern分类学 |
| **LLM批量生成 + 校验** | 大量语义内容 | 速度快，需裁判把关 | 12个domain的Scene/KP、MANIFESTED_IN边的文化表现数据 |
| **规则引擎自动生成** | 确定性关系 | 零人工，量最大 | REQUIRES_VOCAB (104K条)、PREREQUISITE (152条) |
| **脚本自动提取** | 从已有数据派生新节点 | 一次编写，自动运行 | CulturalConcept/LanguagePoint从KP字段提取 |
| **运行时动态生成** | 用户行为数据 | 持续增长 | Learner节点、MASTERED边 |

---

## 2. Layer 1 — 文化语用概念层

**定位**: 教学内容的骨架——领域→场景→语用任务的三级层级，加上从 `l1_conflict_points` 中提取的文化概念和语言点。

### 2.1 节点

| 标签 | 数量 | 生成方法 | 具体方式 |
|------|------|---------|---------|
| **Domain** | 14 | 人工标注 | `knowledge_graph_seed.json` 手动定义14个领域：餐饮美食(food)、职场办公(workplace)、日常社交(daily)、校园生活(campus)、旅游出行(travel)、购物消费(shopping)、交通出行(transport)、医疗健康(medical)、银行金融(banking)、租房住宿(housing)、休闲娱乐(entertainment)、紧急情况(emergency)、家庭与亲属(family)、节日与传统(festival) |
| **Scene** | 56 | **2个人工 + 12个LLM生成** | food 和 workplace 的8个场景人工标注；其余12个domain各3-4个场景由MiniMax LLM批量生成（`generate_kps.py`），生成后JSON格式校验+修复 |
| **KnowledgePoint** | 166 | **2个人工 + 12个LLM生成** | food 和 workplace 的22个KP人工标注（含完整的`pragmatic_intent`/`hsk_level`/`cultural_complexity`/`high_context`/`l1_conflict_points`）；其余约144个KP由 `generate_kps.py` 用DeepSeek批量生成，以已有food/workplace数据作为few-shot示例 |
| **CulturalConcept** | 55 | **脚本自动提取** | `extract_layer1_nodes.py` 从每个KP的 `l1_conflict_points` 字段自动提取文化概念名称，在Neo4j中MERGE创建节点 |
| **LanguagePoint** | 55 | **脚本自动提取** | 同上脚本，从 `l1_conflict_points` 提取语言使用规则名称，创建LanguagePoint节点 |
| **GrammarPoint** | 97 | **人工标注** | `layer3_links_config.json` 手动定义12大类语法点（如"把字句"、"比较句"、"补语结构"等），`seed_layer3_links.py` 批量创建节点 |
| **CultureNode** | 378 | **人工标注** | 早期手动标注的中国文化知识点（如"长城"、"春节"、"筷子文化"等），按group分组 |
| **CrossCultureContrast** | 104 | **人工标注** | 早期手动标注的跨文化对比条目 |

**Domain 完整列表**:

| Domain ID | 名称 | 场景数 | 任务数 | 数据来源 |
|-----------|------|--------|-------|---------|
| food | 餐饮美食 | 4 | 11 | 人工标注 |
| workplace | 职场办公 | 4 | 11 | 人工标注 |
| daily | 日常社交 | 4 | 12 | MiniMax LLM 生成 + 校验 |
| campus | 校园生活 | 4 | 12 | MiniMax LLM 生成 + 校验 |
| travel | 旅游出行 | 4 | 12 | MiniMax LLM 生成 + JSON修复 |
| shopping | 购物消费 | 4 | 12 | MiniMax LLM 生成 + 校验 |
| transport | 交通出行 | 4 | 12 | MiniMax LLM 生成 + 校验 |
| medical | 医疗健康 | 4 | 12 | MiniMax LLM 生成 + 校验 |
| banking | 银行金融 | 4 | 12 | MiniMax LLM 生成 + 校验 |
| housing | 租房住宿 | 4 | 11 | MiniMax LLM 生成 + 校验 |
| entertainment | 休闲娱乐 | 4 | 12 | MiniMax LLM 生成 + 补丁 |
| emergency | 紧急情况 | 4 | 12 | MiniMax LLM 生成 + JSON修复 |
| family | 家庭与亲属 | 4 | 13 | MiniMax LLM 生成 + JSON修复+补全 |
| festival | 节日与传统 | 4 | 12 | MiniMax LLM 生成 + 补丁 |
| **合计** | | **56** | **166** | |

**KnowledgePoint 属性定义**:

| 属性 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | string | 唯一标识 | `food_ordering_basic` |
| `name` | string | 中文名称 | "基础点餐" |
| `pragmatic_intent` | string | 交际意图描述 | "在餐厅用恰当的方式请服务员推荐菜并表达口味偏好" |
| `hsk_level` | integer(1-9) | 对应HSK等级 | 1 |
| `cultural_complexity` | integer(1-5) | 文化复杂度 | 2 |
| `high_context` | boolean | 是否高语境场景 | true |
| `l1_conflict_points` | JSON | 母语迁移冲突点列表 | `["间接表达vs直接要求", "合餐vs分餐"]` |

### 2.2 关系

| 关系类型 | 数量 | 生成方法 | 方向 | 含义 |
|----------|------|---------|------|------|
| **HAS_SCENE** | 56 | 同Domain/Scene | Domain → Scene | 领域包含场景 |
| **HAS_KNOWLEDGE_POINT** | 166 | 同上 | Scene → KnowledgePoint | 场景包含语用任务 |
| **RELATES_TO** | 55 | **脚本自动提取** | KnowledgePoint → CulturalConcept | 语用任务涉及的文化概念（`extract_layer1_nodes.py` 自动建立） |
| **INVOLVES** | 55 | **脚本自动提取** | KnowledgePoint → LanguagePoint | 语用任务涉及的语言使用规则（同上脚本） |
| **HAS_CONTRAST** | 78 | 人工标注 | CultureNode → CultureNode | 两个文化概念之间的对比关系 |
| **SAME_GROUP** | 225 | 人工标注 | CultureNode → CultureNode | 两个文化概念属于同一主题分组 |
| **BELONGS_TO_CONTRAST** | 300 | 人工标注 | CrossCultureContrast → CultureNode | 跨文化对比关联到文化节点 |

---

## 3. Layer 2 — 跨文化维度层

**定位**: 将文化概念映射到 Hofstede/Hall 等经典跨文化理论维度，使文化差异可量化、可对比。

### 3.1 节点

| 标签 | 数量 | 生成方法 | 具体方式 |
|------|------|---------|---------|
| **CulturalDimension** | 12 | **人工标注** | `seed_cultural_dimensions.cypher`，基于经典跨文化理论手动定义 |
| **HomeCulture** | 9 | **人工标注** | 同上，定义1个中文文化圈 + 8个学习者文化圈 |

**12个文化维度**:

| ID | 维度名称 | 理论来源 |
|----|----------|----------|
| `dim_power_distance` | 权力距离 | Hofstede |
| `dim_individualism` | 个人/集体主义 | Hofstede |
| `dim_masculinity` | 竞争与关怀导向 | Hofstede |
| `dim_uncertainty` | 不确定性规避 | Hofstede |
| `dim_long_term` | 长期/短期导向 | Hofstede |
| `dim_indulgence` | 放纵与克制 | Hofstede |
| `dim_high_context` | 高低语境 | Hall |
| `dim_proxemics` | 空间距离 | Hall |
| `dim_chronemics` | 时间观念 | Hall |
| `dim_specific_diffuse` | 特定型与扩散型界限 | Trompenaars |
| `dim_face_concern` | 面子与尊严 | 自定（跨文化语用学） |
| `dim_reciprocity` | 互惠与人情规范 | 自定（跨文化语用学） |

**9个 HomeCulture**:

| ID | 名称 | 说明 |
|----|------|------|
| `hc_zh` | 中文文化圈 | 目标文化（基准） |
| `hc_en` | 英语圈 | 学习者母语文化 |
| `hc_ja` | 日语圈 | 学习者母语文化 |
| `hc_ko` | 韩语圈 | 学习者母语文化 |
| `hc_es` | 西班牙语圈 | 学习者母语文化 |
| `hc_ar` | 阿拉伯语圈 | 学习者母语文化 |
| `hc_ru` | 俄语圈 | 学习者母语文化 |
| `hc_fr` | 法语圈 | 学习者母语文化 |
| `hc_th` | 东南亚文化圈 | 学习者母语文化 |

### 3.2 关系

| 关系类型 | 数量 | 生成方法 | 方向 | 含义 |
|----------|------|---------|------|------|
| **HAS_DIMENSION** | 73 | **脚本自动生成** | CulturalConcept → CulturalDimension | 一个文化概念涉及哪个理论维度，含 `weight`(0-1)。`seed_cross_cultural_links.py` 读取 `cross_cultural_mapping.json` 配置，自动分析KP的 `l1_conflict_points` 匹配维度 |
| **MANIFESTED_IN** | 96 | **LLM批量生成 + 双裁判仲裁** | CulturalDimension → HomeCulture | 该维度在某母语文化中的具体表现。含 `weight`, `manifestation`, `conflict_with_chinese`, `pragmatic_tip`, `example_scenario`。`seed_manifested_in.py`：Coze(豆包)批量生成内容 → DeepSeek+MiniMax独立评分 → **通过率91%才导入Neo4j** |
| **SCORES** | 108 | **人工标注** | HomeCulture → CulturalDimension | 某文化圈在某维度上的 Hofstede 分值(0-1)，含 `confidence`(High/Medium)。`seed_cultural_dimensions.cypher` 手动定义 |

**MANIFESTED_IN 边的属性**（每条边是一段结构化的跨文化知识）:

| 属性 | 说明 |
|------|------|
| `weight` | 该维度对目标文化的重要度 (0-1) |
| `manifestation` | 该维度在目标母语文化中的具体表现描述 |
| `conflict_with_chinese` | 与中国文化在该维度上的冲突点 |
| `pragmatic_tip` | 给学习者的实用跨文化沟通建议 |
| `example_scenario` | 真实场景示例 |

---

## 4. Layer 3 — HSK 语言体系层

**定位**: 为 A4 内容生成提供词汇和语法约束，确保生成的练习题目符合学习者的 HSK 等级。

### 4.1 节点

| 标签 | 数量 | 生成方法 | 具体方式 |
|------|------|---------|---------|
| **HSKWord** | 15,246 | **批量导入官方数据** | `seed_hsk_vocab.py` 读取 `src/data/hsk_word_new.jsonl`（HSK 3.0 官方词表），逐条创建节点 |
| **GrammarPoint** | 97 | **人工标注** | 同 Layer 1 中的 GrammarPoint（共享节点），`layer3_links_config.json` 定义 |

**HSKWord 属性**:

| 属性 | 说明 |
|------|------|
| `id` | 词汇唯一标识 |
| `lemma` | 词条（中文） |
| `level` | HSK 等级 (1-7) |
| `pos` | 词性标签 |

**HSKWord 等级分布**:

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

### 4.2 关系

| 关系类型 | 数量 | 生成方法 | 方向 | 含义 |
|----------|------|---------|------|------|
| **REQUIRES_VOCAB** | 104,045 | **规则引擎自动生成** | KnowledgePoint → HSKWord | `seed_layer3_links.py`。规则：KP的 `hsk_level=N` → 关联所有 HSK 1~N 级的 HSKWord。计算量：166个KP × 平均627词 = ~104K条边。**零人工，纯规则** |
| **REQUIRES_GRAMMAR** | 136 | **人工标注 + 脚本绑定** | KnowledgePoint → GrammarPoint | `layer3_links_config.json` 手动定义每个语法点匹配哪些KP，`seed_layer3_links.py` 创建边。当前仅覆盖food/workplace的KP |
| **HAS_POS** | 4,194 | **脚本自动生成** | HSKWord → GrammarPoint | `seed_hsk_vocab.py` 按 HSKWord.pos 字段自动关联到GrammarPoint词性节点 |

---

## 5. Layer 4 — 学习者认知层

**定位**: 追踪学习者的掌握状态和偏误模式，支撑个性化推荐与自适应干预。

### 5.1 节点

| 标签 | 数量 | 生成方法 | 具体方式 |
|------|------|---------|---------|
| **Learner** | 运行时增长 | **运行时动态生成** | `learner-graph.ts` 的 `upsertLearnerNode()`，用户首次学习时 MERGE 创建 |
| **ErrorCategory** | 4 | **人工标注** | `seed_error_patterns.cypher`，基于偏误分类学论文手动定义四大类 |
| **ErrorPattern** | 10 | **人工标注** | 同上，10种具体偏误模式，每个含 `name`/`description`/`l1_impact_factor`/`frequency` |
| **LinguisticFeature** | 28 | **人工标注** | 同上，TMT(目标语差异系统) + LCC(语言学分类系统) 双框架标记 |
| **Etiology** | 3 | **人工标注** | 同上，三种偏误成因 |
| **InterventionStrategy** | 10 | **人工标注** | 同上，每种偏误对应的教学干预策略 |

**4个偏误大类**:

| ID | 名称 | 包含偏误模式数 |
|----|------|-------------|
| `ec_phonology` | 语音与汉字偏误 | 2 |
| `ec_lexicon` | 词汇层面偏误 | 3 |
| `ec_syntax` | 语法层面偏误 | 3 |
| `ec_pragmatics` | 语用与文化偏误 | 2 |

**10个偏误模式**:

| ID | 名称 | 所属大类 |
|----|------|----------|
| `phonological_tone_confusion` | 拼音声调混淆与语音偏差 | 语音与汉字 |
| `orthographic_character_structure` | 汉字部件混淆与拓扑结构错误 | 语音与汉字 |
| `lexical_separable_word_misuse` | 离合词使用与结构偏误 | 词汇 |
| `lexical_noun_compound_order` | 名词复合结构语序与机制偏差 | 词汇 |
| `lexical_quantifier_collocation` | 量词缺失与语义错配 | 词汇 |
| `grammar_special_construction_ba` | 把字句回避与结构泛化 | 语法 |
| `grammar_special_construction_gei` | 给字句介动词混淆与成分缺失 | 语法 |
| `grammar_particle_misuse` | 助词形态规则偏误 | 语法 |
| `pragmatic_metadiscourse_imbalance` | 元话语标记功能缺失与语体失当 | 语用 |
| `discourse_connective_misuse` | 逻辑连词偏误与适应性转移 | 语用 |

**28个 LinguisticFeature（TMT+LCC双框架）**:

| 框架 | 数量 | 标记示例 |
|------|------|---------|
| TMT 主类动作 | 5 | `[M]`遗漏, `[R]`冗余, `[S]`选用错误, `[W]`错序, `[A]`类推泛化 |
| LCC 次类词性 | 10 | `v`动作动词, `adv`副词, `n`名词, `asp`时态助词, `de`结构助词, `Aux`能愿动词, `conj`连词, `p`介词, `vs`状态动词, `form`格式 |
| 特殊句式 | 3 | `ba`把字句, `gei`给字句, `bei`被字句, `shi`是字句 |
| 复合标记 | 10 | `[Madv]`副词遗漏, `[Sasp]`时态选用错误, `[Sv]`动词选用错误等 |

**3个 Etiology（偏误成因）**:

| ID | 名称 | 说明 |
|----|------|------|
| `et_negative_transfer` | 母语负迁移 | 学习者母语规则对目的语的干扰 |
| `et_overgeneralization` | 目的语规则泛化 | 将已掌握的中文规则错误地过度推广 |
| `et_avoidance` | 交际回避策略 | 为了规避困难而刻意避免使用复杂结构 |

### 5.2 关系

| 关系类型 | 数量 | 生成方法 | 方向 | 含义 |
|----------|------|---------|------|------|
| **BELONGS_TO** | 10 | **人工标注** | ErrorPattern → ErrorCategory | 偏误模式属于哪个大类 |
| **CAUSED_BY** | 14 | **人工标注** | ErrorPattern → Etiology | 偏误的成因，含 `primary`(true/false) 标记主次 |
| **REMEDIATED_BY** | 10 | **人工标注** | ErrorPattern → InterventionStrategy | 该偏误对应的纠正策略 |
| **HAS_FEATURE** | 19 | **人工标注** | ErrorPattern → LinguisticFeature | 偏误涉及的语言学特征标记 |
| **FREQUENT_ERROR** | 117 | **规则引擎自动生成** | KnowledgePoint → ErrorPattern | 每个KP按语义自动匹配1-2个常见偏误模式 |
| **PREREQUISITE** | 152 | **规则引擎自动生成** | KnowledgePoint → KnowledgePoint | `learner-graph.ts` 的 `buildPrerequisiteEdges()`。算法：Scene内按HSK等级升序串链KP₀→KP₁→KP₂；前一Scene末尾KP桥接下一Scene首个KP。MERGE幂等可重跑 |
| **BELONGS_TO** | 运行时 | **运行时动态生成** | Learner → HomeCulture | 学习者属于哪个母语文化圈 |
| **MASTERED** | 运行时 | **运行时动态生成** | Learner → KnowledgePoint | 学习者对某语用任务的掌握度，含 `score`(0-1), `last_updated_at` |

---

## 6. 关系图谱 — Agent 使用的查询路径

```
A2 母语阐释器 (MotherTongueExplainerAgent):
  (KnowledgePoint)-[:RELATES_TO]→(CulturalConcept)
    -[:HAS_DIMENSION]→(CulturalDimension)
    -[:MANIFESTED_IN]→(HomeCulture)
  → 拿到学习者的母语文化表现数据
  → 注入 prompt 的 <graph_cultural_context> 块
  → 让 LLM 基于图谱权威数据做母语阐释，减少幻觉

A3 文化对比器 (CulturalComparatorAgent):
  (KnowledgePoint)-[:RELATES_TO]→(CulturalConcept)
    -[:HAS_DIMENSION]→(CulturalDimension)
  → 拿到 Hofstede/Hall 维度标签和权重
  → 注入 prompt 的 <graph_dimension_data> 块
  → 让 LLM 基于学术框架做跨文化对比，而非主观判断

A4 内容生成器 (ContentGeneratorAgent):
  (KnowledgePoint)-[:REQUIRES_VOCAB]→(HSKWord)
  (KnowledgePoint)-[:REQUIRES_GRAMMAR]→(GrammarPoint)
  → 拿到该等级允许的词汇白名单 + 语法点列表
  → 注入 prompt 的 <vocabulary_constraints> 块
  → 硬约束 LLM 不输出超纲词汇

推荐引擎 (getRecommendations):
  (Learner)-[:MASTERED]→(KnowledgePoint)
  (KnowledgePoint)-[:PREREQUISITE]→(KnowledgePoint)
  → 五因子加权评分（动机×HSK邻近×解锁×弱项×新颖）
  → 驱动首页"为你推荐"和学习完成页"下一步推荐"

学习者画像 (A1 LearnerProfiler):
  (Learner)-[:BELONGS_TO]→(HomeCulture)
  → 确定学习者的文化圈归属
  → 驱动焦虑度调整和母语占比计算
```

---

## 7. 数量汇总

```
  Layer    节点标签数    节点总数       关系类型数     关系总数
  ─────    ────────    ──────────     ────────     ──────────
  L1        8           ~800           7            ~930
  L2        2           21             3            277
  L3        1           15,246         3            108,375
  L4        6           45 + 运行时     8            332 + 运行时
  ─────    ────────    ──────────     ────────     ──────────
  合计      17         ~16,100        21           ~110,000
```

按生成方法汇总:

```
  生成方法             节点数        边数
  ─────────           ──────      ───────
  人工标注             159          433
  LLM批量生成+校验      158          96 (通过率91%)
  规则引擎自动生成        0        104,314 (REQUIRES_VOCAB占99.7%)
  脚本自动提取          110          128
  批量导入官方数据     15,246        4,194
  运行时动态生成          ∞            ∞
  ─────────           ──────      ───────
  合计                ~15,700     ~109,000
```

**核心原则**: 骨架靠人工（领域定义、学术分类体系）→ 血肉靠LLM（12个domain的场景和任务、96条文化表现数据）→ 海量连接靠规则引擎（104K条词汇约束边、152条学习路径边）。

---

## 8. 相关文件索引

| 文件 | 作用 |
|------|------|
| `scripts/knowledge_graph_seed.json` | L1 种子数据（14 Domain, 56 Scene, 166 KP），**唯一数据源** |
| `scripts/seed_neo4j.py` | 将种子 JSON 导入 Neo4j，MERGE 幂等 |
| `scripts/extract_layer1_nodes.py` | 从 KP.l1_conflict_points 提取 CulturalConcept/LanguagePoint |
| `scripts/seed_cultural_dimensions.cypher` | L2 文化维度种子（12维度 + 9文化圈 + SCORES边） |
| `scripts/cross_cultural_mapping.json` | 跨文化维度映射配置（KP→Dimension权重） |
| `scripts/seed_cross_cultural_links.py` | 创建 HAS_DIMENSION 关系 |
| `scripts/seed_manifested_in.py` | LLM批量生成 + 双裁判评分 → 导入 MANIFESTED_IN 边 |
| `scripts/seed_hsk_vocab.py` | 从 `hsk_word_new.jsonl` 导入 15,246 个 HSKWord 节点 |
| `scripts/seed_layer3_links.py` | 规则引擎生成 REQUIRES_VOCAB(104K) + REQUIRES_GRAMMAR(136) 边 |
| `scripts/layer3_links_config.json` | HSK 语法点绑定配置（97个语法点 × 对应KP） |
| `scripts/seed_error_patterns.cypher` | L4 偏误模式分类学（ErrorCategory/ErrorPattern/LinguisticFeature/Etiology/InterventionStrategy） |
| `scripts/generate_kps.py` | LLM 批量生成新领域的 KnowledgePoint（DeepSeek + few-shot） |
| `scripts/neo4j_schema_v2.cypher` | Neo4j 约束和索引定义（18个约束） |
| `src/lib/learner-graph.ts` | 运行时：Learner节点、MASTERED边、PREREQUISITE边、推荐引擎 |
| `docs/KNOWLEDGE_GRAPH.md` | 知识图谱详细文档（结构说明、完成度追踪） |
| `docs/ARCHITECTURE.md` | 系统架构文档（含图谱在整体系统中的位置） |
