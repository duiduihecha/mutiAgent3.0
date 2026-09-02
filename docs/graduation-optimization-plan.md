# 毕业设计：跨文化中文学习平台的体验与质量优化方案

> 系统：面向 8 大母语文化圈留学生的智能中文学习平台（多智能体生成中文学习材料）
> 角色：系统负责人兼开发者
> 目标：针对 4 条真实用户反馈，定位根因 → 给出可落地优化 → 设计验收标准 → 产出 Demo
> 全部根因均锚定在仓库真实代码（活跃管线为 `src/lib/learning-graph.ts` 的 LangGraph 编排）

---

## 0. 问题陈述（用户反馈原文）

| # | 反馈 | 现象 |
|---|------|------|
| P1 | 答非所问 | 问「饮食」相关知识点，偶尔返回完全无关内容 |
| P2 | 学了就忘 | 学过的跨文化知识点过一阵不再被推荐复习，用户「好像没真正记住」 |
| P3 | 干预不准 | 不同母语用户在情绪激动时，系统给的安抚/降难度话术不够精准 |
| P4 | 偶发低质 | 个别情况下用户会收到未经审核的低质量练习题 |

---

## 1. 根因定位（五维归因：数据 / 模型 / Agent / 部署 / 评测）

> 归因维度：D=数据，M=模型/算法，A=Agent 编排，P=部署/服务，E=评测

### P1 答非所问 —— 根因：场景→知识点用「模糊 LIKE + limit(1)」匹配，多义无消解，错命中还写进缓存

- **代码证据**
  - `src/lib/multi-agent-system.ts:1874` `getKnowledgePointByScene()`：用 `content_json->zh->>topic ILIKE '%kw%'` 的 **OR 查询 + `.limit(1)` 无排序**，多个同主题知识点命中时取第一个；无匹配时兜底 `knowledge_point_id: sceneId`（**场景串直接变成知识点 ID**）。
  - `src/app/api/learning/route.ts:104`：把原始 `knowledge_point_id`（可能是场景串）传给 coordinator，映射出的 `actualKpId` 被丢弃，错误命中 ID 进入后续链路。
  - `src/lib/learning-graph.ts:463` 注释链：`DB content_json.zh.topic → getKnowledgePointByScene → 场景关键词 → 知识点ID`，回译校验拿不到中文原文时就退化到关键词/ID。
  - A4 虽有 `kpGroundingBlock`（`multi-agent-system.ts:1540`）锚定 topic，但**缓存路径（`generateExercises`, learning-graph.ts:245）只传 `cached_explanation/comparison`**，缓存本身存错主题则「错知识点被当成命中」。
- **归因**：D（知识点语义库缺同义/歧义消解）+ M（模糊字符串匹配，无语义消歧）+ A（A4 约束在命中错 KP 时失效）+ E（缺「答非所问」离线探针评测）。
- **影响**：多义场景（饮食/餐桌礼仪/食物禁忌/节日食品）极易串味，且错误结果被缓存放大。

### P2 学了就忘 —— 根因：BKT 与遗忘曲线已算已落库，但「复习」无主动调度，needsReview 不进推荐排序

- **代码证据**
  - 落库：`src/app/api/learning/results/route.ts` 调 `bayesianKnowledgeTracing`（:156）、写 `bkt_mastery_after`（:304）、`recordMastery` 写 Neo4j `MASTERED` 边（:117 `last_updated_at`）。
  - 衰减：`src/lib/learner-graph.ts:506` `applyForgettingDecay`；`:611-612` 算 `needsReview`（mastery≥0.6 且衰减<0.4）。
  - **缺陷**：加权推荐总分（learner-graph.ts:615-620）**不含 needsReview 项**，它只生成 reason 文本（:643-645），与全新知识点 `novelty=1` 同权；**全代码无 `next_review` / 间隔重复调度字段**（grep `spaced`/`next_review`/`schedule` 零命中）。落库写的是 `correctRate` 而非 BKT 后验分，口径不一致。
- **归因**：M（BKT/遗忘曲线未接调度算法）+ P（无复习推荐服务/定时任务）。
- **影响**：知识点掌握度衰减后从不主动召回，用户「学完即弃、回头就忘」。

### P3 干预不准 —— 根因：A1 纯数学、零 LLM，系统根本**没有**生成安抚/降难度话术的能力，更不区分母语

- **代码证据**
  - `src/lib/multi-agent-system.ts:1017` `LearnerProfilerAgent.calculateAnxiety`：只做「读库 `cultural_anxiety_score` → 映射 `anxiety_level` → 算 `native_language_ratio` → 可选查 L2 趋势」，**全文搜 comfort/安抚/soothe/encourage 零命中**，无任何情感话术生成。
  - 唯一「干预」在 A4 的 `adaptive_guidance`（multi-agent-system.ts:1650）：基于 `accuracy_trend` 的通用「降难度」模板，**对所有母语一致**，不区分情绪档位、不用母语文化语用。
  - 焦虑源数据缺埋点：`aggregateLearnerMetrics`（:2078）的 `time_ratio/abandonment/negative_feedback` 用 fallback，焦虑分本身常不准 → 干预更不准。
- **归因**：A（缺情感干预 Agent）+ E（缺母语文化适配度评测）。
- **影响**：日/英/韩等母语用户在受挫时拿到的是「无差别模板」，安抚不落地、降难度不贴心。

### P4 偶发低质 —— 根因：A5 的 `is_qualified` 从未硬拦截返回；缓存路径更完全跳过 A5 LLM 盲审

- **代码证据**
  - 管线拓扑（`learning-graph.ts:8-10`）：`cache_hit → generateExercises → END`，**缓存命中路径只跑 A4 重生成练习题，跳过 A2/A3/A5**。
  - `generateExercises`（learning-graph.ts:245-388）：确实跑了 guardrail（a4_solver / a4_hard_rules / a4_grounding / **a5_joint 仲裁**:341），但 `:355-359` 仅用 verdict 降低 `pipeline_confidence` 遥测；**`:373-387` 无条件 `return final_result`**，即使 `a5_joint.passed=false` 也不拦截。
  - 非缓存路径 `a5Controller`（:720）同理：A5 算出 `is_qualified`，但 `computePipelineStateUpdate`（:137-161）只衰减置信度，**最终返回不判断 `is_qualified`**。
  - `validateExercisesFormat`（multi-agent-system.ts:1683）**只校验格式**（4 选项/题型/答案/数量），不校验内容质量——格式对、内容烂也能过。
- **归因**：A（A5 网关未硬门控）+ P（缓存路径绕过 A5）+ E（CIEval 未做「低质触达率」回归门禁）。
- **影响**：未过审练习题照样触达用户，是「偶发低质」投诉的直接来源。

---

## 2. 优化方案（复用已有资产：知识图谱 / CIEval / BKT / A5 网关）

> 资产复用清单见 §4。方案原则：**不重写系统，只在现有 LangGraph 节点与资产上打补丁**。

### P1 答非所问 → 知识图谱锚定路由 + 强约束生成 + 缓存一致性校验

1. **KG 语义路由替代模糊 LIKE**：把「场景」映射到 Neo4j 的 `Scene`/`Topic` 节点，用语义同义扩展（知识点同义词表 + 轻量 embedding 召回）做**消歧 + 多候选打分**，取 top-1 并返回「映射置信度」；置信度低于阈值时**不直接兜底成 sceneId**，而是回退到 A2 原文回译校验或请求用户确认。
   - 落点：`getKnowledgePointByScene` 改为先查 `knowledge-graph-neo4j-service` 的 Topic 子图，再回写 `actualKpId`。
2. **A4 主题硬约束**：将命中 KP 的 `canonical_name` + `topic` 作为 system prompt 强制段（强化 `kpGroundingBlock`），生成后强制 `verifyA4Grounding`（已存在，扩展到全链路）。
3. **缓存写入前一致性断言**：`saveToKB`（learning-graph.ts:782）写缓存前校验 `cached_explanation.topic === requested_kp.topic`，不一致视为脏缓存不写、下次按 miss 处理。

### P2 学了就忘 → BKT 后验 + 间隔重复调度（KG 驱动复习路由）

1. **needsReview 进推荐加权**：在 `learner-graph.ts:615-620` 的加权总分中加入 `needsReview` 项（权重 +0.3），使其排序高于全新知识点 `novelty`。
2. **引入 `next_review` 调度字段**（Neo4j 节点属性 + Supabase 学习进度表）：基于 BKT 后验 P(L) 与遗忘曲线算 SM-2 风格间隔 `interval = base · 2^n · decay_factor`；到点进入「复习队列」，首页/学习页主动推荐。
3. **落库口径统一**：`results` 落库改写 BKT 后验 `new_mastery`（multi-agent-system.ts:1094）而非 `correctRate`，消除口径不一致。

### P3 干预不准 → 母语感知情感干预（A1 保留 + 新增 A6 安抚生成，CIEval 评适配度）

1. **A1 保留**（纯数学、零成本、确定性强），但把 `anxiety_level` + `native_language` + `recent_weak_dimensions` 作为结构化输入透传给 A6。
2. **新增 A6 情感干预 Agent**（轻量 LLM 调用 + 母语模板）：按「焦虑档位 × 母语文化圈」生成差异化安抚/降难度话术（如 高焦虑×日语圈 → 间接留面子式鼓励；高焦虑×英语圈 → 直接结构化拆解；高焦虑×韩语圈 → 共情+阶段性小目标）。
3. **补埋点**：`time_ratio/abandonment/negative_feedback` 接真实埋点（feedback 表已存在），让焦虑分更准 → 干预更准。
4. **CIEval 评适配度**：用 `scripts/cieval_consistency.ts` 双裁判（qwen/glm）对母语×焦虑话术打「文化适配/冒犯度」分，挑出不准样本迭代模板。

### P4 偶发低质 → A5 网关硬门控（全链路强制，CIEval 做回归门禁）

1. **A5 从 advisory 升级为硬门控**：在 `generateExercises`（:373）与 `a5Controller`（:720）返回处加
   ```
   if (!pipelineConfidence 通过阈值 || a5_joint.passed === false) {
     触发回退：miss 路径→A4 重生成并再过 A5；cache 路径→降级为「已审核缓存版」或转完整链路
   }
   ```
   绝不直接返回未过审内容。
2. **缓存路径补 A5 内容质量仲裁**：`:341` 的 `verifyA5JointArbitration` 已对 exercises 仲裁，改为**拦截式**而非仅遥测。
3. **CIEval 回归门禁**：重跑 n=40，对比修复前后 `is_qualified` 拒绝率与「低质触达率」，目标线上投诉归零。

---

## 3. 验收标准（量化指标 + 阈值 + 评测方法）

| 问题 | 指标 | 目标阈值 | 评测方法 |
|------|------|----------|----------|
| P1 答非所问 | 离线场景→知识点 top-1 命中准确率 | ≥ 95%（200 条多义探针） | 构造 200 条含歧义场景探针，比对映射结果 |
| P1 | 线上「答非所问」反馈率（feedback 负标记） | 较基线 ↓ ≥ 80% | 上线前后 feedback 表统计 |
| P2 学了就忘 | 30 天回访 retention（BKT P(L) 衰减后仍 ≥0.7 占比） | ≥ 70% | 抽样用户 30 天掌握度追踪 |
| P2 | needsReview KP 进入推荐 Top-3 命中率 | ≥ 90% | 推荐排序日志回放 |
| P3 干预不准 | 母语×焦虑档位话术覆盖率 | 100%（8 母语×3 档=24 类全覆盖） | 穷举组合回归测试 |
| P3 | CIEval 情感文化适配度评分 | ≥ 4.0 / 5 | 双裁判打分均值 |
| P3 | 线上「安抚不准」反馈率 | ↓ ≥ 70% | feedback 表统计 |
| P4 偶发低质 | 线上「收到未审核低质题」投诉 | = 0 | 上线后反馈监控 |
| P4 | CIEval 重跑（n=40）is_qualified 拒绝项触达率 | 0%（100% 被拦截） | 双裁判 + 网关日志对账 |
| P4 | 端到端质量分（A5 四維均分） | ≥ 4.2 / 5 | CIEval 输出 |

**通用验收**：修复前后跑一遍 CIEval（`--all` / `--n 40`），保证优化**不退化**内容正确性（Pearson/Spearman/Cohen κ 不显著下降）。

---

## 4. 资产复用清单

| 资产 | 现状（能做什么） | 本次怎么用 | 缺口 |
|------|------------------|-----------|------|
| **知识图谱 (Neo4j)** | 推荐排序（PREREQUISITE/MASTERED/衰减）、A2 文化表现注入、A4 词汇/弱项约束 | P1 语义路由消歧；P2 复习队列路由（needsReview 进排序） | 无主动复习路由；Topic 节点缺同义词/歧义标注 |
| **CIEval** (`scripts/cieval_consistency.ts`) | 双裁判（qwen/glm）独立打分，Pearson/Spearman/Cohen κ，输出 jsonl+md；支持 `--all/--n/--skip-gen` | P3 母语适配度评测；P4 低质回归门禁 | 评「裁判一致性」非端到端正确性；需加「低质触达率」指标 |
| **BKT** (`bayesianKnowledgeTracing` + `applyForgettingDecay`) | 公式+衰减已落库 | P2 后验掌握度 + 间隔重复调度 | 无 `next_review` 调度；needsReview 不进排序；存 correctRate 非后验 |
| **A5 网关** (`QualityControllerAgent` + guardrail) | 4 维 LLM 盲审 + `is_qualified`；缓存路径已有 a5_joint 仲裁 | P4 升级为硬门控（拦截式） | `is_qualified` 未接入拦截；缓存路径被跳过/不拦截 |

---

## 5. Demo 说明

交互式 Demo（`docs/graduation-demo.html`，零依赖、浏览器直接打开）包含：

1. **现状管线图**：可视化 LangGraph 拓扑，高亮 4 个 bug 点（缓存路径跳过 A5、needsReview 不排序、A1 无话术、模糊 LIKE）。
2. **P1 模拟器**：输入场景串，对比「模糊 LIKE」vs「KG 语义路由」的命中结果，演示多义消歧。
3. **P2 模拟器**：滑块调 BKT 掌握度与距上次复习天数，实时画遗忘衰减曲线 + 计算 `next_review`，并演示推荐排序中 needsReview 被加权置顶。
4. **P3 模拟器**：选母语 × 焦虑档位，生成差异化安抚话术（母语感知模板）。
5. **P4 模拟器**：A5 硬门控开关对比——关闭时 FLAG_REJECT 内容仍触达；开启时拦截/回退。

> 文档结论：4 个问题并非「模型不行」，而是**编排与评测缺口**——模糊匹配无消歧、BKT 未接调度、缺情感干预 Agent、A5 网关未硬拦截。所有修复均可复用现有 KG/CIEval/BKT/A5，属「小改动、大体验」的毕业设计增量，且能用 CIEval 给出可辩护的量化验收。
