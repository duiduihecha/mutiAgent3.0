# Canonical Evaluation Schema v1.1

## 研究对象边界（D-016）

本协议比较的是 **condition-invariant generated instructional artifact**：每个条件都被投影到同一的解释、跨文化比较、语言点和练习字段。它不声称忠实复现当时部署 UI，也不纳入仅某条件可见的内部 Agent 产物、`native_ratio`、A5/CIEval 标签。Schema-valid 只表示结构合法；`diagnostics.strict_complete=true` 才表示内容组件过了严格完整性门。

## 1. 目标

把 Full、Monolith、NoA3、NoA2A3、NoA5 等条件的最终学习材料转换为完全相同的评价结构，消除 A2/A3 专用字段、条件名称和流水线元数据带来的评价偏置。

主原则：**主评价只使用学习者最终可见的 `generated_content`/`learning_content`，不使用任何智能体中间产物。**

## 2. 统一评价对象

每条材料必须映射为：

```json
{
  "schema_version": "1.0",
  "evaluation_item_id": "blind-random-id",
  "task": {
    "knowledge_point_id": "...",
    "domain": "...",
    "scene": "...",
    "pragmatic_intent": "...",
    "native_culture": "...",
    "hsk_level": 3,
    "anxiety_band": "medium"
  },
  "material": {
    "explanation": "...",
    "cross_cultural_comparison": "...",
    "language_points": [],
    "exercises": []
  },
  "completeness": {
    "explanation_present": true,
    "comparison_present": true,
    "language_points_present": true,
    "exercises_present": true,
    "exercise_count": 5,
    "mapping_warnings": []
  }
}
```

条件名、模型名、agent 名、缓存状态、质量网关结果、调用次数、延迟与成本不得出现在盲评对象中。

## 3. 唯一允许的主评价来源

先按以下规则定位最终内容容器：

1. `record.generated_content` 为非空对象时使用它；
2. 否则使用非空的 `record.learning_content`；
3. 两者均不存在时保留该样本，字段置空并写入 `mapping_warnings`，不得静默删除或回退到 A2/A3 中间输出。

字段映射：

| Canonical 字段 | 允许来源 | 规范化规则 |
|---|---|---|
| `material.explanation` | 最终容器的 `cultural_context` | 字符串直接使用；对象按固定键序列化为可读文本 |
| `material.cross_cultural_comparison` | 最终容器的 `comparison` | 字符串直接使用；对象按 `cn`、`target`、`similarities`、`differences` 固定顺序渲染 |
| `material.language_points` | 最终容器的 `language_points` | 保留原顺序；统一为 `zh`、`native`、`note`，`en` 只作为旧字段映射到 `native` |
| `material.exercises` | 最终容器的 `exercises` | 保留原顺序；统一题型名称和字段名，不改写题目内容 |

明确禁止作为主评价来源：

- `cultural_explanation`（A2 或占位符）；
- `cross_cultural_comparison`（A3 或占位符）；
- A5 review、guardrail rationale、confidence；
- prompt、agent message、KG trace、cache metadata。

这些字段可以另存为 `mechanism_trace`，但必须与盲评文件物理分离，仅用于机制分析和排错。

## 4. 规范化而非内容改写

允许的处理：

- Unicode NFC；
- 统一换行符为 `\n`；
- 去除首尾空白；
- 对对象字段采用冻结键序渲染；
- 旧题型别名映射，例如 `fill_in_blank` → `fill_blank`；
- `language_points[].en` → `language_points[].native`，前提是 `native` 缺失。

禁止的处理：

- 摘要、润色、翻译、补全或事实修正；
- 删除看似低质量、冒犯或格式错误的内容；
- 为某一条件增加中间产物作为补偿；
- 按长度截断某一条件而不对全部条件使用同一预注册规则；
- 映射失败后调用 LLM 修复。

若需要长度上限，smoke 前必须冻结统一的字符/token 上限和“保留开头还是按字段配额截断”规则。首选不截断；长度作为结果变量报告。

## 5. 缺失值与失败样本

失败也是实验结果。任何字段缺失都必须：

1. 保留 evaluation item；
2. 对应字段使用空字符串或空数组；
3. 在 `mapping_warnings` 写入标准代码；
4. 记录到 manifest 的 failure 信息；
5. 在 intention-to-treat 主分析中计入。

标准 warning：`NO_FINAL_CONTAINER`、`MISSING_EXPLANATION`、`MISSING_COMPARISON`、`MISSING_LANGUAGE_POINTS`、`MISSING_EXERCISES`、`INVALID_EXERCISE_SCHEMA`、`UNRECOGNIZED_TYPE`。

不得因 canonical 映射失败而从某个条件选择性删除样本。另可报告 complete-case 敏感性分析。

## 6. 匿名化与随机化

- `evaluation_item_id` 使用与条件无语义关系的随机 ID；
- 条件映射保存在独立 key file，由 P2/P0 保管，评审者不可见；
- 两位评审者收到完全相同的材料集合，但各自使用独立随机顺序；
- 同一 base case 的不同条件不得连续展示；
- 不修写生成文本以“消除”泄盲；显式条件词和可由长度/模板推断的隐性泄盲分别记入 diagnostics。

## 7. 公平性检查

canonical 映射解决“评价字段一致”，但不等于生成预算公平。Full vs Monolith 另须满足：

- 相同 base case、学习者画像、知识输入和可用知识源；
- 相同基础模型及版本；
- 相同采样参数，或记录并解释模型限制；
- 以每个配对的总输入+输出 token 为主要匹配标准；
- 同时报告调用次数、端到端延迟、模型服务成本；
- 预注册 token 容差：建议每个配对绝对相对差不超过 10%，整体条件均值差不超过 5%；超出则 smoke 不准入。

## 8. 校验与版本

- JSON 必须通过 `canonical-evaluation.schema.json`；
- canonical converter 版本和源文件 SHA-256 写入 manifest；
- 映射结果生成后只读冻结；任何变更升 schema minor/major 版本并保留旧文件；
- 正式分析必须记录 canonical 文件 SHA-256。
