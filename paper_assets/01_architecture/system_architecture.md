# 系统架构分析

## 1. 系统整体架构

本系统面向跨文化对外汉语教学（TCSL）场景，采用**六层递阶架构**组织计算资源。自顶向下依次为：前端交互层、API 网关层、Agent 编排层、知识底座层、Guardrail 校验层与异构模型层。各层之间通过显式定义的接口进行通信，层内组件遵循单一职责原则，支持独立替换与渐进演化。

### 1.1 前端交互层

基于 Next.js 16 App Router 构建，包含 6 个页面路由与 18 个 API 路由：

| 路由 | 功能描述 |
|------|----------|
| `/` | 入口页面，学习者画像采集（母语、HSK 等级、学习风格、学习动机） |
| `/learning` | 学习主界面，知识点检索、场景选择与生成内容展示 |
| `/test` | 练习题作答页，逐题提交与结果展示 |
| `/knowledge-graph` | Neo4j 知识图谱可视化浏览 |
| `/admin` | 管理后台，缓存池健康度监控与内容审核 |
| `/api/*` | RESTful API 端点群，完整列表见 1.2 节 |

前端与后端通过标准 JSON 请求-响应模式通信。一次完整的"选题→学习→答题→反馈"生命周期跨越 2 次 API 调用：`POST /api/learning`（触发多 Agent 内容生成）与 `POST /api/learning/results`（提交答题结果与更新画像）。

### 1.2 API 网关层

API 网关层基于 Next.js Route Handler 实现，承担请求路由、参数校验与分级错误编码三重职责。核心端点如下：

| 端点 | 方法 | 职责 |
|------|------|------|
| `/api/learning` | POST | 学习请求入口，调度多智能体编排层 |
| `/api/learning/results` | POST | 做题结果提交，三级持久化写入（L1/L2/L3） |
| `/api/learning/results` | GET | 学习历史查询 |
| `/api/learners` | GET/POST | 学习者列表查询与创建 |
| `/api/learners/[id]` | GET | 学习者详情 |
| `/api/learners/[id]/trends` | GET | 学习者 L2 短期趋势查询 |
| `/api/knowledge/points` | GET | 知识点列表检索 |
| `/api/knowledge/points/[id]` | GET | 知识点详情 |
| `/api/knowledge/graph` | GET | 知识图谱全局结构 |
| `/api/knowledge/graph/level/[level]` | GET | 按 HSK 等级筛选图谱子图 |
| `/api/knowledge/graph/contrasts/[kp_id]` | GET | 跨文化对比边查询 |
| `/api/culture/compare` | POST | 按需跨文化对比分析生成 |
| `/api/culture/admin` | GET/POST | 文化知识库管理 |
| `/api/cache/vote` | POST | 缓存质量投票（赞/踩） |
| `/api/cache/stats` | GET | 缓存池统计信息 |
| `/api/explanations/[kp_id]` | GET | 已缓存文化阐释查询 |
| `/api/knowledge/admin` | GET/POST | 知识库管理接口 |
| `/api/test/llm` | POST | LLM 连通性诊断 |

错误码体系采用分级策略：400（参数校验失败）、404（资源不存在）、500（服务器内部错误）、502（Agent 调用异常，附带可诊断信息——异常类型与是否可重试）、503（数据库不可用）。

### 1.3 Agent 编排层

编排层提供**双路径并行**的设计，兼顾灵活性与演化能力：

- **LangGraph DAG 路径**（`src/lib/learning-graph.ts`）：基于 `@langchain/langgraph` 的 `StateGraph` 框架，以 `Annotation.Root` 定义 13 个共享状态字段，使用 reducer 控制字段合并策略（replace 用于覆盖型字段如 `learner_profile`，merge 用于累积型字段如 `guardrail_results`）。图包含 9 个节点（checkCache、generateExercises、a1Profiler、a2Explainer、a3Comparator、mergeA2A3、a4Generator、a5Controller、saveKB），通过条件边实现缓存短路分支，通过多出边实现 A2/A3 的天然并行。
- **手写编排路径**（`src/lib/multi-agent-system.ts`）：基于 `MultiAgentCoordinator` 类的命令式编排。使用 `Promise.all()` 实现 A2/A3 并行，手动管理 guardrail 插入点与错误处理。作为 LangGraph 路径的行为基准与回退方案。

两条路径共享相同的 Agent 实现类（`LearnerProfilerAgent`、`MotherTongueExplainerAgent`、`CulturalComparatorAgent`、`ContentGeneratorAgent`、`QualityControllerAgent`）、相同的 `GuardrailService` 单例和相同的 `CacheManager` 单例。编排模式的切换通过环境变量 `USE_LANGGRAPH=true` 或请求参数 `use_langgraph=true` 控制。

### 1.4 知识底座层

采用混合知识底座架构，整合三种互补的知识源：

$$K = K_{graph} \cup K_{llm} \cup K_{expert}$$

- **$K_{graph}$（Neo4j 图数据库）**：存储文化概念之间的结构化语义关联。节点类型 6 种（文化概念、知识点、语言点、场景、HSK 等级、母语文化），边类型 6 种（RELATES_TO、CONTRASTS_WITH、BELONGS_TO、HAS_LANGUAGE_POINT、APPLIES_IN_SCENE、AT_LEVEL）。通过 Cypher 图查询实现 BFS 路径搜索和文化关联发现。
- **$K_{llm}$（PostgreSQL `llm_content_cache` 表）**：LLM 生成内容的持久化缓存。以 `(knowledge_point_id, hsk_level, scene_id)` 三维复合主键进行精确检索，不做向量相似度匹配以避免语义漂移。缓存条目附有 `confidence_score` 与 `status` 字段，通过加权置信度门控（$C \geq 0.60$，`computeCacheConfidence` 函数）决定准入，通过有限状态机（ACTIVE → DEGRADED → REJECTED）管理生命周期。
- **$K_{expert}$**：人工审核与修正内容，通过 `expert_review_queue` 表存储待审项，通过 `vote_cache` / `evaluate_cache_quality` PostgreSQL RPC 实现社区投票驱动的质量反馈闭环。

### 1.5 Guardrail 校验层

Guardrail 校验层由 `GuardrailService` 单例实现，提供 6 种异构校验方法，采用 **in-line gating** 策略嵌入生成管线——在 Agent 输出向下游传播之前执行校验，而非在生成完成后统一过滤。这种设计阻断了错误在管线中的传播。

| 校验方法 | 嵌入点位 | 校验目标 | 技术路线 | 类型 |
|----------|----------|----------|----------|------|
| `verifyA2Translation` | A2 输出后 | 母语阐释的语义保真度 | qwen3.6-plus 回译 + DeepSeek 二值裁判（True/False，t=0） | LLM 裁判 |
| `verifyA3Comparison` | A3 输出后 | 跨文化对比的客观性与无偏见 | DeepSeek 三标准裁判（客观性/无偏见/事实基础，t=0） | LLM 裁判 |
| `verifyA4SolverAdversarial` | A4 输出后 | 练习题的可解性 | DeepSeek 独立盲解 + 题型分化校验（选择题精确匹配/填空三级模糊匹配） | LLM 对抗 |
| `verifyA4Grounding` | A4 输出后 | 练习题与 A2 阐释的忠实度 | DeepSeek 裁判，验证练习题是否可从阐释中溯源 | LLM 裁判 |
| `preA5HardRulesFilter` | A4 输出后 | 拼音格式 + HSK 等级单字合规 | 正则字符集校验 + HSK 单字颗粒度白名单（无 LLM 调用） | 确定性规则 |
| `verifyA5JointArbitration` | A5 输出后 | 四维质量评分的可靠性 | DeepSeek 单模型四维评分（原 MiniMax 第二仲裁方已废弃，降级为单模型；分歧度仲裁待恢复，$\delta_{max}=0.15$） | 单模型仲裁 |

全部 guardrail 方法遵循统一的安全兜底原则：任何外部 API 异常均被 `safeFallback()` 捕获，返回 `FLAG_PENDING_REVIEW` 判决而非向上传播异常，确保单模型故障不导致管线崩溃。

### 1.6 异构模型层

系统通过统一 LLM 服务 `UnifiedLLMService` 接入，按角色分配模型（单一事实源见 `config/models.json`）：

- **DeepSeek（deepseek-chat）**：承担 5 个核心 Agent（A1-A5）的生成任务与高 stakes guardrail 裁判（A4 solver 对抗盲解、A4 接地交叉校验、A3 客观性裁判、A5 四维盲审与仲裁）。A1 不使用 LLM（仅纯计算），A2-A4 使用 temperature=0.3，A5 使用 temperature=0.0（确定性质量审核）。通过 `UnifiedLLMService.chat()` 调用 OpenAI-compatible API，超时 15-45 秒。
- **qwen3.6-plus（经 eflowcode 网关）**：承担低 stakes 校验——A2 回译 NLI、A3 客观性对比、A4 接地判定的轻量裁判角色，与 DeepSeek 形成跨模型交叉校验。
- **已废弃**：原 Coze SDK（豆包 doubao-seed-2-0-pro-260215）与 MiniMax-M2.7 已移除。生成统一切换至 DeepSeek；原 MiniMax 双模型仲裁降级为 DeepSeek 单模型（见 limitation）。CIEval 评测裁判另用 qwen3.7-plus / glm-5，与生成异族。

## 2. 用户请求生命周期

一次完整的学习请求从用户操作到结果返回，经历以下 8 个阶段：

### 2.1 请求接入与画像解析

用户在前端选择知识点并触发学习。`POST /api/learning` 接收请求后依次执行：

1. **参数校验**：`knowledge_point_id` 为必填项，缺失时返回 400。
2. **场景→知识点映射**：若传入的是场景 ID（如 `"food"`，不含 UUID 分隔符 `-`），调用 `getKnowledgePointByScene()` 查询 `cultural_knowledge_points` 表，将场景 ID 转换为实际知识点 UUID。
3. **学习者画像获取**：若传入有效 `learner_id`，从 `learners` 表读取完整的 7 维画像（母语、HSK 等级、学习风格、学习动机、文化焦虑度、能力向量）。若首次访问，写入新记录并初始化默认画像（焦虑度 50，能力向量 [50,50,50,50,50]）。

### 2.2 缓存检索

系统以 `(knowledge_point_id, hsk_level, scene_id)` 三维复合主键查询 `llm_content_cache` 表。`scene_id` 通过 `getSceneType()` 函数从知识点 ID 和场景关键词推断（支持 14 种场景类型：daily、campus、food、travel、shopping、transport、workplace、medical、banking、housing、entertainment、emergency、family、festival）。

缓存命中需通过 `CacheManager.get()` 的双重校验：
- `status = 'ACTIVE'`（非 DEGRADED、非 REJECTED）
- `confidence_score >= 0.60`（加权聚合 guardrail 置信度达到阈值）

若命中（`found=true` 且 `cross_cultural_comparison` 存在），走**缓存短路路径**：跳过 A1-A3 的全部 LLM 调用，仅调用 A4 基于缓存中的 `cultural_explanation` 和 `cross_cultural_comparison` 生成练习题，并执行 A4 solver 对抗盲测。此路径可节省约 15-45 秒的 LLM 调用延迟，响应中 `from_cache = true`。

### 2.3 学习者画像建模（A1 节点）

A1 是系统中唯一不调用 LLM 的 Agent。其核心逻辑为纯计算：

1. 从 `learner_profile.cultural_anxiety_score` 读取数据库权威值。
2. 映射焦虑等级：`score >= 80 → high`，`score >= 40 → medium`，`< 40 → low`。
3. 计算母语占比：`high → 0.75`，`medium → 0.50`，`low → 0.25`。
4. 调用 `getRecentLearningTrend()`，从 `assessment_records` 表取最近 5 条记录，聚合出四项 L2 趋势指标：
   - **弱项维度**（weak_dimensions）：维度正确率 < 40%
   - **准确率趋势**（accuracy_trend）：前后半段均分差 > 5 判定 improving/declining
   - **重复错误模式**（repeated_error_patterns）：出现 ≥ 2 次的错误标签
   - **重复场景**（repeated_scenes）：出现 ≥ 2 次的场景类型

焦虑度遵循严格单向数据流。唯一写入入口为 `POST /api/learning/results` 中的 `applyAnxietyDelta(correctnessRate)`；唯一读取入口为数据库 `learners` 表；A1 不从行为指标独立计算焦虑度数值。此约束解决了多 Agent 系统中状态多源写入导致的不一致问题。

### 2.4 并行生成（A2 + A3 节点）

A2 与 A3 在 A1 完成后并行启动：

- **A2 MotherTongueExplainer**：以 DeepSeek 模型生成目标母语的文化阐释。输出为结构化 JSON：`precise_definition`（2-4 句精准定义）、`scene_introduction`（场景介绍附对话示例）、`pragmatic_rules`（3 条语用规则）、`examples`（附拼音与文化注释）、`taboo_warnings`（禁忌提醒）、`difficulty_notes`（学习难点预判）。prompt 采用 XML 标签约束格式（`<system_prompt>`、`<strict_constraints>`、`<tier_guidelines>`、`<output_schema>`），按 HSK 等级分层指导阐释深度。约束包括四类硬规则：语言约束（非中文内容必须用目标母语）、文化安全红线（禁止绝对化表述/负面刻板印象/文化优劣判断/神秘化东方）、事实性约束（不确定的细节宁可省略）、等级匹配约束（超纲词汇须附拼音与母语注释）。
- **A3 CulturalComparator**：基于 Hofstede 文化维度理论或 Hall 高低语境理论，生成 XML 格式的四段对比分析。prompt 要求绝对客观中立，禁止文化优劣评判。

在 LangGraph 路径中，并行通过 A1 节点同时添加指向 A2 和 A3 的出边实现（fan-out），两者汇聚于 `mergeA2A3` 节点（fan-in）。在手写路径中，使用 `Promise.all([a2.process(...), a3.process(...)])` 实现等效并行。

A2 输出后立即触发 `verifyA2Translation`：qwen3.6-plus 将阐释回译为中文，再由 DeepSeek 以 t=0 进行二值 NLI 裁判（"回译是否准确解释了核心概念"）。A3 输出后立即触发 `verifyA3Comparison`：DeepSeek 三标准裁判（客观性/无偏见/事实基础）。

### 2.5 内容生成与四重 Guardrail 校验（A4 节点）

A4 ContentGenerator 综合 A2 文化阐释、A3 跨文化对比和 A1 L2 趋势数据，生成完整的 `GeneratedContent` 对象：`cultural_context`（80-150 词母语文化背景说明）、3-5 个 `language_points`（核心中文表达附母语翻译）、`comparison`（跨文化对比摘要）、3-5 道 `exercises`（须涵盖至少 2 种题型：选择题/判断题/填空题，每题标注 dimension 维度）。

A4 的 prompt 包含 `<adaptive_guidance>` 块，以结构化指令注入个性化参数：
- 若弱项维度非空，对应维度题目占比提高至 ≥ 40%
- 若准确率趋势为 declining，降低难度（减少陷阱题）
- 若准确率趋势为 improving，可适度提升难度
- 若存在重复错误模式，针对性生成相关题目
- 若存在重复场景，避免再次使用相同场景

A4 输出后依次触发 4 个 guardrail：

1. **对抗盲测**（`verifyA4SolverAdversarial`）：对每道练习题调用独立的 DeepSeek Solver 盲解。选择题要求精确字母匹配（A/B/C/D）；判断题要求精确"对"/"错"匹配；填空题采用三级模糊匹配策略——先精确匹配（去除标点空格后），再子串包含，最后 Levenshtein 距离 ≤ 30% 容忍。
2. **硬规则过滤**（`preA5HardRulesFilter`）：拼音格式正则校验（宽松字符级，覆盖全部声调字母与标准标点）+ HSK 单字颗粒度白名单检查（将目标 HSK 等级的词汇表打散为单字集合后，逐一比对题干中的中文字符）。
3. **交叉校验**（`verifyA4Grounding`）：DeepSeek 裁判验证练习题主题与 A2 文化阐释的可追溯性，防止 A4 凭空编造与阐释无关的练习题。
4. **加权置信度聚合**（`computeCacheConfidence`）：对全部已执行 guardrail 结果进行加权求和，A5 仲裁权重最高（0.40）、A2 回译裁判（0.25）、A3 客观性裁判（0.15）、A4 交叉校验（0.10）、硬规则（0.05）、solver（0.05）。

### 2.6 质量审核（A5 节点）

A5 QualityController 以 temperature=0 对 A4 输出的练习题进行四维盲审：

- **拼音准确度**（pinyin_score）：是否符合《汉语拼音方案》，声调位置是否正确
- **干扰项合理性**（distractor_score）：错误选项是否具有语法或语义迷惑性
- **HSK 等级匹配度**（hsk_compliance_score）：词汇是否限定在目标等级范围内
- **文化政治安全性**（safety_score）：是否包含政治敏感、宗教冲突或民族刻板印象内容

每维度 0.0-1.0 评分，四项均 ≥ 0.85 方判定 `is_qualified = true`。

A5 输出后触发 `verifyA5JointArbitration`：DeepSeek 以 A5 的四维评分框架独立评分。原设计为 DeepSeek + MiniMax 双模型独立评分并计算分歧度 $\delta = \max_i |s_i^{DS} - s_i^{MM}|$，仅当双方均判定合格且 $\delta \leq 0.15$ 时放行；MiniMax 通道失效后已降级为 DeepSeek 单模型结论，不中断流程（见 limitation，待恢复双模型仲裁）。

### 2.7 知识库回写

`saveToKnowledgeBase()` 以 `computeCacheConfidence()` 聚合的加权置信度写入缓存。$C < 0.60$ 的内容标记为 REJECTED 状态，不进入有效缓存池。写入操作通过 `.catch()` 异步执行，不阻塞用户响应返回。

### 2.8 结果组装与返回

API 返回统一 JSON 结构，包含以下字段族：
- **学习者快照**：id、母语、HSK 等级、焦虑度分数与等级
- **知识点信息**：id、主题、HSK 等级
- **生成内容**：文化背景、核心语言点、跨文化对比摘要、练习题列表
- **元信息**：生成状态（passed/pending_review）、是否缓存命中、编排引擎标识（langgraph/legacy）、guardrail 详细判决结果

### 2.9 闭环：结果提交与画像更新

用户完成练习后，`POST /api/learning/results` 执行三级持久化闭环：

1. **L1 写入**：更新 `learning_records.practice_result`，结构化为逐题标准化结果（题目序号、用户答案、正确答案、是否正确、所属维度）。
2. **L2 写入**：插入 `assessment_records` 新行（本轮评估快照），含维度分数（5 维分项正确率）、错误模式标签、场景类型、BKT 知识追踪掌握度、焦虑度前/后值。
3. **L3 更新**：原子更新 `learners` 当前行——`applyAnxietyDelta(correctnessRate)` 计算新焦虑度并写回，能力向量通过 EWMA 更新（$\alpha=0.7$），session 计数递增。

若本轮触发快照条件（焦虑度变化 ≥ 10、任一维度变化 ≥ 15、每 10 轮周期性快照、HSK 等级变化），创建 `learner_snapshots` 历史记录用于纵向研究。

## 3. 多智能体协同机制

### 3.1 Agent 职责与拓扑

管线中的 5 个 Agent 按 DAG 拓扑组织，每个 Agent 拥有独立的 system prompt、temperature 参数和超时设置：

| Agent | 类名 | 角色 | 模型 | 温度 | 超时 |
|-------|------|------|------|------|------|
| A1 | LearnerProfilerAgent | 画像建模，焦虑映射，L2 趋势聚合 | 无 LLM | — | — |
| A2 | MotherTongueExplainerAgent | 目标母语文化阐释生成 | DeepSeek | 0.3 | 60s |
| A3 | CulturalComparatorAgent | 跨文化学术对比分析 | DeepSeek | 0.3 | 60s |
| A4 | ContentGeneratorAgent | 教案合成与练习题生成 | DeepSeek | 0.3 | 90s |
| A5 | QualityControllerAgent | 四维盲审打分 | DeepSeek | 0.0 | 60s |

所有 Agent 继承自 `BaseAgent` 抽象类，共享 `generateResponse(system_prompt, user_message, timeoutMs, response_format)` 方法，通过 `UnifiedLLMService` 统一调用 LLM 后端。

### 3.2 通信模型

Agent 间通信采用**共享状态消息传递**模型：

- **消息载体**：`AgentMessage` 接口统一定义字段——`id`（消息唯一标识）、`event_id`（请求级追踪 ID）、`sender_agent`/`receiver_agent`（拓扑追踪）、`learner_id`（用户关联）、`message_type`（5 种语义类型：profile_update、content_request、comparison_result、quality_check、approval）、`payload`（业务数据）、`status`（pending/processing/passed/pending_review/rejected）、`created_at`。
- **状态传递**：LangGraph 路径通过共享 `GraphState`（`Annotation.Root` 定义）在各节点间传递。字段采用 replace reducer（覆盖型字段如 `learner_profile`）或 merge reducer（累积型字段如 `guardrail_results`）。手写路径通过函数参数与返回值传递。
- **Guardrail 附着**：guardrail 结果通过 `guardrail_results: Record<string, GuardrailVerdict>` 字段附着在响应对象中，不作为独立消息发送。

### 3.3 并行与同步策略

- **A2/A3 并行**：两者仅依赖 A1 的输出，彼此无数据依赖。在 LangGraph 中通过从 A1 节点同时添加指向 A2 和 A3 的出边实现结构性并行；在手写版中通过 `Promise.all()` 实现运行时并行。
- **Guardrail 同步阻塞**：每个 guardrail 在其对应的 Agent 输出后、下游 Agent 启动前同步执行。这是有意设计——in-line gating 要求在错误内容传播到下游节点之前完成校验和拦截。
- **异步写入**：知识库 `saveToKnowledgeBase()` 通过 Promise chain 异步执行，不阻塞 `final_result` 的返回。
- **整体同步模式**：学习请求采用请求-响应模式，等待全部 Agent 和 guardrail 完成后返回，超时限制 120s。暂不实现 SSE 流式推送，因为教学内容生成需要完整性和可审计性。

### 3.4 全链路容错

| 层级 | 容错策略 | 参数 |
|------|----------|------|
| Agent 层 | `withRetry(fn, 2)` + 指数退避 | 2 次重试，退避 1s/2s |
| Agent 层 | `withTimeout(promise, timeoutMs)` | 生成 90s，校验 45s |
| Guardrail 层 | `safeFallback()` → FLAG_PENDING_REVIEW | 全部异常兜底，不中断流程 |
| A5 仲裁 | 单模型失败自动降级为单模型结论 | 避免双失败死锁 |
| 缓存层 | 写入失败 `.catch()` 不阻塞 | 异步重试，不阻塞返回 |
| API 层 | 分级错误码 + 可诊断错误信息 | 400/404/500/502/503 |

## 4. 个性化生成机制

### 4.1 HSK 等级自适应

HSK 等级（1-9）在管线的 5 个层面施加影响：

| 层面 | 影响机制 |
|------|----------|
| A2 阐释深度 | `<tier_guidelines>` 三层指导：HSK1-3 聚焦"是什么"与"何时用"；HSK4-6 阐释"为什么"与"跟谁用"；HSK7-9 分析"从何而来"与"当代演变" |
| A3 对比复杂度 | 低层级做现象级对比，高层级引入 Hofstede/Hall 学术框架 |
| A4 词汇控制 | prompt 强制"所有词汇和语法点严格控制在目标 HSK 等级范围内，超纲须附拼音注释" |
| A5 合规审核 | `hsk_compliance_score` 维度评估用词等级匹配度 |
| 硬规则过滤 | `preA5HardRulesFilter` 将目标等级 HSK 单字白名单与题干逐一比对，标记超纲字 |

### 4.2 母语文化圈适配

系统支持 8 种母语文化圈：英语、日语、韩语、西班牙语、阿拉伯语、俄语、法语、泰语。母语信息在生成管线中的影响路径：

- **A2 输出语言**：`<strict_constraints>` 中明确指令"所有非中文的解释、翻译、注释、定义必须使用目标母语，严禁使用英语或任何其他语言替代"。guardrail 回译校验中的 qwen3.6-plus 翻译方向为目标母语→中文，进一步约束输出语言。
- **A3 对比锚点**：以学习者母语文化作为跨文化对比的参照系，分析同一文化维度在两种文化中的具体表现差异。
- **A4 翻译与解析**：`language_points` 的翻译和 `exercises` 的解析均使用目标母语。
- **缓存键局限**：当前缓存复合主键 `(knowledge_point_id, hsk_level, scene_id)` 不显式包含母语维度。这意味着同一缓存条目可能被不同母语的学习者复用——跨文化的个性化主要体现在首次 LLM 生成阶段，而非缓存复用阶段。这是一个已知的设计权衡。

### 4.3 学习动机与场景关联

系统定义 5 种学习动机：旅游（tourism）、留学（study_abroad）、工作（work）、兴趣（interest）、考试（exam）。当前阶段，动机主要通过场景选择间接影响内容生成——如 tourism 学习者更可能选择 travel/dining/shopping 场景，exam 学习者更可能选择 campus/grammar 场景。场景类型（14 种）通过 `SCENE_TO_KP_KEYWORDS` 映射表关联到知识点，进而影响 A4 生成内容的语境取向。

### 4.4 文化焦虑度驱动的自适应

文化焦虑度（0-100）是系统最核心的动态自适应变量，其设计遵循严格单一数据源原则：

- **来源与更新**：唯一值是数据库 `learners.cultural_anxiety_score`。通过 `POST /api/learning/results` 中的 `applyAnxietyDelta(correctnessRate)` 原子更新，增量公式 $\Delta = (0.5 - r) \times 20$（全对焦虑-10，全错焦虑+10），更新上下限 [0, 100]。
- **等级映射**：high [80,100] → 大幅降低中文暴露量，母语为主；medium [40,80) → 双语均衡；low [0,40) → 中文沉浸式。
- **母语占比控制**：`calculateNativeLanguageRatio(anxiety_score)` 返回 `(native_ratio, chinese_ratio)`，直接控制 A4 `cultural_context.explanation` 中母语与中文的比例。high → 0.75 母语、medium → 0.50、low → 0.25。
- **练习题难度调节**：L2 趋势输出 `accuracy_trend`。declining → A4 被指示减少陷阱题、增加基础题；improving → 渐进提升难度。
- **弱项靶向强化**：L2 趋势中正确率 < 40% 的维度，在 A4 `<adaptive_guidance>` 中提示"对应维度题目占比提高至 40%+"。

### 4.5 L2 短期记忆趋势

`getRecentLearningTrend(learnerId, windowSize=5)` 从 `assessment_records` 表读取最近 5 轮评估记录，通过纯传统统计算法（不调用 LLM）提取 4 项指标，直接注入 A4 prompt 的 `<adaptive_guidance>` 块：

1. **弱项维度**：$dimension\_accuracy[dim] < 40\%$ → 标记为弱项，增加对应维度出题权重
2. **准确率趋势**：最近半段与前半段均分差 $> +5$ → improving；$< -5$ → declining；otherwise → stable
3. **重复错误模式**：在窗口中出现 ≥ 2 次的错误标签（如"声调混淆"、"量词误用"）→ 靶向出题
4. **重复场景**：在窗口中出现 ≥ 2 次的场景类型 → 提示避免场景疲劳

### 4.6 能力向量与贝叶斯知识追踪

- **能力向量**：5 维向量 $\vec{v} = [v_{grammar}, v_{listening}, v_{speaking}, v_{cultural\_pragmatic}, v_{reading}]$，每维 [0, 100]，初始值均为 50。每次做题后通过指数加权移动平均（$\alpha=0.7$）更新：$\vec{v}_{new}[i] = \alpha \cdot s_{new}[i] + (1-\alpha) \cdot \vec{v}_{old}[i]$。$\alpha=0.7$ 使向量对新数据高度敏感（新评估占 70% 权重，历史积累占 30%）。
- **贝叶斯知识追踪**：`bayesianKnowledgeTracing(prior, P(G)=0.25, P(S)=0.10, observed_correct)` 估计单个知识点掌握概率 $P(L_{n+1} | evidence)$，写入 `assessment_records.bkt_mastery_after` 用于长期追踪。
