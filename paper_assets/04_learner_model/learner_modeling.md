# 学习者建模与个性化机制

## 1. 学习者画像结构

### 1.1 七维画像

`learners` 表存储7维静态+动态画像：

```typescript
interface LearnerProfile {
  id: string;                      // UUID
  uid: string;                     // 用户唯一标识
  native_language: string;         // 母语文化圈 (8种可选)
  hsk_level: number;               // HSK等级 (1-9)
  learning_style: string;          // 学习风格 (visual/auditory/kinesthetic)
  learning_motivation: string;     // 学习动机 (tourism/study/work/interest/exam)
  cultural_anxiety_score: number;  // 文化焦虑度 [0, 100]
  ability_vector: number[];        // 能力短板向量 [语法,听力,口语,文化语用,阅读]
}
```

### 1.2 数据库索引

```sql
CREATE INDEX learners_uid_idx ON learners(uid);
CREATE INDEX learners_native_language_idx ON learners(native_language);
CREATE INDEX learners_hsk_level_idx ON learners(hsk_level);
```

## 2. 文化焦虑度机制

### 2.1 设计原则

焦虑度是系统的核心动态变量，遵循严格的单向数据流：

- **唯一写入入口**：results API → `applyAnxietyDelta(correctnessRate)`
- **唯一读取入口**：A1 从 DB `learners.cultural_anxiety_score` 读取
- **禁止行为**：A1 不从行为指标独立计算焦虑度数值

### 2.2 增量计算公式

$$\Delta = (0.5 - r) \times 20$$

其中 $r$ 为最近一次评估的正确率：
- $r = 1.0$ (全对) → $\Delta = -10$，焦虑下降
- $r = 0.5$ (一半对) → $\Delta = 0$，焦虑不变
- $r = 0.0$ (全错) → $\Delta = +10$，焦虑上升

### 2.3 应用函数

```typescript
function applyAnxietyDelta(currentAnxiety: number, correctnessRate: number): number {
  const delta = calculateAnxietyDelta(correctnessRate);
  return Math.min(100, Math.max(0, currentAnxiety + delta));
}
```

### 2.4 等级映射

| 分数范围 | 等级 | 母语占比 | 教学策略 |
|----------|------|----------|----------|
| [80, 100] | high | 0.75 | 大幅降低中文暴露量，母语为主 |
| [40, 80) | medium | 0.50 | 双语均衡，逐步引入中文 |
| [0, 40) | low | 0.25 | 语言沉浸式，中文为主 |

### 2.5 母语占比公式

```typescript
function calculateNativeLanguageRatio(anxiety_score: number): {
  native_ratio: number; chinese_ratio: number;
} {
  const native_ratio = anxiety_score > 80 ? 0.75
    : anxiety_score >= 40 ? 0.5 : 0.25;
  return {
    native_ratio: Math.round(native_ratio * 100) / 100,
    chinese_ratio: Math.round((1 - native_ratio) * 100) / 100
  };
}
```

## 3. 贝叶斯知识追踪

### 3.1 BKT 模型

$$P(L_{n+1}) = P(L_n | \text{evidence})$$

参数：
- `prior_probability`：先验掌握概率
- `guess_probability = 0.25`：猜测概率
- `slip_probability = 0.10`：失误概率
- `observed_correct`：本次观察结果

### 3.2 实现

```typescript
function bayesianKnowledgeTracing(params: {
  prior_probability: number;
  guess_probability: number;
  slip_probability: number;
  observed_correct: boolean;
}): number {
  if (observed_correct) {
    const numerator = slip_probability * prior_probability;
    const denominator = slip_probability * prior_probability
      + guess_probability * (1 - prior_probability);
    return numerator / denominator;
  } else {
    const numerator = (1 - slip_probability) * prior_probability;
    const denominator = (1 - slip_probability) * prior_probability
      + (1 - guess_probability) * (1 - prior_probability);
    return numerator / denominator;
  }
}
```

## 4. 能力向量

### 4.1 五维能力空间

$\vec{v} = [v_{grammar}, v_{listening}, v_{speaking}, v_{cultural\_pragmatic}, v_{reading}]$

每个维度值域 [0, 100]，初始值均为 50。

### 4.2 加权移动平均

```typescript
function calculateAbilityVector(
  oldVector: number[],
  currentResults: Array<{
    dimension: 'grammar' | 'listening' | 'speaking' | 'cultural_pragmatic' | 'reading';
    correct: boolean;
    weight?: number;
  }>
): number[] {
  const alpha = 0.7; // 新数据权重
  for (let i = 0; i < 5; i++) {
    if (counts[i] > 0) {
      const newScore = weightedSum[i] / weights[i];
      newVector[i] = Math.round(alpha * newScore + (1 - alpha) * oldVector[i]);
    }
  }
  return newVector.map(v => Math.min(100, Math.max(0, v)));
}
```

$\alpha = 0.7$ 的含义：新一次评估结果占70%权重，历史积累占30%，使能力向量对近期表现敏感。

## 5. L2 短期记忆趋势

### 5.1 数据源

```sql
SELECT score, dimension_scores, error_patterns, scene_type, assessed_at
FROM assessment_records
WHERE learner_id = $learnerId
ORDER BY assessed_at DESC
LIMIT 5
```

### 5.2 聚合维度

| 指标 | 计算方法 | 用途 |
|------|----------|------|
| `recent_average_score` | 最近N轮平均分 | 整体趋势判断 |
| `weak_dimensions` | 维度正确率 < 40% | A4 弱项强化 |
| `accuracy_trend` | 前后半段均分差 > 5 | improving/stable/declining |
| `repeated_error_patterns` | 错误模式出现 ≥ 2次 | A4 针对性出题 |
| `repeated_scenes` | 场景重复学习 ≥ 2次 | 避免场景疲劳 |

### 5.3 趋势判断

```typescript
if (records.length >= 3) {
  const recentAvg = mean(scores[0:half]);
  const olderAvg = mean(scores[half:2*half]);
  const diff = recentAvg - olderAvg;
  if (diff > 5) accuracy_trend = "improving";
  else if (diff < -5) accuracy_trend = "declining";
}
```

## 6. 文化偏见检测

### 6.1 关键词匹配

```typescript
const BIAS_KEYWORDS = [
  '所有', '都', '必须', '应该', '从来不', '永远都', '一定', '必然',
  '落后', '保守', '封闭', '愚昧', '专制', '压迫', '低级', '原始',
  '像西方那样', '西方文明', '发达国家的', '文明世界',
  '神秘的东方', '古老的东方', '神秘的'
];
```

### 6.2 句式模式匹配

```typescript
const BIAS_PATTERNS = [
  /(所有|每个)([A-Za-z一-龥]+人都)/g,
  /([A-Za-z一-龥]+人都(会|能|必须|应该|从不))/g,
  /(像|跟)(西方|欧美|美国|英国)(一样|那样)/g
];
```

### 6.3 偏见度评分

$$\text{bias\_score} = \min(1, \text{keywords\_count} \times 0.1 + \text{patterns\_count} \times 0.2)$$

$$ \text{has\_bias} = \text{bias\_score} > 0.2 $$

注意：关键词检测仅作为 A3 的轻量级预警。主要偏见判断已升级为 `verifyA3Comparison` LLM 裁判。
