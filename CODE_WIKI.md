# Code Wiki — 母语驱动的跨文化对比式中文学习系统

> 面向 8 大母语文化圈留学生的 HSK1-9 级智能中文学习平台。核心创新：母语阐释打底 → 跨文化异同匹配 → 场景化应用闭环。

***

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [前端层](#3-前端层)
4. [API/后端入口层](#4-api后端入口层)
5. [核心业务编排层](#5-核心业务编排层)
6. [LLM 生成层](#6-llm-生成层)
7. [数据/知识层](#7-数据知识层)
8. [质量控制层](#8-质量控制层)
9. [关键算法说明](#9-关键算法说明)
10. [数据库 Schema](#10-数据库-schema)
11. [配置与环境变量](#11-配置与环境变量)
12. [项目运行方式](#12-项目运行方式)
13. [完整调用链路](#13-完整调用链路)
14. [排错地图](#14-排错地图)
15. [文件速查表](#15-文件速查表)

***

## 1. 项目概览

### 1.1 一句话总结

面向 8 大母语文化圈（英语、日语、韩语、西班牙语、阿拉伯语、俄语、法语、东南亚语系）的 HS1-9 级智能中文学习平台。用户选择母语和 HSK 等级后，系统通过 5 个 AI 智能体串并行协作，先以母语阐释中国文化概念，再与学习者母语文化做对比，最后生成场景化练习题形成学习闭环。

### 1.2 核心设计范式

```
母语阐释打底 (Mother Tongue Scaffolding)
    ↓
跨文化异同匹配 (Cross-Cultural Alignment)
    ↓
场景化应用闭环 (Situated Practice Loop)
```

### 1.3 当前实现状态

| 模块         | 状态      | 说明                         |
| ---------- | ------- | -------------------------- |
| 5 智能体调用链   | ✅ 已跑通   | 4 次真实 LLM 调用 (A2/A3/A4/A5) |
| 多智能体协调器    | ✅ 已实现   | 串行+并行，含缓存链路                |
| 母语文化阐释     | ✅ 已实现   | 槽位分段生成，双批并行优化              |
| 跨文化对比      | ✅ 已实现   | 含偏见检测机制                    |
| 场景化内容生成    | ✅ 已实现   | 文化背景+语言点+练习题               |
| 质量管控 (A5)  | ✅ 已实现   | 自动评分 + LLM 二次审核            |
| 知识库缓存      | ✅ 已实现   | Supabase 缓存命中可减少调用         |
| 学习者画像闭环    | ✅ 半闭环   | BKT/能力向量计算已实现，结果已写回        |
| Neo4j 知识图谱 | ✅ 可视化已接 | 可视化可用，推荐主流程未深度接入           |
| 偏见检测       | ⚠️ 关键词级 | 无语义级检测                     |

### 1.4 技术栈

| 层      | 技术                                                              |
| ------ | --------------------------------------------------------------- |
| 前端框架   | Next.js 16 (App Router) + React 19                              |
| UI 组件库 | shadcn/ui + Tailwind CSS 4 + Radix UI                           |
| 图表可视化  | vis-network (知识图谱力导向图) + recharts                               |
| 状态管理   | React Context (LearnerProvider)                                 |
| 主数据库   | Supabase PostgreSQL                                             |
| 图数据库   | Neo4j Aura                                                      |
| ORM    | Drizzle ORM                                                     |
| 核心业务   | TypeScript + 自研 Multi-Agent Framework (3017 行单文件)               |
| LLM 路由 | 统一 LLM 路由 (e-flowcode 网关)，支持 DeepSeek/Qwen/GLM/Kimi/豆包 等 26+ 模型 |
| 构建工具   | pnpm + tsup + Next.js Build                                     |
| 包管理    | pnpm ≥ 9.0.0 (only-allow 强制)                                    |
| 测试     | Vitest                                                          |

***

## 2. 整体架构

### 2.1 六层架构图

```
┌─────────────────────────────────────────────────────────────┐
│  ① 前端层 (Frontend)                                        │
│  首页 → 学习页 → 知识图谱 → 管理台 → LLM 测试              │
├─────────────────────────────────────────────────────────────┤
│  ② API/后端入口层 (Route Handlers)                          │
│  /api/learning → 主流程  /api/learning/results → 结果入库   │
│  /api/learners → 学习者 CRUD  /api/knowledge/* → 知识层     │
│  /api/explanations → 多语言阐释  /api/culture/* → 文化对比  │
├─────────────────────────────────────────────────────────────┤
│  ③ 核心业务编排层 (Multi-Agent Orchestration)                │
│  MultiAgentCoordinator.processLearningRequest()             │
│  A1(焦虑度) → (A2阐释 + A3对比)(并行) → A4(内容) → A5(质控) │
├─────────────────────────────────────────────────────────────┤
│  ④ LLM 生成层 (LLM Generation)                              │
│  UnifiedLLMService + llm-config 路由 (e-flowcode 网关)      │
│  支持 26+ 模型族，每个 Agent 独立 preset 可单独配置模型     │
├─────────────────────────────────────────────────────────────┤
│  ⑤ 数据/知识层 (Knowledge Base)                              │
│  K = Supabase (结构化阐释/对比/画像)                         │
│    ∪ Neo4j (391 个文化节点图谱)                               │
│    ∪ LLM (实时生成)                                          │
├─────────────────────────────────────────────────────────────┤
│  ⑥ 质量控制层 (Quality & Guardrails)                         │
│  偏见检测 / JSON 容错解析 / 格式验证 / A5 自动评分           │
│  情感检测 / 限流 / 超时重试                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 模块依赖关系图

```
src/app/page.tsx (首页)
    ↓ localStorage: learner_id, native_language, hsk_level
    ↓ URL 跳转
src/app/learning/page.tsx (学习页)
    ↓ fetch POST
src/app/api/learning/route.ts
    ├── getKnowledgePointByScene()  ← src/lib/constants.ts
    ├── Supabase 学习者 CRUD       ← src/storage/database/supabase-client.ts
    └── multiAgentCoordinator.processLearningRequest()
            ↓
        src/lib/multi-agent-system.ts (3017 行大文件，见 SPLIT_PLAN.md 拆分方案)
            ├── BaseAgent.generateResponse() ← src/lib/unified-llm-service.ts
            │                                   ← src/lib/llm-config.ts (路由)
            ├── LearnerProfilerAgent (A1)
            ├── MotherTongueExplainerAgent (A2)
            ├── CulturalComparatorAgent (A3)   ← detectBias()
            ├── ContentGeneratorAgent (A4)     ← 格式验证
            ├── QualityControllerAgent (A5)    ← LLM 评分
            ├── queryKnowledgeBase()            ← Supabase cultural_explanations
            └── saveToKnowledgeBase()           ← 异步写入 Supabase

src/app/api/learning/results/route.ts
    ├── calculateAbilityVector() / applyAnxietyDelta()
    ├── bayesianKnowledgeTracing() / computeMemoryStrength()
    ├── detectEmotionState()         ← src/lib/emotion-check.ts
    ├── recordMastery()              ← src/lib/learner-graph.ts (Neo4j)
    └── 三级写入: L1 → L2 → L3 → learner_snapshots
```

***

## 3. 前端层

### 3.1 页面清单

| 路径                               | 作用                        | 关键状态/交互                                                                                                                               |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| src/app/page.tsx                 | 首页：选母语/HSK等级/学习场景，启动学习    | 8 种母语 × 7 档 HSK × 5 种学习动机；点击"开始学习"写入 localStorage 并跳转 /learning；展示推荐内容、阐释统计、LLM 测试面板、知识点列表                                            |
| src/app/learning/page.tsx        | 学习页：展示 A2/A3/A4 生成内容，答题交互 | Tabs 切换：母语阐释 → 跨文化对比 → 场景对话 → 答题练习；validateAnswer() 判对判错；做完 POST /api/learning/results 保存结果                                           |
| src/app/knowledge-graph/page.tsx | 知识图谱页：Neo4j 节点可视化         | 连接测试 → 391 个文化节点力导向图，可按 HSK/分类筛选                                                                                                      |
| src/app/admin/page.tsx           | 管理台：查看 6 张核心表数据           | Tab 切换 learners/learning\_records/assessment\_records/cultural\_explanations/cross\_cultural\_comparisons/cultural\_knowledge\_points |
| src/app/test/page.tsx            | LLM 测试页：调试不同 provider 的响应 | 选择 provider，输入 prompt，查看返回                                                                                                            |
| src/app/admin/graph/page.tsx     | 图谱管理页                     | 数据迁移与管理                                                                                                                               |
| src/app/feedback/page.tsx        | 反馈收集页                     | 用户反馈提交                                                                                                                                |
| src/app/vlog-preview/page.tsx    | Vlog 预览页                  | 学习 Vlog 脚本渲染预览                                                                                                                        |

### 3.2 根布局与全局 Context

src/app/layout.tsx：

```
<LearnerProvider>
  {isDev && <Inspector />}
  {children}
</LearnerProvider>
```

* LearnerProvider (src/lib/learner-context.tsx)：前端唯一 learner 状态源

  * learner / setLearner() / fetchLearner(id) / initLearner(...)

### 3.3 核心组件

| 组件                                                 | 作用                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| src/components/interactive-graph-visualization.tsx | Neo4j 知识图谱力导向图组件 (vis-network)                                                |
| src/components/knowledge-graph-view\.tsx           | 知识图谱视图（备选）                                                                    |
| src/components/learning/progressive-disclosure.tsx | 渐进式内容披露组件                                                                     |
| src/components/ui/\*                               | 完整 shadcn/ui 基础组件 (60+ 个)：button, card, input, select, tabs, dialog, alert... |

### 3.4 前端启动学习流程 (startLearning)

1. 校验：selectedLanguage / selectedLevel 必选
2. 初始化 Learner：调用 LearnerProvider.initLearner() → 有 learner\_id 从 API 拉取，否则 POST /api/learners 创建
3. localStorage 写入: learner\_id, native\_language, hsk\_level
4. router.push(`/learning?learner=xxx&kp=daily&level=3&lang=英语`)

### 3.5 前端答题判对逻辑 validateAnswer()

| 题目类型                   | correct\_answer 格式 | 验证方式               |
| ---------------------- | ------------------ | ------------------ |
| 选择题 (multiple\_choice) | 字母 A/B/C/D         | 忽略大小写直接比较          |
| 判断题 (true\_false)      | 中文 对 / 错           | 先把答案 A/B 映射成对/错再比较 |
| 填空题 (fill\_blank)      | 实际中文文本             | 精确比较（暂不支持交互，已知限制）  |

***

## 4. API/后端入口层

所有 API 都是 Next.js App Router 的 Route Handler，运行在同一端口 (默认 5000)。

### 4.1 API 总览表

| 路由                                       | 方法         | 作用                                | 真实可用       |
| ---------------------------------------- | ---------- | --------------------------------- | ---------- |
| src/app/api/learning/route.ts            | POST       | 主学习流程入口，5 智能体编排                   | ✅ 接通真实 LLM |
| /api/learning/jobs                       | GET/POST   | 异步学习任务管理                          | ✅          |
| /api/learning/jobs/\[id]                 | GET        | 任务状态查询                            | ✅          |
| src/app/api/learning/results/route.ts    | POST       | 保存学习结果，L1/L2/L3 三级写入 + BKT + 情感检测 | ✅          |
| src/app/api/learners/route.ts            | GET/POST   | 学习者列表/创建，支持分页筛选                   | ✅          |
| /api/learners/\[id]                      | GET/PUT    | 学习者详情/更新                          | ✅          |
| /api/learners/\[id]/trends               | GET        | 学习者学习趋势                           | ✅          |
| /api/learners/\[id]/recommendations      | GET        | 个性化推荐                             | ✅          |
| /api/knowledge/points                    | GET/POST   | 知识点 CRUD                          | ✅          |
| /api/knowledge/points/\[id]              | GET/DELETE | 知识点详情/删除                          | ✅          |
| src/app/api/knowledge/graph/route.ts     | GET/POST   | Neo4j 图谱查询/迁移/测试连接                | ✅          |
| /api/knowledge/graph/level/\[level]      | GET        | 按层级查图谱节点                          | ✅          |
| /api/knowledge/graph/contrasts/\[kp\_id] | GET        | 跨文化对比节点查询                         | ✅          |
| /api/knowledge/admin                     | POST       | 知识点管理操作                           | ✅          |
| src/app/api/explanations/route.ts        | GET/POST   | 多语言阐释 (SSE 流式生成/统计)               | ✅          |
| /api/explanations/\[kp\_id]              | GET        | 某知识点所有语言阐释                        | ✅          |
| src/app/api/culture/compare/route.ts     | GET/POST   | 跨文化对比 CRUD + LLM 生成               | ✅          |
| /api/culture/admin                       | POST       | 文化对比管理                            | ✅          |
| /api/data                                | GET/POST   | 统一数据 API                          | ✅          |
| /api/test/llm                            | GET/POST   | LLM 连通测试                          | ✅          |
| /api/vlog/generate                       | POST       | Vlog 脚本生成                         | ✅          |
| /api/feedback                            | POST       | 用户反馈提交                            | ✅          |
| /api/cache/stats                         | GET        | 缓存命中率统计                           | ✅          |
| /api/cache/vote                          | POST       | 缓存质量投票                            | ✅          |
| /api/admin/data                          | GET        | 管理台数据查询                           | ✅          |
| /api/admin/graph                         | POST       | 图谱管理迁移操作                          | ✅          |
| /api/admin/migrate                       | POST       | 数据库迁移                             | ✅          |
| /api/research-docs                       | GET        | 研究文档接口                            | ✅          |

### 4.2 核心 API 详解

#### POST /api/learning — 主学习流程

* 限流：每 IP 每分钟最多 6 次

* 超时：路由级 480 秒 (LEARNING\_PIPELINE\_TIMEOUT\_MS，旧值 120s 已修复)

* 请求体：

  ```
  {
    learner_id: string;           // "new" 或 已有UUID
    knowledge_point_id: string;   // 场景ID如 "daily" 或 UUID
    hsk_level: number;            // 1-9
    native_language: string;      // "英语" / "日语" ...
    learning_motivation?: string; // interest/tourism/study_abroad/work/exam
    use_langgraph?: boolean;      // 是否启用 LangGraph 编排
  }
  ```

* 内部步骤：

  1. 限流校验
  2. 参数校验
  3. Step 0: 场景→知识点映射 (getKnowledgePointByScene())：非 UUID 格式视为场景 ID，从 Supabase 模糊关键词匹配
  4. 学习者获取/创建 (Supabase learners 表)

     * 已存在 learner\_id 从 DB 读，传入的 native\_language/hsk\_level 优先于 DB 旧值

     * learner\_id 不存在返回 404（不静默创建）
  5. 调用多智能体系统 (processLearningRequest())
  6. 格式化响应：exercises type 英文→中文，字段映射

#### POST /api/learning/results — 三级存储写入

严格写入顺序：

```
STEP 0: 计算
  ├─ calculateAbilityVector()     → 新能力向量
  ├─ applyAnxietyDelta()          → 新焦虑度
  ├─ bayesianKnowledgeTracing()   → BKT 掌握度
  ├─ computeMemoryStrength()      → 遗忘曲线 S
  ├─ 维度分析 (5 维分 + 错误模式)
  └─ detectEmotionState()         → 红/黄/绿 情感状态
STEP 1: L1 写入 → learning_records
STEP 2: L2 写入 → assessment_records
STEP 3: L3 更新 → learners (焦虑/向量/sessions/scene 重写回)
STEP 3.5: learner_snapshots (规则: first_session/level_up/significant_change/periodic)
STEP 4 (不阻塞): L4 → Neo4j Learner 图谱 (recordMastery)
```

***

## 5. 核心业务编排层

### 5.1 核心文件

src/lib/multi-agent-system.ts (3017 行) — 整个系统的心脏（一个篮子里的 5 个鸡蛋，见 SPLIT\_PLAN.md 要拆它的 3 套方案）。

物理结构（wc + grep 估算）：

| 段                             | 起始行   | 估算行数  |
| ----------------------------- | ----- | ----- |
| 错误类 + 工具 + 类型 + 算法 + θ3 槽位    | L1    | 1166  |
| BaseAgent                     | L1040 | \~127 |
| A1 LearnerProfilerAgent       | L1167 | 106   |
| A2 MotherTongueExplainerAgent | L1273 | 209   |
| A3 CulturalComparatorAgent    | L1482 | 146   |
| A4 ContentGeneratorAgent      | L1628 | 267   |
| A5 QualityControllerAgent     | L1895 | 144   |
| 场景映射 + 缓存 + L2 趋势             | L2039 | \~431 |
| MultiAgentCoordinator + 单例    | L2470 | 547   |

### 5.2 关键类与函数

#### 工具函数

| 函数                                       | 行号   | 作用                                                              |
| ---------------------------------------- | ---- | --------------------------------------------------------------- |
| safeJsonParse(text)                      | L70  | 安全 JSON 解析：剥离 <think> → 直接解析 → 提取 markdown 代码块 → 首尾花括号提取        |
| truncateForA4(obj, maxLen=2000)          | L113 | A2/A3 产物瘦身送入 A4，避免 Cloudflare 524 超时                            |
| withTimeout(promise, ms, msg)            | L122 | Promise 超时包装，用于 LLM 调用                                          |
| withRetry(fn, maxRetries, delay, signal) | L138 | 重试机制：AbortError 不重试，AgentError.retryable=false 不重试，其余指数退避最多 2 次 |

#### 核心算法函数

| 函数                                        | 行号        | 作用                                                 |
| ----------------------------------------- | --------- | -------------------------------------------------- |
| calculateCulturalAnxiety(params)          | L225      | 4 因子加权公式 0.4*e\_c + 0.3*t\_c + 0.2*f\_c + 0.1*n\_c |
| calculateAnxietyDelta / applyAnxietyDelta | L251/L259 | 焦虑度增量：100% 正确 → -10，50% → 0，0% → +10               |
| anxietyScoreToLevel(score)                | L268      | 0-33: low / 34-66: medium / 67-100: high           |
| calculateNativeLanguageRatio              | L277      | 焦虑度 → 母语占比：high 70% / medium 50% / low 30%         |
| detectBias(text)                          | L747      | 偏见检测：关键词 + 句式正则，> 0.2 标记                           |
| bayesianKnowledgeTracing(params)          | L819      | BKT 贝叶斯知识追踪                                        |
| computeMemoryStrength(cumulativeCorrect)  | L843      | 遗忘曲线累积正确次数 → 记忆稳定性 S（天）                            |
| applyForgettingDecay                      | L853      | 遗忘衰减                                               |
| calculateAbilityVector                    | L867      | 按 5 维（语法/听力/口语/文化语用/阅读）更新能力向量                      |
| validateSlotRatio                         | L713      | A2 θ3 母语占比验证                                       |

#### θ3 槽位生成链路（只被 A2 直接使用，纯函数 \~700 行）

```
getSlotStructure(anxiety_score)   → SlotTemplate (6 个槽 + 过渡锚 + 占比)
      ↓
generateSlotBatch(batch) + parseSlotBatch(raw, batchSlots)   ← Promise.all 双批并行
      ↓
trimSlotToBudget() (SLOT_CHAR_BUDGET=400, 硬上限 600; 按句边界截断)
      ↓
cleanSlotContent()
      ↓
assembleSlots()   → 拼最终阐释文
      ↓
validateSlotRatio()   → 不达标 → 单槽补生成 ×1
```

#### BaseAgent — 智能体基类

```
abstract class BaseAgent {
  agent_id: string;
  // 分发 action
  abstract async process(message: AgentMessage): Promise<AgentMessage>;
  // 核心 LLM 调用封装（注入 AbortSignal，超时真正中断底层）
  async generateResponse(systemPrompt, userMessage, timeoutMs=120000): Promise<string>;
}
```

* 通过 getLLMConfig(preset) 获取每个 Agent 自己的 provider/model

* 失败分类：超时 → retryable=false；用户断开 → 不重试

#### A1: LearnerProfilerAgent

* 无 LLM 调用，纯计算

* action=calculate\_anxiety：

  * 从 DB 读取 cultural\_anxiety\_score（唯一权威值）→ 映射 anxiety\_level

  * 计算 native\_language\_ratio

  * 查询 L2 短期记忆趋势（近 5 轮薄弱维度 + 正确率趋势 + 重复错误模式）

* action=track\_progress：BKT 单题追踪

#### A2: MotherTongueExplainerAgent — 母语阐释

* 1 次 LLM 调用或 2 次并行槽位批量生成

* 核心优化：θ3 槽位分段 + 双批并行（旧 6 槽串行 150-170s → 新 2 批并行）

* 注入上下文：

  1. Neo4j 图谱文化数据 (queryCulturalGraphData)
  2. Supabase 知识点语义锚定 (fetchKnowledgePointSemantics)

* 容错：漏槽 → 单槽补生成；批整体失败 → 逐槽退化；超预算 → 按句边界截断

#### A3: CulturalComparatorAgent — 跨文化对比

* 1 次 LLM 调用

* 输出：chinese\_perspective + target\_culture\_perspective + similarities + differences + learning\_pitfalls + pragmatic\_hints

* 生成后运行 detectBias()，bias\_score > 0.2 标记 warning

#### A4: ContentGeneratorAgent — 场景化内容生成

* 1 次 LLM 调用，超时 90-180s

* 输入：A2 阐释（瘦身版）+ A3 对比（瘦身版）+ A1 画像

* 输出框架（JSON Schema）：cultural\_context.explanation + language\_points\[] + comparison.cn/target/differences\[] + exercises\[]

* 格式验证 validateExercisesFormat()：选择题必须 4 options + correct\_answer ∈ {A,B,C,D}；判断题格式固定；题量 EXERCISES\_PER\_SESSION = 5

#### A5: QualityControllerAgent — 质量管控

* 1 次 LLM 调用

* 打分：pinyin\_score / distractor\_score / hsk\_compliance\_score / safety\_score / overall\_score；不合格 → A4 重生成 ×2

#### MultiAgentCoordinator — 主协调器

```
class MultiAgentCoordinator {
  async processLearningRequest(learner, kpId, options) {
    // Step 0: 知识库缓存查询
    cached = queryKnowledgeBase(kpId, langCode);
    if (cached) return cached + A4.generateExercisesOnly();   // 1 次 LLM

    // Step 1: A1 焦虑度（无 LLM）
    profile = await A1.calculate_anxiety

    // Step 2: A2 + A3 并行（2-3 次 LLM）
    [explanation, comparison] = await Promise.all([A2, A3]);

    // Step 3: A4 内容生成 + A5 审核（不合格重生成×2 → 最多 3+3 次）
    content = run_A4_with_A5_retry(profile, explanation, comparison)

    // Step 5: 异步保存缓存（不阻塞）
    saveToKnowledgeBase(explanation, comparison, content);

    return aggregatedResult;
  }
}
export const multiAgentCoordinator = new MultiAgentCoordinator();
```

调用次数：

* 未命中缓存：4 次 LLM（A2+A3 并行 + A4 + A5）

* 命中缓存：1 次 LLM（仅 A4 生成练习题）

***

## 6. LLM 生成层

### 6.1 LLM 路由架构 — 双路径设计

| 路径              | 调用方                          | 路由机制                                                            |
| --------------- | ---------------------------- | --------------------------------------------------------------- |
| 路径 A：5 智能体使用    | BaseAgent.generateResponse() | getLLMConfig("generation\_a2"\~"a5") → UnifiedLLMService.chat() |
| 路径 B：阐释/对比/独立功能 | explanations/culture API     | new UnifiedLLMService("generation") → chat()                    |

### 6.2 中央 LLM 路由

src/lib/llm-config.ts — fail-closed，唯一事实源

* 统一通过 e-flowcode OpenAI 兼容网关（国内可直连）

* 网关已验证：26 个模型族（DeepSeek / Qwen / GLM / Kimi / 豆包 / Doubao-Seed / Muse-Spark 等）

* 每个角色独立 preset 可单独 env 覆盖：

| Preset                     | 角色        | 默认模型              | Env 覆盖键                                |
| -------------------------- | --------- | ----------------- | -------------------------------------- |
| generation\_daily          | 日常生成档     | deepseek-v4-flash | LLM\_GENERATION\_DAILY\_MODEL          |
| generation\_quality        | 高质量生成档    | deepseek-v4-pro   | LLM\_GENERATION\_QUALITY\_MODEL        |
| generation\_a2\~a5         | A2\~A5 各自 | 继承 daily/quality  | LLM\_A2\_MODEL ... LLM\_A5\_MODEL      |
| judge                      | AI 裁判     | qwen3.8-max       | LLM\_JUDGE\_MODEL                      |
| judge2                     | 二级裁判      | glm-5.2           | LLM\_JUDGE2\_MODEL                     |
| guardrail\_backtranslation | 护栏回译      | kimi-k2.6         | LLM\_GUARDRAIL\_BACKTRANSLATION\_MODEL |
| guardrail\_binary          | 护栏二选一     | qwen3.6-flash     | LLM\_GUARDRAIL\_BINARY\_MODEL          |
| guardrail\_solver          | 护栏解题      | qwen3.7-max       | LLM\_GUARDRAIL\_SOLVER\_MODEL          |
| guardrail\_final           | 护栏终审      | glm-5.2           | LLM\_GUARDRAIL\_FINAL\_MODEL           |

生成档切换：LLM\_GENERATION\_PROFILE=daily|quality（同一实验进程内锁定）

### 6.3 UnifiedLLMService

src/lib/unified-llm-service.ts (342 行)

```
class UnifiedLLMService {
  constructor(preset: LLMPreset)  // 必须传 preset，fail-closed
  chat(messages, options): Promise<LLMResponse>        // 非流式
  chatStream(messages, options): ReadableStream         // 流式
  generateCulturalExplanation(kp, lang, level): JSON    // JSON 格式化阐释
}
```

底层客户端：

* DeepSeekClient / QwenClient：legacy 兼容

* 主路径：OpenAI 兼容网关 (e-flowcode)，所有新角色走这条

* 离线模式：isOfflineMockExecution() → 各 Agent 专用 JSON fixture（不花配额）

### 6.4 LLM 调用遥测 & 配额

* src/lib/llm-runtime-policy.ts：assertLLMCallAllowed() 预算检查；estimateCostCny() 人民币估算；LLMProviderError 分级错误码

* src/lib/experiment-telemetry.ts：emitExperimentCall() 每次 LLM 调用写 JSONL；hashMessages() prompt 去重

***

## 7. 数据/知识层

动态混合知识底座：K = K\_supabase ∪ K\_neo4j ∪ K\_llm

### 7.1 Supabase 服务

src/storage/database/supabase-client.ts：

```
function getSupabaseClient(): SupabaseClient
```

凭证来源：平台自动注入 COZE\_SUPABASE\_URL / COZE\_SUPABASE\_ANON\_KEY；本地缺失时通过 coze\_workload\_identity Python SDK 拉取项目环境变量（因为非标准 Next server，入口是 src/server.ts）。

KnowledgeBaseService (src/lib/knowledge-base-service.ts, 550 行)：

| 子服务                            | 作用                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------- |
| CulturalKnowledgeService       | 知识点 CRUD：getKnowledgePoints 分页筛选、getById、search(keywords)、create、batchCreate |
| CrossCulturalComparisonService | 跨文化对比 CRUD + LLM 生成                                                          |
| CulturalExplanationService     | 文化阐释 CRUD + 批量生成                                                             |
| KnowledgeGraphService          | Supabase 中图谱节点 CRUD（与 Neo4j 并行）                                              |

### 7.2 Neo4j 服务

src/lib/neo4j-service.ts (\~350 行)

```
class RealNeo4jService {
  async connect(): Promise<boolean>       // 缺失配置会 throw 明确错误（不降为假数据）
  async query<T>(cypher, params): T[]
  async write(cypher, params): number
  async execute(cypher, params): void
}
export const neo4jService = new RealNeo4jService();
```

关键：配置必须每次调用时现读 process.env，不能模块顶层快照（否则 dotenv 加载时序会冻结成 undefined）。

配套服务：

* src/lib/knowledge-graph-neo4j-service.ts：图谱专用查询（层级/分类/聚类）

* src/lib/learner-graph.ts：学习者图谱（recordMastery() 写掌握度边）

* src/lib/hsk-vocab-graph.ts：HSK 词汇图谱 → 字符白名单

* src/lib/learning-graph.ts：LangGraph 编排版（USE\_LANGGRAPH 切换）

### 7.3 其他数据/知识模块

* src/lib/unified-data-service.ts：Supabase + Neo4j 统一访问层

* src/lib/multi-language-explanation-service.ts：8 语种阐释 + SSE 流式生成 + 覆盖率统计

* src/storage/cache/cache-manager.ts + services/guardrail-service.ts：护栏评分通过才写缓存（CACHE\_WRITE\_CONFIDENCE\_THRESHOLD）

***

## 8. 质量控制层

| 机制           | 位置                                       | 说明                                                |
| ------------ | ---------------------------------------- | ------------------------------------------------- |
| 偏见检测         | detectBias() in multi-agent-system.ts    | BIAS\_KEYWORDS + BIAS\_PATTERNS 正则，> 0.2 标记       |
| JSON 容错解析    | safeJsonParse()                          | 思维链剥离 → 代码块 → 首尾花括号                               |
| 练习题格式验证      | A4.validateExercisesFormat()             | 选择题 4 option / 判断题格式 / correct\_answer ∈ {A-D,对错} |
| A5 质量管控      | QualityControllerAgent                   | 4 维打分 + LLM 审核；不合格 → A4 重生成 × 2                   |
| Guardrail 服务 | guardrail-service.ts                     | 回译验证 + 二选一 + 解题验证 + 终审 4 级                        |
| 情感检测         | detectEmotionState() in emotion-check.ts | 红/黄/绿 3 态：正确趋势/时间/连错/高焦虑 → 触发干预建议                 |
| 画像快照         | shouldCreateSnapshot() in results route  | 5 条触发规则确保重要变化被记录                                  |
| 路由级限流        | learning/route.ts                        | 每 IP 每分钟 6 次；自动清理过期桶                              |
| 路由级超时        | learning/route.ts                        | 480 秒 (LEARNING\_PIPELINE\_TIMEOUT\_MS)           |
| 重试机制         | withRetry()                              | 最多 2 次；用户断开/Agent 超时不重试                           |
| AbortSignal  | 全链路                                      | 上游超时真正中断底层 fetch（不会后台静默烧钱）                        |

情感检测 EmotionCheck：Green(≥70% 正确) → 保持节奏；Yellow(40-70% 或单维<50%) → 关注薄弱维度；Red(<40% 或连错≥3 或焦虑>80 且做差) → 焦虑+10 建议休息/切换场景/降 HSK。

***

## 9. 关键算法说明

### 9.1 文化焦虑度

完整公式（有行为指标时）：

```
a = 0.4 × e_c + 0.3 × t_c + 0.2 × f_c + 0.1 × n_c
其中：e_c = 文化错误率(×100)，t_c = 超时犹豫比，f_c = 放弃中断比，n_c = 负反馈比
```

增量公式（做题后更新，results API 的唯一权威公式）：

```
Δ = 10 × (0.5 - correctRate)     范围 [-10, +10]
anxiety_new = clamp(anxiety_old + Δ, 0, 100)
100% 正确 → -10；50% → 0；0% → +10
```

母语占比映射：
low    (0-33): 30% 母语 / 70% 中文
medium (34-66): 50% / 50%
high   (67-100): 70% / 30%

### 9.2 BKT 贝叶斯知识追踪

```
P(L_t | obs_correct) = [P(obs|L)P(L)] / P(obs)
P(obs_correct | L)   = 1 - slip
P(obs_correct | ~L)  = guess

标准参数：guess = 0.25 (四选一)，slip = 0.10
（注：历史上 slip 曾误写成 0.90，已修复）
```

### 9.3 遗忘曲线记忆强度

```
S = computeMemoryStrength(cumulativeCorrect)
基础 S = 30 天；累积每答对 1 次，S 按 Ebbinghaus 曲线递增
```

### 9.4 能力向量 5 维

```
[grammar, listening, speaking, cultural_pragmatic, reading]
语法 / 听力 / 口语 / 文化语用 / 阅读
更新：每维独立根据该维度题目正确/错误加权
```

### 9.5 场景→知识点映射

```
sceneId (例: "daily")
  → SCENE_TO_KP_KEYWORDS (constants.ts)
  → Supabase ilike 模糊匹配 cultural_knowledge_points.content_json
  → 命中返回 point_id+topic
  → 未命中 → 兜底返回 sceneId 本身 (可能导致内容跑题)
```

### 9.6 偏见检测

```
bias_score = (Σ keyword_matches × weight + Σ pattern_matches × weight) / normalizer
阈值：<0.1 low / 0.1-0.2 medium(warning) / >0.2 high(flagged)
```

***

## 10. 数据库 Schema

### 10.1 Supabase PostgreSQL 核心表

Drizzle Schema: src/storage/database/shared/schema.ts

#### learners (学习者表)

| 字段                        | 类型                 | 说明                                       |
| ------------------------- | ------------------ | ---------------------------------------- |
| id (PK)                   | varchar(36)        | UUID                                     |
| uid                       | varchar(50) UNIQUE | 用户业务 ID                                  |
| native\_language          | varchar(50)        | 母语文化圈                                    |
| hsk\_level                | integer            | 1-9                                      |
| learning\_motivation      | varchar(50)        | tourism/study\_abroad/work/interest/exam |
| cultural\_anxiety\_score  | decimal(5,2)       | 焦虑度 0-100，默认 50                          |
| ability\_vector           | jsonb              | 5 维 \[语法,听力,口语,文化语用,阅读]                  |
| total\_sessions           | integer            | 总学习轮数                                    |
| last\_scene\_id           | varchar(36)        | 上次学习场景                                   |
| created\_at / updated\_at | timestamptz        | -                                        |

索引：uid, native\_language, hsk\_level

#### cultural\_knowledge\_points (文化知识点表)

| 字段                        | 类型          | 说明                                           |
| ------------------------- | ----------- | -------------------------------------------- |
| id (PK)                   | varchar(36) | UUID                                         |
| hsk\_level                | integer     | 对应 HSK 等级                                    |
| layer                     | integer     | 1基础/2进阶/3高阶                                  |
| language\_binding\_points | text\[]     | 绑定的语言点集                                      |
| content\_json             | jsonb       | 多语言内容 {zh: {topic, examples,...}, en: {...}} |

#### cultural\_explanations (文化阐释缓存表)

* 按 knowledge\_point\_id + language\_code 缓存 A2 母语阐释

* 命中时跳过 A2+A3 LLM 调用，仅 A4 生成练习题（节省 3 次调用）

#### cross\_cultural\_comparisons (跨文化对比缓存表)

source\_culture\_id + target\_culture → similarities/differences/pragmatic\_hints + bias\_score + verified

#### learning\_records (L1 学习记录表)

learner\_id + scene\_id + knowledge\_point\_id + practice\_result(标准化逐题JSONB) + comprehension\_score + pragmatic\_score + status + time\_spent + completed\_at

#### assessment\_records (L2 评估记录表)

overall\_score + ability\_vector before/after + anxiety before/after + bkt\_mastery\_after + memory\_strength + dimension\_scores + error\_patterns + emotion\_state + learning\_record\_id (FK)

#### learner\_snapshots (画像历史快照, Phase 3A)

通过 RPC insert\_learner\_snapshot() 写入；5 条触发规则：first\_session / level\_up / significant\_change (焦虑变化≥10 或任一维≥15) / periodic(每 10 轮强制一次)

### 10.2 Neo4j 核心节点与关系

```
节点：
  (:CultureNode {id, topic, hsk_level, category, subcategory, hierarchy,
                 description, definition, usage_notes, cultural_significance})
  (:CrossCultureContrast {id, name, theme, hsk_level, category, node_count})
  (:HomeCulture {id, code, name})       # 母语文化圈：hc_en, hc_ja, hc_ko...
  (:Learner {learner_id})               # 学习者节点（L4 结果写入）
  (:Vocabulary {term, hsk_level})       # HSK 词汇节点

关系：
  (:CultureNode)-[:BELONGS_TO_CONTRAST]->(:CrossCultureContrast)
  (:CultureNode)-[:MANIFESTED_IN {manifestation, conflict_with_chinese,
                                   pragmatic_tip, example_scenario}]->(:HomeCulture)
  (:Learner)-[:MASTERED {mastery, cumulative_correct, last_assessed_at}]->(:CultureNode)
  (:Learner)-[:WEAK_IN]->(:Dimension)
```

***

## 11. 配置与环境变量

### 11.1 必填配置

| 变量                                             | 说明              | 获取方式                               |
| ---------------------------------------------- | --------------- | ---------------------------------- |
| COZE\_SUPABASE\_URL                            | Supabase 服务 URL | 平台自动注入（扣子项目环境）                     |
| COZE\_SUPABASE\_ANON\_KEY                      | Supabase 匿名 Key | 平台自动注入                             |
| NEO4J\_URI / NEO4J\_USERNAME / NEO4J\_PASSWORD | Neo4j Aura 连接   | .env 手动配置                          |
| EFLOWCODE\_API\_URL                            | OpenAI 兼容网关 URL | .env (默认 <https://e-flowcode.cc>)  |
| EFLOWCODE\_API\_KEY                            | 网关 Key          | .env 或 fallback 到 OPENAI\_API\_KEY |

### 11.2 LLM 路由配置

| 变量                                    | 默认值                | 说明                                                              |
| ------------------------------------- | ------------------ | --------------------------------------------------------------- |
| LLM\_MOCK\_MODE                       | false              | true 时禁止真实 LLM，用 fixture                                        |
| LLM\_PROVIDER                         | -                  | legacy 兼容；"mock" 等同于 mock mode（LLM\_REAL\_CALLS\_ENABLED!=true） |
| LLM\_REAL\_CALLS\_ENABLED             | -                  | LLM\_PROVIDER=mock 时设 true 可临时放行真实调用                            |
| LLM\_GENERATION\_PROFILE              | daily              | daily (v4-flash, 快/便宜) / quality (v4-pro, 高质/贵)                 |
| LLM\_A2\_MODEL / ... / LLM\_A5\_MODEL | (继承 daily/quality) | 单独覆盖 A2\~A5 模型                                                  |
| LLM\_EXTRA\_MODELS                    | -                  | 逗号追加网关新增的模型白名单（无需改代码）                                           |

### 11.3 运行时性能与稳定性

| 变量                              | 默认值    | 说明                         |
| ------------------------------- | ------ | -------------------------- |
| DEPLOY\_RUN\_PORT               | 5000   | 服务监听端口                     |
| LEARNING\_PIPELINE\_TIMEOUT\_MS | 480000 | 主链路总超时（旧 120s 会 502）       |
| LEARNING\_RATE\_LIMIT\_PER\_MIN | 6      | 同 IP 每分钟最多学习请求数            |
| USE\_LANGGRAPH                  | false  | true 时使用 LangGraph 编排      |
| USE\_SLOT\_GENERATION           | true   | A2 槽位分段生成（关掉退化为单次 JSON 调用） |

### 11.4 后端网关出口 (e-flowcode)

scripts/llm-egress.sh：dev/start 会 source 该脚本配置出口代理；Node 22 需要 NODE\_USE\_ENV\_PROXY=1（脚本已设）。

***

## 12. 项目运行方式

### 12.1 包管理与依赖

```
pnpm install --prefer-frozen-lockfile  # 强制 pnpm≥9.0.0（preinstall 禁 npm/yarn）
```

### 12.2 NPM Scripts

```
pnpm dev             # 开发模式 (scripts/dev.sh)：清 5000 端口 + BGE embedding 服务
                     #   + 出口代理 + pnpm tsx watch src/server.ts（不是 next dev！）
pnpm build           # 生产构建：install → next build → tsup 打包 src/server.ts → dist/server.js
pnpm start           # 生产启动：BGE 服务 + node dist/server.js
pnpm ts-check        # tsc 类型检查（注意 build 阶段 skip 了 TS 错误）
pnpm lint            # eslint
pnpm test            # vitest 单测
pnpm smoke           # 跑 batch-smoke 冒烟
pnpm check:docs      # Python 检查文档一致性
pnpm dev:test        # 测试模式开发
```

### 12.3 为什么不用 next dev

项目使用自定义 HTTP 入口 src/server.ts（不是 Next 自带 server），以便：

1. 统一监听 5000 端口（Next / API / 健康检查 / SSE）
2. 在 dev.sh 里配置 BGE embedding 服务 + 出口代理
3. build 出独立 dist/server.js（生产部署不需要 Next 二进制）

### 12.4 本地运行前置条件

1. Supabase：扣子环境自动注入 COZE\_SUPABASE\_\*；本地跑需 .env 或 coze-workload-identity
2. Neo4j：.env 配置 NEO4J\_\*（缺失会明确报错，不降假数据）
3. LLM Gateway：.env 配置 EFLOWCODE\_API\_\*（或离线用 LLM\_MOCK\_MODE=true）
4. BGE Embedding：src/services/embedding\_server.py（启动脚本自动拉起）
5. Node ≥20、Python 3、pnpm ≥9

### 12.5 最快跑通（离线零外部依赖）

```
echo "LLM_MOCK_MODE=true" > .env
pnpm install
pnpm dev            # → http://localhost:5000
# Neo4j 缺失会明确报错，但 A2/A3 退化为 LLM-only 仍能跑主流程
```

***

## 13. 完整调用链路

```
用户在首页选择：母语=英语, HSK=3, 场景=日常社交
  ↓
startLearning() [page.tsx]
  ├─ LearnerProvider.initLearner() → 新建/恢复学习者
  ├─ localStorage: learner_id, native_language, hsk_level
  └─ URL 跳转: /learning?learner=xxx&kp=daily&level=3&lang=英语
  ↓
learning/page.tsx onLoad
  ├─ 从 localStorage 读参数
  └─ fetch POST /api/learning
  ↓
api/learning/route.ts POST (限流:6/IP/min, 超时 480s)
  ├─ Step 0: getKnowledgePointByScene("daily") → SCENE_TYPE_MAP + Supabase ilike → kpId
  ├─ Step 1: 获取/创建学习者 (Supabase learners, 请求入参优先于 DB 旧值)
  └─ Step 2: multiAgentCoordinator.processLearningRequest()
       ├─ CACHE CHECK queryKnowledgeBase(kpId, 'en')
       │   ├─ ✓ 命中 → 跳过 A2/A3，仅 A4 生成练习题 (1 次 LLM)
       │   └─ ✗ 未命中 → 走完整 5 智能体链路 ↓
       ├─ A1 LearnerProfilerAgent (无 LLM)
       │   ├─ DB anxiety → 映射 level → native_ratio
       │   └─ 查 L2 趋势 (近 5 轮薄弱维度)
       ├─ A2 MotherTongueExplainer + A3 CulturalComparator (并行)
       │   ├─ A2: 双批并行槽位生成 + Neo4j 图谱注入 + KP 语义锚定
       │   └─ A3: LLM 生成 → detectBias()
       │   └─ 合计 2-3 次 LLM
       ├─ A4 ContentGenerator (90-180s 超时) → validateExercisesFormat
       ├─ A5 QualityController → 不合格 → A4 重生成 ×2
       │   └─ 合计 1~3 次 LLM
       └─ 异步 saveToKnowledgeBase() → Supabase 缓存
  ↓
API 格式化响应 → exercises.type 英文→中文
  ↓
学习页渲染 Tabs (母语阐释 → 跨文化对比 → 场景对话 → 答题练习)
  └─ 5 题做完 → POST /api/learning/results
       ├─ Step 0: 计算（向量/焦虑/BKT/遗忘/情感）
       ├─ Step 1: L1 learning_records
       ├─ Step 2: L2 assessment_records (5 维分+错误模式+情感)
       ├─ Step 3: L3 learners（焦虑+向量+sessions+scene）
       ├─ Step 3.5: learner_snapshots（按 5 规则触发）
       └─ Step 4: Neo4j LearnerGraph 写掌握度边
       └─ 返回 updated_learner → LearnerContext 更新
```

一次完整未命中缓存：4 次 LLM（A2+A3 并行 + A4 + A5）；命中缓存：1 次 LLM。

***

## 14. 排错地图

### 14.1 按钮点击无响应

1. DevTools Console 是否有 JS 错
2. selectedLanguage/selectedLevel 未选择（startLearning 会拦截）
3. localStorage 被浏览器隐私策略阻止

### 14.2 选了 HSK 但内容等级不对

1. Network → /api/learning Request Payload hsk\_level 是否正确
2. learning/page.tsx localStorage.getItem("hsk\_level")
3. page.tsx setItem 执行过没有

### 14.3 一直 loading / 502

1. Network 状态码：502/超时超 480s → 查 app.log Agent xxx timeout；503 → Supabase 连接；429 → 限流；404 → learner\_id 过期（清 localStorage）
2. LEARNING\_PIPELINE\_TIMEOUT\_MS 够不够
3. 快速排查 LLM：设 LLM\_MOCK\_MODE=true 再跑

### 14.4 内容像固定模板不随 HSK/母语变

1. 日志 \[知识库] 命中缓存 → 缓存粒度只按 kpId+lang，不区分 HSK 等级
2. 清空 Supabase cultural\_explanations + cross\_cultural\_comparisons 表重试
3. 场景映射 \[场景映射] 日志 → 是否兜底了 sceneId 本身

### 14.5 学习内容跑题 (校园→筷子文化)

1. \[场景映射] 日志 → getKnowledgePointByScene 的模糊结果
2. A2 注入 kpSemanticBlock 日志 topic 是否匹配

### 14.6 明明配了 Neo4j 却不生效

1. \[Neo4j] 连接成功/失败 日志（不存在 = 根本没被调）
2. NEO4J\_URI 是否 neo4j+s\:// 协议
3. .env 配置后重启 dev server（模块顶层 import 会冻结配置）

### 14.7 填空题无法作答 — 已知限制

A4 Prompt 要求填空题 options=\[]，前端只实现了选择/判断交互。临时：A4 Prompt 去掉 fill\_blank 类型；长期：前端补填空输入 UI。

### 14.8 做题判错但实际对了

1. /api/learning 响应里 exercises\[].correct\_answer 格式。选择题必须 A/B/C/D；判断题必须 对/错。
2. 判断题特殊处理：前端先把 A→对、B→错 再比较。如果 LLM 返回中文内容而非字母 → Prompt 未被遵循。

### 14.9 知识图谱页面空白

1. Console + Network → /api/knowledge/graph。500/503 → .env NEO4J\_\*。空数组 → Neo4j 没数据 → 跑迁移脚本 scripts/seed\_neo4j.py。

***

## 15. 文件速查表

| 文件 (相对项目根)                                         | 作用                                    | 上游                                | 下游                                   | 出错现象                             | 优先排查点                                      |
| -------------------------------------------------- | ------------------------------------- | --------------------------------- | ------------------------------------ | -------------------------------- | ------------------------------------------ |
| src/app/page.tsx                                   | 首页：选参数启动学习                            | 用户                                | /learning + API                      | 按钮无响应/参数丢失                       | localStorage, initLearner                  |
| src/app/learning/page.tsx                          | 学习页：展示+答题                             | 首页跳转                              | /api/learning, /api/learning/results | 白屏/一直 loading/判错                 | validateAnswer, fetch 响应                   |
| src/app/layout.tsx                                 | 根布局 + LearnerProvider + Inspector     | Next.js                           | 所有页面                                 | 全局白屏                             | LearnerProvider                            |
| src/lib/learner-context.tsx                        | 前端唯一 learner 状态源                      | 首页/学习页                            | 跨页共享状态                               | 切换学习者后未更新                        | fetchLearner, localStorage 同步              |
| src/components/interactive-graph-visualization.tsx | 知识图谱力导向图 (vis-network)                | 图谱页                               | /api/knowledge/graph                 | 空白/节点错位                          | vis-network 初始化                            |
| src/app/api/learning/route.ts                      | 主流程编排                                 | 学习页 fetch                         | multi-agent-system + Supabase        | 502/503/429/空内容                  | 限流, 超时, learner 查询, 场景映射                   |
| src/app/api/learning/results/route.ts              | L1/L2/L3/L4 三级写入                      | 学习页答题提交                           | Supabase + Neo4j                     | 500 保存失败, 结果不回写                  | 焦虑增量, BKT, 快照触发                            |
| src/app/api/learners/route.ts                      | 学习者列表/创建 CRUD                         | 首页, context                       | Supabase learners                    | 400 缺字段, 500 DB                  | 必填字段校验                                     |
| src/app/api/knowledge/graph/route.ts               | Neo4j 图谱查询/测试/迁移                      | 图谱页, 管理台                          | neo4j-service                        | 503 连不上 Neo4j                    | NEO4J\_\* env                              |
| src/app/api/explanations/route.ts                  | 多语言阐释 SSE 流式+统计                       | 首页阐释 Tab                          | multi-language-service               | SSE 断流, 覆盖率 0                    | SSE 响应头, 语言码映射                             |
| src/app/api/culture/compare/route.ts               | 跨文化对比 CRUD+生成                         | A3, 管理台                           | crossCulturalComparisonService       | LLM 生成失败                         | 字段校验, LLM 连接                               |
| src/lib/multi-agent-system.ts                      | 5 智能体协调器 (3017 行，见 SPLIT\_PLAN.md 拆它) | learning API                      | LLM + Supabase + Neo4j               | 生成失败/格式错/超时                      | 哪个 Agent 抛 AgentError, safeJsonParse       |
| safeJsonParse()                                    | JSON 容错解析                             | 所有 Agent                          | -                                    | 解析失败抛 ValidationError            | LLM 原始文本（含 think 标签？）                      |
| applyAnxietyDelta()                                | 焦虑唯一增量公式                              | results API, A1                   | -                                    | 焦虑变化不合理？                         | correctRate ∈ 0-1                          |
| bayesianKnowledgeTracing()                         | BKT 算法                                | results API, A1                   | -                                    | 掌握度异常                            | slip=0.10 (不是 0.9)                         |
| getKnowledgePointByScene()                         | 场景→知识点映射                              | learning API Step0                | Supabase                             | 内容与场景不匹配                         | SCENE\_TO\_KP\_KEYWORDS, ilike 结果          |
| queryKnowledgeBase()                               | 缓存查询                                  | Coordinator Step0                 | Supabase                             | 内容不随 HSK 变                       | 缓存键不含 HSK 等级                               |
| detectBias()                                       | 偏见检测                                  | A3, A5                            | -                                    | 误报漏报                             | BIAS\_KEYWORDS/PATTERNS                    |
| BaseAgent.generateResponse()                       | LLM 调用基类                              | 所有 Agent                          | unified-llm-service                  | 超时/空返回                           | AbortSignal, preset, mock 判断               |
| A1 LearnerProfilerAgent                            | 焦虑度+画像+L2 趋势                          | Coordinator                       | 无 LLM                                | 趋势 N/A？                          | Supabase client 是否注入                       |
| A2 MotherTongueExplainerAgent                      | 母语阐释，槽位双批并行                           | Coordinator                       | 1-3 LLM calls                        | 槽内容混？                            | \<SLOT\_N> 解析，单槽补生成日志                      |
| A3 CulturalComparatorAgent                         | 跨文化对比 + 偏见检测                          | Coordinator                       | 1 LLM call                           | 偏见未检测？                           | detectBias 分数                              |
| A4 ContentGeneratorAgent                           | 内容生成+格式验证                             | Coordinator                       | 1-3 LLM calls                        | 题目字段错？                           | validateExercisesFormat                    |
| A5 QualityControllerAgent                          | 自动评分+不合格反馈                            | Coordinator                       | 1-3 LLM calls                        | 一直不合格？                           | 反馈是否被 A4 正确消费                              |
| MultiAgentCoordinator.processLearningRequest()     | 协调器主入口                                | learning API                      | 所有 Agent                             | 任何 Agent 错                       | 缓存命中与否                                     |
| src/lib/llm-config.ts                              | 中央 LLM 路由 (fail-closed)               | UnifiedLLMService, BaseAgent      | e-flowcode 网关                        | Model is not in verified catalog | LLM\_\*\_MODEL 拼写, EFLOW\_VERIFIED\_MODELS |
| src/lib/unified-llm-service.ts                     | 统一 chat/chatStream                    | BaseAgent, knowledge-base-service | DeepSeek/Qwen/OpenAI/Coze            | 401/429/524                      | provider 分发, mock fixture                  |
| src/lib/llm-runtime-policy.ts                      | 配额+费用估算                               | UnifiedLLMService                 | -                                    | 调用被拒绝                            | 预算文件, LLMProviderError.code                |
| src/storage/database/supabase-client.ts            | Supabase 客户端初始化+Python SDK 拉凭证        | 所有 DB 操作                          | Supabase 云                           | 全局 503                           | COZE\_SUPABASE\_\* 变量                      |
| src/lib/knowledge-base-service.ts                  | 知识库 4 子服务 CRUD                        | 各知识 API                           | Supabase                             | 知识点查不到                           | 表名, ilike 过滤                               |
| src/lib/neo4j-service.ts                           | Neo4j 连接查询                            | 图谱 API, A2, L4                    | Neo4j Aura                           | 图谱空白, A2 图谱注入 N/A                | getNeo4jConfig() 每次现读 env                  |
| src/lib/learner-graph.ts                           | 学习者图谱 (MASTERED 边)                    | results API (L4)                  | Neo4j                                | 推荐不更新                            | recordMastery 错误日志                         |
| src/lib/multi-language-explanation-service.ts      | 8 语种阐释生成+统计                           | /api/explanations                 | UnifiedLLMService                    | 覆盖率 0                            | SUPPORTED\_LANGUAGES 映射                    |
| src/lib/emotion-check.ts                           | 情感检测 (红黄绿) + 干预建议                     | results API Step0                 | -                                    | 永远 yellow？                       | 阈值: correctRate/连错/焦虑                      |
| src/lib/constants.ts                               | 单一常量源                                 | 跨层引用                              | -                                    | 场景映射不到                           | SCENE\_TYPE\_MAP                           |
| src/storage/database/shared/schema.ts              | Drizzle 全表 schema                     | DB client, Drizzle Kit            | -                                    | 建表错/索引失效                         | SQL 类型匹配                                   |
| src/services/guardrail-service.ts                  | 护栏服务：验证+缓存写策略                         | multi-agent-system                | UnifiedLLMService                    | 写不了缓存？                           | CACHE\_WRITE\_CONFIDENCE\_THRESHOLD        |
| src/storage/cache/cache-manager.ts                 | 缓存读写管理                                | guardrail-service                 | Supabase cultural\_explanations      | 命中率为 0？                          | 缓存键匹配                                      |
| src/server.ts                                      | 自定义 HTTP 入口 (非 Next dev)              | dev.sh / start.sh                 | Next App Router + 健康检查               | 启动失败端口被占                         | tsx watch, 5000 端口清理                       |
| next.config.ts                                     | Next.js 配置 (ignoreBuildErrors=true)   | next build / server               | -                                    | build 过了但运行报错                    | typescript.ignoreBuildErrors 注意            |
| scripts/dev.sh / build.sh / start.sh               | 开发/构建/启动脚本                            | pnpm dev/build/start              | 清端口 + BGE + 代理 + server              | 启动就崩                             | BGE health, ss 命令, Clash 代理                |
| scripts/llm-egress.sh                              | LLM 出口代理配置                            | dev.sh + start.sh                 | HTTP\_PROXY env                      | LLM 全部超时 524                     | Clash 监听端口                                 |
| package.json                                       | 依赖/脚本/引擎限制                            | pnpm                              | -                                    | 装不上依赖                            | pnpm\@9, engines.pnpm                      |
| SPLIT\_PLAN.md                                     | multi-agent-system.ts 的 3 种拆分方案       | 本文件                               | -                                    | 大文件冲突/难维护                        | 推荐方案一 1-2 人天先落地                            |

