# MANIFESTED_IN 标注任务

> **目标**: 填充知识图谱 Layer 2 的 `CulturalDimension-[MANIFESTED_IN]->HomeCulture` 关系（当前为空，共 12×8=96 条）
> **流程**: 人准备输入 → Coze 批量生成 → MiniMax 裁判评分 → 达标后导入 Neo4j

---

## 背景

知识图谱的 Layer 2（跨文化维度层）中，`CulturalDimension` 节点（12个）通过 `MANIFESTED_IN` 关系连接到 `HomeCulture` 节点（8个学习者文化圈，不含目标文化 hc_zh）。这条边存储的是：**某个文化维度在某个母语文化中的具体表现，以及与中国文化的冲突点**。

这些数据会被 A2（母语阐释器）和 A3（文化对比器）读取，用于生成更准确、更有针对性的教学内容。

---

## 目录结构

```
tasks/manifested_in_annotation/
├── README.md                   # 本文件
├── COZE_PROMPT.md              # 发给 Coze 的提示词（复制粘贴即可）
├── input_dimensions.json       # 12个文化维度的输入数据
├── input_cultures.json         # 8个学习者的文化圈的输入数据
├── example_output.json         # 3条完整的标注示例
├── judge_with_minimax.py       # MiniMax 裁判评分脚本
└── (待 Coze 生成后补充)
    ├── manifested_in_output.json           # Coze 的输出
    └── manifested_in_output_judge_results.json  # 裁判评分结果
```

---

## 工作流程

### 第 1 步：你发给 Coze 的东西

将以下 4 个文件一起发给 Coze：

| 文件 | 说明 |
|------|------|
| `COZE_PROMPT.md` | **直接复制全文**发给 Coze 作为任务指令 |
| `input_dimensions.json` | 12 个文化维度（待标注的对象） |
| `input_cultures.json` | 8 个母语文化圈（待标注的对象） |
| `example_output.json` | 3 条高质量示例（格式和质量标准参考） |

对 Coze 说（可以附在 COZE_PROMPT.md 前面）："请按照这个任务说明，生成 96 条标注数据，输出为 JSON 文件。"

### 第 2 步：Coze 返回结果

Coze 应该返回一个包含 96 条记录的 JSON 文件。把它保存为 `manifested_in_output.json`，放在本目录下。

### 第 3 步：用 MiniMax 裁判评分

```bash
cd tasks/manifested_in_annotation

# 抽样评分 30 条（快速验证）
python3 judge_with_minimax.py --input manifested_in_output.json --sample 30

# 全部 96 条评分（确定质量）
python3 judge_with_minimax.py --input manifested_in_output.json
```

### 第 4 步：看评分结果

裁判会生成 `manifested_in_output_judge_results.json`，包含每条数据的 5 维度评分（1-5）+ 总分（最高25）。

- **总分 ≥ 20/25** → ✅ 通过，可以直接用
- **总分 15-19** → 🔧 需要修改对应字段
- **总分 < 15** → ❌ 不合格，重新生成这一条

**通过率 ≥ 80%**：整体数据可用，不通过的手改即可。
**通过率 < 50%**：建议调整 Coze 提示词后重新生成。

### 第 5 步：导入 Neo4j

评分通过后，我（Claude）帮你写一个脚本把 JSON 导入 Neo4j，创建 `CulturalDimension-[MANIFESTED_IN]->HomeCulture` 边。

---

## 期望的输出格式

每条记录长这样（完整示例见 `example_output.json`）：

```json
{
  "dimension_id": "dim_power_distance",
  "dimension_name": "权力距离",
  "culture_id": "hc_en",
  "culture_name": "英语圈",
  "weight": 0.9,
  "manifestation": "英语圈权力距离低，上下级关系平等，员工可直接质疑老板决策...",
  "conflict_with_chinese": "与中国高权力距离形成核心冲突——中国职场中下级不公开反驳上级...",
  "pragmatic_tip": "在中国环境中，即使对方态度友好平等，也要保持对长辈、老师、上级的形式尊重...",
  "example_scenario": "你在中国的公司实习，发现老板的方案有一个明显错误。不要当众指出..."
}
```

### 各字段质量要求

| 字段 | 好 ✅ | 差 ❌ |
|------|-------|-------|
| `manifestation` | "称呼上级常用名字而非头衔" | "低权力距离文化" |
| `conflict_with_chinese` | "该文化做X，但中文环境期待做Y，表现为Z" | "两者有差异" |
| `pragmatic_tip` | "你应该在...时做..." | "要注意文化差异" |
| `example_scenario` | 具体的对话场景 + 对话示例 | 理论描述 |

---

## 需要消耗的资源

| 资源 | 数量 |
|------|------|
| Coze 生成 | 96 条记录，每条约 200 字，共约 20,000 字 |
| MiniMax 裁判评分 | 96 次 API 调用，每次约 0.3 秒，共约 30 秒 |

---

## 输入数据摘要

### 12 个文化维度
权力距离、个人/集体主义、竞争与关怀导向、不确定性规避、长期/短期导向、放纵与克制、高低语境、空间距离、时间观念、特定型与扩散型界限、面子与尊严、互惠与人情规范

### 8 个母语文化圈
英语圈、日语圈、韩语圈、西班牙语圈、阿拉伯语圈、俄语圈、法语圈、东南亚文化圈

（中文文化圈 hc_zh 是目标文化，不需要标注）

---

## 注意事项

1. Coze 生成的 JSON 必须语法正确，能被 `json.loads()` 直接解析
2. 如果 Coze 把输出包裹在 ```json ... ``` 代码块里，裁判脚本能自动处理
3. `weight` 字段：与中国差异越大的维度给越高分（0.7-1.0），共性多的维度给低分（0.3-0.6）
4. 每条记录的 5 个文字字段（manifestation/conflict_with_chinese/pragmatic_tip/example_scenario）必须是中文
