# 学习者建模系统架构

## 整体架构：四层记忆模型

```
L1 learning_records → L2 assessment_records → L3 learners/snapshots → L4 Neo4j Graph
    原始答题数据           聚合评估快照              长期画像状态              认知图谱
```

---

## 1. 学习者画像表 (`learners`)

**创建 API**：`POST /api/learners` → `src/app/api/learners/route.ts`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID PK | 内部学习者 ID |
| `uid` | VARCHAR(50) UNIQUE | 外部用户标识 |
| `native_language` | VARCHAR(50) | 母语，决定文化圈（如 英语/日语/韩语/西班牙语） |
| `hsk_level` | INTEGER 1-9 | HSK 等级，决定内容难度 |
| `learning_motivation` | VARCHAR(50) | **学习动机**：tourism / study_abroad / work / interest / exam。驱动推荐系统的领域亲和力过滤 |
| `cultural_anxiety_score` | DECIMAL(5,2) | 文化焦虑度 0-100，默认 50 |
| `ability_vector` | JSONB | `[语法, 听力, 口语, 文化语用, 阅读]`，默认各 50 |
| `total_sessions` | INTEGER | 累计学习次数，默认 0 |
| `last_scene_id` | VARCHAR(36) | 最近学习的场景 |
| `created_at` / `updated_at` | TIMESTAMPTZ | 时间戳 |

创建时只需 `uid` + `native_language` + `hsk_level`，其余字段自动设默认值。

**换母语重置**：当前端切换母语选择器时，`ability_vector` 和 `cultural_anxiety_score` 重置为默认值 `[50,50,50,50,50]` / `50`。不同母语背景的学习画像应有独立起点。



---

## 2. A1 画像分析 Agent

**位置**：`src/lib/multi-agent-system.ts` → `LearnerProfilerAgent`

### 2a. calculate_anxiety

- 读取 DB 中的 `cultural_anxiety_score`
- 映射为三级：`<40 → low`、`40-80 → medium`、`>80 → high`
- 决定母语使用比例：高焦虑 75%、中 50%、低 25%
- 查询 L2 短期趋势（近 5 轮弱项维度、正确率趋势、重复错误模式）
- **纯读 DB + 纯规则，不调 LLM**

### 2b. track_progress

- 输入：`knowledge_point_id`、`answered_correctly`、`current_mastery`
- 调用 `bayesianKnowledgeTracing()` 更新该知识点的掌握概率

---

## 3. 能力向量 (`calculateAbilityVector`)

**位置**：`src/lib/multi-agent-system.ts:340`

```
每维度加权正确率 = Σ(正确?100:0 × 权重) / Σ权重
新向量[i] = round(0.7 × 本轮得分 + 0.3 × 旧向量[i])
```

- 指数加权移动平均 (EWMA)，α=0.7
- 高 α 使其对近期表现敏感——一次好/差就能明显拉动维度
- 未涉及的维度保持不变
- 所有值 clamp 到 [0, 100]

---

## 4. 焦虑追踪 (`applyAnxietyDelta`)

**位置**：`src/lib/multi-agent-system.ts:237`

```
delta = (0.5 - correctRate) × 20
新焦虑 = clamp(旧焦虑 + delta, 0, 100)
```

| 正确率 | delta | 效果 |
|---|---|---|
| 100% | -10 | 焦虑下降 |
| 50% | 0 | 不变 |
| 0% | +10 | 焦虑上升 |

这是系统中**唯一的焦虑权威更新入口**。EmotionCheck 检测到 red 状态时额外 +10。

---

## 5. BKT 知识追踪 (`bayesianKnowledgeTracing`)

**位置**：`src/lib/multi-agent-system.ts:318`

标准贝叶斯公式，三个参数：

| 参数 | 含义 | 默认值 |
|---|---|---|
| `prior_probability` | 当前掌握概率 | 0.2（首次） |
| `guess_probability` | 未掌握时猜对的概率 | 0.25 |
| `slip_probability` | 已掌握时失误的概率 | 0.10 |

当观察为正确：
```
P(掌握|正确) = (1-slip) × prior / [(1-slip) × prior + guess × (1-prior)]
```

当观察为错误：
```
P(掌握|错误) = slip × prior / [slip × prior + (1-guess) × (1-prior)]
```

按**知识点粒度**追踪，每个 learner-kp 对独立维护掌握概率。

---

## 6. L2 短期趋势 (`getRecentLearningTrend`)

**位置**：`src/lib/multi-agent-system.ts:1512`

**纯规则函数，不调 LLM**。查询最近 5 条 `assessment_records`，聚合输出：

| 输出字段 | 计算方式 |
|---|---|
| `recent_average_score` | 近 5 轮平均得分 |
| `dimension_accuracy` | 各维度近 5 轮平均正确率 |
| `weak_dimensions` | 平均正确率 < 40% 的维度 |
| `accuracy_trend` | 前半 vs 后半窗口对比 → improving/stable/declining |
| `repeated_error_patterns` | 出现 ≥2 次的错误模式 |
| `repeated_scenes` | 出现 ≥2 次的场景类型 |

这些数据注入 A4 内容生成器，用于自适应出题（弱项维度出题占比 40%+）。

---

## 7. L3 画像快照 (`learner_profile_snapshots`)

**位置**：`src/app/api/learning/results/route.ts` → `shouldCreateSnapshot()`

### 触发规则（按优先级）

| # | 条件 | 标签 |
|---|---|---|
| 1 | 首次学习 (sessions=0) | `first_session` |
| 2 | HSK 等级变化 | `level_up` |
| 3 | 焦虑变化 ≥10 | `significant_change` |
| 4 | 任一能力维度变化 ≥15 | `significant_change` |
| 5 | 每 10 轮 (sessions+1 % 10 == 0) | `periodic` |

### 快照表结构

| 字段 | 说明 |
|---|---|
| `learner_id` | 学习者 ID |
| `snapshot_reason` | 触发原因标签 |
| `cultural_anxiety_score` | 当前焦虑值 |
| `ability_vector` | 当前能力向量 |
| `hsk_level` | 当前 HSK 等级 |
| `native_language` | 母语 |
| `total_sessions_at_time` | 当时累计学习次数 |
| `last_scene_id` | 最近场景 |
| `weak_dimensions` | 弱项维度 (JSONB) |

通过 PostgreSQL RPC `insert_learner_snapshot` 写入。失败不阻塞主流程。

---

## 8. 情感检测 (`emotion-check.ts`)

**位置**：`src/lib/emotion-check.ts`

**纯规则引擎，6 个信号 → 3 级分类**：

### 信号阈值

| 信号 | 计算方式 | Yellow | Red |
|---|---|---|---|
| `frustration` | 连续错误占比 | ≥3 题 | ≥5 题 |
| `fatigue` | 焦虑↑ + 正确率↓ + 时长>20min | — | 全部满足 |
| `disengagement` | 连续全对 + 正确率>90% | ≥8 题 | — |
| `anxiety_spike` | 焦虑变化值 | ≥15 | ≥25 |
| `repeated_same_error` | 同维度错误次数 | ≥2 | ≥3 |

### 综合判断

- 任意 red 信号 → 整体 red
- 任意 1 个 yellow 信号 → 整体 yellow
- 其余 → green

### 干预动作

| 状态 | 条件 | 动作 | 难度系数 |
|---|---|---|---|
| Red | 疲劳 | `suggest_break` | — |
| Red | 挫败/重复错误 | `lower_difficulty` | 0.7 |
| Red | 其他 | `encourage` | — |
| Yellow | 脱离（太简单） | `raise_difficulty` | 1.2 |
| Yellow | 其他 | `encourage` | — |

### 跨文化话术

干预话术按母语文化圈定制：英语圈 (hc_en)、日语圈 (hc_ja)、韩语圈 (hc_ko)、西班牙语圈 (hc_es)，中文兜底。

---

## 9. Neo4j 学习图谱 (`learner-graph.ts`)

**位置**：`src/lib/learner-graph.ts`

### 存储结构

| 图谱元素 | Cypher 模式 | 说明 |
|---|---|---|
| Learner 节点 | `(:Learner {id, hsk_level, ...})` | 学习者 |
| BELONGS_TO 边 | `(Learner)-[:BELONGS_TO]->(HomeCulture)` | 文化圈归属 |
| MASTERED 边 | `(Learner)-[:MASTERED {score}]->(KnowledgePoint)` | 知识点掌握度 |
| PREREQUISITE 边 | `(KnowledgePoint)-[:PREREQUISITE]->(KnowledgePoint)` | 学习前置关系 |

### 查询功能

- `getLearnerMasteryMap`：获取所有 MASTERED 边的掌握度映射
- `getLearnerWeakDimensions`：沿 `KP→CulturalConcept→CulturalDimension` 路径聚合，找出平均分 < 0.4 的维度
- `getRecommendedNextKPs`：沿 `[:PREREQUISITE]` 边推荐未掌握的下一知识点
- `buildPrerequisiteEdges`：规则引擎构建 PREREQUISITE 边（152 条，幂等可重跑）
- `getRecommendations`：五因子加权推荐引擎（见下方 §11）

写入在 results pipeline STEP 4，fire-and-forget，失败不影响主流程。

---

## 10. Results Pipeline（汇聚点）

**位置**：`src/app/api/learning/results/route.ts`

```
STEP 0    计算新值
           ├─ calculateAbilityVector(oldVector, results) → newVector
           ├─ applyAnxietyDelta(oldAnxiety, correctRate) → newAnxiety
           ├─ bayesianKnowledgeTracing(prior, observed) → bktMastery
           └─ detectEmotionState(...) → emotionSnapshot
               └─ red? anxietyAfter += 10

STEP 1    L1 写入 learning_records
           └─ practice_result (JSONB: 逐题结果)

STEP 2    L2 写入 assessment_records
           ├─ ability_vector_before / after
           ├─ anxiety_before / after
           ├─ bkt_mastery_after
           ├─ dimension_scores / error_patterns
           └─ emotion_state / emotion_signals

STEP 3    L3 更新 learners 当前行
           ├─ cultural_anxiety_score
           ├─ ability_vector
           ├─ total_sessions += 1
           └─ last_scene_id

STEP 3.5  L3 画像快照（满足触发条件时）
           └─ insert_learner_snapshot() RPC → learner_profile_snapshots

STEP 4    L4 写入 Neo4j（fire-and-forget）
           └─ recordMastery(learner_id, kp_id, correctRate) → MASTERED 边
```

### API 返回

```json
{
  "score": 0.4,
  "new_ability_vector": [3, 50, 2, 46, 15],
  "new_cultural_anxiety_score": 81,
  "emotion": {
    "state": "yellow",
    "signals": { "frustration": 0, "accuracy_trend": "stable", ... },
    "intervention": { "tier": "yellow", "suggested_action": "encourage", "learner_message": "..." }
  },
  "updated_learner": { ... },
  "_phase3a_snapshot": { "created": false, "reason": null }
}
```

---

## 11. 学习路径推荐系统

### 11a. Motivation → Domain 亲和力映射

**位置**：`src/lib/constants.ts` → `MOTIVATION_DOMAIN_AFFINITY`

| 动机 | 优先推荐 Domain |
|---|---|
| `tourism` | travel, food, shopping, transport, entertainment |
| `study_abroad` | campus, daily, housing, banking, food, medical |
| `work` | workplace, banking, housing, transport, daily |
| `interest` | 无过滤，全领域均等 |
| `exam` | 无过滤，纯 HSK 级别驱动 |

### 11b. 推荐引擎 (`getRecommendations`)

**位置**：`src/lib/learner-graph.ts`

**API**：`GET /api/learners/{id}/recommendations?limit=5`

**评分公式**（加权总分 0-1）：

| 因子 | 权重 | 计算方式 |
|------|------|----------|
| 动机匹配 | 0.20 | KP 所在 domain 在 learner 的 motivation 亲和列表里 → 1.0，否则 0.3。interest/exam 始终 1.0 |
| HSK 邻近度 | 0.25 | `1 - abs(kp.hsk_level - learner.hsk_level) / 9` |
| 解锁状态 | 0.25 | 所有前置 KP 已被 learner 掌握 (MASTERED score ≥ 0.8) → 1.0，否则 0 |
| 弱项维度 | 0.15 | KP 的 pragmatic_intent 或 name 涉及 learner 的弱项维度 → 1.0 |
| 新颖度 | 0.15 | KP 未被掌握 (mastery < 0.6) → 1.0，已掌握 → 0 |

**返回结构**：

```typescript
RecommendationItem {
  kp_id, scene_id, domain_id, domain_icon, hsk_level,
  pragmatic_intent, score, reasons: string[], is_unlocked, mastery_status
}
```

### 11c. PREREQUISITE 边构建

**位置**：`src/lib/learner-graph.ts` → `buildPrerequisiteEdges()`

**触发**：`GET /api/admin/graph?action=build_prerequisites`

**算法**：每个 Scene 内按 `(hsk_level ASC, kp.id ASC)` 排序 KnowledgePoint，串链 KP0→KP1→KP2。同一 Domain 内，前一个 Scene 末尾 KP → 下一个 Scene 首个 KP。共 152 条边，MERGE 幂等可重跑。

### 11d. 冷启动

无 mastery 数据的新 learner：取 motivation 亲和 domain 下 HSK 最低、复杂度最低的 KP，全部标记 `is_unlocked: true`。

### 11e. 前端集成

- **首页**（`src/app/page.tsx`）：学习者画像下方"为你推荐"横向滚动卡片区。下拉框（母语/HSK/动机）变化后自动刷新推荐。
- **学习完成页**（`src/app/learning/page.tsx`）：完成页"下一步推荐"卡片，点击直接开始下一轮学习。

---

## 12. 学习动机选择器

**位置**：`src/app/page.tsx` — 首页 Hero 区域

```
选项：🎯 兴趣探索 | ✈️ 旅游出行 | 🎓 留学生活 | 💼 职场工作 | 📝 考试备考
```

选择后自动写入 DB（PUT `/api/learners/{id}`）并刷新推荐。该值随 `learning_motivation` 字段流经：

```
首页选择器 → LearnerContext → localStorage("selected_motivation")
  → ProgressiveDisclosure → URL params
  → POST /api/learning (新建 learner 时写入)
  → getRecommendations() (驱动领域过滤)
```

---

## 总览

```
                    ┌──────────────────────────┐
                    │      Practice Results     │
                    └──────────┬───────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  EmotionCheck    │ ← 纯规则，6 信号 → 3 级
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌───────────┐  ┌────────────┐  ┌──────────────┐
    │ ability   │  │  anxiety   │  │  BKT mastery  │
    │ vector    │  │  delta     │  │  (per KP)     │
    │ (EWMA)    │  │  (formula) │  │  (Bayesian)   │
    └─────┬─────┘  └─────┬──────┘  └──────┬───────┘
          │              │                │
          └──────────────┼────────────────┘
                         ▼
              ┌────────────────────┐
              │   Results Pipeline │  STEP 1→2→3→3.5→4
              └────────┬───────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌────────┐   ┌──────────┐   ┌─────────┐
    │ L1 原始│   │ L2 聚合  │   │ L3 画像 │
    │ 答题   │   │ 快照     │   │ 当前+历史│
    └────────┘   └──────────┘   └─────────┘
                       │
                       ▼
              ┌────────────────────┐
              │   Neo4j L4 认知图谱 │
              │   MASTERED 边      │
              │   PREREQUISITE 边  │ ← 新增 152 条学习路径边
              │   弱项维度检测      │
              │   前置知识点推荐    │
              └────────┬───────────┘
                       │
                       ▼
              ┌────────────────────┐
              │   推荐引擎          │ ← 新增：5因子加权评分
              │   getRecommendations│    motivation × HSK × 解锁 × 弱项 × 新颖
              └────────┬───────────┘
                       │
                       ▼
              ┌────────────────────┐
              │   前端展示          │
              │   首页"为你推荐"    │
              │   完成页"下一步"    │
              └────────────────────┘
```

**核心设计原则**：L1 存数据 → L2 做聚合 → L3 管状态 → L4 建图谱 → 推荐引擎驱动下一步。A1 读状态、EmotionCheck 测情绪、BKT 追知识点、ability_vector 管能力维、anxiety 调难度，全部闭环在 results pipeline 中。
