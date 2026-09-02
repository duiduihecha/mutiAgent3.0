# CIEval 完善计划（除 Human-Eval 外）

> 状态：待执行 | 预计工期：1-2周

---

## 总览

当前 CIEval 骨架完整（600 数据集 + Judge 引擎 + 消融实验验证），以下 6 个模块需要补全：

```
Phase 1: 自动指标补全     ████░░  2天  C1 + D1 + B Stage2
Phase 2: Auto-Eval 批量   ██░░░░  1天  对 Test 集 250 条全量跑
Phase 3: Leaderboard      ███░░░  2天  多模型对比 + Challenge Set
Phase 4: 一致性验证       ██░░░░  1天  双裁判一致性分析
```

---

## Phase 1: 自动指标补全（2天）

当前 C1、D1 是占位值，B 只有 Stage1 粗筛。全部修掉。

### 1.1 C1 母语占比（读 slot 结构）

**问题**：当前 `evaluateDimensionC` 的 C1 永远 `true`，因为 θ₃ 落地前没有 slot 数据。现在 A2 输出带 `_slot_mode: true` 标记，可以验证了。

**修改点**：`src/lib/cieval-judge.ts` → `evaluateDimensionC()`

```
逻辑:
  1. 检查 output 是否包含 _assembled_text 或 _slot_mode 标记
  2. 如果有 slot 模式：提取各 slot 的 lang 字段 → 统计 native_count vs chinese_count
  3. 对比目标比例：|actual − target| ≤ 0.15 → C1 passed
  4. 如果无 slot 标记（旧数据/单体LLM）：C1 = 默认通过（不扣分）
```

### 1.2 D1 HSK 词表合规率（Jieba 分词 + Neo4j）

**问题**：当前 D1 返回 0.85 占位值，需要真正分词验证。

**修改点**：`src/lib/cieval-judge.ts` → `evaluateDimensionD()`

```
逻辑:
  1. 安装 jieba 分词库: npm install nodejieba
  2. 对 exercises 中的中文文本分词
  3. 过滤停用词（的/了/是/在/...）
  4. 逐词查 Neo4j HSKWord 节点
  5. 计算合规率 = 在纲词 / 总词
  6. Neo4j 不可用时降级为 0.80（保守估计）
```

### 1.3 B Stage2 LLM 精确分类

**问题**：当前 B 只做 Stage1 正则粗筛——没命中就 5 分。应该对有疑似句的样本调用 LLM 做二分类（宣扬偏见 vs 客观描述）。

**修改点**：`src/lib/cieval-judge.ts` → `evaluateDimensionB()`

```
逻辑:
  1. Stage1 正则粗筛（已实现）
  2. 如果无触发 → BTR=0 → 5分（不变）
  3. 如果有触发 → 调 LLM 做精确分类（当前跳过）
     - 把疑似句 + 上下文发给 Judge LLM
     - 问 "这是在宣扬偏见(A)还是客观描述(B)？"
     - 只计入判定为 A 的句子
```

---

## Phase 2: Auto-Eval 批量脚本（1天）

### 2.1 `scripts/cieval_autoeval.ts`

```
功能:
  1. 加载 Test 集 250 条样本
  2. 对每条样本:
     a. 调系统生成 E（用 C1_Full 流水线，或读取已有 output）
     b. 调 CIEvalJudge.evaluate() 评分
     c. 结果写 JSONL
  3. 跑完后汇总：
     - 四维度均分
     - 按文化圈分组对比
     - 输出 Markdown 表格
```

**如果 Test 集已有输出（Step1 生成过的），则只跑评测**。

---

## Phase 3: Leaderboard（2天）

### 3.1 加基线模型

不用外部 API。用你自己的系统跑几个变体当基线：

| 模型 | 生成方式 | 预计 CIEval |
|------|---------|------------|
| **本文系统 (Full)** | C1_Full + θ₃ slot | 16.3（已知） |
| **本文系统 (NoKG)** | 关停 Neo4j 查询 | ? |
| **本文系统 (Monolith)** | C2 单体 LLM | 11.9（已知） |
| **GPT-4o (Monolith)** | OpenAI API 单体 | ?（如果 API 能通） |

### 3.2 Challenge Set 专项分析

```
功能:
  1. 加载 Challenge Set 50 条
  2. 用 C1_Full 生成
  3. CIEval 评测
  4. 分析: 文化距离 vs 各维度得分的相关性
  5. 输出论文表2（文化公平性分析）
```

---

## Phase 4: 一致性验证（1天）

### 4.1 双裁判一致性

不用 Human-Eval，而是用 **两个不同的 Judge 模型** 互相验证：

```
方案:
  1. 用 Test 集 50 条
  2. Judge A: MiniMax (当前裁判)
  3. Judge B: DeepSeek (替代裁判)
  4. 计算 Spearman ρ(A, B) + Krippendorff α(A, B)
  5. 如果 ρ > 0.7: 说明 CIEval Judge 对不同裁判模型稳健
```

**这是 Human-Eval 的低成本替代方案**——证明 CIEval 的 Judge 不在特定模型上过拟合。

---

## 执行顺序

```
Phase 1:   C1修掉 → D1修掉 → B Stage2修掉     （2天）
Phase 2:   Auto-Eval 批量跑 Test 250条           （1天，自动跑）
Phase 3:   多模型生成 + Challenge + Leaderboard   （2天）
Phase 4:   双裁判一致性                           （1天）
```

---

## 文件清单

| 文件 | Phase | 用途 |
|------|-------|------|
| `src/lib/cieval-judge.ts` | 1 | 修改 evaluateDimensionC/D/B |
| `package.json` | 1 | 添加 nodejieba 依赖 |
| `scripts/cieval_autoeval.ts` | 2 | Auto-Eval 批量脚本 |
| `scripts/cieval_leaderboard.ts` | 3 | Leaderboard 生成 |
| `scripts/cieval_challenge.ts` | 3 | Challenge Set 分析 |
| `scripts/cieval_consistency.ts` | 4 | 双裁判一致性 |

---

> **相关文档**:
> - `docs/CIEVAL_BENCHMARK_DESIGN.md` — CIEval 完整设计
> - `docs/EVALUATION_FRAMEWORK.md` — 评估框架
> - `docs/汇报-导师-2026-07-15.md` — 导师汇报稿
