# 跨文化学习者画像系统 — 架构差距分析报告

> 分析对象：调研文档《跨文化阐释系统的学习者画像 学习笔记》 vs. 项目 `mutiAgent3.0` 代码库
> 日期：2026-06-11

---

## 1. 现存系统映射（What's Already Implemented）

调研文档覆盖六大理论板块。以下逐项对照当前代码库的实现状态。

### 1.1 知识追踪与认知建模

| 文档理论 | 代码实现 | 位置 |
|---|---|---|
| **贝叶斯知识追踪 (BKT)** — 四参数标准模型 (p-init, p-transit, p-slip, p-guess) | `bayesianKnowledgeTracing()` 实现了三参数版本 (prior, guess=0.25, slip=0.10)，**缺 p-transit** | `multi-agent-system.ts:318` |
| **个性化 BKT** — 将 p-transit 按学生个性化 | **未实现**。当前 BKT 所有参数是全局常量，无 learner-specific 参数 | — |
| **深度知识追踪 (DKT)** — RNN/LSTM/Transformer 高维连续向量 | **未实现**。系统仅有 BKT，无任何深度学习模型 | — |
| **艾宾浩斯遗忘曲线** — R(t)=e^(-t/S)，随时间衰减 | **未实现**。BKT 假定技能一旦掌握永不遗忘；代码中唯一"decay"是 guardrail 管道置信度衰减，与知识遗忘无关 | `guardrail-service.ts:34` |
| **生产延迟与流畅度** — 反应时间作为认知负荷指标 | **未实现**。`learning_records` 表、答题验证函数均不记录或使用反应时间 | — |
| **支架指数 (Scaffolding Index)** — 提示/干预依赖度 | **未实现**。系统不追踪用户请求提示的频率或模式 | — |
| **显性知识→隐性技能转化** — 程序化追踪 | 部分实现。`ability_vector` 的 EWMA 更新反映了技能掌握趋势，但不区分"死记硬背"和"本能反应" | `multi-agent-system.ts:340` |

### 1.2 情感、特质与学习风格

| 文档理论 | 代码实现 | 位置 |
|---|---|---|
| **多模态情感识别** — OpenCV 面部特征 + Librosa 语音压力 | **未实现**。系统无任何传感器/摄像头/麦克风数据采集 | — |
| **大五人格特质 (TIPI)** — 开放性/尽责性/外向性/宜人性/神经质 | **未实现**。学习者画像无任何性格特质字段。`learners` 表无 neuroticism/openness 等列 | — |
| **学习偏好** — Felder-Silverman / VARK 模型 | **未实现**（`learning_style` 字段已在本次迭代中移除，因其从未被使用） | — |
| **认知负荷管理** — 实时难度调整防认知超载 | 部分实现。`emotion-check.ts` 在答题完成后做三级判定 + `difficulty_multiplier`（0.7/1.2），但**不在答题过程中**实时调整 | `emotion-check.ts:248-292` |
| **情感检测** — 挫败/疲劳/脱离/焦虑突增 | **已实现**。纯规则引擎 6 信号 → 3 级 (green/yellow/red)，跨文化话术定制 | `emotion-check.ts:135-295` |

### 1.3 跨文化胜任力与文化智力 (CQ)

| 文档理论 | 代码实现 | 位置 |
|---|---|---|
| **CQ 四维模型** — 认知/元认知/动机/行为 | 部分实现。`cultural_anxiety_score` 映射动机 CQ 的部分维度；`ability_vector[3]`（文化语用）映射行为 CQ 的部分维度；**元认知 CQ 未实现** | `schema.ts:7-25` |
| **KSA 知识-技能-态度模型** | 部分实现。"态度"由 `learning_motivation` 间接体现；"知识"由 BKT mastery 体现；"技能"由 `ability_vector` 体现。三者分散在不同子系统，**未形成统一的 KSA 数据网格** | — |
| **IB 学习者画像十属性** | 仅 `learning_motivation`（5 选 1）是最接近的属性。无探究者/思考者/反思者等维度 | `constants.ts:155-161` |
| **民族相对主义态度** — DMIS 六阶段 | **未实现**。系统无文化敏感性发展阶段的评估 | — |

### 1.4 智能自适应与系统干预

| 文档理论 | 代码实现 | 位置 |
|---|---|---|
| **混合强化学习 (PAL)** — MDP + IRT 先验 + Q-learning | **未实现**。难度调整是固定 multiplier (0.7/1.2)，无 RL 决策 | — |
| **模糊专家控制器** — If-Then 规则库 + 隶属度函数 | **未实现**。当前阈值全是 crisp（≥3题错 = yellow），无模糊/部分隶属 | — |
| **轨迹感知学习分析 (TALA)** — 状态 vs 特质分离 | **未实现**。无性格特质基线，无法区分"暂时走神"和"根本性能力缺陷" | — |
| **开放学习者模型 (OLM)** — 画像可视化 + 协商机制 | 部分实现。首页展示能力雷达图 + 焦虑度标签，但**只读，无协商/挑战机制** | `page.tsx:366-490` |
| **反思循环** — 暂停-预测-反思支架 | **未实现**。无结构化反思提示或关键事件日志 | — |
| **LARD 仪表盘** — 交互回放 + 反思提示器 | **未实现**。学习完成页仅有分数和推荐，无交互回放 | — |

### 1.5 哲学基础

| 文档理论 | 代码实现 | 位置 |
|---|---|---|
| **差异阐释学** — 保留他者陌生性 | 部分体现。A3 `CulturalComparator` 的 prompt 要求"中立性：只陈述客观差异，不评判文化优劣" | `multi-agent-system.ts:883-895` |
| **中道三义** — 价值中立/时间中止/空间中立 | 部分体现。`detectBias()` 检测绝对化表述和西方中心主义 | `multi-agent-system.ts` (BIAS_KEYWORDS) |
| **空间性本体论** | 未显式实现。文化对比内容由 LLM 生成，无结构化空间模型 | — |

### 1.6 总结：实现度热力图

```
BKT 知识追踪        ████████░░  80%  (缺 p-transit、遗忘)
情感检测引擎        ████████░░  85%  (缺实时调整)
能力向量 (EWMA)     ██████████  95%
焦虑度追踪          ████████░░  85%  (缺模糊边界)
推荐引擎            ████████░░  80%  (缺 RL 优化)
学习偏好 (VARK)     ░░░░░░░░░░   0%  (已移除)
人格特质 (TIPI)     ░░░░░░░░░░   0%
遗忘曲线建模        ░░░░░░░░░░   0%
生产延迟追踪        ░░░░░░░░░░   0%
支架指数            ░░░░░░░░░░   0%
模糊控制器          ░░░░░░░░░░   0%
CQ 四维模型         ██░░░░░░░░  20%
OLM 开放模型        ███░░░░░░░  30%
TALA 特质感知       ░░░░░░░░░░   0%
DKT 深度知识追踪    ░░░░░░░░░░   0%
```

---

## 2. 核心架构启发（Architectural Inspirations）

### 2.1 艾宾浩斯遗忘曲线：修复 BKT 的"只记不忘"缺陷

当前 `bayesianKnowledgeTracing()` 的核心假设是"技能一旦掌握就不会遗忘"——这是经典 BKT 的已知局限。文档中的遗忘曲线公式 $R(t) = e^{-t/S}$ 提供了一个精确的数学修正手段。

对"跨文化语义对齐"的意义：跨文化技能（如称谓礼仪、面子协商策略）是**低频使用**的。一个学习者在 HSK 2 级学了"称呼长辈用'您'"，如果后续 10 轮都练的是点餐场景，这项技能的实际掌握度应该随时间衰减。当前系统的 BKT 不会反映这种衰减——它在做推荐时会认为"这个知识点已掌握 (mastery≥0.8)，新颖度=0"，从而不再推荐。但学习者的真实状态可能已经退化到需要复习的程度。

**启发**：引入时间衰减因子 $e^{-\Delta t / S}$，乘以 BKT 后验概率，使推荐引擎能够"打捞"正在遗忘的知识点。

### 2.2 模糊专家控制器：用隶属度替代 Crisp 阈值

当前 `emotion-check.ts` 的阈值全是 crisp：3 题错 = yellow，5 题错 = red。连续 4 题错也是 yellow，但距离 red 仅差 1 题——用户主观感受的差异远小于系统行为的跃变。文档中的 Mamdani 模糊推理模型提供了一条路径：将"挫败感"定义为 0-1 的连续隶属度，而非二值信号。

对"跨文化语义对齐"的意义：文化焦虑不是一个开关，而是一个渐变的光谱。一个日韩文化背景的学习者（高权力距离、高不确定性规避）和一个西班牙文化背景的学习者（低权力距离）面对同样的连续 3 题错，感受到的"挫败"程度完全不同。模糊控制器可以将文化背景作为先验权重系数，调制焦虑隶属度函数的形状。

**启发**：将 `anxiety_spike` 的 ≥15/≥25 二值判定替换为梯形隶属度函数，并用 `cultural_anxiety_score` 基线调制隶属度参数。

### 2.3 TALA（特质感知学习分析）：分离"状态"与"特质"

当前系统将所有用户行为数据视为同质——答对就是掌握，答错就是不会。但文档中的 TALA 框架指出：**同样的行为，对"高神经质"和"低神经质"的学习者含义完全不同**。高神经质学习者在压力下的错误可能是焦虑导致的暂时表现下滑（状态），而非真正的知识缺陷（特质）。

对"跨文化语义对齐"的意义：跨文化学习本身就是高压情境。如果系统不能区分"答错是因为不懂"和"答错是因为紧张"，就会陷入过度干预或错误干预。这正是文档中"差异阐释学"在技术层的体现——系统需要认识到学习者行为的"非良构"属性。

**启发**：引入轻量级特质基线（如 5 题 TIPI 简化问卷），在 `emotion-check.ts` 中使用 `neuroticism` 作为焦虑阈值的调制系数。

### 2.4 支架指数：量化干预依赖，驱动"撤除辅助"

文档指出，真正掌握 = 零支架下的独立表现。当前系统不追踪用户在答题中是否使用了"提示"按钮、是否反复修改答案。如果说 `emotion-check.ts` 回答了"学习者现在什么情绪"，那么支架指数回答的是"学习者到底还需不需要我帮忙"。

对"跨文化语义对齐"的意义：跨文化技能的教学尤其需要"撤除辅助"的时机判断。过早撤除，学习者被文化冲击击溃；过晚撤除，学习者形成对 AI 翻译的依赖，无法建立独立的跨文化直觉。

**启发**：在 `learning_records` 中增加 `scaffold_requests` 字段，在 `ability_vector` 更新时引入支架惩罚系数。

---

## 3. 具体改进与落地建议（Actionable Improvements）

### 优先级排序

| 优先级 | 改进项 | 改动量 | 影响面 | 理论基础 |
|---|---|---|---|---|
| **P0** | BKT 引入遗忘曲线 | ~80行 | 推荐引擎、知识追踪 | 艾宾浩斯遗忘曲线 |
| **P1** | 支架指数追踪 | ~120行 | 能力向量、情感检测 | 最近发展区 / Fading |
| **P2** | 反应延迟记录 | ~40行 | 认知负荷评估、情感检测 | 生产延迟与流畅度 |
| **P3** | 模糊焦虑阈值 | ~150行 | 情感检测、干预策略 | 模糊专家控制器 |
| **P4** | 特质基线（轻量 TIPI） | ~200行 | 全局学习者画像 | TALA |

---

### 建议 1 (P0)：BKT 引入艾宾浩斯时间衰减

**现状**：BKT 更新后的 `mastery` 值写入 L2 `assessment_records` 和 L4 Neo4j `MASTERED` 边后，**永不衰减**。`getRecommendations()` 读取 mastery 时，如果值 ≥0.8（解锁阈值）或 ≥0.6（新颖度阈值），判定是永久的。

**改进**：
1. 为每个 MASTERED 边附加 `last_updated_at` 时间戳
2. 在 `getRecommendations()` 读取 mastery 时，对每个 KP 计算衰减后的有效掌握度：
   - $P_{effective} = P_{stored} \times e^{-\Delta t / S}$
   - $S = 30$ 天（初始记忆强度，随累计正确次数增加）
   - $\Delta t$ = 当前时间 - `last_updated_at`
3. 当 $P_{effective} < 0.4$ 时，推荐引擎给该 KP 额外加分（"需要复习"信号），在 reasons 中添加 `"needs_review"` 标签

**数据结构扩展**：
- `assessment_records` 新增 `bkt_mastery_before_decay` (原有值) 和 `bkt_mastery_after_decay` (衰减后)
- Neo4j `MASTERED` 边新增属性 `last_updated_at` 和 `cumulative_correct`（累计正确次数，用于计算 $S$）

### 建议 2 (P1)：支架指数追踪与"撤除辅助"判定

**现状**：系统完全不追踪用户是否使用了任何辅助手段。前端学习页有"提示"功能（如 cultural_notes），但使用频率不被记录。

**改进**：
1. 在 `practice_result` (L1) 中新增 `scaffold_used` 字段（boolean，每题）
2. 在 `assessment_records` (L2) 中新增 `scaffold_index` 字段（0-1，本轮支架依赖度 = 使用了支架的题数/总题数）
3. 在 `applyAnxietyDelta` 中引入支架惩罚：当 `scaffold_index > 0.5` 时，焦虑度额外 +5（"依赖拐杖→缺乏自信"信号）
4. 在 `ability_vector` 更新中引入支架降权：使用支架答对的题目权重 ×0.5（"有支架的正确 ≠ 真正的掌握"）
5. 在 `getRecentLearningTrend()` 中输出 `scaffold_trend: "increasing" | "stable" | "decreasing"`——当支架使用率连续 3 轮下降，触发"撤除辅助"成功信号

### 建议 3 (P2)：生产延迟（反应时间）记录

**现状**：`validateAnswer()` 只比对答案对错，不记录答题耗时。前端 `handleSubmit` 也无计时逻辑。

**改进**：
1. 前端 `learning/page.tsx` 在每题渲染时记录 `questionShownAt = Date.now()`，提交时计算 `reactionTime = Date.now() - questionShownAt`
2. `practice_result` 新增 `reaction_time_ms` 字段
3. `assessment_records` 新增 `avg_reaction_time_ms` 和 `reaction_time_trend`
4. 在 `emotion-check.ts` 中引入流畅度信号：`avg_reaction_time > 30s` 且正确率 <0.5 → 叠加焦虑信号（"慢+错" = 高认知负荷，比"快+错"更需关注）

### 建议 4 (P3)：模糊焦虑阈值

**现状**：`anxiety_spike` 使用硬阈值 Δ≥15→yellow, Δ≥25→red。这意味着 Δ=14 时完全忽略，Δ=15 时突然触发。

**改进**：
1. 引入梯形隶属度函数替代二值判定：
   - $\mu_{low}(\Delta) = 1.0 \text{ if } \Delta < 10; = (15-\Delta)/5 \text{ if } 10 \leq \Delta < 15; = 0 \text{ otherwise}$
   - $\mu_{yellow}(\Delta) = (\Delta-10)/5 \text{ if } 10 \leq \Delta < 15; = 1.0 \text{ if } 15 \leq \Delta < 20; = (25-\Delta)/5 \text{ if } 20 \leq \Delta < 25; = 0 \text{ otherwise}$
   - $\mu_{red}(\Delta) = 0 \text{ if } \Delta < 20; = (\Delta-20)/5 \text{ if } 20 \leq \Delta < 25; = 1.0 \text{ if } \Delta \geq 25$
2. 对 frustration 信号同样模糊化：`frustration_membership = min(1, max(0, (consecutiveErrors - 2) / 3))`
3. 综合判定使用 `max(defuzzified_yellow, defuzzified_red)` 选择最终 tier

### 建议 5 (P4)：轻量级特质基线（微型 TIPI）

**现状**：学习者画像完全不包含性格特质维度，所有用户的情绪响应被视为同质。

**改进**：
1. `learners` 表新增 `trait_neuroticism` 和 `trait_openness` 两个字段（只取大五人格中与跨文化学习最相关的两个维度）
2. 首次创建 learner 时，前端展示 4 题微型问卷（每题 1-7 分李克特量表）：
   - "我经常感到紧张和焦虑"（神经质）
   - "我很容易感到压力"（神经质）
   - "我对新事物充满好奇"（开放性）
   - "我喜欢尝试不同的文化和体验"（开放性）
3. 在 `emotion-check.ts` 中使用特质调制阈值：
   - 高神经质 (>5)：yellow 焦虑阈值从 15 降至 10（更敏感地捕捉焦虑）
   - 高开放性 (>5)：disengagement 阈值从 8 提高到 10（更不容易觉得无聊）
4. 在 `getRecommendations()` 中，高开放性学习者降低 HSK 邻近度权重（鼓励探索跨级内容），低开放性提高邻近度权重（保守推荐同级内容）

---

## 4. 代码重构/设计草案（Code Blueprint）

以下是 **P0 建议（BKT 引入遗忘曲线）** 的详细代码设计，这是优先级最高、改动量最小、但影响面最广的一项。

### 4.1 新增类型定义（`multi-agent-system.ts` 顶部附近）

```typescript
// ==================== 遗忘曲线建模 ====================

/** 遗忘曲线参数 */
interface ForgettingCurveParams {
  /** 最后一次成功更新的时间戳 */
  last_updated_at: number;          // Unix ms
  /** 累计正确次数（用于计算记忆强度 S） */
  cumulative_correct: number;
  /** 当前时间（注入以方便测试） */
  current_time?: number;
}

/** 
 * 记忆强度 S 的计算：
 * S = 30 + 5 * ln(1 + cumulative_correct)
 * 
 * - 首次掌握: S ≈ 30 天（半衰期约 21 天）
 * - 累计 10 次正确: S ≈ 42 天
 * - 累计 50 次正确: S ≈ 50 天
 */
const BASE_MEMORY_STRENGTH = 30; // 天

/**
 * 计算衰减后的有效掌握概率
 * R(t) = P_stored * exp(-t / S)
 * 
 * 其中 t = 自上次更新以来的天数
 *      S = 记忆强度（天）
 */
export function applyForgettingDecay(
  storedMastery: number,
  params: ForgettingCurveParams,
): number {
  const now = params.current_time ?? Date.now();
  const elapsedDays = (now - params.last_updated_at) / (1000 * 60 * 60 * 24);

  if (elapsedDays <= 0) return storedMastery;

  const S = BASE_MEMORY_STRENGTH + 5 * Math.log(1 + params.cumulative_correct);
  const decayFactor = Math.exp(-elapsedDays / S);
  return storedMastery * decayFactor;
}

/**
 * 计算增强后的记忆强度 S（每次正确练习后调用）
 */
export function computeMemoryStrength(cumulativeCorrect: number): number {
  return BASE_MEMORY_STRENGTH + 5 * Math.log(1 + cumulativeCorrect);
}
```

### 4.2 修改 `bayesianKnowledgeTracing`（`multi-agent-system.ts` 现有行 318 附近）

```typescript
// 原有 BKT 函数签名不变，新增返回值中带 cumulative_correct
export function bayesianKnowledgeTracing(params: {
  prior_probability: number;
  guess_probability?: number;
  slip_probability?: number;
  observed_correct: boolean;
  cumulative_correct?: number;  // 新增
}): { posterior: number; memory_strength?: number } {
  const guess = params.guess_probability ?? 0.25;
  const slip = params.slip_probability ?? 0.10;
  const prior = params.prior_probability;

  let posterior: number;
  if (params.observed_correct) {
    const num = (1 - slip) * prior;
    const den = num + guess * (1 - prior);
    posterior = num / den;
  } else {
    const num = slip * prior;
    const den = num + (1 - guess) * (1 - prior);
    posterior = num / den;
  }

  return {
    posterior,
    memory_strength: params.cumulative_correct !== undefined
      ? computeMemoryStrength(params.cumulative_correct)
      : undefined,
  };
}
```

### 4.3 `getRecommendations` 中的 mastery 读取修改（`learner-graph.ts`）

```typescript
// 原来直接读 masteryMap.get(kpId)，改为先衰减再使用
function getEffectiveMastery(
  kpId: string,
  masteryMap: Map<string, { score: number; last_updated_at: number; cumulative_correct: number }>,
): number {
  const entry = masteryMap.get(kpId);
  if (!entry) return 0;

  return applyForgettingDecay(entry.score, {
    last_updated_at: entry.last_updated_at,
    cumulative_correct: entry.cumulative_correct,
  });
}
```

`is_unlocked` 判定改为使用衰减后的 mastery：
```typescript
const effectiveMastery = getEffectiveMastery(pid, masteryMapWithMeta);
const allPrereqsMastered = prereq_ids.every(pid => effectiveMastery >= 0.8);
```

新颖度因子改为：
```typescript
const effectiveMastery = getEffectiveMastery(c.kp_id, masteryMapWithMeta);
const isForgotten = effectiveMastery < 0.4 && (masteryMapWithMeta.get(c.kp_id)?.score ?? 0) >= 0.6;
const novelty = isMastered && !isForgotten ? 0 : 1.0;
if (isForgotten) reasons.push('needs_review');  // "遗忘复习"理由
```

### 4.4 Results Pipeline 中的 Neo4j 写入修改（`results/route.ts` STEP 4 附近）

```typescript
// 原来只写 score，现在附加遗忘曲线所需的元数据
await recordMastery(learner_id, knowledge_point_id, {
  score: bktResult.posterior,
  last_updated_at: Date.now(),
  cumulative_correct: previousCumulativeCorrect + (observed_correct ? 1 : 0),
});
```

### 4.5 测试用例（`edge-cases.test.ts` 追加）

```typescript
describe('遗忘曲线衰减', () => {
  it('掌握度 0.9，30天后：~0.33 (半衰)', () => {
    const r = applyForgettingDecay(0.9, {
      last_updated_at: Date.now() - 30 * 86400000,
      cumulative_correct: 0,
    });
    expect(r).toBeCloseTo(0.9 * Math.exp(-1), 2);
  });

  it('掌握度 0.9，累计 10 次正确，30天后衰减更慢：~0.44', () => {
    const S = computeMemoryStrength(10);
    const expected = 0.9 * Math.exp(-30 / S);
    const r = applyForgettingDecay(0.9, {
      last_updated_at: Date.now() - 30 * 86400000,
      cumulative_correct: 10,
    });
    expect(r).toBeCloseTo(expected, 2);
  });

  it('0 天过去不衰减', () => {
    const r = applyForgettingDecay(0.8, {
      last_updated_at: Date.now(),
      cumulative_correct: 0,
    });
    expect(r).toBe(0.8);
  });

  it('遗忘后 mastery < 0.4 触发 needs_review', () => {
    const r = applyForgettingDecay(0.7, {
      last_updated_at: Date.now() - 60 * 86400000, // 60天
      cumulative_correct: 1,
    });
    expect(r).toBeLessThan(0.4);
  });
});
```

### 4.6 改动量估算

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `multi-agent-system.ts` | ~40 行 | 遗忘曲线函数 + BKT 返回值扩展 |
| `learner-graph.ts` | ~30 行 | mastery 衰减读取 + needs_review 理由 |
| `results/route.ts` | ~10 行 | Neo4j 写入增加元数据 |
| Neo4j Cypher | 1 条 MERGE 更新 | MASTERED 边新增 2 个属性 |
| `edge-cases.test.ts` | ~30 行 | 遗忘曲线测试 |

**总计：约 110 行代码改动，无破坏性变更。** 所有现有 BKT 调用者的 `observed_correct` 参数不变，仅返回值从 `number` 变为 `{ posterior, memory_strength? }`，需在调用处做一次解构适配。

---

## 附录：与论文框架的理论映射

| 论文章节 | mutiAgent3.0 对应模块 | 差距 |
|---|---|---|
| §1 空间性与中道三义 | A3 prompt 约束 + detectBias() | 无空间性本体论建模 |
| §2 王国维互证法 | A2 母语阐释 + A3 文化对比 | 缺"外来观念←→固有材料"的双向追踪 |
| §3 符号学文化观 | Scene→Domain→CulturalDimension 图谱 | 缺符号歧义建模 |
| §4 伽达默尔视域融合 | （被有意拒绝） | N/A |
| §5 差异阐释学 | 文化对比内容生成 | 缺"保留陌生性"的量化指标 |
| §6 BKT/DKT | bayesianKnowledgeTracing() | 缺 DKT、遗忘、个性化参数 |
| §7 CQ 四维模型 | anxiety + ability_vector + motivation | 缺元认知 CQ 和行为 CQ 的系统评估 |
| §8 情感识别 | emotion-check.ts | 缺多模态传感器数据 |
| §9 TALA | 无 | 缺特质基线 |
| §10 OLM | 首页画像卡片（只读） | 缺协商/挑战机制 |
| §11 PAL 混合 RL | 固定 difficulty_multiplier | 缺 RL 决策引擎 |
| §12 模糊控制器 | crisp 阈值 | 缺隶属度函数 |
