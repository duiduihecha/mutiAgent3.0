# MANIFESTED_IN 标注任务 — 发给 Coze 的提示词

> 请将以下内容完整发给 Coze（或其他 AI 编程工具），并附上 3 个输入文件。

---

## 任务说明

你是一位跨文化交际专家。请根据我提供的 12 个文化维度和 8 个母语文化圈的描述，生成每个维度在每个文化圈中的具体表现描述。

## 输入文件

我提供 3 个 JSON 文件：

1. **`input_dimensions.json`** — 12 个文化维度的 ID、名称、理论来源和中文描述。你需要标注的维度就是这 12 个。
2. **`input_cultures.json`** — 8 个非中文母语文化圈的 ID、名称、覆盖地区和文化特征概述。目标文化（中文文化圈 hc_zh）不需要标注。
3. **`example_output.json`** — 3 条完整的示例，展示了期望的输出格式和质量标准。请仔细阅读。

## 输出要求

请生成一个 JSON 数组，包含 **12 × 8 = 96 条**记录。每条记录的格式如下：

```json
{
  "dimension_id": "维度ID（与 input_dimensions.json 一致）",
  "dimension_name": "维度中文名",
  "culture_id": "文化圈ID（与 input_cultures.json 一致）",
  "culture_name": "文化圈中文名",
  "weight": 0.0-1.0,
  "manifestation": "该维度在此文化中的具体表现（35-60字中文）",
  "conflict_with_chinese": "与中国文化在此维度上的冲突点（35-60字中文）",
  "pragmatic_tip": "给该文化学习者的实用交际建议（30-60字中文）",
  "example_scenario": "一个具体的跨文化交际场景示例（40-80字中文）"
}
```

### 各字段的具体要求

| 字段 | 要求 |
|------|------|
| `weight` | 0.0-1.0，表示该维度在此文化中的重要程度。中文文化在该维度上越强，且该文化与中国差异越大，weight 越高。主要维度（权力距离、个人/集体主义、高低语境、面子）不低于 0.7 |
| `manifestation` | 说明该维度在此文化中的具体行为表现。要具体到可观察的行为层面，不要讲抽象理论。例如：不要说"低语境文化"而要说"沟通时直接说出想法，不依赖暗示" |
| `conflict_with_chinese` | 必须体现该文化与中文文化的**具体冲突点**。不是泛泛地说"有差异"，而是说清楚**什么行为会导致什么误解** |
| `pragmatic_tip` | 给学习者的**可操作建议**。学习者看完后应该知道"我该怎么做"。使用"你应该..."或"不要..."的句式 |
| `example_scenario` | 一个具体的对话或场景，展示该维度的冲突如何在实际交流中发生。最好包含对话示例 |

### 质量标准（参考 example_output.json）

1. **具体而非抽象**：写"称呼上级用名字"而不是"平等沟通风格"
2. **行为导向**：写"拒绝时直接说 No"而不是"直接表达风格"
3. **可执行**：pragmatic_tip 要能直接指导行为
4. **体现冲突**：conflict_with_chinese 要说明"该文化做X，但中文环境期待做Y，误解表现为Z"

## 输出格式

请将 96 条记录输出为一个 JSON 文件，文件名为 `manifested_in_output.json`，格式为：

```json
[
  {"dimension_id": "dim_power_distance", "dimension_name": "权力距离", "culture_id": "hc_en", ...},
  {"dimension_id": "dim_power_distance", "dimension_name": "权力距离", "culture_id": "hc_ja", ...},
  ...
]
```

确保：
- JSON 语法完全正确，可被 `JSON.parse()` 或 `json.loads()` 解析
- 所有字符串使用中文（不要混入英文）
- 96 条记录无遗漏，每个维度×文化组合都有
- 不要输出任何 JSON 之外的内容（不要解释、不要 markdown 代码块标记）
