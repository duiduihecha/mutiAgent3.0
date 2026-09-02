# 多智能体系统拆分方案（multi-agent-system.ts → 多文件）

> 当前 src/lib/multi-agent-system.ts 共 3017 行，一个篮子里塞了：错误类型/工具函数/核心算法/θ3 槽位生成逻辑/A1~A5 5 个 Agent/场景映射/知识库缓存/L2 趋势查询/协调器。
>
> 外部直接引用它的模块有 11 个：learning route / results route / jobs route、learning-task-store、learning-graph、learner-graph、evaluation-metrics、experiment-runner、3 个测试文件。
>
> 本文给出三种拆分方案，并对每一种列出：最终目录结构、迁移步骤、边界、代价清单。

---

## 0. 现状粗粒度拆分（行数估算）

| 功能块 | 当前行 | 体积说明 |
|--------|-------|----------|
| 错误类 + 工具 (safeJsonParse/withTimeout/withRetry) + 所有 interface/type | 1166 | 最大，还内包了 ~700 行 θ3 槽位逻辑 + ~220 行核心算法 |
| θ3 槽位生成与拼接（slot/assemble/trim/batch） | ~700 | 只被 A2 直接使用，纯函数 |
| 核心算法（焦虑/BKT/遗忘/能力向量/detectBias/比例） | ~220 | results、learner-graph、evaluation-metrics、测试都单独 import |
| BaseAgent（generateResponse + AbortSignal + 错误包装） | ~120 | 所有 Agent 继承 |
| A1 LearnerProfilerAgent | 106 | 无 LLM，轻 |
| A2 MotherTongueExplainerAgent（含 prompt 大段）| 209 | 依赖槽位逻辑 + Neo4j 图谱查询 + KP 语义查询 |
| A3 CulturalComparatorAgent | 146 | 依赖 detectBias + constants 偏见词 |
| A4 ContentGeneratorAgent | 267 | 依赖 A2/A3 产物结构、格式校验 |
| A5 QualityControllerAgent | 144 | 评分 prompt + 不合格重生成 |
| 场景映射 + 查询缓存/保存缓存 | ~400 | Coordinator 直接用；jobs route 单独 import getKnowledgePointByScene |
| L2 RecentLearningTrend + aggregateLearnerMetrics | ~200 | A1 消费；对 Supabase 强依赖 |
| MultiAgentCoordinator + 全局实例 | ~548 | 编排 5 个 Agent 的核心流程 |

---

## 方案一：按 5 Agent 职责横向切分（推荐 · 改造最小 · 可立即执行）

### 1.1 思路

把 5 个具体 Agent 各拆一个文件；其他共享物（类型、错误、工具、算法、槽位、知识 IO、协调器）按"被谁用"归类到共享模块。A2 私有的 θ3 槽位逻辑不进入共享算法层，独立为 a2-slots.ts（只被 A2 import）。

### 1.2 目标目录结构

    src/lib/
    ├── multi-agent/
    │   ├── index.ts                      ← barrel (可选)
    │   ├── types.ts                      ← AgentMessage / LearnerProfile / Exercise /
    │   │                                    GeneratedContent / SlotDef / SlotTemplate /
    │   │                                    SlotResult / RecentLearningTrend
    │   ├── errors.ts                     ← AgentError、ValidationError
    │   ├── utils.ts                      ← safeJsonParse、withTimeout、withRetry、truncateForA4
    │   ├── algorithms.ts                 ← 焦虑/母语占比/BKT/遗忘/能力向量/detectBias/
    │   │                                    validateSlotRatio（都是跨 Agent 或外部 import 的纯算法）
    │   ├── base-agent.ts                 ← BaseAgent + resolveAgentPreset
    │   ├── a2-slots.ts                   ← θ3 全套纯函数（只 export 必要入口供 A2 用）
    │   ├── scene-mapper.ts               ← getKnowledgePointByScene（SQL 模糊匹配）
    │   ├── cache-io.ts                   ← queryKnowledgeBase / saveToKnowledgeBase
    │   ├── trend-io.ts                   ← aggregateLearnerMetrics / getRecentLearningTrend
    │   ├── kp-semantics.ts               ← fetchKnowledgePointSemantics / queryCulturalGraphData
    │   ├── agents/
    │   │   ├── learner-profiler.agent.ts      ← A1
    │   │   ├── mother-tongue-explainer.agent.ts ← A2（import ../a2-slots + ../kp-semantics）
    │   │   ├── cultural-comparator.agent.ts    ← A3（import ../algorithms.detectBias）
    │   │   ├── content-generator.agent.ts      ← A4（内含 validateExercisesFormat）
    │   │   └── quality-controller.agent.ts     ← A5
    │   └── coordinator.ts                ← MultiAgentCoordinator + multiAgentCoordinator 单例
    │
    └── multi-agent-system.ts             ← 【兼容 barrel，关键！】不改 11 处外部 import 路径

兼容 barrel（src/lib/multi-agent-system.ts）退化为：

    export * from './multi-agent/types';
    export * from './multi-agent/errors';
    export * from './multi-agent/utils';
    export * from './multi-agent/algorithms';
    export * from './multi-agent/base-agent';
    export * from './multi-agent/scene-mapper';
    export * from './multi-agent/cache-io';
    export * from './multi-agent/trend-io';
    export * from './multi-agent/kp-semantics';
    export * from './multi-agent/agents/learner-profiler.agent';
    export * from './multi-agent/agents/mother-tongue-explainer.agent';
    export * from './multi-agent/agents/cultural-comparator.agent';
    export * from './multi-agent/agents/content-generator.agent';
    export * from './multi-agent/agents/quality-controller.agent';
    export * from './multi-agent/coordinator';

### 1.3 分步拆分顺序（每一步都可独立 PR、全绿）

1. 抽 types + errors + utils（纯搬运，0 逻辑变更）。
2. 抽 algorithms.ts（results/learning-graph/evaluation-metrics/tests 单独 import 的函数都在这里）。
3. 抽 base-agent.ts。
4. 抽 scene-mapper + cache-io + trend-io + kp-semantics（知识 IO 按职责直接拆 4 个小文件，避免"knowledge-io 新大包"）。
5. 抽 a2-slots.ts（700 行纯函数，先搬再跑 test）。
6. 五个 agents/*.agent.ts（拆到这里每个 Agent 的 import 数量 ≤5，就是最省力的挪位置）。
7. 抽 coordinator.ts。
8. 写回兼容 barrel 覆盖 src/lib/multi-agent-system.ts。
9. 等 2 周稳定后再择期"11 处引用路径迁移 + 删除 barrel"（可选，不是必做）。

### 1.4 方案一的代价清单

| # | 代价项 | 说明 | 量级 |
|---|--------|------|------|
| 1 | 循环依赖风险 | types 只定义类型不引实现；a2-slots 不引 Agent。只要"types 是叶子节点"就不会有环。 | 低 · 可控 |
| 2 | 共享 utils / algorithms 继续膨胀 | 后续新函数倾向塞到共享层。需要评审规则：非 2+ 个文件复用 → 放 agent 私有或 kp-semantics 这种 io 子文件。 | 中 · 需要评审约定 |
| 3 | prompt 跨文件对比上下文丢失 | 原来 A2~A5 的 system prompt 同文件一眼对照，拆后要跳文件。可选补丁：集中到 multi-agent/prompts/a2.ts~a5.ts。 | 低 · 体验/可选补丁 |
| 4 | tsx watch 冷启动轻微抖动 | 从 1 文件 3017 行 → 约 17 个文件。日常开发 HMR 粒度更细是利好；仅当"同时改 prompts/ 与 barrel/index.ts"时可能触发略大范围的重编译。 | 低 |
| 5 | 知识 IO 拆 4 子文件 vs 1 大文件的选择 | 如果偷懒合成 knowledge-io，会形成新的 600 行大包，只是"大包换了个文件名"。建议直接拆 4 个，不留大包。 | 中 · 可通过纪律规避 |
| 6 | 单测与 11 处外部引用的路径迁移可选 | 有兼容 barrel → 0 迁移成本；如果要迁移引用（删 barrel）则要改 3 个测试 + 8 处 lib/app 引用。 | 低 · 一次性 |
| 7 | DI 注入不需要重写 | 现在的 neo4jService、getSupabaseClient、GuardrailService、CacheManager 都是模块级单例，拆分后依然是模块级单例，不引入 DI。代价 0。 | 0 |

### 1.5 工作量与风险

- 纯代码搬运总行数不变：3017 → 17 文件，约 1-2 人天（路径不迁移）。
- 风险：极低。保留兼容 barrel，且原文件不删只转 barrel，随时可 revert。
- 推荐度：✅ 立即做。

---

## 方案二：按技术层纵向切分（层次干净，后续做 SDK/实验框架最顺）

### 2.1 思路

不按"有几个 Agent"切，而按技术职责严格分层：类型层 → 纯算法/纯工具 → LLM 运行时 → Prompt 资源 → 数据访问层 → Agent 实现层 → 编排段 → 协调器。每层只依赖下层，禁止反向，禁止循环。

### 2.2 目标目录结构

    src/lib/mas/                          ← mas = Multi-Agent System（新命名空间）
    ├── index.ts                          ← barrel
    ├── errors.ts                         ← AgentError / ValidationError
    ├── types/                            ← 纯类型叶子，不 import 任何实现
    │   ├── core.ts                       ← AgentMessage / LearnerProfile / Exercise / GeneratedContent
    │   ├── slots.ts                      ← SlotDef / SlotTemplate / SlotResult
    │   └── io.ts                         ← RecentLearningTrend / 缓存 / 场景 类型
    ├── core/                             ← 纯算法 & 纯工具（0 IO / 0 LLM / 100% 可单测）
    │   ├── json.ts                       ← safeJsonParse、extractJsonFromReasoning
    │   ├── async.ts                      ← withTimeout、withRetry
    │   ├── anxiety.ts                    ← 焦虑度 / 母语占比 / 等级映射
    │   ├── bkt-memory.ts                 ← BKT + 遗忘曲线 + 记忆强度
    │   ├── ability-vector.ts             ← 能力向量 + 维度统计
    │   └── bias.ts                       ← detectBias
    ├── prompts/                          ← 抽离所有 Prompt 大段，Agent 只拼不内嵌
    │   ├── a2.native-explainer.ts
    │   ├── a3.cultural-comparator.ts
    │   ├── a4.content-generator.ts
    │   └── a5.quality-controller.ts
    ├── runtime/                          ← LLM 调用运行时层
    │   ├── base-agent.ts                 ← BaseAgent + resolveAgentPreset
    │   └── slot-engine.ts                ← θ3 槽位引擎（若未来不通用，可改成 agents/private/a2-slots.ts）
    ├── io/                               ← 数据访问层（推荐 client 传参，便于 mock）
    │   ├── scene-mapper.ts               ← getKnowledgePointByScene(sb, sceneId)
    │   ├── knowledge-cache.ts            ← queryKnowledgeBase(sb, params) / saveToKnowledgeBase(sb, ...)
    │   ├── kp-semantics.ts               ← fetchKnowledgePointSemantics(sb, kpId)
    │   ├── graph-cultural.ts             ← queryCulturalGraphData(neo4j, kpId, hcId)
    │   └── learner-trends.ts             ← aggregateLearnerMetrics / getRecentLearningTrend(sb, id)
    ├── agents/                           ← Agent 实现（只 depend on types / core / prompts / runtime / io）
    │   ├── learner-profiler.agent.ts
    │   ├── mother-tongue-explainer.agent.ts
    │   ├── cultural-comparator.agent.ts
    │   ├── content-generator.agent.ts
    │   └── quality-controller.agent.ts
    ├── pipeline/                         ← 编排段（把 Coordinator 的 5 段拆成可替换的子流）
    │   ├── learner-profile-builder.ts    ← A1 → 构建 learner 段上下文
    │   ├── explain-compare-parallel.ts   ← A2 + A3 并行 + 超时重试统一
    │   ├── generate-and-validate.ts      ← A4 → A5 → 不合格重生成 × 2
    │   └── cache-in-out.ts               ← 命中缓存分支 → 跳过 A2/A3
    └── coordinator.ts                    ← 组合 pipeline/*，对外暴露 processLearningRequest()

并保留 src/lib/multi-agent-system.ts 作为兼容 barrel：

    export * from './mas/index';

### 2.3 依赖方向约束（必须成立，否则"分层"是假的）

    coordinator
      └── pipeline/*
            ├── agents/*
            │     ├── runtime (BaseAgent / slot-engine)
            │     ├── prompts (只读)
            │     ├── core (纯算法)
            │     └── io (数据访问)
            └── core + io

禁止项：
- core/* 不得 import agents / runtime / io；
- io/* 不得 import Agent 类；
- prompts/* 不得 import 任何实现文件（只能是常量字符串）。

### 2.4 方案二的代价清单

| # | 代价项 | 说明 | 量级 |
|---|--------|------|------|
| 1 | 首次改造工作量大 | 不是"挪位置"，而是把 Agent 内嵌 Prompt/IO/重试逻辑全抽层。需新建 ~25 文件、重写 import 链。 | 高 · 3-5 人天 |
| 2 | 数据访问 client 参数化 | 真分层需要把场景映射、缓存 IO、趋势 IO 的 getSupabaseClient() 调用改为从 coordinator 传入 client，从而可 mock 单测。如果偷懒仍保留模块级单例，那 io 层只是"import 集合"，不算真分层。 | 中 · 2-3 人天（可分阶段） |
| 3 | slot-engine 通用化过度设计风险 | θ3 槽位实际上只给 A2 用。把它抽象成 runtime 公共层容易接口膨胀、反直觉。规避：改成 agents/private/a2-slots.ts，不放入 runtime。 | 中 · 可规避 |
| 4 | AbortSignal/超时/重试的统一治理 | 把 Coordinator 里的 withTimeout/withRetry 拆到 pipeline/* 后，需要一个统一 PipelineContext(signal, traceId, metrics, hcId, cacheKey, ...)，否则各段超时策略不一致。 | 中 |
| 5 | 现有 11 处外部 import 的 ESM 路径复杂 | 即使 barrel 兼容，barrel 自身要走 mas/core/* 多层路径；tsconfig paths + Next.js 服务器/客户端 bundle 边界会出现一次"别名抖动"期，要跑 smoke 回归。 | 中 · 一次性 |
| 6 | 新人阅读成本增加 | 原来 1 个文件看完整链路，现在要读 pipeline → agents → core/io。需要 src/lib/mas/README.md 做索引。 | 中 · 文档补齐即可 |
| 7 | 与 unified-llm-service 的职责重叠 | core/json.ts 的 extractJsonFromReasoning 与 unified-llm-service 里已有实现重复。需要明确谁是权威实现（建议：统一放到 unified-llm-service.ts，core/json 只做 re-export），否则两份逻辑长期漂移。 | 中 · 需决策 |
| 8 | generateExercisesOnly（缓存链路）要同时受 pipeline/cache-in-out 与 agents/a4 配合 | 原实现 Coordinator 里有一条独立的"只生成练习"路径，拆层后不能在 a4 Agent 里写死，否则 Cache 分支失效。 | 中 · 需要在 generate-and-validate 里区分 mode |

### 2.5 收益（什么场景下值得做）

- 单测覆盖率：core/ 纯函数 → 100%，io/ → mock client，agents/ → 只测"拼 Prompt + 调用 runtime"，整体可达 80%+；
- 替换底层 LLM / 换数据源：只改 runtime/io 层，Agent 不动；
- 6 个月内做 Agent 独立部署 / 多模型对比实验；
- 多人并行改 A2 Prompt、A5 评分算法、缓存策略。

### 2.6 适用场景

- 团队 ≥ 3 人并行开发；
- 目标：CI 覆盖率 ≥80%、做 ablation experiments（拆 A3、换 A2 实现）、Agent 独立部署；
- 当前频繁在大文件上发生多人冲突。

---

## 方案三：Monorepo 多包切分（暂不推荐，只有复用场景才考虑）

### 3.1 思路

方案二如果已经落地、且确认"5 Agent 系统要被 3+ 个应用复用"（如 Next.js 主站 + React Native 端 + 批量实验 CLI），再把每层发布成 pnpm workspace 的独立 package：

    packages/
    ├── mas-core         ← @project/mas-core
    ├── mas-runtime      ← @project/mas-runtime
    ├── mas-io           ← @project/mas-io
    ├── mas-agents       ← @project/mas-agents
    ├── mas-prompts      ← @project/mas-prompts
    └── mas-coordinator  ← @project/mas-coordinator

    apps/
    └── web              ← 本项目 Next.js 应用（组合上述包）

### 3.2 方案三的代价清单（非常高）

| # | 代价项 | 说明 | 量级 |
|---|--------|------|------|
| 1 | 包配置地狱 | 每个包都要独立 package.json 的 main/module/types/exports + tsconfig.build.json + tsup 构建脚本。排错成本极高。 | 高 · 1-2 人天搭建 |
| 2 | DB Schema 跨包使用难 | mas-io 要用到 Drizzle schema shared/schema.ts。要么再抽 @project/db-schema 包（更多包），要么 mas-io 放弃 Drizzle 直接写裸 SQL（丢类型安全）。 | 高 · 连锁 |
| 3 | Phantom dependency & peer deps | pnpm workspaces + only-allow pnpm 本身对"同一 workspace 内互相用未声明的 dep"比较严格，容易本地能跑 CI 炸。 | 中 |
| 4 | 扣子平台部署脚本重写 | 当前 scripts/build.sh 是 next build + tsup src/server.ts。包化后 dist/server.js 的 bundle 追踪链复杂，需要验证 2-3 次才稳定。 | 高 · 需实测 |
| 5 | GuardrailService / CacheManager 反向依赖 | 它们在本项目 services/、storage/ 下，属于 application 层服务。纯 mas-* 包不能反引 application 层，必须通过接口注入。 | 中 · 架构补丁 |
| 6 | 小步 PR 无法做 | 包化是大爆炸改造，至少 5 个 PR 协同才能合；中途任一 PR 卡住 → 仓库半残状态。 | 高 · 流程风险 |
| 7 | 包版本发布链路 | 如果未来要独立发布到 npm/private registry，需要 changesets、版本矩阵、changelog 治理，团队工作量直接 +50%。 | 高 · 长期成本 |

### 3.3 什么时候才值得做

- 明确要把多智能体作为独立 npm 包，供 3+ 个应用复用；
- 已有成熟 Monorepo 治理（changesets + lint-staged + build matrix）；
- 不依赖 Coze 平台 build，或 packages/* 先发布到私有 registry。

本项目当前形态（Next.js 单应用 + 实验脚本 + 扣子部署）通常不推荐方案三，方案二足以做到 90% 的架构干净度。

---

## 三方案横向对比

| 维度 | 方案一 · 5 Agent 横向切分 | 方案二 · 技术层纵向切分 | 方案三 · Monorepo 多包 |
|------|--------------------------|-------------------------|------------------------|
| 文件数 | ~17（比现在多 16 个） | ~25-30 | 6+ packages × 多文件 |
| 行数 | 不变（拆分不合并） | 略减 ~2500 | ~2500 + 大量配置文件 |
| 预计改造人天 | 1-2 人天 ✅ | 3-5 人天 | 7-14 人天 |
| 对 11 处外部调用 | 兼容 barrel → 0 改造 | 仍需 barrel，但 io 参数化改造可选 | 所有路径/包名/exports 都要回归 |
| 循环依赖风险 | 低 · types 为叶 | 中 · 严格层化才能避免 | 高 · 包边界 + exports 叠加 |
| 可测试性提升 | 中 | 高 | 高 |
| Prompt 多人编辑体验 | 好 | 最好（prompts/ 目录集中） | 同方案二 |
| 后续加 A6/A7 | 加 agents/a6.ts | 加 agents/a6.ts + prompts/a6.ts | 同方案二，需走包版本 |
| 独立部署为服务 | 一般 | 友好 | 直接可用 |
| 回滚难度 | 极低（barrel 不删即回） | 中（pipeline 拆完再合并成本高） | 极高 |
| 风险等级 | 低 | 中 | 高 |
| 推荐度 | ✅ 马上做 | ⭐ 中期演进目标 | ❌ 暂不推荐 |

---

## 推荐的渐进组合路径（低风险 + 高收益）

1. 立即做方案一（1-2 人天）：IO 直接拆 4 个小文件，避免新大包；保留兼容 barrel，每步 PR 全绿。
2. 紧接着拆 prompts/（~0.5 人天，方案二的局部）：把 A2~A5 的大段 Prompt 抽离 prompts/a{2,3,4,5}.ts，Agent 文件里只剩"读常量 + 拼模板 + 调用"。
3. （可选，架构升级窗口时做）方案二的 core/io/pipeline 分层：当团队≥3 人，或要启动"80% 覆盖率单测"专项时引入。
4. 不要在第 3 步之前碰方案三：只有当第 3 步已经落地、且出现明确的"3+ 应用复用多智能体"时才包化。

---

## 任何方案都必须守住的 7 条纪律

1. 保留兼容 barrel 至少 2 周：src/lib/multi-agent-system.ts 不要立即删，改为 re-export。
2. 每一步 PR 都全绿（ts-check + test + smoke）：拆分不许"分 10 个 PR 中间有 6 个红的"。
3. 同一次 PR 里不做逻辑变更 + 变量重命名：只做"文件切分 + 路径改写"。
4. Slot 逻辑归属明确：θ3 仅 A2 使用 → 放入 a2-slots.ts 或 agents/private/，别塞进共享层。
5. 关键算法单一权威实现：applyAnxietyDelta、bayesianKnowledgeTracing 只留一份实现，results route 从共享层 re-export 取。
6. 环境变量读取单点：LLM 配置永远走 llm-config.ts 的 getLLMConfig(preset)，不允许新拆的 Agent 文件里直接读 process.env。
7. 日志前缀保持不变：[A1]/[A2]/[A3]/[A4]/[A5]/[θ3]/[知识库]/[场景映射] 不要改文案，否则排错地图失效。
