# 学习者画像与动态个性化机制

## 1. 画像结构总览

### 1.1 七维画像模型

系统以`learners`表存储学习者的多维画像，涵盖静态属性与动态状态两类信息：

| 维度 | 字段 | 类型 | 值域 | 更新频率 | 分类 |
|------|------|------|------|----------|------|
| 母语文化圈 | `native_language` | string | 8种（zh/en/ja/ko/th/ar/es/fr） | 注册时设定 | 静态 |
| HSK等级 | `hsk_level` | number | 1-9 | 升降级时变更 | 准静态 |
| 学习风格 | `learning_style` | string | visual/auditory/kinesthetic | 注册时设定 | 静态 |
| 学习动机 | `learning_motivation` | string | tourism/study/work/interest/exam | 注册时设定 | 静态 |
| 文化焦虑度 | `cultural_anxiety_score` | number | [0, 100] | 每轮学习后更新 | 动态核心 |
| 能力向量 | `ability_vector` | number[] | 5维，各维[0, 100] | 每轮学习后更新 | 动态 |
| L2短期趋势 | 从`assessment_records`实时聚合 | 结构体 | 4项指标 | 每次请求时计算 | 瞬时 |

画像按**时间稳定性**分为三层：
- **L_static**（母语、风格、动机）：注册时确定，几乎不变
- **L_quasi_static**（HSK等级）：仅在显著能力变化时变更
- **L_dynamic**（焦虑度、能力向量、L2趋势）：每轮学习后可能变化

### 1.2 画像的读写分离

系统对画像数据严格执行读写分离：

- **写入路径唯一**：所有动态画像更新仅通过`POST /api/learning/results`（结果提交API）执行
- **读取路径唯一**：所有Agent仅通过`SELECT FROM learners WHERE id=?`读取画像快照
- **禁止Agent写画像**：A1-A5中没有任何Agent具备写数据库的能力

该设计确保了画像更新的因果一致性——学习者的表现（原因）通过results API转化为画像更新（结果），Agent仅消费画像而不修改它。

## 2. 文化焦虑度：核心动态变量

### 2.1 设计原则

文化焦虑度是贯穿系统所有Agent的核心自适应变量，遵循三条严格原则：

**单一写入源原则**：焦虑度的数值更新仅发生在`applyAnxietyDelta()`函数中，该函数仅在results API中被调用。全系统中不存在第二条焦虑度写入路径。

**单一读取源原则**：A1 Agent的焦虑度仅从数据库`learners.cultural_anxiety_score`字段读取，不从任何行为指标（错误率、答题时长、放弃率）独立计算。`aggregateLearnerMetrics()`函数虽然存在于代码中，但仅用于日志记录，不参与焦虑度决策。

**增量更新原则**：每次更新基于前值加增量（$new = old + \Delta$），不是重新赋值。这确保了焦虑度的时序连续性。

### 2.2 增量公式

$$\Delta = (0.5 - r) \times 20$$

其中$r$为本轮学习的正确率（$r \in [0, 1]$）。该公式具有以下数学性质：
- 对称性：$r=0.5$为均衡点（$\Delta=0$），正确率高于0.5降低焦虑，低于0.5增加焦虑
- 有界性：$\Delta \in [-10, +10]$，单轮最大变化为±10分
- 线性响应：对正确率变化的响应强度恒定（斜率=-20）

应用函数实施硬边界约束：
$$anxiety_{new} = \text{clamp}(anxiety_{old} + \Delta, 0, 100)$$

### 2.3 焦虑度的离散化传导

A1 Agent将连续焦虑度分数映射为离散等级，并进一步计算母语占比：

| 焦虑分数 | 离散等级 | 母语占比 | 中文占比 | A2/A4行为 |
|----------|----------|----------|----------|-----------|
| $\geq 80$ | high | 0.75 | 0.25 | 母语为主，最大化理解 |
| $[40, 80)$ | medium | 0.50 | 0.50 | 双语均衡，渐进引入 |
| $< 40$ | low | 0.25 | 0.75 | 中文为主，沉浸式学习 |

母语占比通过A4 prompt中的`native_ratio`参数控制`cultural_context`文本段中母语与中文的比例，实现基于焦虑水平的自适应语言切换。

### 2.4 焦虑度更新闭环

```
学习者答题 → results API 计算正确率 r
    → calculateAnxietyDelta(r) → Δ = (0.5-r)×20
    → applyAnxietyDelta(old, r) → new = clamp(old+Δ, 0, 100)
    → UPDATE learners SET cultural_anxiety_score = new
    → 下次请求时 A1 读取 new → 映射等级+母语占比
    → A2/A3/A4 据此调节生成策略
```

## 3. 能力向量与BKT

### 3.1 五维能力空间

$\vec{v} = [v_{grammar}, v_{listening}, v_{speaking}, v_{cultural\_pragmatic}, v_{reading}]$

各维度值域$[0, 100]$，初始值均为50（表示未知状态）。能力向量记录学习者在五个核心维度上的相对水平，用于驱动A4的针对性出题策略。

### 3.2 EWMA更新算法

能力向量采用指数加权移动平均（EWMA）更新：

$$v_{new}[i] = \alpha \cdot s_{new}[i] + (1 - \alpha) \cdot v_{old}[i]$$

其中$\alpha = 0.7$，$s_{new}[i]$为本轮维度$i$的加权正确率（$\in [0, 100]$）。

$\alpha = 0.7$的设计考量：新数据占70%权重使向量对近期表现高度敏感（响应灵敏），同时30%的历史积累防止单次异常表现导致向量剧烈波动（抗噪声）。该平衡点使能力向量具有约3轮的"有效记忆窗口"——3轮前的表现对当前向量的贡献衰减至$(1-0.7)^3 = 2.7\%$。

### 3.3 BKT知识追踪

贝叶斯知识追踪（Bayesian Knowledge Tracing）用于精细化评估单个知识点的掌握概率：

$$P(L_n | \text{correct}) = \frac{P(S) \cdot P(L_n)}{P(S) \cdot P(L_n) + P(G) \cdot (1 - P(L_n))}$$

$$P(L_n | \text{incorrect}) = \frac{(1-P(S)) \cdot P(L_n)}{(1-P(S)) \cdot P(L_n) + (1-P(G)) \cdot (1 - P(L_n))}$$

参数设置：$P(G) = 0.25$（猜测概率，选择题基准），$P(S) = 0.10$（失误概率）。BKT输出的`bkt_mastery`值存入`assessment_records.bkt_mastery`字段，为后续的知识点推荐和复习间隔计算提供概率依据。

### 3.4 能力向量与BKT的协同

能力向量提供**宏观维度视图**——五个维度的相对强弱；BKT提供**微观知识点视图**——单个知识点的掌握概率。两者在L2层存储中共存，服务于不同粒度的自适应决策：

- 能力向量 → A4弱项维度占比调节（宏观策略）
- BKT mastery → 知识点推荐优先级（微观选择）

## 4. L2短期记忆趋势

### 4.1 数据源与窗口

`getRecentLearningTrend(learnerId, windowSize=5)`从`assessment_records`表聚合最近5轮评估记录，提取4项趋势指标。窗口大小N=5的选择基于短期记忆研究——足够捕获近期趋势，又不至于被远期历史稀释。

### 4.2 四项趋势指标

**弱项维度（weak_dimensions）**：从`dimension_scores`中提取正确率低于40%的维度标签。阈值40%意味着学习者在该维度上错误多于正确，表明系统性薄弱。

**准确率趋势（accuracy_trend）**：将最近N轮分为前半段和后半段，计算均分差。差值>5为"improving"，<-5为"declining"，区间内为"stable"。阈值5分避免了随机波动被误判为趋势。

**重复错误模式（repeated_error_patterns）**：统计所有`error_patterns`数组中出现≥2次的错误类型。重复出现的错误模式提示系统性认知偏差，需要靶向干预。

**重复场景（repeated_scenes）**：统计`scene_type`字段中出现≥2次的场景。重复场景表明学习者可能处于学习瓶颈或场景疲劳状态。

### 4.3 趋势注入策略

L2趋势以结构化自然语言注入A4的`<adaptive_guidance>`块：

```xml
<adaptive_guidance>
  弱项维度: [cultural_pragmatic, grammar]
  准确率趋势: declining
  重复错误模式: ["声调标注错误", "量词误用"]
  重复场景: ["food"]
</adaptive_guidance>
```

A4的prompt中包含趋势解读规则：
- 弱项维度 → 题目占比提高至40%+
- declining趋势 → 降低整体难度
- improving趋势 → 适度提升难度
- 重复错误模式 → 靶向设计针对性练习
- 重复场景 → 避免使用相同场景

## 5. 三层持久化（L1/L2/L3）

### 5.1 分层写入架构

results API接收学习者答题结果后，按三层递进写入：

| 层级 | 目标表 | 存储内容 | 写入操作 |
|------|--------|----------|----------|
| L1 | `learning_records` | 原始答题结果 | UPDATE `practice_result` 字段（JSON） |
| L2 | `assessment_records` | 评估维度聚合 | INSERT 新记录（dimension_scores, error_patterns, scene_type, bkt_mastery） |
| L3 | `learners` | 画像核心状态 | UPDATE anxiety_score, ability_vector, total_sessions |

### 5.2 写入时序

```
STEP 0: 计算新值
  - correctRate = 正确题数 / 总题数
  - newAnxiety = applyAnxietyDelta(oldAnxiety, correctRate)
  - newVector = calculateAbilityVector(oldVector, results)
  - bktMastery = bayesianKnowledgeTracing(prior, observed)

STEP 1 (L1): UPDATE learning_records
  SET practice_result = standardizedPracticeResult
  WHERE id = recordId

STEP 2 (L2): INSERT INTO assessment_records
  (learner_id, score, dimension_scores, error_patterns, scene_type, bkt_mastery)

STEP 3 (L3): UPDATE learners
  SET cultural_anxiety_score = newAnxiety,
      ability_vector = newVector,
      total_learning_sessions = total + 1
  WHERE id = learnerId
```

### 5.3 Phase 3A快照机制

`shouldCreateSnapshot()`函数在以下条件满足时触发画像快照：

| 触发条件 | 判定规则 | 设计意图 |
|----------|----------|----------|
| 首次学习 | `total_sessions === 0` | 记录基线画像 |
| 等级变化 | `old_hsk !== new_hsk` | 记录里程碑 |
| 显著变化 | 焦虑度变化≥10 或 任一维度变化≥15 | 捕获突变 |
| 周期性 | 每10轮学习 | 定期存档 |

快照写入`learner_profile_snapshots`表，为后续的学习轨迹可视化和教学效果评估提供时间序列数据。

## 6. 画像对Agent的驱动路径

### 6.1 HSK等级的多层影响

HSK等级在5个Agent和1个Guardrail中产生影响：

| 消费者 | 影响机制 | 具体行为 |
|--------|----------|----------|
| A2 | `<tier_guidelines>`三层指导 | HSK1-3"是什么"、4-6"为什么"、7-9"从何而来" |
| A3 | 分析复杂度控制 | 低层级做现象对等、高层级引入Hofstede维度 |
| A4 | 词汇范围约束 | 超纲词须附拼音+母语注释 |
| A5 | `hsk_compliance_score`审核 | 无注释的超纲词直接0分 |
| preA5HardRules | HSK单字白名单 | 打散词汇表为单字集合逐字比对 |

### 6.2 母语文化圈的注入路径

母语信息通过三个层面影响Agent行为：

**语言层面**：A2/A3/A4的所有面向学习者内容强制使用目标母语。由prompt硬约束（"非中文内容必须使用目标母语，严禁英语替代"）和`verifyA2Translation`回译校验双重保障。

**对比层面**：A3以学习者母语文化为参照系（`target_culture`参数），在中方视角与目标文化视角之间建立对称分析。

**认知层面**：A2的`difficulty_notes`字段根据不同母语文化圈的学习难点预判——例如日语母语者学习汉字有优势但声调系统薄弱，阿拉伯语母语者面临从右到左的阅读方向切换。

### 6.3 文化焦虑度的级联传导

```
DB焦虑度 → A1读取 → 映射离散等级(high/medium/low) → 计算native_ratio
    → A2: 阐释情感基调（high时更温和鼓励）
    → A3: 对比分析复杂度（high时简化理论框架引用）
    → A4: 母语占比控制（native_ratio直接约束文本比例）
         + 练习难度调节（high时降低难度梯度）
```

### 6.4 L2趋势的靶向注入

L2趋势仅注入A4的`<adaptive_guidance>`块，不影响A2和A3。这一设计选择基于关注点分离原则——A2/A3负责文化知识的准确阐释（不应因学习者近期表现而歪曲文化事实），A4负责教学策略的个性化适配（应根据学习者近期趋势调节出题策略）。

### 6.5 学习动机的间接影响

学习动机（tourism/study/work/interest/exam）不直接注入Agent prompt，而是通过场景选择间接影响内容生成。`SCENE_TYPE_MAP`和`SCENE_TO_KP_KEYWORDS`的映射关系使不同动机的学习者倾向于接触不同的场景和知识点——工作动机偏向workplace/banking场景，旅游动机偏向travel/food/transport场景。

## 7. 画像驱动的自适应闭环

### 7.1 完整闭环路径

```
学习者注册 → 静态画像(母语+HSK+风格+动机)
    ↓
首次学习请求 → A1读画像 → 初始自适应生成
    ↓
学习者答题 → results API
    ↓
L1/L2/L3三层写入 → 画像更新(焦虑度+能力向量+BKT)
    ↓
下次学习请求 → A1读更新后画像 → 自适应策略调整
    ↓
... (循环迭代)
```

### 7.2 自适应响应特征

系统的自适应响应具有以下特征：

**即时响应**（latency=1轮）：焦虑度和能力向量在每轮答题后立即更新，下一轮请求即可感知变化。

**渐进收敛**：EWMA的$\alpha=0.7$和焦虑度的$\Delta \in [-10, +10]$约束确保画像在单轮内不会剧烈波动，需要持续的行为模式才能推动画像显著变化。

**多维解耦**：焦虑度更新仅依赖正确率、能力向量更新仅依赖维度得分、L2趋势仅依赖历史聚合——各维度的更新逻辑相互独立，避免了耦合导致的不可预测行为。

**单向因果**：画像更新的唯一输入是学习者的客观表现（正确率、维度得分），不受Agent的主观判断影响。这排除了自我强化偏差——Agent不能通过自己的评判改变画像，从而避免了"Agent给差评→画像降级→Agent生成更简单内容→学习者无法进步"的恶性循环。
