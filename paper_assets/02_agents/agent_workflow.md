# 多智能体协同机制分析

## 1. Agent 定义与职责

系统定义 5 个专业化 Agent，分布于管线的 5 个串行阶段。所有 Agent 均继承自 `BaseAgent` 抽象类（`src/lib/multi-agent-system.ts:372`），共享 `generateResponse(system_prompt, user_message, timeoutMs, response_format)` 方法，通过 `UnifiedLLMService`（`src/lib/unified-llm-service.ts`）统一调用 LLM 后端。

### 1.1 Agent 列表

#### A1 — LearnerProfilerAgent

| 属性 | 说明 |
|------|------|
| 源文件 | `src/lib/multi-agent-system.ts:429` |
| 模型 | 无 LLM 调用（纯计算 Agent） |
| 温度 | — |
| 超时 | — |
| 输入 | `AgentMessage { action: "calculate_anxiety", payload: { learner_profile, _supabase_client } }` |
| 输出 | `AgentMessage { payload: { cultural_anxiety_score, anxiety_level, native_language_ratio, recent_weak_dimensions, accuracy_trend, repeated_error_patterns, repeated_scenes } }` |
| 核心方法 | `calculateAnxiety()` — 读 DB 焦虑度 → 映射等级 → 计算母语占比 → 聚合 L2 趋势 |
| 状态影响 | 从 `learners.cultural_anxiety_score` 读取；从 `assessment_records`（最近 5 轮）聚合 L2 趋势；不写入任何持久化状态 |

A1 是系统中唯一不调用 LLM 的 Agent。其核心设计约束为：焦虑度的唯一权威来源是数据库 `learners.cultural_anxiety_score`，A1 仅负责读取和映射，不独立计算也不写入。`aggregateLearnerMetrics()` 的调用结果仅用于日志记录，不参与焦虑度决策。

#### A2 — MotherTongueExplainerAgent

| 属性 | 说明 |
|------|------|
| 源文件 | `src/lib/multi-agent-system.ts:535` |
| 模型 | deepseek-chat（UnifiedLLMService） |
| 温度 | 0.3 |
| 超时 | 60s |
| 输入 | `AgentMessage { payload: { knowledge_point_id, target_language, anxiety_level, hsk_level } }` |
| 输出 | `AgentMessage { payload: { cultural_explanation: { precise_definition, scene_introduction, pragmatic_rules, examples, taboo_warnings, difficulty_notes }, native_ratio, language } }` |
| 核心方法 | `process()` — 构建 XML 标签约束 prompt → 调用 LLM → `safeJsonParse` 结构化输出 |
| Prompt 结构 | `<system_prompt>` + `<strict_constraints>`（4 类硬约束） + `<tier_guidelines>`（HSK 分层指导） + `<output_schema>`（JSON Schema） |

A2 的 prompt 包含四类硬约束：（1）语言约束——所有非中文内容必须使用目标母语，严禁英语替代；（2）文化安全红线——禁止绝对化表述、负面刻板印象、文化优劣判断、神秘化东方表述；（3）事实性约束——不确定的细节宁可省略不可臆造；（4）等级匹配约束——超纲词汇须附带拼音与母语注释。`<tier_guidelines>` 按 HSK1-3/4-6/7-9 三层指导阐释深度。

#### A3 — CulturalComparatorAgent

| 属性 | 说明 |
|------|------|
| 源文件 | `src/lib/multi-agent-system.ts:633` |
| 模型 | deepseek-chat（UnifiedLLMService） |
| 温度 | 0.3 |
| 超时 | 60s |
| 输入 | `AgentMessage { payload: { chinese_culture_point, target_culture, hsk_level, anxiety_level, native_language_code } }` |
| 输出 | `AgentMessage { payload: { cross_cultural_comparison: { framework_used, chinese_perspective, target_culture_perspective, learning_pitfall }, bias_detection, requires_review } }` |
| 核心方法 | `process()` — 构建 XML 约束 prompt → 调用 LLM → 正则提取 XML 四段 → `detectBias()` 关键词初筛 |
| Prompt 结构 | `<system_prompt>` + `<strict_constraints>`（4 条学术规范） + `<output_schema>`（XML Schema） |

A3 的 prompt 要求基于 Hofstede 文化维度理论或 Hall 高低语境理论进行学术对比，禁止捏造事实、网络段子和刻板印象。输出为 XML 格式四段：`framework_used`、`chinese_perspective`（≤100 字）、`target_culture_perspective`（≤100 字）、`learning_pitfall`（一句话总结交际误区）。生成后执行 `detectBias()` 关键词+句式模式双重检测作为轻量级预警，主要偏见判断由后续的 `verifyA3Comparison` guardrail 完成。

#### A4 — ContentGeneratorAgent

| 属性 | 说明 |
|------|------|
| 源文件 | `src/lib/multi-agent-system.ts:727` |
| 模型 | deepseek-chat（UnifiedLLMService） |
| 温度 | 0.3 |
| 超时 | 90s |
| 输入 | `AgentMessage { payload: { cultural_explanation, cross_cultural_comparison, scene_type, hsk_level, learner_profile, recent_weak_dimensions, accuracy_trend, repeated_error_patterns, repeated_scenes } }` |
| 输出 | `AgentMessage { payload: { generated_content: { cultural_context, language_points, comparison, exercises[] } }, content_type } }` |
| 核心方法 | `process()` — 构建带 `<adaptive_guidance>` 的 prompt → 调用 LLM → `safeJsonParse` → `validateExercisesFormat()` |
| Prompt 结构 | `<system_prompt>` + `<strict_constraints>` + `<content_requirements>` + `<exercise_rules>` + `<output_schema>` + `<user_input>`（含 `<adaptive_guidance>` 块） |

A4 是管线中逻辑最复杂的 Agent。其 prompt 包含 3 种题型的格式约束（`validateExercisesFormat` 方法校验：选择题 4 选项+A-D 答案、判断题固定"对/错"选项、填空题空选项+非空中文答案）。`<adaptive_guidance>` 块以结构化自然语言指令注入 L2 趋势数据——弱项维度占比提升至 40%+、declining 趋势降低难度、improving 趋势提升难度、重复错误模式靶向出题。

#### A5 — QualityControllerAgent

| 属性 | 说明 |
|------|------|
| 源文件 | `src/lib/multi-agent-system.ts:896` |
| 模型 | deepseek-chat（UnifiedLLMService） |
| 温度 | 0.0（确定性输出） |
| 超时 | 60s |
| 输入 | `AgentMessage { payload: { generated_content, content_type, hsk_level, learner_profile } }` |
| 输出 | `AgentMessage { payload: { quality_review: { is_qualified, scores: { pinyin_score, distractor_score, hsk_compliance_score, safety_score }, feedback }, is_qualified, final_status, requires_expert_review } }` |
| 核心方法 | `process()` — 提取练习题 JSON → 构建审计 prompt → 调用 LLM + `response_format: json_object` → `safeJsonParse` → 四维判定 |
| Prompt 结构 | `<system_prompt>`（教研总监角色） + `<audit_checklist>`（四维评分标准） + `<strict_constraints>` + `<output_schema>` |

A5 以 temperature=0 进行确定性盲审。四维评分标准：拼音准确度（pinyin_score）——任何一处错误扣 0.5，两处以上给 0.0；干扰项合理性（distractor_score）——一票否决"一眼假"选项；HSK 等级匹配度（hsk_compliance_score）——超纲且无拼音注释给 0.0；文化政治安全性（safety_score）——一丝风险直接给 0.0。四项均 ≥ 0.85 方判定 `is_qualified = true`。

### 1.2 状态管理

系统采用 LangGraph `Annotation.Root` 定义的共享状态对象（`LearningGraphState`）管理 Agent 间状态。状态包含 13 个字段，按更新策略分为两类：

**覆盖型字段（replace reducer）**：`learner_profile`、`knowledge_point_id`、`scene_keywords`、`event_id`、`scene_type`、`cache_hit`、`cached_explanation`、`cached_comparison`、`anxiety_data`、`cultural_explanation`、`cross_cultural_comparison`、`bias_detection`、`generated_content`、`quality_review`、`final_status`、`final_result`。每个节点返回的 `Partial<GraphState>` 覆盖同名字段。

**累积型字段（merge reducer）**：`guardrail_results: Record<string, GuardrailVerdict>`。使用对象展开合并（`(a, b) => ({ ...a, ...b })`），使得 A2、A3、A4、A5 各节点的 guardrail 判决能够逐步累积到一个统一的判决映射中，供最终的 `computeCacheConfidence()` 加权聚合。

手写编排路径（`MultiAgentCoordinator.processLearningRequest()`）使用局部变量 `guardrailResults: Record<string, GuardrailVerdict> = {}` 手动累积，与 LangGraph 的 merge reducer 逻辑等效。

## 2. Agent 通信机制

### 2.1 消息结构

所有 Agent 间通信通过统一的 `AgentMessage` 接口（`src/lib/multi-agent-system.ts:129`）承载：

```typescript
interface AgentMessage {
  id: string;                    // 消息唯一标识，格式 msg_<timestamp>[_<role>]
  event_id: string;              // 请求级追踪标识，格式 evt_<timestamp>_<random>
  sender_agent: string;          // 发送方 Agent 标识
  receiver_agent?: string;       // 接收方 Agent 标识
  learner_id?: string;           // 学习者 UUID
  message_type: 'profile_update' | 'content_request' | 'comparison_result' | 'quality_check' | 'approval';
  payload: Record<string, unknown>;  // 业务载荷
  status: 'pending' | 'processing' | 'passed' | 'pending_review' | 'rejected';
  created_at: Date;
}
```

5 种 `message_type` 对应管线的 5 个阶段：
- `profile_update` → A1 画像更新
- `content_request` → A2/A4 内容生成请求
- `comparison_result` → A3 对比分析结果
- `quality_check` → A5 质量审核请求
- `approval` → A5 审核通过

### 2.2 上下文共享方式

系统采用**共享状态对象**而非点对点消息传递作为主要的上下文共享机制。在 LangGraph 路径中，所有节点共享同一个 `GraphState` 对象，每个节点读取所需字段、返回增量更新。节点的输入不来自前驱节点的显式发送，而来自共享状态的自动注入。在手写路径中，前驱 Agent 的 `payload` 通过函数参数显式传递到后继 Agent 的 `message.payload` 中。

关键上下文传递路径：

```
learner_profile ─────────────────────────────────→ A1, A2, A3, A4, A5
anxiety_data ──────────→ A2, A3, A4 (anxiety_level, native_ratio, L2 趋势)
cultural_explanation ─────→ A4, Guardrail(A2), Guardrail(Grounding)
cross_cultural_comparison → A4, Guardrail(A3)
generated_content ────────────→ A5, Guardrail(A4), Guardrail(A5)
guardrail_results ─────────────────→ saveKB (computeCacheConfidence)
```

### 2.3 同步/异步模型

| 执行环节 | 同步/异步 | 机制 |
|----------|-----------|------|
| A1 → A2/A3 | 同步（但 A2 和 A3 之间并行） | LangGraph fan-out 边 / `Promise.all()` |
| A2/A3 → mergeA2A3 | 同步 barrier | LangGraph fan-in 汇聚节点 / `await Promise.all()` |
| A4 → A5 | 同步串行 | A4 完成后 A5 才启动 |
| Agent → Guardrail | 同步阻塞 | guardrail 在 Agent 输出后、下游 Agent 启动前同步执行 |
| saveKB | 异步（fire-and-forget） | `.catch(err => ...)`，不阻塞 `final_result` 返回 |
| 整个请求 | 同步（请求-响应） | 120s 超时 |

Guardrail 校验采用同步阻塞模式——这是有意设计。内联门控（in-line gating）要求在错误内容传播到下游节点之前完成校验。若 guardrail 异步执行，则 A4 可能在 A2 的回译校验完成前就开始消费 A2 的输出，违背了"阻断传播"的设计目标。

### 2.4 编排模式

系统并非事件驱动架构，而是采用**有向无环图（DAG）编排**模式。LangGraph 路径通过 `StateGraph` 的声明式 API 定义节点和边，运行时按拓扑顺序执行；手写路径通过 `MultiAgentCoordinator.processLearningRequest()` 的命令式代码控制执行顺序。

编排层与 Agent 实现层解耦：编排器（`StateGraph` 或 `MultiAgentCoordinator`）仅负责调度——决定何时调用哪个 Agent、如何传递输入输出、如何处理 guardrail 插入点，不侵入 Agent 的 prompt 逻辑和模型调用。Agent 类（继承 `BaseAgent`）仅负责自身业务——构建 prompt、调用 LLM、解析输出、校验格式，不感知编排拓扑和其他 Agent 的存在。

## 3. Agent 执行顺序与依赖关系

### 3.1 拓扑依赖图

```
START
  │
  ▼
checkCache ──(cache_hit)──→ generateExercises ──→ END
  │
  │(cache_miss)
  ▼
A1_Profiler
  │
  ├──────────────────────┐
  ▼                      ▼
A2_Explainer      A3_Comparator
  │                      │
  ▼                      ▼
gA2 (回译)         gA3 (客观性)
  │                      │
  └────────┬─────────────┘
           ▼
      mergeA2A3
           │
           ▼
      A4_Generator
           │
           ├──────────────┐
           ▼              ▼
      gA4_Solver    gA4_HardRules
           │              │
           └──────┬───────┘
                  ▼
      gA4_Grounding
                  │
                  ▼
           A5_Controller
                  │
                  ▼
           gA5_JointArbitration
                  │
                  ▼
               saveKB
                  │
                  ▼
                END
```

### 3.2 并行节点

**A2 与 A3 并行**：两者仅依赖 A1 的输出（`anxiety_data`），彼此之间无数据依赖。A2 需要 `anxiety_level` 和 `hsk_level` 来调节阐释深度和语言选择；A3 需要相同的 `anxiety_level`、`hsk_level` 和 `native_language_code` 来调节对比分析的复杂度。两者互不依赖对方的输出。

在 LangGraph 中，并行通过从 `a1Profiler` 节点同时添加指向 `a2Explainer` 和 `a3Comparator` 的两条出边实现（`src/lib/learning-graph.ts:654-655`），LangGraph 运行时自动并行执行没有边依赖的节点。在手写版中，通过 `Promise.all([a2.process(...), a3.process(...)])` 实现等效并行（`src/lib/multi-agent-system.ts:1504-1544`）。

**A4 内部 guardrail 伪并行**：在 A4 节点内部，`verifyA4SolverAdversarial` 对多道练习题使用 `Promise.all()` 并发调用 Solver（每道题独立盲解）。

### 3.3 串行依赖链

以下 Agent 对之间存在严格的串行依赖：

| 前驱 | 后继 | 依赖原因 |
|------|------|----------|
| A1 | A2, A3 | A2/A3 需要 A1 计算的 `anxiety_level`、`native_language_ratio`、`hsk_level` |
| mergeA2A3 | A4 | A4 需要 A2 的 `cultural_explanation` 和 A3 的 `cross_cultural_comparison` |
| A4 | A5 | A5 审查 A4 生成的 `generated_content`（练习题） |
| guardrail A2 | mergeA2A3 | 在 A2 输出汇入 A4 之前完成回译校验 |
| guardrail A3 | mergeA2A3 | 在 A3 输出汇入 A4 之前完成客观性校验 |
| guardrail A4 | A5 | 在练习题进入 A5 审核前完成对抗盲测、硬规则和交叉校验 |
| guardrail A5 | saveKB | 在内容写入缓存前完成双模型仲裁 |

### 3.4 条件分支

缓存检查节点（`checkCache`）引入管线的唯一条件分支。`routeAfterCache(state)` 函数检查 `state.cache_hit` 布尔值（`src/lib/learning-graph.ts:630-632`）：
- `cache_hit = true` → 进入 `generateExercises` 短路节点，跳过全部 LLM 生成，仅基于缓存内容生成练习题
- `cache_hit = false` → 进入 `a1Profiler`，走完整的 5-Agent LLM 管线

缓存命中的判定在 `checkCache` 节点内部：`queryKnowledgeBase()` 执行后，若 `found=true` 且 `cross_cultural_comparison` 存在，则设置 `cache_hit=true`。

## 4. 学习者画像对 Agent 的影响

### 4.1 HSK 等级

HSK 等级（1-9）在 4 个 Agent 中产生影响：

| Agent | 影响方式 | 代码位置 |
|-------|----------|----------|
| A2 | `<tier_guidelines>` 分三层指导阐释深度：HSK1-3 聚焦"是什么"（具体生活场景）、HSK4-6 阐释"为什么"（社会规范层面）、HSK7-9 分析"从何而来"（哲学历史层面） | prompt 中的 `<tier_guidelines>` 段 |
| A3 | 控制跨文化对比的分析复杂度；低层级做现象对比，高层级引入学术框架 | A3 prompt 中的 `hsk_level` 参数 |
| A4 | 约束词汇选择范围（"所有词汇和语法点严格控制在目标 HSK 等级范围内"），超纲词汇须附带拼音注释 | `<strict_constraints>` 第 3 条 |
| A5 | `hsk_compliance_score` 维度评估练习题词汇是否超纲 | `<audit_checklist>` 第 3 条 |
| Guardrail | `preA5HardRulesFilter` 以目标 HSK 等级对应的单字白名单（`getHSKCharWhitelistArray(hskLevel)`，`src/data/hsk_vocabulary.ts`）逐一比对题干中的中文字符 | `learning-graph.ts:512-513` |

HSK 等级还在缓存检索中作为复合主键的第二维（`hsk_level`），确保不同等级的阐释被独立存储。`hskLevelMatches()` 函数（`src/lib/multi-agent-system.ts:1088-1093`）允许 ±1 级偏差的缓存复用。

### 4.2 母语文化圈

母语（8 种文化圈）在生成管线中的影响路径：

| Agent | 影响方式 |
|-------|----------|
| A2 | 所有非中文输出（定义、规则、注释、翻译、禁忌提醒、难点提示）强制使用目标母语。通过 `<strict_constraints>` 第 1 条硬约束实现："学习者的母语是${targetLangNaturalName}。所有非中文的解释、翻译、注释、定义必须使用${targetLangNaturalName}，严禁使用英语或任何其他语言替代" |
| A3 | 以学习者母语文化为跨文化对比的参照系，分析同一文化维度在中国文化与该目标文化中的具体表现差异 |
| A4 | `language_points` 的翻译和 `exercises` 的解析使用目标母语；`cultural_context.explanation` 以目标母语书写 80-150 词文化背景 |
| Guardrail | `verifyA2Translation` 的回译方向为目标母语→中文（qwen3.6-plus），裁判语言为中文（DeepSeek），形成跨语言校验闭环 |

语言映射通过 `getLanguageCode()`（中文名称→ISO 639-1）和 `getLanguageNaturalName()`（ISO 639-1→自然语言名称）两个函数实现，支持 8 种主要语言的映射。

### 4.3 文化焦虑度

文化焦虑度是贯穿 A1→A2→A3→A4 四个 Agent 的核心自适应变量：

| Agent | 影响方式 |
|-------|----------|
| A1 | 从数据库读取焦虑度 → 映射为三个离散等级（high/medium/low） → 计算 `native_language_ratio`（high=0.75, medium=0.50, low=0.25） |
| A2 | `anxiety_level` 注入 prompt → 影响阐释的情感基调和母语占比的指导性建议；`native_language_ratio` 控制 `cultural_context` 中母语与中文的比例 |
| A3 | `anxiety_level` 注入 prompt → 高焦虑时降低理论框架的复杂度，以更直观的现象对比替代 |
| A4 | `anxiety_level` + `native_ratio` + L2 趋势（`accuracy_trend`）联合作用：declining 趋势 → 降低难度（减少陷阱题），improving 趋势 → 渐进提升难度 |

焦虑度遵循严格单一数据源：唯一写入入口为 `POST /api/learning/results` 的 `applyAnxietyDelta(correctnessRate)`；唯一读取入口为数据库 `learners.cultural_anxiety_score`；A1 不从行为指标（error_rate、time_ratio、abandonment_rate、negative_feedback）独立计算焦虑度数值。

### 4.4 学习动机

5 种学习动机（tourism/study_abroad/work/interest/exam）当前阶段主要通过**场景选择**间接影响 Agent 行为。系统定义 14 种交际场景，通过 `getSceneType()` 函数（`src/lib/learning-graph.ts:60-81` 或 `src/lib/constants.ts:96-108`）从知识点 ID 和关键词推断场景类型。

场景对 Agent 的影响路径：
- **A4**：`scene_type` 作为 `payload` 参数注入 prompt，影响练习题的语境选择（如 `food` 场景下的练习题围绕饮食文化出题）
- **缓存**：`scene_id` 作为复合主键第三维，确保同知识点在不同场景下的阐释独立缓存
- **L2 趋势**：`repeated_scenes` 提示 A4 避免场景疲劳

学习动机本身暂未作为显式 prompt 参数注入——动机的个性化主要通过场景选择间接体现（tourism 学习者选择 travel/dining/shopping 场景，exam 学习者选择 campus/grammar 场景）。

### 4.5 能力向量与 L2 趋势

五维能力向量和 L2 短期记忆趋势仅在 A4 中产生直接影响：

| 指标 | 来源 | 注入方式 | 效果 |
|------|------|----------|------|
| `recent_weak_dimensions` | `getRecentLearningTrend()` | `<adaptive_guidance>` → "弱项维度题目占比提高至 40%+" | 题型配比自适应 |
| `accuracy_trend` | `getRecentLearningTrend()` | `<adaptive_guidance>` → "declining 降低难度" / "improving 提升难度" | 难度自适应 |
| `repeated_error_patterns` | `getRecentLearningTrend()` | `<adaptive_guidance>` → "针对性出题" | 弱项靶向强化 |
| `repeated_scenes` | `getRecentLearningTrend()` | `<adaptive_guidance>` → 避免重复场景 | 防场景疲劳 |

L2 趋势数据由 `getRecentLearningTrend`（纯统计函数，不调用 LLM）从 `assessment_records` 最近 5 轮聚合，以结构化自然语言指令注入 A4 prompt。这种设计将数据驱动的趋势提取与 LLM 的生成策略解耦——前者可审计、可复现，后者仅在 prompt 指导下将趋势"翻译"为具体的出题策略。

能力向量（5 维）通过 EWMA（α=0.7）在 `/api/learning/results` 中更新，写入 `learners` 表，作为长期画像数据在下次学习请求中通过 `learner_profile.ability_vector` 返回给前端，但在当前阶段的 Agent prompt 中暂未显式注入。
