# CIEval Benchmark 实施计划

> 严格参照 `docs/CIEVAL_BENCHMARK_DESIGN.md`
> 预计总工期：3-4周（含人类专家协调时间）

---

## 阶段总览

```
Phase 1: 数据集构建        ████████░░  4天
Phase 2: Auto-Eval 引擎    ██████░░░░  3天
Phase 3: 模型输出生成       ████░░░░░░  2天（自动跑，人在等）
Phase 4: 正式评测           ████████░░  4天
Phase 5: 分歧处理 & 报告    ████░░░░░░  2天
```

---

## Phase 1: 数据集构建（4天）

### 1.1 从 KG 抽取 CIEval 样本

**文件**: `scripts/build_cieval_dataset.py`

```
输入: Neo4j 知识图谱
输出: experiment_results/cieval/
        ├─ train.json     (200条)
        ├─ dev.json       (100条)
        ├─ test.json      (300条)
        └─ challenge.json  (50条)

抽样策略:
  1. 从14个Domain各选2个Scene → 28个Scene
  2. 每Scene选1-2个KP（优先cultural_complexity覆盖1-5的）→ 50个KP
  3. 每KP × 3种母语圈(近/中/远各1) × 2个HSK等级 × 2个焦虑度 = 12条
     - 近: 日语/韩语中随机选1
     - 中: 英语/西班牙语中随机选1
     - 远: 阿拉伯语/俄语中随机选1
  4. 50 × 12 = 600条
  5. 随机打乱后按比例划分:
     - Train: 40% = 240 → 取200
     - Dev: 16% = 96 → 取100
     - Test: 44% = 264 → 取300（含50条challenge）
```

**每条数据包含**（按 CIEval 文档第 2.4 节的 JSON schema）:

```json
{
  "cieval_id": "CIEval-0001",
  "split": "test",
  "input": {
    "knowledge_point": { "id", "domain", "scene", "pragmatic_intent", "hsk_level", "cultural_complexity", "high_context" },
    "learner_profile": { "home_culture", "home_culture_code", "hsk_level", "anxiety_score", "motivation" },
    "kg_data": { "cultural_dimensions": [...], "manifestation": {...} }
  },
  "gold_reference": {
    "key_concept_mapping": "...",
    "cultural_dimension_to_use": [...],
    "expected_chinese_vocab": [...],
    "avoid_expressions": [...]
  },
  "task": "生成一份面向{母语文化}HSK{等级}学习者的学习内容..."
}
```

### 1.2 验证数据集

```bash
# 验证脚本
python3 scripts/validate_cieval_dataset.py

检查项:
  ☐ 每个 cieval_id 唯一
  ☐ 每个 split 的样本数符合预期
  ☐ KG 数据完整性（cultural_dimensions 非空、manifestation 非空）
  ☐ 母语圈 × HSK × 焦虑度组合矩阵的覆盖率
  ☐ gold_reference 字段完整性
  ☐ Challenge Set 文化距离 ≥ 均值+1σ
```

---

## Phase 2: Auto-Eval 引擎（3天）

### 2.1 Judge Prompt 实现

**文件**: `src/lib/cieval-judge.ts`

```
实现 CIEval 文档第 3.2-3.5 节的完整 Rubric:

  evaluateDimensionA(content, kg_dimensions, hsk_level) → {rationale, score, detected_dimension}
    两步评测: 框架识别 → 契合度评分 → 学术黑话检查

  evaluateDimensionB(content) → {rationale, score, btr, suspicious_sentences, stage2_classifications}
    两级过滤: 正则粗筛 → LLM精确分类 → BTR计算

  evaluateDimensionC(content, anxiety_score, slot_structure) → {rationale, score, sub_C1, sub_C2, sub_C3}
    C1: Slot级Token统计 | C2: Scaffolding质量 | C3: 过渡衔接自然度

  evaluateDimensionD(content, hsk_level) → {rationale, score, sub_D1, sub_D2, sub_D3}
    D1: Jieba分词→HSK词表验证 | D2: 逆向表达题比例 | D3: 题型多样性

  computeCIEvalScore(dimA,B,C,D) → {cieval_score, dimension_scores}

强制 CoT 输出顺序: rationale → rubric_evidence → score
```

### 2.2 Judge 模型配置

```
Auto-Eval Judge: GPT-4o（或 Qwen-Max）
Meta-Judge: Claude（不同模型家族）
Calibration: Dev 集 20 个样本 + few-shot 锚定样本
```

### 2.3 Calibration 脚本

**文件**: `scripts/cieval_calibrate.py`

```
功能:
  1. 加载 Dev 集 + 预标注的锚定样本（满分/3分/1分各2个）
  2. 跑 Judge → 与锚定样本对比 → MAE < 1.0 才通过
  3. 识别系统性偏差模式并输出修复建议
```

---

## Phase 3: 模型输出生成（2天，自动化）

### 3.1 生成待评测内容

**文件**: `scripts/cieval_generate.py`

```
用你的系统（Doubao DeepSeek + KG）对 Test 集 300 个样本生成 E:

  对每个 CIEval 样本:
    输入 → processLearningRequestWithLangGraph()
    输出 → E = (cultural_explanation, cross_cultural_comparison, learning_content)
  
  保存: test_outputs/cieval_{model_name}/
          ├─ CIEval-0001.json
          ├─ CIEval-0002.json
          └─ ...

基线模型（至少跑2个做对比):
  ① 本文系统 (Full): A1→A2+A3→A4→A5+KG
  ② NoKG: 同架构但不查Neo4j
  ③ 可选: GPT-4o base (纯LLM, 无Agent无KG)
```

---

## Phase 4: 正式评测（4天）

### 4.1 Auto-Eval 全量跑

```bash
npx tsx scripts/cieval_autoeval.ts --split test --model full

# 对每个样本:
#   1. 加载 model_output
#   2. 调用 cieval-judge 的四个维度评分
#   3. 输出: autoeval_results/{model_name}/autoeval_full.json
```

### 4.2 Human-Eval 准备

```
专家招募 & 资格认定:

  Round 1 — 背景问卷（10分钟/人）
  Round 2 — 锚定样本评测（30分钟/人，5个样本，MAE < 1.0 通过）
  Round 3 — Calibration（60分钟，3人，评10个Dev样本，α ≥ 0.75 通过）

评分工具:
  在线评分表（Google Forms 或自定义Web页面）
  每个样本显示: BLIND_ID | 学习者背景 | 生成的E（隐去模型名）
  评分项: A(1-5) | B(1-5，附Stage2判定) | C(1-5) | D(1-5) | 备注
```

### 4.3 Human-Eval 执行

```
样本: 从 Test 集抽取200个（确保覆盖8文化圈×3HSK）
专家: 3位通过资格认定的评审
盲评: 不知道模型/条件
预计每人耗时: 4-5小时
```

---

## Phase 5: 分歧处理 & 报告（2天）

### 5.1 三级仲裁执行

```
1. 计算 Δ = |Auto − Human|，按等级分流

2. Δ=1（轻度）→ 自动取平均

3. Δ=2（中度）→ Meta-Judge 仲裁
   - 调用 Claude（与GPT-4o Judge不同模型家族）
   - 输出 {final_score, preference, rationale}
   - confidence ≥ 0.8 → 采用
   - 否则升级为严重分歧

4. Δ≥3（严重）→ 人类首席仲裁员
   - 你本人或导师担任
   - 阅读三方材料 → 判定最终评分 → 记录分歧根因
```

### 5.2 报告生成

```
输出文件:
  cieval_results/
    ├─ autoeval_full.json          Auto-Eval 全量评分
    ├─ humaneval_full.json          Human-Eval 全量评分
    ├─ disagreement_analysis.json   分歧分析
    ├─ leaderboard.json             Leaderboard
    └─ report.md                    Markdown 报告

报告内容:
  1. CIEval Score Leaderboard
  2. 四维度分项对比表
  3. Auto vs Human 一致性（Spearman ρ + Krippendorff α）
  4. 分歧矩阵（按维度×等级×文化圈）
  5. 严重分歧案例分析（3-5个代表性案例）
  6. Limitations（LLM-as-Judge的盲区、文化覆盖局限）
```

---

## 文件清单

| 文件 | 用途 | Phase |
|------|------|-------|
| `scripts/build_cieval_dataset.py` | 从KG抽取+构造600个CIEval样本 | 1 |
| `scripts/validate_cieval_dataset.py` | 验证数据集质量 | 1 |
| `experiment_results/cieval/*.json` | 数据集文件（train/dev/test/challenge） | 1 |
| `src/lib/cieval-judge.ts` | Auto-Eval Judge（CoT + A-D Rubric） | 2 |
| `scripts/cieval_calibrate.py` | Judge + Human 校准脚本 | 2 |
| `scripts/cieval_generate.py` | 用系统跑300条待评测内容 | 3 |
| `scripts/cieval_autoeval.ts` | Auto-Eval 批量评分 | 4 |
| `scripts/cieval_arbitrate.ts` | 三级仲裁引擎 | 5 |
| `scripts/cieval_report.py` | 报告生成 | 5 |

---

## 里程碑检查点

| # | 检查点 | 验证标准 |
|---|--------|---------|
| 1 | 数据集生成 | 600条，split分布符合预期，KG数据无空值 |
| 2 | Auto-Eval Calibration | Judge MAE < 1.0 on anchor samples |
| 3 | 模型输出生成 | 300条输出全部成功，无LLM超时 |
| 4 | Auto-Eval 完成 | 300条 × 4维度评分完成 |
| 5 | Human-Eval 完成 | α ≥ 0.75, 200条评分完成 |
| 6 | 一致性验证 | Spearman ρ ≥ 0.7 (excluding Δ≥3) |
| 7 | 报告生成 | Leaderboard + 分歧分析 + 案例 |

---

## 风险预案

| 风险 | 概率 | 应对 |
|------|------|------|
| Neo4j KG 数据不完整（某些KP无MANIFESTED_IN） | 中 | 跳过该KP，从备选池补充 |
| GPT-4o API 限流导致 Auto-Eval 跑不完 | 中 | 降低并发，增加重试间隔 |
| 找不到3位合格的人类专家 | 中 | 降级方案：2位专家 + 你本人作为第3评审（论文中声明） |
| Auto-Human Spearman ρ < 0.5 | 低 | 回到 Calibration 阶段重新对齐 Rubric |
| KG 一致性（维度A）的 Auto-Eval 不稳定 | 中 | 维度A降为"仅Human-Eval"，Auto-Eval只跑B/C/D |
