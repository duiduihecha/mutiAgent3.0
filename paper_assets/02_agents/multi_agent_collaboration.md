# 多智能体协同机制

## 1. Agent 设计原则

每个 Agent 遵循单一职责原则，通过标准化消息结构 (`AgentMessage`) 通信，不直接依赖其他 Agent 的内部状态。

### 1.1 消息结构

```typescript
interface AgentMessage {
  id: string;              // 消息唯一标识
  event_id: string;        // 请求事件ID (全链路追踪)
  sender_agent: string;    // 发送方 Agent ID
  receiver_agent?: string; // 接收方 Agent ID
  learner_id?: string;     // 学习者ID
  message_type: 'profile_update' | 'content_request' | 'comparison_result' | 'quality_check' | 'approval';
  payload: Record<string, unknown>;  // 业务载荷
  status: 'pending' | 'processing' | 'passed' | 'pending_review' | 'rejected';
  created_at: Date;
}
```

## 2. Agent 详细设计

### 2.1 A1 — LearnerProfilerAgent

**职责**：学习者画像建模，不调用 LLM 生成内容，仅做数值计算与映射。

**输入**：
- `learner_profile.cultural_anxiety_score` — 数据库权威焦虑度值
- `assessment_records` — 最近5轮评估记录

**处理流程**：
1. 读取 DB 焦虑度 → 映射 `anxiety_level`：high(≥80) / medium(40-79) / low(<40)
2. 计算 `native_language_ratio`：高焦虑75%母语 / 中焦虑50% / 低焦虑25%
3. 调用 `getRecentLearningTrend()` 查询 L2 短期记忆趋势
4. 调用 `aggregateLearnerMetrics()` 聚合行为指标（仅日志，不参与决策）

**输出**：
```json
{
  "cultural_anxiety_score": 50,
  "anxiety_level": "medium",
  "native_language_ratio": { "native_ratio": 0.5, "chinese_ratio": 0.5 },
  "recent_weak_dimensions": ["cultural_pragmatic"],
  "accuracy_trend": "declining",
  "repeated_error_patterns": ["声调混淆"],
  "repeated_scenes": ["food"]
}
```

**关键约束**：A1 不从 `aggregateLearnerMetrics` 计算焦虑度。焦虑度的唯一权威来源是数据库，唯一写入入口是 results API 的 `applyAnxietyDelta()`。

### 2.2 A2 — MotherTongueExplainerAgent

**职责**：以学习者母语生成中国文化概念的精准阐释。

**Prompt 结构**：
```
<system_prompt>      角色设定 (15年TCSL教研经验)
<strict_constraints> 语言约束 / 文化安全红线 / 事实性约束 / 等级匹配约束
<tier_guidelines>    HSK分级指导
<output_schema>      严格JSON Schema
</system_prompt>
<user_input>         知识点ID / 目标语言 / HSK等级 / 母语占比 / 焦虑等级
</user_input>
```

**文化安全红线（绝对禁止）**：
- 禁止绝对化表述：所有、都、必须、从来不
- 禁止负面刻板印象：落后、保守、封闭、愚昧
- 禁止文化优劣判断：不得使用比较级评判
- 禁止神秘化东方：不得使用猎奇化表述

**输出 Schema**：
```json
{
  "precise_definition": "精准定义 (2-4句，含中文关键词)",
  "scene_introduction": "文化场景介绍 (1个具体场景 + 中文对话示例)",
  "pragmatic_rules": ["规则1", "规则2", "规则3"],
  "examples": [{
    "chinese": "中文例句",
    "pinyin": "拼音标注",
    "translation": "母语翻译",
    "notes": "文化注释"
  }],
  "taboo_warnings": ["禁忌提醒1", "禁忌提醒2"],
  "difficulty_notes": "学习难点预判"
}
```

### 2.3 A3 — CulturalComparatorAgent

**职责**：基于学术框架的跨文化对比分析。

**学术框架约束**：
- [A] 霍夫斯泰德文化维度理论 (Hofstede's Cultural Dimensions)
- [B] 爱德华·霍尔的高低语境文化理论 (High/Low Context Culture)

**输出 Schema (XML)**：
```xml
<response>
  <framework_used>选用的学术框架及具体维度</framework_used>
  <chinese_perspective>中国文化中的行为表现及底层逻辑 (≤100字)</chinese_perspective>
  <target_culture_perspective>目标文化对等行为或差异表现 (≤100字)</target_culture_perspective>
  <learning_pitfall>跨文化学习者最易产生的沟通误区 (一句话)</learning_pitfall>
</response>
```

### 2.4 A4 — ContentGeneratorAgent

**职责**：综合 A2 文化阐释 + A3 跨文化对比 + A1 L2趋势数据，生成完整教案。

**L2 自适应指导**：
- 弱项维度占比提高至 40%+
- accuracy_trend=declining → 降低难度，减少陷阱题
- accuracy_trend=improving → 适度提升难度
- 重复错误模式 → 针对性出题

**练习题规范**：
- 3-5 题，≥2 种题型
- 选择题：4选项，干扰项需语法或语义迷惑性
- 判断题：选项固定 ["对","错"]
- 填空题：选项为空数组，答案为标准中文
- 每题标注 dimension

### 2.5 A5 — QualityControllerAgent

**职责**：四维盲审，temperature=0.0 保证确定性。

**审核维度**：
1. pinyin_score：拼音方案正确性、声调标注位置
2. distractor_score：干扰项语法/语义迷惑性
3. hsk_compliance_score：题干选项用词 ≤ 目标HSK等级
4. safety_score：政治敏感、宗教冲突、低俗暴力、民族刻板印象

**通过条件**：4个维度得分均 ≥ 0.85，is_qualified = true

## 3. 并行与同步

### 3.1 LangGraph 并行机制

A1 完成后，A2 和 A3 通过图的 fan-out 并行执行：

```
A1 → [A2, A3] → mergeA2A3 → A4 → A5
```

LangGraph 的 `Annotation` 状态定义：
- 普通状态：replace reducer `(_, b) => b` — 后写入覆盖前值
- `guardrail_results`：merge reducer `(a, b) => ({...a, ...b})` — 累加不覆盖

### 3.2 手写编排并行机制

旧版 `MultiAgentCoordinator` 使用 `Promise.all()` 实现 A2/A3 并行：

```typescript
const [a2Result, a3Result] = await Promise.all([
  withRetry(() => this.agents.get('A2').process(a2Msg), 2),
  withRetry(() => this.agents.get('A3').process(a3Msg), 2)
]);
```

### 3.3 容错机制

每个 Agent 调用包裹两层保护：
- `withTimeout(promise, 90000, "Agent timeout")` — 90秒超时
- `withRetry(fn, 2)` — 最多2次重试，指数退避 (1s, 2s)

## 4. 依赖关系

| Agent | 依赖上游输出 | 依赖学习者画像 |
|-------|-------------|---------------|
| A1 | 无 (仅读DB) | 直接读取 learner_profile + assessment_records |
| A2 | A1.anxiety_level, A1.native_language_ratio | anxiety_level 控制复杂度 |
| A3 | A1.anxiety_level, A1.native_language_code | anxiety_level 控制分析深度 |
| A4 | A2.cultural_explanation, A3.cross_cultural_comparison, A1.L2趋势 | 全部画像字段 + L2趋势 |
| A5 | A4.exercises | 不依赖画像，独立审核 |
