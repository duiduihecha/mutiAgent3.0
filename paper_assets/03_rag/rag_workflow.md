# RAG 流程：知识增强生成

## 1. 知识底座架构

系统采用混合知识底座：$K = K_{graph} \cup K_{llm} \cup K_{expert}$

| 知识源 | 存储引擎 | 内容类型 | 检索方式 |
|--------|----------|----------|----------|
| $K_{graph}$ | Neo4j 图数据库 | 文化节点语义关联 (6种节点类型 × 6种边类型) | Cypher 图查询、BFS路径搜索 |
| $K_{llm}$ | Supabase PostgreSQL (`llm_content_cache`) | LLM生成内容缓存 | 复合主键精确查询 |
| $K_{expert}$ | Supabase PostgreSQL (`expert_review_queue`) | 专家审核/修正内容 | 状态过滤查询 |

## 2. 缓存检索机制

### 2.1 复合主键设计

缓存使用三重主键精确命中，不做向量相似度检索：

```
(knowledge_point_id, hsk_level, scene_id)
```

设计理由：
- `knowledge_point_id`：语义域隔离（"饮食文化"与"交通规则"不可混淆）
- `hsk_level`：难度分层（同一知识点在HSK1和HSK6的阐释深度不同）
- `scene_id`：场景约束（同一知识点在不同场景下的语用表现不同）

### 2.2 检索流程

```sql
SELECT content_payload, status, confidence_score
FROM llm_content_cache
WHERE knowledge_point_id = $kpId
  AND hsk_level = $hskLevel
  AND scene_id = $sceneId
```

检索结果需通过双重校验才能命中：
1. `status = 'ACTIVE'` — 非 DEGRADED、非 REJECTED
2. `confidence_score >= 0.60` — 聚合 guardrail 置信度达标

### 2.3 单例模式

`CacheManager` 使用单例模式，全系统共享一个缓存实例：

```typescript
class CacheManager {
  private static instance: CacheManager;
  static getInstance(): CacheManager { ... }
}
```

## 3. 缓存状态生命周期

### 3.1 状态机

```
INSERT → ACTIVE (confidence ≥ 0.60)
INSERT → REJECTED (confidence < 0.60)
ACTIVE → DEGRADED (累计downvotes超过阈值)
DEGRADED → REJECTED (持续低质量投票)
DEGRADED → ACTIVE (upvotes回升 + 重新评估通过)
```

### 3.2 写入策略

```typescript
async upsert(params: {
  kpId: string; hskLevel: number; sceneId: string;
  payload: Record<string, unknown>;
  confidence: number;
}) {
  const status = confidence < 0.60 ? "REJECTED" : "ACTIVE";
  await supabase.from("llm_content_cache").upsert({
    knowledge_point_id, hsk_level, scene_id,
    content_payload, confidence_score, status
  }, { onConflict: "knowledge_point_id,hsk_level,scene_id" });
}
```

### 3.3 缓存准入置信度计算

$C = \sum_i w_i \cdot c_i / \sum_i w_i$

各 guardrail 权重分配：

| Guardrail | $w_i$ | 分值域 |
|-----------|-------|--------|
| a5_joint (双模型仲裁) | 0.40 | [0, 1] 连续 |
| a2_translation (回译裁判) | 0.25 | {0, 1} 二值 |
| a3_comparison (客观性裁判) | 0.15 | {0, 1} 二值 |
| a4_grounding (交叉校验) | 0.10 | {0, 1} 二值 |
| a4_hard_rules (硬规则) | 0.05 | {0, 1} 二值 |
| a4_solver (对抗盲测) | 0.05 | {0, 1} 二值 |

阈值：$C \geq 0.60 \rightarrow$ ACTIVE

## 4. Prompt 拼接策略

### 4.1 XML 标签约束格式

所有 Agent prompt 采用统一的三段式结构：

```
<system_prompt>      角色设定 + 能力描述
<strict_constraints> 硬约束 (语言/文化/事实/等级)
<tier_guidelines>    HSK分层指导
<output_schema>      输出格式 (JSON Schema / XML Schema)
</system_prompt>

<user_input>
<knowledge_point_id>...</knowledge_point_id>
<target_language>...</target_language>
<hsk_level>...</hsk_level>
<adaptive_guidance>
  L2趋势数据 (弱项维度 / 准确率趋势 / 重复错误模式)
</adaptive_guidance>
</user_input>
```

### 4.2 A4 自适应注入

A4 的 `<adaptive_guidance>` 块包含：

```
弱项维度: ["cultural_pragmatic", "speaking"]
准确率趋势: "declining"
重复错误模式: ["声调混淆", "量词误用"]
重复场景: ["food", "shopping"]
指导:
1. 弱项维度题目占比提高至 40%+
2. 准确率趋势=declining → 降低难度
3. 重复错误模式 → 针对性出题
```

## 5. Generation 流程

### 5.1 A4 内容生成

A4 生成完整的 `GeneratedContent` 对象：

```typescript
interface GeneratedContent {
  cultural_context: {
    explanation: string;    // 80-150词母语文化背景
    native_ratio: number;   // 母语占比
  };
  language_points: Array<{ zh: string; en: string }>;  // 3-5个核心表达
  comparison: {
    cn: string; target: string;
    differences: Array<{ cn: string; target: string; description: string }>;
  };
  exercises: Exercise[];    // 3-5道练习题
}
```

### 5.2 练习题生成规范

3种题型，每种有严格的格式校验 (`validateExercisesFormat`)：

| 题型 | options | correct_answer | 校验规则 |
|------|---------|----------------|----------|
| multiple_choice | 4项数组 | A/B/C/D | options.length=4, answer匹配/^[A-D]$/ |
| true_false | ["对","错"] | "对"/"错" | options精确匹配 |
| fill_blank | [] (空数组) | 标准中文 | options.length=0, answer非空 |

每题标注 `dimension`：grammar / listening / speaking / cultural_pragmatic / reading
