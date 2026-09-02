# RAG 机制：知识增强生成分析

## 1. 知识源分析

系统采用混合知识底座架构 $K = K_{graph} \cup K_{llm} \cup K_{expert}$ 三种知识源互补。与传统基于向量相似度的 RAG 系统不同，本系统的检索策略以**结构化精确匹配**为主、**图遍历语义扩展**为辅，规避了跨语言场景中向量语义检索的漂移问题。

### 1.1 结构化知识库 ($K_{graph}$)

#### Neo4j 图数据库

Neo4j 存储文化概念之间的结构化语义关联。节点类型与边类型定义如下：

| 节点类型 | 说明 | 示例 |
|----------|------|------|
| `CultureNode` | 文化知识点节点 | `{id: "kp_001", topic: "筷子与合餐", hsk_level: 3, category: "饮食"}` |
| 隐含节点 | 目标文化节点 | 在 `CONTRASTS_WITH` 关系中通过 `target_culture` 属性动态关联 |

| 边类型 | 说明 | Cypher 示例 |
|--------|------|-------------|
| `CONTRASTS_WITH` | 跨文化对比关系 | `(n)-[r:CONTRASTS_WITH {target_culture: "英语圈"}]->(target)` |
| `BELONGS_TO` / `RELATED_TO` | 层级归属/语义关联 | `(parent)-[r:BELONGS_TO]->(child)` |

核心检索操作（`src/lib/neo4j-service.ts`）：

- **跨文化对比查询**（`queryCrossCulturalContrast`）：通过 `(n:CultureNode {id})-[r:CONTRASTS_WITH {target_culture}]->(target)` 精确匹配某一知识点在特定目标文化下的对比分析。
- **相邻节点查询**（`queryRelatedNodes`）：通过可变长度路径 `MATCH path = (n)-[*1..depth]-(related)` 实现 BFS 语义扩展，发现与当前知识点相关的其他文化概念。
- **图统计**（`getKnowledgeGraphStats`）：通过 `CALL db.relationshipTypes()` 获取全图结构与维度分布。

Neo4j 服务通过 `neo4j-driver` 直接连接，提供连接池管理（max 50 连接，10s 获取超时）、自动重连、批量写入事务支持。

#### PostgreSQL 结构化知识表

| 表名 | 存储内容 | 关键检索字段 |
|------|----------|-------------|
| `cultural_knowledge_points` | 文化知识点主数据 | `id`, `hsk_level`, `layer` (1/2/3), `content_json`（多语言字段：zh/en/ja/ko 等） |
| `cultural_explanations` | 面向特定语言的文化阐释 | `knowledge_point_id`, `language_code`, `precise_definition`, `scene_introduction`, `pragmatic_rules`, `examples`, `taboo_warnings` |
| `cross_cultural_comparisons` | 跨文化对比数据 | `source_culture_id`, `target_culture`, `similarities`, `differences`, `pragmatic_hints`, `verified` |
| `knowledge_graph_nodes` | 知识图谱节点（PostgreSQL 侧） | `node_type` (culture/language/level/dimension/pragmatic/region), `properties` |
| `knowledge_graph_edges` | 知识图谱边（PostgreSQL 侧） | `edge_type` (correspond/contain/match/taboo/homology/difference), `source_node_id`, `target_node_id` |

### 1.2 LLM 生成缓存 ($K_{llm}$)

`llm_content_cache` 表（PostgreSQL）是系统的核心检索缓存层，由 `CacheManager` 单例（`src/storage/cache/cache-manager.ts`）管理。

**缓存条目结构**：

```typescript
interface CacheEntry {
  knowledge_point_id: string;   // 知识点 UUID (复合主键第1维)
  hsk_level: number;            // HSK 等级 (复合主键第2维)
  scene_id: string;             // 场景类型 (复合主键第3维)
  content_payload: Record<string, unknown>;  // 包含 cultural_explanation + cross_cultural_comparison
  is_llm_generated: boolean;    // 是否 LLM 生成
  confidence_score: number;     // 聚合 guardrail 置信度
  upvotes: number;              // 赞成票数
  downvotes: number;            // 反对票数
  status: "ACTIVE" | "DEGRADED" | "REJECTED";  // 生命周期状态
  model_version: string | null; // 生成模型版本
  generation_duration_ms: number | null;  // 生成耗时
}
```

**复合主键设计**：`(knowledge_point_id, hsk_level, scene_id)` 三维主键确保缓存条目在语义域、难度层和场景语境三个维度上精确区分。这与传统向量检索的模糊匹配形成根本差异——向量检索可能将 HSK1 的"筷子"与 HSK6 的"筷子文化象征"视为相似内容返回，而复合主键的精确匹配保证了缓存语义的准确性。

### 1.3 专家知识 ($K_{expert}$)

`expert_review_queue` 表和社区投票机制构成知识质量反馈闭环：

- `vote_cache(kpId, hskLevel, sceneId, isUpvote)` PostgreSQL RPC：用户对缓存内容进行赞/踩投票
- `evaluate_cache_quality(kpId, hskLevel, sceneId)` RPC：手动触发单条缓存的质量重新评估
- 状态变迁：累积足够 downvotes → ACTIVE → DEGRADED；持续低质量 → DEGRADED → REJECTED

### 1.4 关于向量库的说明

本系统**未使用向量数据库或 embedding 语义检索**。原始版本中曾包含 `cosineSimilarity()` 函数和 `getEmbeddings()` 调用（用于 A2 回译校验的语义相似度计算），但在重构中已移除，替换为基于 DeepSeek LLM 裁判（t=0, True/False NLI 判决）的语义验证方案。

移除向量检索的设计考量：
1. 短文本（文化阐释的回译）的 embedding 余弦相似度不可靠——两个语义完全不同但共享关键词的句子可能获得高相似度
2. 跨语言 embedding 模型的对齐质量在中文-小语种对（如中文-泰语、中文-阿拉伯语）上未经充分验证
3. LLM 裁判（DeepSeek NLI）在语义判断的准确性上优于余弦相似度，且具有可审计性（输出明确的 True/False 判决）

## 2. 检索流程

### 2.1 检索总体架构

本系统的检索策略以**复合主键精确命中**为核心，辅以**图遍历语义扩展**和**场景映射路由**，不依赖向量相似度检索。

```
请求进入 (knowledge_point_id, hsk_level, target_culture)
    │
    ├─→ [场景推断] getSceneType(kpId, keywords)
    │     └─→ 14 种场景类型: daily/campus/food/travel/...
    │
    ├─→ [路由 1] 复合主键精确检索
    │     └─→ CacheManager.get(kpId, hskLevel, sceneId)
    │           └─→ SELECT FROM llm_content_cache
    │                 WHERE (kp, hsk, scene) AND status='ACTIVE' AND confidence>=0.60
    │
    ├─→ [路由 2] Neo4j 图检索
    │     ├─→ queryCrossCulturalContrast(kpId, targetCulture)
    │     │     └─→ MATCH (n)-[r:CONTRASTS_WITH]->(target)
    │     └─→ queryRelatedNodes(kpId, depth=1)
    │           └─→ MATCH path = (n)-[*1..depth]-(related)
    │
    ├─→ [路由 3] PostgreSQL 结构化查询
    │     ├─→ cultural_knowledge_points (按 hsk_level, layer 筛选)
    │     ├─→ cultural_explanations (按 kpId + language_code)
    │     └─→ cross_cultural_comparisons (按 source_culture_id + target_culture)
    │
    └─→ [路由 4] 场景→知识点映射
          └─→ getKnowledgePointByScene(sceneId)
                └─→ 关键词 OR 查询 cultural_knowledge_points
```

### 2.2 缓存检索（主路径）

`queryKnowledgeBase()` 函数（`src/lib/multi-agent-system.ts:1100-1130`）是缓存检索的主入口：

1. 计算场景 ID：`sceneId = params.scene_id || getSceneType(knowledge_point_id, keywords) || "general"`
2. 调用 `CacheManager.get(kpId, hskLevel, sceneId)` 执行复合主键精确查询
3. 双重校验返回结果：`status === 'ACTIVE'` 且 `confidence_score >= 0.60`
4. HSK 等级容忍：`hskLevelMatches(cachedLevel, requestedLevel)` 允许 ±1 级偏差复用

命中时，缓存的 `cultural_explanation` 和 `cross_cultural_comparison` 直接注入 A4 用作练习题生成基础，跳过 A1-A3 的全部 LLM 调用。

### 2.3 知识图谱检索（语义扩展路径）

Neo4j 图检索提供两类语义扩展能力：

**跨文化对比精确匹配**：
```cypher
MATCH (n:CultureNode {id: $knowledge_point_id})
MATCH (n)-[r:CONTRASTS_WITH {target_culture: $target_culture}]->(target)
RETURN n, r, target
```
返回中国知识点节点、对比关系边、对应目标文化的对比节点三部分数据。

**邻域语义扩展**：
```cypher
MATCH path = (n:CultureNode {id: $knowledge_point_id})-[*1..$depth]-(related)
RETURN collect(DISTINCT nodes(path)), collect(DISTINCT relationships(path))
```
通过 BFS 在 1-3 跳深度内发现语义关联的文化概念。例如，检索"春节"时，可通过图遍历发现关联的"红包文化"、"年夜饭"、"春运"等子概念。

### 2.4 场景→知识点映射

当用户传入的是场景 ID（如 `"food"`）而非具体知识点 UUID 时，系统通过 `getKnowledgePointByScene()` 执行场景到知识点的映射路由：

1. 从 `SCENE_TO_KP_KEYWORDS` 常量表（`src/lib/constants.ts:78-93`）获取场景对应的关键词数组（如 `"food" → ["饮食", "日常饮食", "食物", "筷子", "合餐", "超市"]`）
2. 对 `cultural_knowledge_points` 表执行 `ilike '%关键词%'` 模糊匹配
3. 返回匹配到的第一条知识点（含 UUID、主题名称、HSK 等级）

该机制使前端可通过语义化的场景选择（而非精确的知识点 UUID）触发学习流程。

### 2.5 Prompt 装配

检索到的知识以 XML 标签结构注入 Agent prompt，与指令性内容隔离。

**A4 的知识注入结构**（`src/lib/multi-agent-system.ts:808-834`）：

```xml
<user_input>
  <scene_type>${scene_type}</scene_type>
  <target_hsk_level>${hsk_level}</target_hsk_level>
  <learner_native_language>${targetLangNaturalName}</learner_native_language>

  <cultural_explanation>
  ${JSON.stringify(cultural_explanation)}  <!-- 来自缓存或 A2 生成 -->
  </cultural_explanation>

  <cross_cultural_comparison>
  ${JSON.stringify(cross_cultural_comparison)}  <!-- 来自缓存或 A3 生成 -->
  </cross_cultural_comparison>

  <adaptive_guidance>
  弱项维度: [...]
  准确率趋势: ...
  重复错误模式: [...]
  </adaptive_guidance>
</user_input>
```

关键设计选择：外部知识以 `<user_input>` 标签包裹，与 `<system_prompt>` 中的指令性内容隔离。这种隔离防止了检索到的文化知识中可能嵌入的指令（如"忽略上述约束"）污染 prompt 的约束系统。

### 2.6 生成与 Grounding 校验

A4 基于注入的知识生成 `GeneratedContent`。生成后，`verifyA4Grounding` guardrail（`src/services/guardrail-service.ts:401-450`）执行**文化知识 grounding 校验**：

1. 提取 A2 文化阐释的关键摘要（`precise_definition` 或 `scene_introduction`）
2. 将练习题题干列表与阐释文本一同发送给 DeepSeek 裁判
3. 裁判判定："练习题是否基于给定的文化阐释内容出题？"
4. 若练习题明显与文化阐释无关（讨论的是完全不同的文化主题），判定为 False → `FLAG_PENDING_REVIEW`

该 grounding 校验是防文化幻觉的关键机制——它确保 A4 的练习题确实源于检索到的文化知识，而非 LLM 凭空编造的文化场景。

## 3. RAG 与多智能体协同

### 3.1 知识消费 Agent 分析

| Agent | 消费的知识源 | 知识用途 | 检索触发时机 |
|-------|-------------|----------|-------------|
| checkCache | `llm_content_cache` | 判断是否可走短路路径 | 管线启动时最先执行 |
| A1 | `assessment_records` (L2) | 聚合 L2 短期记忆趋势 | 缓存未命中后 |
| A2 | `knowledge_point_id` → 参数化 prompt | 确定阐释的文化主题 | 并行生成阶段 |
| A3 | `target_culture` → 参数化 prompt | 确定跨文化对比的参照系 | 并行生成阶段 |
| A4 | `cultural_explanation` + `cross_cultural_comparison` (注入 prompt) | 文化背景注入 + 练习题语境约束 | 汇聚后生成阶段 |
| Guardrail Grounding | `cultural_explanation` (作为校验基准) | 校验练习题是否忠于检索知识 | A4 输出后 |
| saveKB | guardrail 加权置信度 | 决定缓存准入和状态 | 管线末端 |

### 3.2 检索结果对生成的影响路径

```
检索到的 cultural_explanation
    │
    ├─→ A4 prompt <cultural_explanation> 块
    │     └─→ 影响 cultural_context.explanation 的内容准确性
    │     └─→ 影响 language_points 的文化语境选择
    │     └─→ 影响 exercises 的文化场景设定
    │
    ├─→ verifyA4Grounding 校验基准
    │     └─→ 阻断脱离阐释的凭空编造
    │
    └─→ llm_content_cache (经过 guardrail 加权置信度门控)
          └─→ 下次请求的检索源
```

检索到的 `cross_cultural_comparison` 影响 A4 的 `comparison` 摘要和 `exercises` 中涉及跨文化对比的题目设计。

### 3.3 检索与生成的闭环

系统形成"检索→生成→校验→缓存→再检索"的闭环：

1. **首次请求**：缓存未命中 → A2/A3 LLM 生成 → Guardrail 校验 → `computeCacheConfidence()` 加权聚合 → $C \ge 0.60$ 则写入 ACTIVE 缓存
2. **后续请求**：缓存命中 → 跳过 A2/A3 LLM 生成 → 直接注入 A4 → 仅执行 A4 solver 校验
3. **质量反馈**：用户投票 (`vote_cache`) → 累积 downvotes → ACTIVE → DEGRADED → REJECTED
4. **自我净化**：REJECTED 条目被 `CacheManager.get()` 排除在有效池之外，不参与后续检索

## 4. RAG 在跨文化学习中的作用

### 4.1 文化准确性保障

系统的 RAG 机制通过三重保障确保文化内容准确性：

**第一重：结构化知识约束**。所有文化知识来源于 `cultural_knowledge_points` 表，每条记录包含经审核的多语言内容（`content_json.zh` 中文原文 + 多语言翻译），而非 LLM 凭空生成的文化事实。A2 的 prompt 明确要求"你阐释的文化知识点必须基于真实可考的中国文化事实。不确定的细节宁可省略，不可臆造"。

**第二重：Guardrail Grounding 校验**。`verifyA4Grounding` 以检索到的文化阐释为基准，验证 A4 生成的练习题是否忠于原始知识。这防止了 A4 在综合多个输入时将不同文化概念错误拼接——例如将"筷子使用礼仪"错误关联到"日本茶道"的场景中。

**第三重：回译跨语言保真度校验**。`verifyA2Translation` 通过 qwen3.6-plus 将目标母语的阐释回译为中文，再由 DeepSeek 裁判比对回译与原始中文概念是否一致。跨语言、跨模型的双重验证确保文化知识在翻译过程中不发生语义扭曲。

### 4.2 语用得体性保障

系统通过以下机制保障中文语用的准确性：

- **HSK 单字颗粒度白名单**：`preA5HardRulesFilter` 将目标 HSK 等级的词汇表打散为单字集合，与题干逐一比对，标记超纲汉字。单字颗粒度避免了词汇级匹配的误报（如"什么"整体不在词表中但构成单字"什"和"么"均为基础字）。
- **拼音格式正则校验**：宽松字符级正则覆盖全部声调字母（āáǎà 等）和标准标点，不校验音节结构以防止误杀合法的拼音句子。
- **A5 拼音准确度评审**：`pinyin_score` 维度检查声调标注位置是否正确（"nǐ hǎo" 而非 "ni3 hao3"）。
- **语用规则注入**：A2 输出的 `pragmatic_rules` 字段包含 3 条具体的中文语用规则（如"对长辈使用'您'而非'你'"），直接注入 A4 的练习语境设计。

### 4.3 长尾知识补充

系统通过三种机制覆盖长尾文化知识需求：

**图遍历语义扩展**：Neo4j 的 BFS 路径搜索（`queryRelatedNodes`, depth=1-3）能够从核心知识点出发，发现关联的次生文化概念。例如从"春节"出发，可发现"贴春联"、"守岁"、"压岁钱"等子概念，扩展 A4 练习题的文化取材范围。

**场景关键词映射**：`SCENE_TO_KP_KEYWORDS` 表将 14 种交际场景映射到对应的知识点关键词数组。例如"紧急"场景映射到"报警、警察、帮助、急救"——这些长尾场景在日常教学中出现频率低，但对于特定动机（如工作、留学）的学习者至关重要。

**多语言阐释缓存**：`cultural_explanations` 表以 `(knowledge_point_id, language_code)` 为键存储面向特定母语的文化阐释。这意味着"筷子文化"对日语母语者（涉及中日筷子文化差异）和对英语母语者（涉及中西餐具差异）的阐释可以有独立的缓存条目，而非复用同一通用翻译。

### 4.4 与标准 RAG 范式的对比

| 维度 | 标准向量 RAG | 本系统结构化 RAG |
|------|-------------|-----------------|
| 检索方式 | embedding 余弦相似度 | 复合主键精确匹配 + 图遍历 |
| 语义漂移风险 | 高（跨语言场景尤甚） | 低（精确匹配） |
| 召回率控制 | 通过 top-k 调节 | 通过 HSK 等级容忍度 (±1) 和 BFS 深度调节 |
| 知识粒度 | chunk 级（不可控） | 知识点级（每个知识点为独立单元） |
| 幻觉防御 | 依赖 retriever 质量 | 复合主键 + LLM 裁判 grounding 双重保障 |
| 多语言支持 | 依赖多语言 embedding 模型 | 通过 language_code 精确区分 |
| 质量反馈 | 通常无闭环 | 投票 + 状态机 (ACTIVE→DEGRADED→REJECTED) |
| 可审计性 | 低（向量相似度不可解释） | 高（主键匹配、Cypher 查询可追溯） |
