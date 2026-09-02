# 实验一：多智能体架构消融实验

> **对应论文 RQ1**: 多智能体分工协作是否优于单体 LLM？每个 Agent（A2阐释/A3对比/A5质检）各自贡献了多少？
> **运行脚本**: `scripts/run-experiments.ts`
> **核心代码**: `src/lib/experiment-runner.ts` + `src/lib/evaluation-metrics.ts`

---

## 1. 实验目的与假设

### 研究问题

| 子问题 | 核心关注点 |
|--------|-----------|
| **RQ1a** | 5-Agent 协同架构（A1→A2+A3→A4→A5）相比单体 LLM，在内容质量上有多少提升？ |
| **RQ1b** | A3 文化对比器被去掉后，内容的"文化适切性"是否下降？ |
| **RQ1c** | A5 质量控制器被去掉后，格式错误率和偏见度是否上升？ |
| **RQ1d** | A2+A3 被去掉后，内容的文化深度和个体适配性是否下降？ |

### 核心假设

> 每个 Agent 的分工和 KG 数据注入对最终质量都有独立的正向贡献。去掉任何一个 Agent 都会在对应维度上产生可测量的质量下降。

---

## 2. 实验设计

### 2.1 测试用例矩阵

从 Neo4j 知识图谱自动生成测试用例。每个测试用例 = 1个知识点(KP) × 1种母语 × 1个HSK等级：

```
测试用例 = 14 Domain × 1 Scene × 4 母语 × 2 HSK等级
         = 14 × 1 × 4 × 2 = 112 个测试用例

母语: 英语(en) / 日语(ja) / 韩语(ko) / 阿拉伯语(ar)
HSK等级: 1(初级) / 7(高级)
```

**测试用例字段**:

| 字段 | 来源 | 示例 |
|------|------|------|
| `knowledge_point_id` | Neo4j KnowledgePoint.id | `family_elders_care` |
| `domain_name` | Neo4j Domain.name | `家庭与亲属` |
| `scene_name` | Neo4j Scene.name | `与长辈相处` |
| `pragmatic_intent` | Neo4j KnowledgePoint.pragmatic_intent | `用恰当的方式关心长辈的健康和生活...` |
| `native_language` | CLI参数 | `阿拉伯语` |
| `hsk_level` | CLI参数 | `1` |

### 2.2 五个实验条件（消融层次）

| 条件 | 流水线结构 | 含义 | 验证假设 |
|------|-----------|------|---------|
| **C1_Full** | A1 → A2+A3(并行) → A4 → A5 + KG | 完整多智能体系统 | 基线 |
| **C2_NoAgent_Monolith** | 1个"全栈设计师"prompt直调LLM | 单体LLM基线 | RQ1a: 多Agent vs 单体 |
| **C3_NoA3** | A1 → A2 → A4 → A5 + KG | 去掉文化对比Agent | RQ1b: A3的价值 |
| **C4_NoA5** | A1 → A2+A3 → A4 + KG | 去掉质量管控Agent | RQ1c: A5的价值 |
| **C5_NoA2A3** | A1 → A4 → A5 + KG | 去掉阐释和对比Agent | RQ1d: A2+A3的价值 |

### 2.3 控制变量

所有条件共享相同的输入，只改变流水线结构：

| 变量 | 控制方式 |
|------|---------|
| **LLM 模型** | 全部使用豆包 `doubao-seed-2-0-pro-260215` |
| **学习者画像** | 固定 anxiety=50, ability_vector=[50,50,50,50,50] |
| **知识点** | 同一 `knowledge_point_id` |
| **母语/HSK** | 同一 `native_language` + `hsk_level` |
| **KG 数据** | C1/C3/C4/C5 均可查询 Neo4j；C2 无 KG 注入 |

---

## 3. Agent 去掉机制

不修改 Agent 代码。通过**跳过调用步骤**和**传 null 参数**实现：

```
C1 (完整):
  A1.run() → A2.run() + A3.run() [并行]
  → A4.run(cultural_explanation=A2输出, cross_cultural_comparison=A3输出)
  → A5.run(A4输出) → 返回

C2 (单体):
  1个全栈prompt → LLM.chat() → 返回
  （不调用任何Agent，无KG数据注入，无焦虑适配）

C3 (无A3):
  A1.run() → A2.run()
  → A4.run(cultural_explanation=A2输出, cross_cultural_comparison=null)
  → A5.run(A4输出) → 返回

C4 (无A5):
  A1.run() → A2.run() + A3.run() [并行]
  → A4.run(cultural_explanation=A2输出, cross_cultural_comparison=A3输出)
  → 直接返回（不经过A5审核）

C5 (无A2A3):
  A1.run()
  → A4.run(cultural_explanation=null, cross_cultural_comparison=null)
  → A5.run(A4输出) → 返回
```

### C2 单体LLM的prompt

C2 使用一个精简的"全栈设计师"prompt，明确要求做和 C1 相同三件事——文化阐释 + 跨文化对比 + 出题——但全部塞进一次 LLM 调用：

```
你是一位全栈TCSL教学设计师。请一次性完成:
1. 文化阐释：用{母语}解释中国文化概念"{pragmatic_intent}"
2. 跨文化对比：中国文化 vs {母语}文化
3. 生成5道HSK{level}练习题（至少2种题型）
输出严格JSON格式...
```

---

## 4. 评估指标体系（8个指标）

### 4.1 指标总览

| # | 指标 | 测量内容 | 类型 | LLM调用 |
|---|------|---------|------|---------|
| ① | JSON格式正确率 | 输出是否符合GeneratedContent结构 | 规则检查 | 0次 |
| ② | HSK词表覆盖率↑ | 中文词语在HSK词汇表中的命中率 | Neo4j查词 | N次(每词1次) |
| ③ | KG事实一致性↑ | 生成内容是否与KG中KP定义一致 | Neo4j查ground truth | 1次/KP |
| ④ | 偏见度↓ | 含偏见关键词/句式的比例 | 规则检查 | 0次 |
| ⑤ | 题型种类↑ | exercises使用了多少种题型 | 统计 | 0次 |
| ⑥ | 词汇多样性↑ | 中文字符Type-Token Ratio | 统计 | 0次 |
| ⑦ | 答案可判率↑ | 练习题答案是否有效可判 | 规则检查 | 0次 |
| ⑧ | 平均耗时 | 端到端生成时间 | 计时 | 0次 |

### 4.2 各指标计算公式

#### ① JSON格式正确率

```
检查 GeneratedContent 结构完整性:
  cultural_context.explanation         存在且为string?  → 不合格
  language_points                      非空数组?        → 不合格
  language_points[i] 都有 zh+翻译字段?                  → 不合格
  comparison                           对象存在?        → 不合格
  exercises                            非空数组?        → 不合格
  exercise[i] 都有 type+question+correct_answer?        → 不合格
  选择题 options 至少2个?                              → 不合格

正确率 = 全部通过数 / 总样本数
```

#### ② HSK词表覆盖率（词级别）

```
1. 从 exercises + language_points 提取中文文本
2. 2-3字滑动窗口切分中文词语（如 "开银行账户" → ["开银","银行","行账","账户","开银行","银行账","行账户"]）
3. 取前50个去重词，逐一查 Neo4j:
     MATCH (w:HSKWord {lemma: $word}) RETURN w.level
4. 如果命中 → 该词在HSK词表中:
     w.level ≤ targetHSK → "在纲"
     w.level > targetHSK → "超纲"
   如果未命中 → "不在词表中"（可能是LLM自创词）

覆盖率 = 在纲词数 / 总词数
```

**为什么用词级别而非字级别**：
- 字级别："的"(HSK1)+"确"(HSK5) → 对HSK4学习者算在纲
- 词级别："的确"作为词查 HSKWord{lemma:"的确",level:6} → 对HSK4学习者算超纲 ✓

#### ③ KG事实一致性

```
1. 从 Neo4j 查询该 KP 的 ground truth:
   MATCH (d:Domain)-[:HAS_SCENE]->(s)-[:HAS_KNOWLEDGE_POINT]->(kp{id:$kpId})
   MATCH (kp)-[:RELATES_TO]->(cc:CulturalConcept)
   MATCH (kp)-[:RELATES_TO]->(:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)

2. 三项结构化检查:
   检查①: 生成内容是否体现了 domain/scene 名称?
   检查②: 关联的文化概念有多少个在生成内容中被提及?
   检查③: A3使用的文化维度框架是否与KG标注一致?

一致性 = 通过检查数 / 总检查数
```

**为什么不用旧版的"中文关键词搜索"**：
- 旧版：提取中文→`CONTAINS`搜KG节点名 → 纯英文内容提不出中文 → 永远是0%
- 新版：查KG的KP属性作ground truth → 兼容任意语言 → 有意义的分数

#### ④ 偏见度

```
调用 detectBias() 函数:
  关键词扫描: 17个偏见词（"所有/都/必须/从来/落后/保守/神秘的东方"...）
    命中1个 → score += 0.1
  句式扫描: 3个正则模式
    命中1个 → score += 0.2

bias_score > 0.2 → has_bias = true
```

#### ⑤ 题型种类

```
统计 exercises 中 type 字段的不同值个数:
  ["multiple_choice","multiple_choice","true_false","fill_blank","multiple_choice"]
  → 题型种类 = 3 (multiple_choice/true_false/fill_blank)
```

#### ⑥ 词汇多样性（TTR）

```
从所有题目的 question + options 中提取中文字符:
  TTR = 去重中文字符数 / 总中文字符数
  例如: 5道题用了100个汉字，80个不同 → TTR = 0.80
```

#### ⑦ 答案可判率

```
逐题检查:
  选择题: correct_answer 必须是选项字母(A/B/C/D) + 正确选项内容不与其他选项重复
  判断题: correct_answer 必须是 "对" 或 "错"
  填空题: correct_answer 非空即可

可判率 = 有效题数 / 总题数
```

#### ⑧ 平均耗时

```
每个Agent记录 start/end 时间戳，相减得到耗时:
  C1: A1(纯算法,~0ms) + max(A2,A3)(并行,取最长) + A4 + A5
  C2: Monolith(1次LLM)
  C3: A1 + A2 + A4 + A5（少了A3的1次LLM调用）
  C4: A1 + max(A2,A3) + A4（少了A5的1次LLM调用）
  C5: A1 + A4 + A5（少了A2和A3的2次LLM调用）
```

---

## 5. 运行方式

### 5.1 命令行

```bash
# 小规模试跑（1语言×1HSK = 14条×5条件 = 70次调用）
npx tsx scripts/run-experiments.ts --experiment rq1 --samples 1 \
  --languages en --hsk-levels 4

# 标准规模（4语言×2HSK = 112条×5条件 = 560次调用）
npx tsx scripts/run-experiments.ts --experiment rq1 --samples 1 \
  --languages en,ja,ko,ar --hsk-levels 1,7

# 全量规模（8语言×3HSK = 336条×5条件 = 1,680次调用）
npx tsx scripts/run-experiments.ts --experiment rq1 --samples 2 \
  --languages en,ja,ko,es,ar,ru,fr,th --hsk-levels 1,4,7
```

### 5.2 执行流程

```
1. generateTestCases()    查Neo4j → KP × 母语 × HSK = 测试用例列表
2. runBatch()             每个测试用例 × 每个条件 → 依次运行
3. runSingle()            对单个用例+条件:
   ├─ 切换流水线结构（C1~C5）
   ├─ 收集各Agent耗时
   └─ 收集文化阐释/对比/生成内容原始输出
4. computeAllMetrics()    对每次输出计算8个指标
5. 结果写入:
   ├─ JSONL 实时日志 (rq1_progress.jsonl)
   ├─ 按条件分 JSON 文件 (rq1_C1_Full.json, ...)
   └─ 聚合统计表 (rq1_aggregates_per_condition.json)
```

### 5.3 输出文件

| 文件 | 内容 |
|------|------|
| `experiment_results/rq1_progress.jsonl` | 每次运行一行JSON，实时进度 |
| `experiment_results/rq1_C1_Full.json` | C1条件的所有结果 |
| `experiment_results/rq1_C2_NoAgent_Monolith.json` | C2条件的所有结果 |
| `experiment_results/rq1_C3_NoA3.json` | C3条件的所有结果 |
| `experiment_results/rq1_C4_NoA5.json` | C4条件的所有结果 |
| `experiment_results/rq1_C5_NoA2A3.json` | C5条件的所有结果 |
| `experiment_results/rq1_aggregates_per_condition.json` | 按条件聚合统计 |

### 5.4 结果重新分析（不需重跑实验）

```bash
# 用修正后的评估逻辑重新计算指标
npx tsx scripts/reanalyze.ts
```

---

## 6. 第一次运行结果（英语×HSK4，14条×5条件=70次）

| 指标 | C1完整系统 | C2单体LLM | C3无A3 | C4无A5 | C5无A2A3 |
|------|-----------|----------|--------|--------|---------|
| JSON正确率 | 100% | 100% | 100% | 100% | 100% |
| HSK超纲率↓ | 7.8% | 5.9% | 5.3% | 7.5% | **3.8%** |
| KG一致性↑ | 0%* | 0%* | 0%* | 0%* | 0%* |
| 偏见度↓ | 11.4% | 10.7% | 12.1% | 11.4% | **8.6%** |
| 题型种类↑ | **3.0** | **1.8** | 2.9 | 3.0 | 3.0 |
| 词汇多样性↑ | 50.9% | 48.8% | 52.4% | 51.0% | 54.6% |
| 答案可判率↑ | **100%** | **68.6%** | 100% | 100% | 100% |
| 平均耗时(s) | 50.5 | 8.5 | 29.6 | 32.8 | 11.7 |

> *KG一致性为0%是因为第一版指标用中文关键词搜索，但生成内容是英语/日语/韩语等，无法提取中文关键字。新版指标已修复此问题。

### 6.1 初步发现

| 发现 | 数据 | 统计意义 |
|------|------|---------|
| **单体LLM答案可判率大幅下降** | C1 100% vs C2 68.6% | 单体LLM有31%的练习题答案格式不规范 |
| **单体LLM题型单一** | C1 3.0 vs C2 1.8 种 | 多Agent分工产生更多样化的题型组合 |
| **去A5导致偏见漏检** | C4出现1例偏见(C1为0) | A5质量审核具有实际的偏见拦截价值 |
| **去A2A3内容变浅** | C5的文化阐释从80-114词降到67-82词 | A2+A3对内容的文化深度有贡献 |
| **速度-质量权衡** | C1 50.5s vs C2 8.5s | 6倍时间换取答案可判率从68%→100% |

---

## 7. 实验局限性

| 局限 | 说明 | 应对 |
|------|------|------|
| **样本量有限** | 14条/条件(仅英语×HSK4)，统计显著性不足 | 扩大至4语言×2等级(112条/条件) |
| **KG一致性指标失效** | 旧版依赖中文关键词提取，不适用于多语言内容 | 已改为词级别+KG ground truth对比 |
| **缺少人类评估** | 自动指标只能测格式和统计特征，不能测教育质量 | 后续用AI裁判(双LLM盲评)补充 |
| **未控制LLM随机性** | 同条件同输入可能因采样温度产生不同输出 | 可考虑同一条件跑多次取平均 |
| **LLM生成模型单一** | 所有条件都用Doubao，未涉及其他模型 | 后续可加入GPT-4/Claude作对比 |

---

## 8. 代码文件索引

| 文件 | 行数 | 作用 |
|------|------|------|
| `src/lib/experiment-runner.ts` | 828 | 实验条件切换 + 批量运行 + Agent调用的5种流水线变体 |
| `src/lib/evaluation-metrics.ts` | ~1,000 | 8个评估指标 + 聚合统计 + AI裁判模块 + 人工评估模块 |
| `scripts/run-experiments.ts` | 302 | CLI批量运行脚本 |
| `scripts/reanalyze.ts` | ~80 | 对已有数据重新分析（不需重跑实验） |
| `scripts/run-ai-judge.ts` | ~180 | AI裁判双盲评估脚本 |

---

> **相关文档**:
> - `docs/KNOWLEDGE_GRAPH_GENERATION.md` — 知识图谱节点与关系生成方法
> - `docs/论文框架-方向二-多智能体协同.md` — 完整论文框架
> - `docs/ARCHITECTURE.md` — 系统架构文档
