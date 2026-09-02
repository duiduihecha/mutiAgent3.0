# 系统架构 Mermaid 图集

## 1. 总架构图

```mermaid
graph TB
    subgraph Frontend["前端交互层 (Next.js 16 App Router)"]
        FE_Home["/ 首页<br/>画像采集"]
        FE_Learn["/learning<br/>学习界面"]
        FE_Test["/test<br/>练习题作答"]
        FE_KG["/knowledge-graph<br/>知识图谱可视化"]
        FE_Admin["/admin<br/>管理后台"]
    end

    subgraph APIGateway["API 网关层 (Next.js Route Handlers)"]
        API_Learn["POST /api/learning<br/>学习请求入口"]
        API_Results["POST /api/learning/results<br/>结果提交 & L1/L2/L3 写入"]
        API_Learners["/api/learners<br/>学习者 CRUD"]
        API_KB["/api/knowledge/*<br/>知识库查询"]
        API_Cache["/api/cache/*<br/>缓存投票 & 统计"]
    end

    subgraph Orchestration["Agent 编排层"]
        direction LR
        Orch_LangGraph["LangGraph DAG<br/>StateGraph + 条件边<br/>9 节点 · fan-out/in"]
        Orch_HandCrafted["手写编排<br/>MultiAgentCoordinator<br/>Promise.all 并行"]
    end

    subgraph Agents["Agent 执行层 (5 个专用 Agent)"]
        A1["A1 LearnerProfiler<br/>画像建模 · L2 趋势<br/>🖥 纯计算 · 无 LLM"]
        A2["A2 MotherTongueExplainer<br/>母语文化阐释<br/>🤖 DeepSeek t=0.3"]
        A3["A3 CulturalComparator<br/>跨文化对比<br/>🤖 DeepSeek t=0.3"]
        A4["A4 ContentGenerator<br/>教案 & 练习生成<br/>🤖 DeepSeek t=0.3"]
        A5["A5 QualityController<br/>四维盲审<br/>🤖 DeepSeek t=0.0"]
    end

    subgraph Guardrail["Guardrail 校验层 (6 种方法 · 内联门控)"]
        G_A2["verifyA2Translation<br/>qwen3.6 回译 + DeepSeek 裁判"]
        G_A3["verifyA3Comparison<br/>DeepSeek 客观性裁判"]
        G_A4_Solver["verifyA4SolverAdversarial<br/>DeepSeek 对抗盲测"]
        G_A4_Hard["preA5HardRulesFilter<br/>拼音 + HSK 单字白名单"]
        G_A4_Grounding["verifyA4Grounding<br/>练习题 vs 阐释交叉校验"]
        G_A5["verifyA5JointArbitration<br/>DeepSeek 单模型仲裁(降级)"]
    end

    subgraph KnowledgeBase["知识底座层"]
        direction LR
        KG_Neo4j["Neo4j 图数据库<br/>K_graph<br/>6 节点 · 6 边类型"]
        KG_Cache["PostgreSQL llm_content_cache<br/>K_llm<br/>三维复合主键缓存"]
        KG_Expert["expert_review_queue<br/>K_expert<br/>专家审核 & 投票"]
    end

    subgraph Models["异构模型层"]
        direction LR
        M_DS["DeepSeek deepseek-chat<br/>生成 · 高 stakes 裁判 · 仲裁"]
        M_MM["qwen3.6-plus (eflowcode)<br/>低 stakes 回译 · 校验"]
        M_DB["qwen3.7-plus / glm-5 (eflowcode)<br/>CIEval 评测裁判 · 异族"]
    end

    FE_Home --> API_Learn
    FE_Learn --> API_Learn
    FE_Test --> API_Results
    FE_KG --> API_KB
    FE_Admin --> API_Cache

    API_Learn --> Orchestration
    Orchestration --> Agents
    Agents --> Guardrail
    Guardrail --> KnowledgeBase
    Guardrail --> Models
    Agents --> Models
    KnowledgeBase --> API_Learn
```

## 2. 数据流图：完整请求生命周期

```mermaid
sequenceDiagram
    actor User as 学习者
    participant FE as 前端 (Next.js)
    participant API as API 网关 (/api/learning)
    participant Cache as 缓存管理器 (CacheManager)
    participant A1 as A1 LearnerProfiler
    participant A2 as A2 MotherTongueExplainer
    participant A3 as A3 CulturalComparator
    participant A4 as A4 ContentGenerator
    participant A5 as A5 QualityController
    participant GR as GuardrailService
    participant DS as DeepSeek API
    participant MM as qwen3.6 API
    participant DB as Supabase PostgreSQL

    User->>FE: 选择知识点 + 场景
    FE->>API: POST {learner_id, knowledge_point_id, hsk_level, native_language}

    Note over API: 1. 参数校验 & 场景→知识点映射

    API->>DB: SELECT learners WHERE id=?
    DB-->>API: learner_profile (7 维画像)

    Note over API: 2. 缓存检索

    API->>Cache: get(kpId, hskLevel, sceneId)
    Cache->>DB: SELECT llm_content_cache WHERE (kp, hsk, scene)
    DB-->>Cache: cache_entry | null

    alt 缓存命中 (ACTIVE & confidence>=0.60)
        Cache-->>API: cached_explanation + comparison
        Note over API: 短路路径：仅生成练习题
        API->>A4: process({cached_explanation, cached_comparison})
        A4->>A4: 生成练习题
        A4-->>API: GeneratedContent
        API->>GR: verifyA4SolverAdversarial (对抗盲测)
        GR->>DS: Solver 盲解请求
        DS-->>GR: Solver 答案
        GR-->>API: guardrail 判决
        API-->>FE: 响应 (from_cache=true)
    else 缓存未命中
        Cache-->>API: null
        Note over API: 完整 LLM 生成链路

        Note over API,A1: 3. A1 学习者画像建模
        API->>A1: process({calculate_anxiety, learner_profile})
        A1->>DB: SELECT assessment_records (最近 5 条)
        DB-->>A1: 评估记录
        A1->>A1: 焦虑度映射 + L2 趋势聚合
        A1-->>API: anxiety_data (level, ratio, L2 trends)

        Note over API,A3: 4. A2 + A3 并行生成
        par A2 母语阐释
            API->>A2: process({kpId, targetLang, anxiety, hsk})
            A2->>A2: 生成文化阐释 JSON
            A2-->>API: cultural_explanation
            API->>GR: verifyA2Translation (回译校验)
            GR->>MM: qwen3.6 回译 (目标母语→中文)
            MM-->>GR: back_translation
            GR->>DS: DeepSeek NLI 裁判
            DS-->>GR: True/False
            GR-->>API: a2_translation verdict
        and A3 跨文化对比
            API->>A3: process({concept, targetCulture, hsk})
            A3->>A3: 生成 XML 对比分析
            A3-->>API: cross_cultural_comparison
            API->>GR: verifyA3Comparison (客观性裁判)
            GR->>DS: DeepSeek 三标准裁判
            DS-->>GR: True/False
            GR-->>API: a3_comparison verdict
        end

        Note over API,A4: 5. A4 内容生成 + 四重 Guardrail
        API->>A4: process({A2输出, A3输出, L2趋势})
        A4->>A4: 生成 GeneratedContent (文化背景+语言点+练习题)
        A4-->>API: generated_content

        API->>GR: verifyA4SolverAdversarial (逐题盲测)
        GR->>DS: Solver 请求 × N 道题
        DS-->>GR: Solver 答案 × N
        GR-->>API: a4_solver verdict

        API->>GR: preA5HardRulesFilter (拼音+HSK)
        GR-->>API: a4_hard_rules verdict

        API->>GR: verifyA4Grounding (交叉校验)
        GR->>DS: DeepSeek 裁判
        DS-->>GR: True/False
        GR-->>API: a4_grounding verdict

        Note over API,A5: 6. A5 质量审核 + 双模型仲裁
        API->>A5: process({generated_content})
        A5->>A5: 四维盲审 (t=0)
        A5-->>API: quality_review

        API->>GR: verifyA5JointArbitration
        GR->>DS: 四维评分请求 (单模型, 原MiniMax已降级)
        DS-->>GR: ds_scores
        Note over GR: 原双模型分歧度仲裁已降级为 DeepSeek 单模型
        GR-->>API: a5_joint verdict

        Note over API: 7. 异步知识库回写
        API->>GR: computeCacheConfidence(guardrail_results)
        GR-->>API: weighted_confidence
        API->>Cache: upsert(kpId, hsk, scene, payload, confidence)
        Cache->>DB: UPSERT llm_content_cache
        Note over DB: confidence<0.60 → REJECTED

        API-->>FE: 完整响应 (from_cache=false + guardrail详情)
    end

    Note over User,DB: === 结果提交闭环 ===
    User->>FE: 完成练习
    FE->>API: POST /api/learning/results
    API->>API: calculateAbilityVector + applyAnxietyDelta + BKT
    API->>DB: L1: UPDATE learning_records.practice_result
    API->>DB: L2: INSERT assessment_records (维度分数+错误模式)
    API->>DB: L3: UPDATE learners (焦虑度+能力向量+session计数)
    DB-->>API: updated_learner
    API-->>FE: 更新后的画像 (anxiety, vector, sessions)
```

## 3. Agent 协同图：DAG 拓扑与 Guardrail 节点

```mermaid
graph TB
    START((START)) --> checkCache["checkCache<br/>缓存检索节点<br/>────────<br/>queryKnowledgeBase()<br/>双重校验: ACTIVE + C≥0.60"]

    checkCache -->|"cache_hit"| genEx["generateExercises<br/>缓存命中短路<br/>────────<br/>A4 仅生成练习题<br/>+ solver 对抗盲测"]
    checkCache -->|"cache_miss"| a1Profiler["A1 LearnerProfiler<br/>────────<br/>• 读取 DB 焦虑度<br/>• 映射 anxiety_level<br/>• 计算 native_ratio<br/>• 聚合 L2 趋势<br/>🖥 无 LLM 调用"]

    genEx --> END_CACHE((END))

    a1Profiler --> a2Explainer["A2 MotherTongueExplainer<br/>────────<br/>• 母语文化阐释生成<br/>• JSON 结构化输出<br/>🤖 DeepSeek t=0.3"]
    a1Profiler --> a3Comparator["A3 CulturalComparator<br/>────────<br/>• 跨文化对比分析<br/>• XML 四段输出<br/>🤖 DeepSeek t=0.3"]

    a2Explainer --> gA2["🛡 verifyA2Translation<br/>────────<br/>qwen3.6 回译 + DeepSeek NLI 裁判<br/>二值判决 True/False"]
    a3Comparator --> gA3["🛡 verifyA3Comparison<br/>────────<br/>DeepSeek 三标准裁判<br/>客观性 · 无偏见 · 事实基础"]

    gA2 --> mergeA2A3["mergeA2A3<br/>fan-in 汇聚点<br/>────────<br/>A2+A3 并行完成<br/>状态自动合并"]
    gA3 --> mergeA2A3

    mergeA2A3 --> a4Generator["A4 ContentGenerator<br/>────────<br/>• 综合 A2+A3+L2趋势<br/>• 教案 & 练习生成<br/>• &lt;adaptive_guidance&gt; 注入<br/>🤖 DeepSeek t=0.3 · 90s"]

    a4Generator --> gA4_Solver["🛡 verifyA4SolverAdversarial<br/>────────<br/>DeepSeek 独立盲解<br/>选择题: A-D 精确匹配<br/>填空: 三级模糊匹配"]
    a4Generator --> gA4_Hard["🛡 preA5HardRulesFilter<br/>────────<br/>拼音正则 + HSK 单字白名单<br/>🖥 无 LLM 调用"]
    a4Generator --> gA4_Grounding["🛡 verifyA4Grounding<br/>────────<br/>DeepSeek 裁判: 练习题<br/>是否忠于 A2 阐释"]

    gA4_Solver --> a5Controller["A5 QualityController<br/>────────<br/>四维盲审 (t=0)<br/>pinyin · distractor<br/>hsk_compliance · safety<br/>四项 ≥0.85 方合格"]
    gA4_Hard --> a5Controller
    gA4_Grounding --> a5Controller

    a5Controller --> gA5["🛡 verifyA5JointArbitration<br/>────────<br/>DeepSeek 单模型四维评分<br/>(原双模型已降级)<br/>四项 ≥0.85 方通过"]

    gA5 --> saveKB["saveKB<br/>异步知识库回写<br/>────────<br/>computeCacheConfidence()<br/>加权聚合 6 种 guardrail<br/>C ≥ 0.60 → ACTIVE<br/>C < 0.60 → REJECTED"]

    saveKB --> END_MAIN((END))

    style START fill:#2d2d2d,stroke:#666,color:#fff
    style END_CACHE fill:#2d2d2d,stroke:#666,color:#fff
    style END_MAIN fill:#2d2d2d,stroke:#666,color:#fff

    style checkCache fill:#1a365d,stroke:#3182ce,color:#bee3f8
    style genEx fill:#276749,stroke:#48bb78,color:#c6f6d5
    style a1Profiler fill:#744210,stroke:#d69e2e,color:#fefcbf
    style a2Explainer fill:#702459,stroke:#d53f8c,color:#fed7e2
    style a3Comparator fill:#702459,stroke:#d53f8c,color:#fed7e2
    style mergeA2A3 fill:#2d3748,stroke:#718096,color:#e2e8f0
    style a4Generator fill:#035388,stroke:#3182ce,color:#bee3f8
    style a5Controller fill:#0c4a6e,stroke:#0ea5e9,color:#bae6fd
    style saveKB fill:#276749,stroke:#48bb78,color:#c6f6d5

    style gA2 fill:#9b2c2c,stroke:#fc8181,color:#fed7d7
    style gA3 fill:#9b2c2c,stroke:#fc8181,color:#fed7d7
    style gA4_Solver fill:#9b2c2c,stroke:#fc8181,color:#fed7d7
    style gA4_Hard fill:#9b2c2c,stroke:#fc8181,color:#fed7d7
    style gA4_Grounding fill:#9b2c2c,stroke:#fc8181,color:#fed7d7
    style gA5 fill:#9b2c2c,stroke:#fc8181,color:#fed7d7
```

### Guardrail 节点详解

| 节点 | 插入位置 | 依赖模型 | 判决类型 | 失败处理 |
|------|----------|----------|----------|----------|
| 🛡 verifyA2Translation | A2 → mergeA2A3 | qwen3.6 + DeepSeek | 二值 True/False | FLAG_PENDING_REVIEW |
| 🛡 verifyA3Comparison | A3 → mergeA2A3 | DeepSeek | 二值 True/False | FLAG_PENDING_REVIEW |
| 🛡 verifyA4SolverAdversarial | A4 → A5 | DeepSeek | 逐题对比 | FLAG_REJECT |
| 🛡 preA5HardRulesFilter | A4 → A5 | 无 | 规则匹配 | FLAG_PENDING_REVIEW |
| 🛡 verifyA4Grounding | A4 → A5 | DeepSeek | 二值 True/False | FLAG_PENDING_REVIEW |
| 🛡 verifyA5JointArbitration | A5 → saveKB | DeepSeek 单模型 | 四维评分(原双模型已降级) | FLAG_PENDING_REVIEW |
