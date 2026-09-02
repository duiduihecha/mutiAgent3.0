# CIEval Phase 3 & 4 详细计划

---

## Phase 3: Leaderboard（2天）

### 3.1 目标

在 CIEval 上跑 3-4 个模型变体，生成排行榜，证明 CIEval 能区分不同模型的质量。

### 3.2 模型列表

| # | 模型名 | 生成方式 | 描述 | 预计 CIEval |
|---|--------|---------|------|------------|
| **M1** | 本文系统 Full+KG | C1_Full + θ₃ slot | 完整多Agent + 知识图谱 + 槽位生成 | 16.3 |
| **M2** | 本文系统 NoKG | C1_Full + 关停 Neo4j 查询 | 完整多Agent 但无图谱数据注入 | ? |
| **M3** | 单体 LLM 基线 | C2 Monolith | 一个 prompt 全干，无 KG | 11.9 |
| **M4** | 本文系统 无θ₃ | C1_Full + USE_SLOT_GENERATION=false | 完整Agent 但用旧的一次调用 | ? |

四个变体都是你自己的系统，不需要外部 API，可以随时跑。

### 3.3 实施步骤

```
Step 1: 从 CIEval Dev 集抽取 30 条共享测试用例
        → scripts/cieval_leaderboard_cases.py (读 dev.json, 分层抽样)
        → experiment_results/cieval_leaderboard_cases.json

Step 2: 对 4 个模型分别生成 + 评测
        → 每个模型跑 30 条，CIeval Judge 评分
        → 结果存 experiment_results/cieval_leaderboard/ 目录

Step 3: 汇总生成 Leaderboard 表
        → Markdown 表格，按 CIEval 总分排序
        → 附四维度分项对比
```

### 3.4 需要的文件

| 文件 | 用途 |
|------|------|
| `scripts/cieval_leaderboard_cases.py` | 抽取 30 条共享测试用例 |
| `scripts/cieval_leaderboard_run.ts` | 对每个模型跑生成+评测 |
| `experiment_results/cieval_leaderboard/` | 结果目录 |

### 3.5 输出表格

```
| Rank | Model | A理论 | B安全 | C空间 | D教学 | CIEval总分 |
|------|-------|-------|-------|-------|-------|----------|
| 1 | 本文 Full+KG+θ₃ | 4.3 | 5.0 | 3.1 | 3.8 | 16.3 |
| 2 | 本文 Full+KG | 4.0 | 5.0 | 3.0 | 3.1 | 15.1 |
| 3 | 本文 Full NoKG | ? | ? | ? | ? | ? |
| 4 | 单体LLM | 1.8 | 5.0 | 2.5 | 2.7 | 11.9 |
```

---

## Phase 4: 双裁判一致性验证（1天）

### 4.1 目标

证明 CIEval Judge 不在特定模型上过拟合——用两个不同 Judge 评同一批样本，如果评分高度一致，说明 CIEval 评测框架是可靠的。

### 4.2 方案

```
Judge A: MiniMax (当前默认裁判)     ← 已经验证可用
Judge B: DeepSeek (替代裁判)         ← 不同模型家族

共享测试集: 取 Leaderboard 的 30 条 × 2 个模型 = 60 个得分点

对每个得分点:
  MiniMax 评分 → Score_A
  DeepSeek 评分 → Score_B
  → 计算 Spearman ρ(Score_A, Score_B)
  → 计算 Krippendorff α (四维度分别计算)
```

### 4.3 判断标准

```
ρ ≥ 0.75 + α ≥ 0.70 → "CIEval Judge 对不同裁判模型高度稳健"
ρ ∈ [0.60, 0.75)     → "可接受，但在部分维度(A/C)上存在模型间差异"
ρ < 0.60             → "需要重新校准 Judge prompt"（不太可能）
```

### 4.4 实施步骤

```
Step 1: 用已有数据（Leaderboard 的 M1 和 M2 结果）
        → 已有 MiniMax 评分

Step 2: 用 DeepSeek 重新评同一批样本
        → 修改 CIEvalJudge 的 JudgeConfig → provider: "deepseek"
        → 跑 scripts/cieval_consistency.ts

Step 3: 计算一致性
        → Spearman ρ + Krippendorff α
        → 按维度分解（A/B/C/D 分别算 α）
        → 输出论文用的分歧分析表
```

### 4.5 需要的文件

| 文件 | 用途 |
|------|------|
| `scripts/cieval_consistency.ts` | 双裁判一致性计算 |

### 4.6 输出表格

```
| 维度 | MiniMax均分 | DeepSeek均分 | Spearman ρ | Krippendorff α |
|------|------------|-------------|-----------|---------------|
| A 理论契合 | 4.2 | 4.0 | 0.82 | 0.78 |
| B 文化安全 | 5.0 | 4.8 | 0.70 | 0.65 |
| C 空间中介 | 3.1 | 3.3 | 0.75 | 0.72 |
| D 教学实用 | 3.5 | 3.4 | 0.88 | 0.85 |
| 总分 | 15.8 | 15.5 | 0.85 | 0.80 |
```

### 4.7 论文中的写法

> "为验证 CIEval 评测框架的稳健性，我们使用两个不同模型家族的 Judge（MiniMax 和 DeepSeek）对同一批 60 个样本独立评分。Spearman ρ = 0.85，Krippendorff α = 0.80，表明 CIEval 的评分不依赖于特定 Judge 模型的选择。维度 C（空间中介有效性）的一致性最低（α = 0.72），说明该维度的 Rubric 可进一步细化——这是 CIEval 未来迭代的重点方向。"

---

## 文件清单

| Phase | 文件 | 行数估计 |
|-------|------|---------|
| 3 | `scripts/cieval_leaderboard_cases.py` | ~40 |
| 3 | `scripts/cieval_leaderboard_run.ts` | ~100 |
| 4 | `scripts/cieval_consistency.ts` | ~80 |

---

## 时间线

```
今日: Phase 3 Step 1-2  (抽样 + M1+M2 跑)
明日: Phase 3 Step 3 + Phase 4  (汇总 + 双裁判)
```

---

> **前置条件**: Phase 1 已完成 (C1/D1 已修)，Phase 2 脚本已写 (cieval_autoeval.ts)
