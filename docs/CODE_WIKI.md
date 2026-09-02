# Code Wiki — 母语驱动的跨文化对比式中文学习系统

> 项目仓库：`/Users/wanglei/Projects/ai-agents/mutiAgent3.0`
> 最后更新：2026-09-02（反映 2026-09-02 代码快照）
> 总代码量：34,827 行 TypeScript

***

## 1. 项目概述

面向 8 大母语文化圈留学生的 **HSK1-9 级智能中文学习平台**。核心链路：**母语阐释打底 → 跨文化对比匹配 → 场景化练习闭环**。

架构形态：**多智能体（A1\~A5）串并行协作**，融合 e-flowcode LLM 网关 + Supabase + Neo4j 知识图谱 + Guardrail 质量网关。

### 2026-09-02 重构要点

上一轮重构（方案一 · 横拆）已完成：

| 变化                      | 前             | 后                                                |
| ----------------------- | ------------- | ------------------------------------------------ |
| `multi-agent-system.ts` | 1401→3017 行单体 | 24 行兼容 barrel + `multi-agent/` 子目录（16 模块 5663 行） |
| Prompt 管理               | 内嵌各 Agent     | 独立 `multi-agent/prompts/`（A2\~A5 + helpers）      |
| Auth                    | 无             | 新增 `lib/auth/`（JWT + cookie + 限流 + 锁定）           |
| A2 Few-shot             | 无             | 新增 fewshot bank / retriever / ratio calibrator   |

**兼容策略**：`src/lib/multi-agent-system.ts` 保留为 barrel re-export，零逻辑改动，11 处外部 import 路径无需迁移。

***

## 2. 技术栈

| 层级        | 技术                       | 说明                         |
| --------- | ------------------------ | -------------------------- |
| 前端        | Next.js 16 / React 19    | App Router + SSR           |
| 样式        | TailwindCSS 4            | + shadcn/ui 组件库            |
| 持久化       | Supabase (PostgreSQL)    | 356 学习者 / 69 知识点 / 缓存      |
| 图数据库      | Neo4j Driver 6           | 知识图谱可视化                    |
| LLM 网关    | e-flowcode (OpenAI 兼容)   | 统一 26 模型                   |
| LangGraph | @langchain/langgraph 1.3 | 新版编排（`USE_LANGGRAPH=true`） |
| ORM       | Drizzle                  | Supabase schema            |
| 包管理       | pnpm ≥ 9                 | preinstall 强约束             |

***

## 3. 目录结构

```
mutiAgent3.0/
├── src/
│   ├── app/                          # Next.js 页面 + API（37 个路由）
│   │   ├── page.tsx                  # 首页
│   │   ├── learning/page.tsx         # 学习页
│   │   ├── knowledge-graph/page.tsx  # 知识图谱可视化
│   │   ├── test/page.tsx             # LLM 调试
│   │   ├── admin/                    # 管理后台
│   │   ├── feedback/                 # 用户反馈
│   │   └── api/
│   │       ├── learning/             # 主链路 + results + jobs
│   │       ├── knowledge/             # 知识点 + 图谱
│   │       ├── learners/              # CRUD + trends + recommendations
│   │       ├── auth/     🆕           # login/register/me/logout/forgot/reset/link-learner
│   │       ├── explanations/          # 多语言阐释（SSE）
│   │       ├── culture/compare/       # 跨文化对比
│   │       ├── cache/                 # 统计 + 投票
│   │       ├── feedback/              # 用户反馈
│   │       ├── vlog/generate/          # vlog 生成
│   │       └── test/llm/              # LLM 连通测试
│   │
│   ├── lib/                          # 核心业务
│   │   ├── multi-agent-system.ts     # 🔔 兼容 barrel（24 行）
│   │   ├── multi-agent/              # 🆕 横拆子系统（16 模块, 5663 行）
│   │   │   ├── types.ts              # PipelineContext / AgentMessage / ExerciseItem
│   │   │   ├── errors.ts             # AgentError / PipelineError
│   │   │   ├── utils.ts              # safeJsonParse / withTimeout / withRetry / truncateForA4
│   │   │   ├── algorithms.ts         # 焦虑度 / BKT / detectBias
│   │   │   ├── a2-slots.ts           # θ3 槽位分配（437 行）
│   │   │   ├── a2-fewshot-bank.ts    # 🆕 A2 Few-shot 库（356 行）
│   │   │   ├── a2-fewshot-retriever.ts # 🆕 检索（195 行）
│   │   │   ├── a2-ratio-calibrator.ts # 🆕 比例校准（331 行）
│   │   │   ├── base-agent.ts         # BaseAgent（195 行）
│   │   │   ├── kp-semantics.ts       # 知识点语义（205 行）
│   │   │   ├── scene-mapper.ts       # 场景映射（119 行）
│   │   │   ├── cache-io.ts           # 缓存读写（167 行）
│   │   │   ├── trend-io.ts           # 趋势读写（242 行）
│   │   │   ├── coordinator.ts        # MultiAgentCoordinator（654 行）
│   │   │   ├── agents/               # 5 个 Agent
│   │   │   │   ├── learner-profiler.agent.ts     (184)
│   │   │   │   ├── mother-tongue-explainer.agent.ts (363)
│   │   │   │   ├── cultural-comparator.agent.ts  (198)
│   │   │   │   ├── content-generator.agent.ts    (314)
│   │   │   │   └── quality-controller.agent.ts   (187)
│   │   │   └── prompts/              # 🆕 Prompt 独立目录
│   │   │       ├── a2.ts / a2-helpers.ts
│   │   │       ├── a3.ts / a4.ts / a5.ts
│   │   │       └── index.ts
│   │   │
│   │   ├── auth/                     # 🆕 认证（10 模块, 440 行）
│   │   │   ├── types.ts   jwt.ts  cookie.ts  password.ts
│   │   │   ├── rate-limit.ts  lockout.ts  reset-store.ts
│   │   │   ├── middleware.ts  migration.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── unified-llm-service.ts    # 统一 LLM（26,302 行）
│   │   ├── llm-config.ts             # 路由配置（9,676 行）
│   │   ├── llm-runtime-policy.ts     # 运行时策略（3,933 行）
│   │   ├── constants.ts               # 常量（11,163 行）
│   │   ├── learning-graph.ts          # LangGraph（44,404 行）
│   │   ├── learner-graph.ts           # 学习者图谱（22,711 行）
│   │   ├── knowledge-base-service.ts  # KB CRUD（15,502 行）
│   │   ├── neo4j-service.ts           # Neo4j（13,610 行）
│   │   ├── unified-data-service.ts    # 统一数据层（12,847 行）
│   │   ├── ...（evaluation-metrics 等实验/评测模块）
│   │   └── utils.ts                   # 通用工具（169 行）
│   │
│   ├── services/guardrail-service.ts # 质量网关（53,285 行）
│   └── storage/
│       ├── database/
│       │   ├── supabase-client.ts       # Supabase 客户端（3,060 行）
│       │   └── shared/
│       │       ├── schema.ts            # Drizzle schema（13,676 行, 15 表）
│       │       └── relations.ts
│       └── cache/cache-manager.ts       # 缓存管理（3,312 行）
│
├── docs/                             # 项目文档
├── scripts/                          # 70+ 运维/实验脚本
├── AGENTS.md                         # 系统说明书（旧架构仍有参考价值）
└── package.json
```

***

## 4. 系统架构

### 4.1 分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  前端层 (Next.js App Router)                                        │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ fetch
┌──────────────────────────────────▼──────────────────────────────────┐
│  API 路由层 (37 个 Route Handler)                                    │
│  learning · knowledge · learners · auth · guardrail · 限流 · 拦截   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│  编排层                                                              │
│  coordinator.ts（手写）   ← 或 →   learning-graph.ts（LangGraph）    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│  multi-agent/ 子系统（横拆后, 16 模块）                              │
│  A1~A5 Agent + base-agent + prompts + utils + algorithms            │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ generateResponse()
┌──────────────────────────────────▼──────────────────────────────────┐
│  LLM 服务层                                                          │
│  llm-config.ts → UnifiedLLMService → e-flowcode 网关（26 模型）     │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│  Guardrail 质量网关（Solver + 硬规则 + Grounding + 双模型仲裁）     │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│  存储层：Supabase · Neo4j Aura · Auth JWT + Cookie                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 主数据流

```
POST /api/learning { learner_id, knowledge_point_id, hsk_level, native_language }
    │
    ├─→ IP 限流 (6/分钟)
    ├─→ 场景→知识点映射 (scene-mapper.ts)
    ├─→ 获取/创建学习者
    ├─→ [可选] getAuthed() (auth/middleware.ts) — 用户登录后学习
    │
    ▼
coordinator.processLearningRequest() [或 LangGraph 版]
    │
    ├─ Step 0: cache-io.queryKnowledgeBase() → 命中?
    │   ├─ YES → A4 仅生成练习 → Guardrail → 返回
    │   └─ NO  → 继续 ↓
    │
    ├─ Step 1: A1 LearnerProfiler（纯计算，无 LLM）
    │   · 读 DB 焦虑度 → 映射等级 → 母语占比
    │   · trend-io 查 L2 短期记忆趋势
    │
    ├─ Step 2: Promise.all([A2, A3]) 并行
    │   · A2: θ3 槽位 + Few-shot 检索 + 比例校准
    │   · A3: 文化对比 + detectBias（algorithms.ts）
    │
    ├─ Step 3: A4 ContentGenerator
    │   · 消费 A2+A3（truncateForA4 瘦身到 2000 字）
    │   · validateExercisesFormat() 格式验证
    │
    ├─ Step 4: Guardrail Service
    │   · a4_solver: Solver 对抗盲测
    │   · a4_hard_rules: 拼音 + HSK 超纲字
    │   · a4_grounding: Grounding 校验
    │   · a5_joint: 双模型联席仲裁
    │
    └─ Step 5: 异步 cache-io.saveToKnowledgeBase()
        · confidence > 0.85 才写缓存

前端 → 做题 → POST /api/learning/results
    · applyAnxietyDelta(correctnessRate) = (0.5 - rate) × 20
    · UPDATE learners SET cultural_anxiety_score = clamp(old + delta, 0, 100)
    · 情感检测 (emotion-check.ts)
```

### 4.3 LLM 调用

| 链路    | 次数                      | 耗时       |
| ----- | ----------------------- | -------- |
| 缓存未命中 | 4 次（A2/A3 并行, A4/A5 串行） | 120-180s |
| 缓存命中  | 1 + Guardrail           | 90-150s  |

***

## 5. 核心模块详解

### 5.1 multi-agent/ 横拆子系统

原 `multi-agent-system.ts`（3017 行单体）横向切分为 16 模块，`multi-agent-system.ts` 保留为 24 行兼容 barrel：

| 模块                           | 行数       | 内容                                                      |
| ---------------------------- | -------- | ------------------------------------------------------- |
| `types.ts`                   | 120      | PipelineContext / AgentMessage / ExerciseItem           |
| `errors.ts`                  | 75       | AgentError / PipelineError / AgentErrorKind             |
| `utils.ts`                   | 326      | safeJsonParse / withTimeout / withRetry / truncateForA4 |
| `algorithms.ts`              | 347      | 焦虑度 / BKT / detectBias / calculateAbilityVector         |
| `a2-slots.ts`                | 437      | θ3 6 槽位分配 + 过渡锚句                                        |
| `a2-fewshot-bank.ts` 🆕      | 356      | A2 Few-shot 库                                           |
| `a2-fewshot-retriever.ts` 🆕 | 195      | 语义检索                                                    |
| `a2-ratio-calibrator.ts` 🆕  | 331      | 母语/中文比例校准                                               |
| `base-agent.ts`              | 195      | BaseAgent 基类                                            |
| `kp-semantics.ts`            | 205      | 知识点语义匹配                                                 |
| `scene-mapper.ts`            | 119      | 场景→知识点（Supabase ilike）                                  |
| `cache-io.ts`                | 167      | 缓存读写                                                    |
| `trend-io.ts`                | 242      | 趋势读写                                                    |
| `coordinator.ts`             | 654      | MultiAgentCoordinator 主类                                |
| `agents/*.agent.ts` × 5      | 941      | A1\~A5 Agent                                            |
| `prompts/*.ts` × 5           | 624      | Prompt 模板                                               |
| **合计**                       | **5663** | <br />                                                  |

**Agent 速查**：

| Agent                    | 文件                                            | LLM | 职责                    |
| ------------------------ | --------------------------------------------- | --- | --------------------- |
| A1 LearnerProfiler       | agents/learner-profiler.agent.ts (184)        | ❌   | 焦虑度读取 + 母语占比 + L2 趋势  |
| A2 MotherTongueExplainer | agents/mother-tongue-explainer.agent.ts (363) | ✅×1 | θ3 6 槽位 + Few-shot 增强 |
| A3 CulturalComparator    | agents/cultural-comparator.agent.ts (198)     | ✅×1 | 跨文化对比 + 偏见检测          |
| A4 ContentGenerator      | agents/content-generator.agent.ts (314)       | ✅×1 | 内容生成 + 格式验证           |
| A5 QualityController     | agents/quality-controller.agent.ts (187)      | ✅×1 | 质量审核 + 偏见二次检测         |

**θ3 槽位语言分配**（焦虑度决定 6 槽中母语 vs 中文的比例）：

| 焦虑度            | 母语槽 | 中文槽 | target\_ratio |
| -------------- | --- | --- | ------------- |
| high (>80)     | 5   | 1   | 0.75          |
| medium (40-80) | 3   | 3   | 0.50          |
| low (<40)      | 1   | 5   | 0.25          |

**BaseAgent 关键机制**：

- 超时真正中止（Agent 级 AbortController → 透传到 UnifiedLLMService 中断底层 fetch）

- 空响应自愈（内部最多 8 次指数退避重试）

- 温度控制（消融实验固定 temperature=0.0）

**Prompt 模板**（`prompts/` 目录）：a2.ts（188 行，θ3 + Few-shot 指引）、a2-helpers.ts（161 行，槽位模板 + 过渡锚句）、a3.ts（66 行）、a4.ts（154 行，含练习题格式约束）、a5.ts（55 行）。

### 5.2 Auth 认证模块 🆕

**目录**：`src/lib/auth/`（10 模块，440 行）

| 模块               | 行数 | 职责                                                                   |
| ---------------- | -- | -------------------------------------------------------------------- |
| `types.ts`       | 69 | `AuthenticatedUser`, `AuthedContext`                                 |
| `jwt.ts`         | 36 | `signJwt(payload, exp)` / `verifyJwt(token)`                         |
| `cookie.ts`      | 64 | `setAuthCookie/res` / `readAuthCookie(req)` / `clearAuthCookie(res)` |
| `password.ts`    | 28 | bcrypt hash + verify                                                 |
| `rate-limit.ts`  | 56 | Supabase 限流（IP + 用户名双维度）                                             |
| `lockout.ts`     | 42 | 连续失败锁定（5 次 → 15 分钟冷却）                                                |
| `reset-store.ts` | 25 | 密码重置 token                                                           |
| `middleware.ts`  | 53 | `getAuthed(req)` — 统一鉴权入口                                            |
| `migration.ts`   | 67 | auth\_users 表迁移                                                      |

**安全特性**：

- Cookie: `httpOnly` + `secure`（生产）+ `sameSite=lax`

- 登录限流：IP + 用户名双维度（`rate-limit.ts`）

- 锁定机制：5 次失败 → 15 分钟（`lockout.ts`）

- JWT：短期 access token + 可选 refresh

**Auth 相关 API**（7 个）：

| 路由                       | 方法   | 行数  |
| ------------------------ | ---- | --- |
| `/api/auth/register`     | POST | 101 |
| `/api/auth/login`        | POST | 85  |
| `/api/auth/me`           | GET  | 54  |
| `/api/auth/link-learner` | POST | 53  |
| `/api/auth/forgot`       | POST | 44  |
| `/api/auth/reset`        | POST | 45  |
| `/api/auth/logout`       | POST | 15  |

***

### 5.3 LLM 服务层

**llm-config.ts**（9,676 行）— 中央路由：

```typescript
getLLMConfig(preset, overrides?) → { provider, model, apiKey, baseUrl, temperature, role }
```

**模型预设（LLMPreset）**：

| 预设                                      | 默认模型              | 说明       |
| --------------------------------------- | ----------------- | -------- |
| `generation`                            | deepseek-v4-flash | 日常生成     |
| `generation_quality`                    | deepseek-v4-pro   | 高质量      |
| `generation_a2` / `_a3` / `_a4` / `_a5` | deepseek-v4-flash | Agent 专用 |
| `judge`                                 | qwen3.8-max       | 裁判       |
| `judge2`                                | glm-5.2           | 第二裁判     |
| `guardrail_backtranslation`             | kimi-k2.6         | <br />   |
| `guardrail_binary`                      | qwen3.6-flash     | <br />   |
| `guardrail_solver`                      | qwen3.7-max       | <br />   |
| `guardrail_final`                       | glm-5.2           | <br />   |
| `mock`                                  | offline-mock      | <br />   |

e-flowcode 已验证 **26 个模型**（`LLM_EXTRA_MODELS` 可追加）。

**unified-llm-service.ts**（26,302 行）：

```typescript
class UnifiedLLMService {
  async chat(messages, options?): Promise<LLMResponse>;
  async *chatStream(messages, options?): AsyncGenerator<string>;
}
```

`LLMOptions.signal` 透传上游取消 → 级联中止底层 fetch。

***

### 5.4 Guardrail 质量网关

**文件**：`src/services/guardrail-service.ts`（53,285 行）

| 校验           | 说明                                         |
| ------------ | ------------------------------------------ |
| Solver 对抗盲测  | Guardrail 用 Solver 解同一道题 → 不一致标记           |
| 硬规则          | 拼音正确性 + HSK 超纲字白名单                         |
| Grounding 校验 | 答案是否被文化背景文本支撑                              |
| 双模型联席仲裁      | judge1 (qwen3.8-max) + judge2 (glm-5.2) 投票 |

**判定**：

| Action                | 处理                  |
| --------------------- | ------------------- |
| PASS                  | 正常继续                |
| FLAG\_PENDING\_REVIEW | 待审核（置信度衰减）          |
| FLAG\_REJECT          | **硬拦截**（API 返回 422） |

缓存写入阈值：`confidence > 0.85`

***

### 5.5 知识与存储层

| 文件                                      | 行数     | 职责                   |
| --------------------------------------- | ------ | -------------------- |
| `knowledge-base-service.ts`             | 15,502 | Supabase KB CRUD     |
| `neo4j-service.ts`                      | 13,610 | Neo4j 连接 + Cypher    |
| `knowledge-graph-neo4j-service.ts`      | 14,560 | 图谱专用                 |
| `unified-data-service.ts`               | 12,847 | Supabase + Neo4j 统一层 |
| `multi-language-explanation-service.ts` | 16,331 | 8 语言阐释               |
| `storage/database/supabase-client.ts`   | 3,060  | Supabase 客户端初始化      |
| `storage/database/shared/schema.ts`     | 13,676 | Drizzle schema（15 表） |
| `storage/cache/cache-manager.ts`        | 3,312  | 缓存管理                 |

***

## 6. API 路由清单（37 个）

### 核心学习（4）

| 路由                        | 方法       | 行数  |
| ------------------------- | -------- | --- |
| `/api/learning`           | POST     | 471 |
| `/api/learning/results`   | POST     | 607 |
| `/api/learning/jobs`      | GET/POST | 214 |
| `/api/learning/jobs/[id]` | GET      | 38  |

### 🆕 Auth（7）

| 路由                       | 方法   |
| ------------------------ | ---- |
| `/api/auth/register`     | POST |
| `/api/auth/login`        | POST |
| `/api/auth/logout`       | POST |
| `/api/auth/me`           | GET  |
| `/api/auth/link-learner` | POST |
| `/api/auth/forgot`       | POST |
| `/api/auth/reset`        | POST |

### 知识与图谱（6）

| 路由                                       | 方法             |
| ---------------------------------------- | -------------- |
| `/api/knowledge/points`                  | GET/POST       |
| `/api/knowledge/points/[id]`             | GET/PUT/DELETE |
| `/api/knowledge/graph`                   | GET            |
| `/api/knowledge/graph/level/[level]`     | GET            |
| `/api/knowledge/graph/contrasts/[kp_id]` | GET            |
| `/api/knowledge/admin`                   | GET/POST       |

### 学习者（4）

| 路由                                   | 方法       |
| ------------------------------------ | -------- |
| `/api/learners`                      | GET/POST |
| `/api/learners/[id]`                 | GET/PUT  |
| `/api/learners/[id]/trends`          | GET      |
| `/api/learners/[id]/recommendations` | GET      |

### 其他（16）

explanations / culture.compare / cache / feedback / data / research-docs / vlog.generate / admin.{data,graph,migrate} / test.llm

***

## 7. 数据库 Schema

**文件**：`src/storage/database/shared/schema.ts`（Drizzle，13,676 行，15 表）

| 表                                         | 用途                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `learners`                                | learner profile（native\_language, hsk\_level, cultural\_anxiety\_score, ability\_vector） |
| `cultural_knowledge_points`               | 知识点（HSK 层级, 语言绑定点, content\_json）                                                        |
| `cross_cultural_comparisons`              | 跨文化对比                                                                                    |
| `cultural_explanations`                   | 缓存（knowledge\_point\_id + language\_code 索引）                                             |
| `knowledge_graph_nodes` / `edges`         | Neo4j 镜像                                                                                 |
| `learning_scenes`                         | 场景（scene\_id + keywords）                                                                 |
| `learning_records` / `assessment_records` | 学习/评估记录                                                                                  |
| `agent_messages`                          | Agent 事件日志                                                                               |
| `bias_keywords`                           | 偏见检测词库                                                                                   |
| `expert_review_queue`                     | 专家审核队列                                                                                   |
| `user_profiles`                           | 用户扩展                                                                                     |
| `system_configs`                          | 系统配置                                                                                     |
| `auth_users` 🆕                           | 认证用户（email, password\_hash, lockout\_until）                                              |
| `health_check`                            | 健康检查辅助                                                                                   |

***

## 8. 环境变量

### LLM

| 变量                                     | 默认                      | 说明                        |
| -------------------------------------- | ----------------------- | ------------------------- |
| `EFLOWCODE_API_URL`                    | <https://e-flowcode.cc> | e-flowcode 网关             |
| `EFLOWCODE_API_KEY`                    | —                       | API Key                   |
| `LLM_MOCK_MODE`                        | false                   | true 返回 fixture，不调用真实 LLM |
| `LLM_GENERATION_PROFILE`               | daily                   | daily / quality           |
| `LLM_A2_MODEL` / `_A3` / `_A4` / `_A5` | deepseek-v4-flash       | Agent 模型覆盖                |
| `LLM_EXTRA_MODELS`                     | —                       | 追加到 allowlist（逗号分隔）       |

### 数据库

| 变量                                                | 说明               |
| ------------------------------------------------- | ---------------- |
| `COZE_SUPABASE_URL` / `COZE_SUPABASE_ANON_KEY`    | Supabase（平台自动注入） |
| `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | Neo4j Aura       |

### 运行时

| 变量                             | 默认     | 说明              |
| ------------------------------ | ------ | --------------- |
| `USE_LANGGRAPH`                | false  | 切换 LangGraph 编排 |
| `LEARNING_PIPELINE_TIMEOUT_MS` | 480000 | 路由超时            |
| `LEARNING_RATE_LIMIT_PER_MIN`  | 6      | IP 限流           |

### 🆕 Auth

| 变量                         | 默认          | 说明            |
| -------------------------- | ----------- | ------------- |
| `AUTH_JWT_SECRET`          | —           | JWT 签名密钥      |
| `AUTH_COOKIE_NAME`         | auth\_token | Cookie 名      |
| `AUTH_PASSWORD_PEPPER`     | —           | bcrypt pepper |
| `AUTH_LOCKOUT_ATTEMPTS`    | 5           | 锁定阈值          |
| `AUTH_LOCKOUT_DURATION_MS` | 900000      | 锁定时长（15min）   |

### 代理（中国网络）

```
HTTP_PROXY=http://127.0.0.1:7892
HTTPS_PROXY=http://127.0.0.1:7892
```

***

## 9. 运行方式

```bash
# 开发
pnpm dev                      # ← 等价 scripts/dev.sh
# 自动：清理 5000 端口 → 检查 Embedding → 启动 Next.js

# 生产构建
pnpm build

# 生产运行
pnpm start

# LangGraph 编排
USE_LANGGRAPH=true pnpm dev

# Mock 模式（离线验证，不消耗 LLM）
LLM_MOCK_MODE=true pnpm dev

# 类型检查 / 测试 / 冒烟
pnpm ts-check
pnpm test
pnpm smoke           # 单场景
pnpm smoke:all       # 全量并发 3

# 依赖安装（强 pnpm）
pnpm install
```

服务端口：**5000**（可通过 `DEPLOY_RUN_PORT` 覆盖）

***

## 10. 依赖关系

### 核心导入链

```
API Route (learning/route.ts)
  ├── multi-agent/coordinator.ts (或 learning-graph.ts)
  │     ├── multi-agent/base-agent.ts → unified-llm-service.ts → llm-config.ts
  │     ├── multi-agent/agents/*.agent.ts → prompts/*.ts
  │     ├── multi-agent/{utils, algorithms, a2-slots, a2-fewshot-*, scene-mapper, cache-io, trend-io}.ts
  │     ├── services/guardrail-service.ts
  │     └── storage/database/supabase-client.ts
  ├── lib/auth/middleware.ts (可选) → auth/jwt.ts + storage
  └── storage/database/supabase-client.ts

guardrail-service.ts → unified-llm-service.ts → llm-config.ts
                     → storage/cache/cache-manager.ts
```

### 文件大小 Top 10

| 文件                                    | 行数      |
| ------------------------------------- | ------- |
| demo-data-cases.ts                    | 118,318 |
| guardrail-service.ts                  | 53,285  |
| evaluation-metrics.ts                 | 51,564  |
| learning-graph.ts                     | 44,404  |
| populate-knowledge-base.ts            | 32,850  |
| experiment-runner.ts                  | 30,386  |
| cieval-judge.ts                       | 30,096  |
| unified-llm-service.ts                | 26,302  |
| learner-graph.ts                      | 22,711  |
| multi-language-explanation-service.ts | 16,331  |

***

## 11. 排错速查

### 现象 → 排查

| 现象                   | 排查                                              |
| -------------------- | ----------------------------------------------- |
| 启动端口占用               | `lsof -ti:5000 \| xargs kill -9`                |
| 422 Guardrail 拦截（正常） | API 响应的 `error_detail.failed_guardrails`        |
| 422 Auth 锁定          | `auth_users.lockout_until` 是否过期，重置密码            |
| 429 限流               | `LEARNING_RATE_LIMIT_PER_MIN` 或 auth rate-limit |
| 502 Agent 失败         | 日志搜 `Agent xxx failed`                          |
| 504 超时               | 调大 `LEARNING_PIPELINE_TIMEOUT_MS`               |
| Neo4j 空白             | `NEO4J_URI/USERNAME/PASSWORD`                   |
| 内容是 MOCK 字样          | `LLM_MOCK_MODE=true` 没关                         |
| 每次内容一样               | 命中缓存（confidence > 0.85 才写）                      |
| 登录后 API 401          | `getAuthed()` 失败 → Cookie/JWT/`AUTH_JWT_SECRET` |
| Auth 路由 500          | `auth_users` 表存在？跑 `auth/migration.ts`          |

### 关键日志前缀

| 前缀             | 含义                 |
| -------------- | ------------------ |
| `[场景映射]`       | scene-mapper.ts 查询 |
| `[知识库]`        | cache-io 命中/未命中    |
| `[A1]`\~`[A5]` | Agent 执行           |
| `[Guardrail]`  | 质量网关               |
| `[TIMING]`     | LLM 耗时             |
| `[Auth]`       | 认证流程               |

### 快速验证命令

```bash
# LLM 连通
curl -s -X POST http://localhost:5000/api/test/llm \
  -H 'Content-Type: application/json' -d '{}' | python3 -m json.tool

# Auth 注册
curl -s -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"Test1234!"}'

# 完整学习链路
curl -s -X POST http://localhost:5000/api/learning \
  -H 'Content-Type: application/json' \
  -d '{"learner_id":"new","knowledge_point_id":"food","hsk_level":3,"native_language":"英语"}' \
  --max-time 300 | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('success'):
    ex=d['data']['learning_content']['exercises']
    print(f'✅ OK | cache={d[\"data\"][\"from_cache\"]} | exercises={len(ex)}')
else:
    print(f'❌ {d.get(\"error\",\"\")[:200]}')
"
```

***

## 12. 变更历史

| 日期         | 版本   | 主要变化                                                         |
| ---------- | ---- | ------------------------------------------------------------ |
| 2026-09-02 | v2.0 | multi-agent-system.ts 横拆为 16 模块子目录；新增 Auth 认证；A2 Few-shot 增强 |
| 2026-08-xx | v1.x | 单体架构（3017 行 multi-agent-system.ts）                           |

***

> 本文件基于 2026-09-02 重构后代码快照生成。旧版单体架构说明见 `AGENTS.md`（系统说明书，排错更详细）。

