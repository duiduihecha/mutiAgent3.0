# 系统架构说明文档


**相关文档**: `docs/KNOWLEDGE_GRAPH.md`（知识图谱结构）、`AGENTS.md`（技术排错手册）、`docs/SYSTEM_DESIGN.md`（早期设计稿，部分过时）

---

## 目录

1. [一句话概括](#1-一句话概括)
2. [技术栈速览](#2-技术栈速览)
3. [项目目录结构](#3-项目目录结构)
4. [前端层 — 用户看到什么](#4-前端层)
5. [后端 API 层 — 请求怎么处理](#5-后端-api-层)
6. [AI 流水线 — 5 个智能体怎么协作](#6-ai-流水线)
7. [数据层 — 数据存在哪里](#7-数据层)
8. [一次完整的学习请求全过程](#8-一次完整的学习请求全过程)
9. [质量保障体系 — 防幻觉 & 情感检测](#9-质量保障体系)
10. [实验框架 — 论文实验怎么跑](#10-实验框架)
11. [Python 脚本 — 批量数据工具](#11-python-脚本)
12. [常见问题排查](#12-常见问题排查)
13. [附录：关键文件速查](#附录关键文件速查)

---

## 1. 一句话概括

这是一个**面向外国人学中文的智能教学平台**。用户选母语（英语/日语/韩语等8种）和 HSK 等级（1-9），系统用 5 个 AI Agent 分工协作，生成母语文化阐释 + 跨文化对比 + 场景化练习题。用户做完题后，系统分析答题结果，通过情感检测引擎和贝叶斯知识追踪更新学习者画像。

**核心思路**：多智能体协同分工 + 4 层知识图谱提供结构化知识（减少 AI 幻觉）+ 4 道防幻觉防线 + 规则引擎驱动的学习者建模。

---

## 2. 技术栈速览

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端** | TypeScript + React 19 + Next.js 16 | 页面渲染、用户交互 |
| **前端样式** | Tailwind CSS 4 + Radix UI + shadcn | 52个UI组件，统一视觉风格 |
| **前端可视化** | vis-network | 知识图谱交互式力导向图 |
| **后端** | Next.js API Routes（同项目） | 24个HTTP接口 |
| **AI 编排** | LangGraph（`@langchain/langgraph`） | 5 Agent 流水线，含并行节点和条件分支 |
| **LLM 调用** | 两套路径：coze-coding-dev-sdk（主流程）+ UnifiedLLMService（DeepSeek/Qwen/Coze） | 多后端统一调用 |
| **关系数据库** | PostgreSQL + Supabase | 15张业务表（Drizzle ORM 定义） |
| **图数据库** | Neo4j AuraDB | 4层语义网络，~16,000节点~110,000关系 |
| **缓存** | Supabase `llm_content_cache` + 置信度门控 | LLM 生成内容缓存，防缓存投毒 |
| **Python 服务** | FastAPI + sentence-transformers | BGE 中文向量服务（:8765）、Guardrail Python 版 |
| **脚本语言** | Python 3 + TypeScript (tsx) | 图谱种子、数据迁移、实验运行 |
| **测试** | Vitest | 4个测试文件（核心算法/情感检测/推荐引擎/边界用例） |
| **包管理** | pnpm | Node.js 依赖管理 |

---

## 3. 项目目录结构

```
mutiAgent3.0/
├── src/                              # 主代码（TypeScript, ~52,000行）
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # 首页：选母语/HSK/动机/场景，启动学习
│   │   ├── layout.tsx                # 根布局 + LearnerProvider
│   │   ├── learning/page.tsx         # 学习页：文化讲解→练习题→结果分析
│   │   ├── knowledge-graph/page.tsx  # 知识图谱可视化浏览页
│   │   ├── admin/                    # 管理后台（数据浏览 + 图谱管理）
│   │   │   ├── page.tsx              # Supabase 数据表浏览
│   │   │   └── graph/page.tsx        # Neo4j 图谱管理
│   │   ├── test/page.tsx             # LLM 测试页
│   │   ├── globals.css               # 全局样式 + shadcn 主题变量
│   │   └── api/                      # 24个API路由（详见第5节）
│   ├── components/                   # React 组件（55个文件）
│   │   ├── ui/                       # 52个 shadcn/ui 组件
│   │   ├── interactive-graph-visualization.tsx  # 知识图谱力导向图 (1,150行)
│   │   ├── knowledge-graph-view.tsx             # 知识图谱浏览面板 (453行)
│   │   └── learning/
│   │       └── progressive-disclosure.tsx       # 渐进式场景选择器 (618行)
│   ├── lib/                          # 核心业务逻辑（24个文件，~16,000行）★最重要★
│   │   ├── multi-agent-system.ts     # 5个AI Agent定义 + 核心算法 (2,192行)
│   │   ├── learning-graph.ts         # LangGraph流水线编排 (925行)
│   │   ├── constants.ts              # 共享常量（语言/场景/偏见配置）(183行)
│   │   ├── emotion-check.ts          # 情感检测引擎（纯规则）(296行)
│   │   ├── unified-llm-service.ts    # LLM统一调用（3后端）(347行)
│   │   ├── unified-data-service.ts   # Supabase+Neo4j统一数据服务 (389行)
│   │   ├── neo4j-service.ts          # Neo4j连接封装 (445行)
│   │   ├── knowledge-graph-neo4j-service.ts  # 图谱高级查询 (477行)
│   │   ├── knowledge-base-service.ts # Supabase知识库CRUD (550行)
│   │   ├── learner-graph.ts          # Neo4j学习者图谱 (701行)
│   │   ├── learner-context.tsx       # 前端学习者状态 Context (135行)
│   │   ├── hsk-vocab-graph.ts        # HSK词汇图谱查询 (200行)
│   │   ├── multi-language-explanation-service.ts  # 多语言阐释服务 (406行)
│   │   ├── evaluation-metrics.ts     # 论文实验：自动评估指标 (774行)
│   │   ├── experiment-runner.ts      # 论文实验：条件运行器 (828行)
│   │   ├── generate-contrasts.ts     # 跨文化对比生成 (264行)
│   │   ├── generate-cross-cultural-data.ts  # 12维度对比数据生成 (344行)
│   │   ├── populate-knowledge-base.ts      # Supabase知识库填充 (854行)
│   │   ├── neo4j-migration.ts        # Supabase→Neo4j迁移 (338行)
│   │   ├── neo4j-split-nodes.ts      # 图谱节点拆分 (364行)
│   │   ├── ontology-migration.ts     # 本体优化迁移 (281行)
│   │   ├── ontology-verification.ts  # 本体迁移验证 (233行)
│   │   ├── cleanup-contrasts.ts      # Neo4j对比节点清理 (60行)
│   │   └── utils.ts                  # cn() 工具函数 (6行)
│   ├── services/                     # 质量保障服务
│   │   ├── guardrail-service.ts      # 防幻觉网关（4道防线）(1,182行)
│   │   ├── guardrail_service.py      # Python版防幻觉网关 (722行)
│   │   ├── guardrail_runner.py       # Python入口 (167行)
│   │   ├── embedding_server.py       # BGE中文向量微服务 (88行)
│   │   └── supabase_cache_manager.py # Python缓存管理 (612行)
│   ├── storage/                      # 数据存储层
│   │   ├── cache/
│   │   │   └── cache-manager.ts      # LLM缓存管理器 (326行)
│   │   └── database/
│   │       ├── supabase-client.ts    # Supabase客户端工厂 (131行)
│   │       └── shared/
│   │           ├── schema.ts         # Drizzle ORM表定义（15张表）(289行)
│   │           └── relations.ts      # ORM关系定义 (3行)
│   ├── types/
│   │   └── pragmatic-task.ts         # 语用任务类型定义 (74行)
│   ├── data/
│   │   ├── hsk_vocabulary.ts         # HSK字表白名单加载器 (105行)
│   │   └── hsk_word_new.jsonl        # HSK 3.0 词汇数据 (11,092行)
│   ├── hooks/
│   │   └── use-mobile.ts             # 移动端检测 Hook
│   ├── __tests__/                    # 单元测试（4个文件）
│   │   ├── core.test.ts              # 核心算法测试 (322行)
│   │   ├── emotion-check.test.ts     # 情感检测测试 (462行)
│   │   ├── recommendations.test.ts   # 推荐引擎测试 (407行)
│   │   └── edge-cases.test.ts        # 极端边界测试 (317行)
│   └── server.ts                     # 自定义HTTP服务器入口
├── scripts/                          # 批量数据脚本（34个文件）
│   ├── seed_neo4j.py                 # 图谱种子数据导入Neo4j (427行)
│   ├── seed_hsk_vocab.py             # HSK词汇导入Neo4j (354行)
│   ├── seed_layer3_links.py          # 词汇/语法约束关系创建 (340行)
│   ├── seed_cross_cultural_links.py  # 跨文化维度链接 (347行)
│   ├── seed_manifested_in.py         # MANIFESTED_IN边导入（双模型裁判）(271行)
│   ├── extract_layer1_nodes.py       # 文化概念/语言点节点提取 (332行)
│   ├── generate_kps.py               # LLM批量生成知识点 (651行)
│   ├── seed_error_patterns.cypher    # 偏误模式分类学种子 (836行)
│   ├── seed_cultural_dimensions.cypher # 文化维度种子 (372行)
│   ├── neo4j_schema_v2.cypher        # Neo4j约束和索引 (73行)
│   ├── neo4j_seed_pragmatic_tasks.cypher  # 语用任务直接Cypher种子 (157行)
│   ├── run-experiments.ts            # 论文实验CLI脚本 (302行)
│   ├── knowledge_graph_seed.json     # 图谱种子数据（14领域×56场景×166任务）(3,503行)
│   ├── cross_cultural_mapping.json   # 跨文化维度映射配置 (787行)
│   ├── layer3_links_config.json      # HSK语法点绑定配置 (181行)
│   ├── generated_*.json              # LLM生成的各领域数据（8个文件）
│   ├── migrate_data.js               # 数据库迁移 (141行)
│   ├── migrate_emotion.js            # 情感字段迁移 (78行)
│   ├── dev.sh / build.sh / start.sh  # 启动/构建脚本
│   └── prepare.sh                    # 依赖安装
├── supabase/migrations/              # 数据库迁移文件
├── docs/                             # 项目文档
│   ├── ARCHITECTURE.md               # 本文档
│   ├── KNOWLEDGE_GRAPH.md            # 知识图谱详细文档
│   ├── SYSTEM_DESIGN.md              # 早期系统设计（部分过时）
│   ├── LEARNER_MODEL.md              # 学习者建模架构
│   ├── LEARNER_PROFILE_PAPER.md      # 学习者画像论文章节
│   └── 论文框架-方向二-多智能体协同.md  # 论文实验框架
├── paper_assets/                     # 论文素材（图表、方法草稿等）
├── experiment_results/               # 实验运行结果输出目录
├── .env                              # 环境变量
├── package.json                      # Node.js依赖
├── AGENTS.md                         # 给AI助手的系统说明书
└── 面向国际中文教育智能代理的自适应偏误模式分类学与图谱构建研究.md  # 偏误分类学论文稿
```

---

## 4. 前端层 — 用户看到什么

### 4.1 首页（`src/app/page.tsx`，1,030行）

用户进入系统的入口。包含：

1. **学习者配置** — 选择母语（8种）、HSK等级（1-9）、学习动机（旅游/留学/工作/兴趣/考试）
2. **为你推荐** — 基于 `getRecommendations()` 五因子评分的横向滚动推荐卡片
3. **渐进式场景选择** — `ProgressiveDisclosure` 组件，Domain → Scene → Task 三级选择
4. **最近学习** — 近期学习历史列表
5. **学习趋势** — Recharts图表展示能力向量变化

技术细节：通过 `LearnerContext`（`learner-context.tsx`）管理前端学习者状态，数据流经 `localStorage` + URL params + API。

### 4.2 学习页（`src/app/learning/page.tsx`，945行）

核心学习界面，分为三个阶段：

1. **阶段1 — 文化讲解**：展示 A2 生成的母语文化阐释 + A3 生成的跨文化对比
2. **阶段2 — 练习题**：A4 生成的 5 道练习题（选择题/判断题），逐题作答
3. **阶段3 — 结果分析**：正确率、能力向量变化雷达图、情感状态反馈、下一步推荐

交互细节：`validateAnswer()` 判断对错，`EXERCISES_PER_SESSION=5` 道题固定数量。

### 4.3 知识图谱页（`src/app/knowledge-graph/page.tsx`，270行）

`InteractiveGraphVisualization` 组件渲染 Neo4j 图谱的力导向图。支持：
- 节点拖拽/缩放/搜索
- 点击节点查看详情弹窗
- 按层/级别过滤（Domain/Scene/KnowledgePoint/CulturalConcept）

### 4.4 管理后台（`src/app/admin/`）

- `admin/page.tsx`：浏览 Supabase 任意表数据
- `admin/graph/page.tsx`：Neo4j 图谱数据视图、触发迁移操作

### 4.5 LLM 测试页（`src/app/test/page.tsx`，137行）

调试用：选择 LLM provider（coze/deepseek/minimax），输入 prompt，查看响应和耗时。

---

## 5. 后端 API 层 — 请求怎么处理

所有 API 在 `src/app/api/` 下，Next.js Route Handler 模式。共 **24个路由文件**。

### 5.1 学习流程（最核心的 2 个接口）

| 接口 | 文件 | 方法 | 功能 |
|------|------|------|------|
| `/api/learning` | `learning/route.ts` (334行) | POST | **启动学习**：接收 learner_id + knowledge_point_id + hsk_level + native_language → 运行 LangGraph 5-Agent 流水线 → 返回文化讲解 + 练习题 |
| `/api/learning/results` | `learning/results/route.ts` (511行) | POST | **提交答题结果**：STEP0计算新值→STEP1写L1→STEP2写L2→STEP3更新L3→STEP3.5快照→STEP4写L4 Neo4j |

### 5.2 学习者管理

| 接口 | 功能 |
|------|------|
| `POST /api/learners` | 创建新学习者 |
| `GET /api/learners/[id]` | 获取学习者画像 |
| `DELETE /api/learners/[id]` | 删除学习者（同时清除 Neo4j 掌握边） |
| `GET /api/learners/[id]/recommendations` | 五因子学习路径推荐 |
| `GET /api/learners/[id]/trends` | 历史学习趋势 + 画像快照 |

### 5.3 知识管理

| 接口 | 功能 |
|------|------|
| `GET/POST /api/knowledge/points` | 知识点 CRUD |
| `GET /api/knowledge/points/[id]` | 知识点详情（含多语言阐释） |
| `GET /api/knowledge/admin` | 知识库管理（含批量操作） |
| `GET /api/knowledge/graph?action=pragmatic_tree` | Domain→Scene→KP 三级树 |
| `GET /api/knowledge/graph?action=hsk_vocab` | 某 KP 关联的 HSK 词汇 |
| `GET /api/knowledge/graph?action=stats` | 图谱统计 |
| `GET /api/knowledge/graph?action=search` | 图谱搜索 |
| `GET /api/knowledge/graph/contrasts/[kp_id]` | 某 KP 的跨文化对比 |
| `GET /api/knowledge/graph/level/[level]` | 按 HSK 等级查文化节点 |

### 5.4 文化阐释与对比

| 接口 | 功能 |
|------|------|
| `GET/POST /api/explanations` | 多语言阐释生成与查询 |
| `GET /api/explanations/[kp_id]` | 某 KP 的所有语言阐释 |
| `GET/POST /api/culture/compare` | 跨文化对比查询与创建 |
| `GET/POST/DELETE /api/culture/admin` | 文化数据管理 |

### 5.5 缓存与遥测

| 接口 | 功能 |
|------|------|
| `GET /api/cache/stats` | 缓存命中率统计 |
| `POST /api/cache/vote` | 用户投票（upvote/downvote，触发置信度调整） |
| `GET /api/research-docs` | 提供论文/系统文档的 API 访问 |

### 5.6 管理与测试

| 接口 | 功能 |
|------|------|
| `GET /api/admin/data` | 浏览任意 Supabase 表 |
| `GET /api/admin/graph` | Neo4j 全量图谱数据导出 |
| `POST /api/admin/migrate` | 触发数据库迁移 |
| `GET/POST /api/test/llm` | LLM 连通性测试 |

---

## 6. AI 流水线 — 5 个智能体怎么协作

这是系统最核心的部分。Agent 实现在 `src/lib/multi-agent-system.ts`（2,192行），流水线编排在 `src/lib/learning-graph.ts`（925行）。

### 6.1 5 个 Agent 的职责

```
A1 学习者画像分析器 (LearnerProfilerAgent, ~200行)
    │  输入: learner_profile（母语、HSK等级、焦虑度）
    │  输出: anxiety_level, native_ratio, recent_weak_dimensions, accuracy_trend
    │  LLM: 无（纯算法 — 读DB焦虑度 + 查L2短期趋势）
    │
    ├── A2 母语阐释器 (MotherTongueExplainerAgent, ~130行)
    │   输入: kp_id + target_language + anxiety_level
    │   输出: 母语文化阐释（precise_definition, pragmatic_rules, taboo_warnings...）
    │   KG增强: 查询 CulturalConcept → CulturalDimension → MANIFESTED_IN → HomeCulture
    │   特点: 图谱数据注入 prompt <graph_cultural_context> 块
    │
    ├── A3 文化对比器 (CulturalComparatorAgent, ~140行)
    │   输入: kp_id + target_culture + native_language_code
    │   输出: 跨文化对比（framework_used, chinese_perspective, target_culture_perspective...）
    │   KG增强: 查询 HAS_DIMENSION 边获取 Hofstede/Hall 维度标签
    │   特点: XML格式输出 + detectBias() 偏见检测
    │
    └── A4 内容生成器 (ContentGeneratorAgent, ~130行)
        输入: kp_id + A2输出 + A3输出 + learner_profile
        输出: 5道练习题 + 文化背景 + 语言点（GeneratedContent JSON）
        KG增强: 查询 REQUIRES_VOCAB 边获取 HSK 词汇白名单（15,246词）
               查询 REQUIRES_GRAMMAR 边获取语法点约束
               查询 learner-graph 获取薄弱维度
        特点: <vocabulary_constraints> 块硬约束词汇超纲

A5 质量控制器 (QualityControllerAgent, ~90行)
    │  输入: A4 生成的 GeneratedContent
    │  输出: quality_review（JSON格式校验、HSK等级校验、偏见检测）
    │  特点: 不通过则退回到A4重新生成（最多3次）
```

### 6.2 LangGraph 流水线

`learning-graph.ts` 用 LangGraph 把 Agent 串联成状态图：

```
用户请求
  │
  ▼
checkCache ──── 缓存命中? ──→ generateExercises ──→ END
  │                                  (短路路径)
  │ (缓存未命中)
  ▼
a1Profiler ──→ 分析学习者画像
  │
  ├──→ a2Explainer (并行) ──→ 生成母语解释
  │                              │
  └──→ a3Comparator (并行) ──→ 生成文化对比
                                 │
  ▼  (fan-in: A2+A3都完成后自动进入)
mergeA2A3 ──→ 合并A2和A3的输出
  │
  ▼
a4Generator ──→ 生成练习题
  │
  ▼
a5Controller ──→ 质量校验 → (不合格则回到a4Generator)
  │
  ▼
saveKB ──→ 置信度门控写入缓存（≥0.80才写，防缓存投毒）
  │
  ▼
writeLearnerGraph ──→ 写入 Neo4j Learner节点 + MASTERED边
  │
  ▼
END → 返回结果给前端
```

**关键设计点**：

- **A2和A3并行执行**（互不依赖），节省时间
- **A5有退循环机制**（不合格→回退A4→再校验→最多3次）
- **缓存命中短路**（跳过所有Agent，只生成练习题）
- **置信度门控**（`pipeline_confidence < 0.80` 禁止写缓存，防止低质量内容污染）
- **柔性降级**（防线失败→降置信度，不阻断流水线）
- **writeLearnerGraph 是 fire-and-forget**（失败不影响主流程）

### 6.3 10个图节点总结

| 节点 | 函数 | LLM调用 | 说明 |
|------|------|---------|------|
| `checkCache` | 查Supabase缓存 | 无 | 命中→短路，未命中→继续 |
| `generateExercises` | 缓存命中路径 | 1次(A4) | 仅生成练习题 |
| `a1Profiler` | 学习者画像 | 无（纯规则） | 焦虑度映射 + L2短期趋势 |
| `a2Explainer` | 母语阐释 | 1次(coze) | KG增强prompt |
| `a3Comparator` | 文化对比 | 1次(coze) | KG增强prompt |
| `mergeA2A3` | 汇聚点 | 无 | A2+A3完成后自动进入 |
| `a4Generator` | 内容生成 | 1次(coze) | KG词汇约束 |
| `a5Controller` | 质量审核 | 1次(coze) | 不合格→回退A4 |
| `saveKB` | 写知识库 | 无 | 置信度门控 |
| `writeLearnerGraph` | 写Neo4j | 无 | fire-and-forget |

### 6.4 LLM调用次数

| 路径 | 调用次数 | 说明 |
|------|---------|------|
| 缓存未命中（主链路） | **4次** | A2+A3(并行) + A4 + A5 |
| 缓存命中（短路） | **1次** | 仅A4生成练习题 |

### 6.5 核心算法（不依赖 LLM 的纯计算）

| 算法 | 文件位置 | 作用 |
|------|----------|------|
| `calculateAbilityVector()` | `multi-agent-system.ts:366` | EWMA（α=0.7）更新5维能力向量 |
| `applyAnxietyDelta()` | `multi-agent-system.ts:237` | 焦虑度增量公式：Δ=(0.5-correctRate)×20 |
| `bayesianKnowledgeTracing()` | `multi-agent-system.ts:318` | 标准BKT两状态HMM（P(L0)=0.2, guess=0.25, slip=0.10） |
| `computeMemoryStrength()` | `multi-agent-system.ts:342` | 艾宾浩斯记忆稳定性：S=30+5×ln(1+N) |
| `applyForgettingDecay()` | `multi-agent-system.ts:352` | 遗忘衰减：R(t)=score×e^(-t/S) |
| `detectBias()` | `multi-agent-system.ts:278` | 关键词(17个)+句式(3个模式)双重检测 |
| `anxietyScoreToLevel()` | `multi-agent-system.ts:246` | 连续→离散映射（high/medium/low） |
| `calculateNativeLanguageRatio()` | `multi-agent-system.ts:255` | 焦虑驱动的母语占比（75%/50%/25%） |
| `detectEmotionState()` | `emotion-check.ts:1` | 6信号→3级（green/yellow/red）→干预动作 |

---

## 7. 数据层 — 数据存在哪里

### 7.1 双数据库架构

| 数据库 | 类型 | 存储内容 | 用途 |
|--------|------|----------|------|
| **Supabase** (PostgreSQL) | 关系型 | 15张表：学习者、知识点、对比、记录、缓存等 | 业务数据、快速CRUD、LLM缓存 |
| **Neo4j AuraDB** | 图数据库 | 4层语义网络：文化语用→跨文化维度→HSK词汇→学习者认知 | 知识结构化、Agent查询、路径推荐 |

**为什么两个数据库**：
- PostgreSQL 适合存用户数据、记录（表结构固定、事务支持好）
- Neo4j 适合存知识图谱（节点多、关系复杂、需要图遍历查询如"从知识点→文化维度→母语表现"）

### 7.2 Supabase 核心表（15张表）

定义在 `src/storage/database/shared/schema.ts`（Drizzle ORM）：

| 表名 | 核心字段 | 用途 |
|------|---------|------|
| `learners` | uid, native_language, hsk_level, learning_motivation, cultural_anxiety_score, ability_vector | 学习者当前画像 |
| `learner_profile_snapshots` | learner_id, snapshot_reason, ability_vector, cultural_anxiety_score | 画像历史快照（含触发原因） |
| `cultural_knowledge_points` | hsk_level, layer, content_json | 文化知识点（3层级×9等级） |
| `cross_cultural_comparisons` | source_culture_id, target_culture, similarities, differences, bias_score | 跨文化对比缓存 |
| `cultural_explanations` | kp_id, language_code, content_json | 多语言文化阐释 |
| `knowledge_graph_nodes` | node_type, node_id, properties | 图谱节点Supabase备份 |
| `knowledge_graph_edges` | source_node_id, target_node_id, edge_type | 图谱边Supabase备份 |
| `learning_scenes` | scene_type, hsk_level_range, cultural_background, language_points | 学习场景定义 |
| `learning_records` | learner_id, scene_id, practice_result, time_spent | L1原始答题记录 |
| `assessment_records` | learner_id, ability_vector_before/after, anxiety_before/after, bkt_mastery, emotion_state | L2聚合评估快照 |
| `agent_messages` | event_id, sender_agent, receiver_agent, payload, status | 多智能体消息日志 |
| `rag_cache` | cache_key, content_json, confidence_score, status | RAG向量检索缓存 |
| `bias_keywords` | keyword, category, severity | 偏见检测关键词库 |
| `expert_review_queue` | content_id, content_type, review_status, reviewer_id | 专家审核队列 |
| `system_configs` | config_key, config_value | 系统配置 |

### 7.3 Neo4j 图谱结构（4层语义网络）

详见 `docs/KNOWLEDGE_GRAPH.md`。简要总结：

| 层 | 节点类型 | 数量 | 关键关系 | 用途 |
|----|---------|------|---------|------|
| **L1 文化语用概念层** | Domain→Scene→KnowledgePoint→CulturalConcept→LanguagePoint | 14D/56S/166KP/55CC/55LP | HAS_SCENE, HAS_KP, RELATES_TO, INVOLVES | 教学内容骨架 |
| **L2 跨文化维度层** | CulturalDimension, HomeCulture | 12维×9文化圈 | HAS_DIMENSION(73条), MANIFESTED_IN(96条) | A2/A3查询→注入prompt |
| **L3 HSK语言体系层** | HSKWord, GrammarPoint | 15,246词×97语法点 | REQUIRES_VOCAB(104,045条), REQUIRES_GRAMMAR(136条) | A4词汇约束 |
| **L4 学习者认知层** | Learner, ErrorPattern, InterventionStrategy | 运行时增长 | BELONGS_TO, MASTERED, FREQUENT_ERROR(117条) | 掌握度追踪、偏误诊断 |

**Agent查询路径示例**：
- A2: `(KP)-[:RELATES_TO]->(CulturalConcept)-[:HAS_DIMENSION]->(Dimension)-[:MANIFESTED_IN]->(HomeCulture)` → 母语特定文化表现数据
- A3: `(KP)-[:RELATES_TO]->(CulturalConcept)-[:HAS_DIMENSION]->(Dimension)` → 学术维度标签
- A4: `(KP)-[:REQUIRES_VOCAB]->(HSKWord)` → HSK等级词汇白名单

---

## 8. 一次完整的学习请求全过程

以**英语母语用户学习"餐厅点餐"**为例：

```
1. 前端首页
   用户选: 母语=英语, HSK=1, 动机=interest, Domain=food→Scene=点餐
   前端设置: learner_id写入localStorage, 参数编码到URL
   
2. POST /api/learning
   Body: {learner_id, knowledge_point_id: "food_ordering_basic", hsk_level: 1, native_language: "英语"}
   
3. API路由 learning/route.ts
   ├── Step 0: 场景映射 getKnowledgePointByScene("food_ordering_basic")
   │   └── Supabase 模糊匹配 → 返回知识点主题
   ├── Step 1: 获取/创建学习者 Supabase learners表
   │   └── 新建: {hsk_level:1, native_language:"英语", anxiety:50, ability:[50,50,50,50,50]}
   └── Step 2: 调用 processLearningRequestWithLangGraph(learner, kp_id)
   
4. LangGraph 流水线 learning-graph.ts
   ├── checkCache: 查Supabase rag_cache表
   │   └── 未命中 → 走完整链路
   ├── a1Profiler: 从Supabase learners读取 + L2 assessment_records短期趋势
   │   └── 输出: anxiety_level="medium", native_ratio=0.5, recent_weak_dims=[]
   ├── a2Explainer (并行): 调用豆包LLM + KG查询MANIFESTED_IN
   │   └── 查询: (KP)-[:RELATES_TO]->(CC)-[:HAS_DIMENSION]->(CD)-[:MANIFESTED_IN]->(hc_en)
   │   └── 输出: 英语母语文化阐释 { precise_definition, pragmatic_rules[3], taboo_warnings[2]... }
   ├── a3Comparator (并行): 调用豆包LLM + KG查询HAS_DIMENSION
   │   └── 查询: (KP)-[:RELATES_TO]->(CC)-[:HAS_DIMENSION]->(CD)
   │   └── 输出: 跨文化对比XML { framework_used, chinese_perspective, target_culture_perspective... }
   ├── mergeA2A3: A2+A3结果自动合并
   ├── a4Generator: 调用豆包LLM + KG查询REQUIRES_VOCAB
   │   └── 查询: (KP)-[:REQUIRES_VOCAB]->(HSKWord) WHERE level<=1
   │   └── 输出: 5道选择题/判断题 + 文化背景 + 语言点
   ├── a5Controller: 调用豆包LLM 质量审核
   │   └── 校验: JSON格式 + HSK等级 + 偏见检测 → 通过
   ├── saveKB: 置信度≥0.80 → 写入Supabase rag_cache
   └── writeLearnerGraph: 写入Neo4j Learner节点 + MASTERED边 (fire-and-forget)
   
5. API格式化响应 → 返回JSON给前端
   Response: {
     cultural_explanation: {...},
     cross_cultural_comparison: {...},
     learning_content: { cultural_context, language_points, comparison, exercises[5] },
     anxiety_level: "medium",
     pipeline_metadata: { overall_confidence: 0.95, guardrail_count: 4, ... }
   }
   
6. 前端渲染学习页
   渐进展示: 文化讲解(母语) → 跨文化对比 → 5道练习题
   
7. 用户做题，提交结果
   POST /api/learning/results
   Body: { learner_id, exercises[5], results["correct","wrong",...], total_time }
   
8. Results Pipeline results/route.ts
   ├── STEP 0: 计算新值
   │   ├── calculateAbilityVector(old, results) → newVector
   │   ├── applyAnxietyDelta(50, 0.6) → 48 (全对降10, 60%正确降2)
   │   ├── bayesianKnowledgeTracing(0.2, observed) → bktMastery
   │   └── detectEmotionState(...) → { state:"green/yellow/red", intervention }
   ├── STEP 1: 写入 L1 learning_records
   ├── STEP 2: 写入 L2 assessment_records (含emotion_state)
   ├── STEP 3: 更新 L3 learners (新anxiety, ability_vector, total_sessions+1)
   ├── STEP 3.5: 条件触发画像快照 (首次/HSK变化/焦虑变化≥10/维度变化≥15/每10轮)
   └── STEP 4: 写入 L4 Neo4j MASTERED边 (fire-and-forget)
   
9. 返回给前端
   Response: {
     score: 0.6,
     new_ability_vector: [55,50,60,48,50],
     new_cultural_anxiety_score: 48,
     emotion: { state:"green", intervention:{...} },
     ...
   }
```

---

## 9. 质量保障体系 — 防幻觉 & 情感检测

### 9.1 防幻觉网关（Guardrail Service）

实现在 `src/services/guardrail-service.ts`（1,182行）+ Python版 `guardrail_service.py`（722行）。

**四道防线**：

| # | 防线 | 方法 | 机制 | LLM调用 | 置信度衰减 |
|---|------|------|------|---------|-----------|
| 1 | 回译校验 | `verifyA2Translation()` | A2母语阐释→反向翻译回中文→语义相似度比较 | 1次(coze) | -0.15 |
| 2 | 对抗盲测 | `verifyA4SolverAdversarial()` | 用另一个模型盲做A4的练习题→比较答案一致性 | N次(每题1次) | -0.20 |
| 3 | 硬规则过滤 | `preA5HardRulesFilter()` | HSK词汇覆盖率+拼音格式+JSON格式 | **0次** | -0.20 |
| 4 | 双模型仲裁 | `verifyA5JointArbitration()` | DeepSeek+MiniMax交叉评分→双低分拦截 | 2次 | -0.20 |

**柔性降级策略**：
- `pipeline_confidence` 初始 1.0
- 每道防线未通过 → 减去对应权重
- 置信度 < 0.80 → 禁止写全局缓存（防缓存投毒）
- 置信度 < 0.60 → 标记 `requires_human_review`
- 防线失败**不阻断流水线**，仅降置信度

**部署**：TypeScript版用于主流程（LangGraph节点间调用）；Python版用于离线批量审核和HTTP微服务。

### 9.2 情感检测引擎

实现在 `src/lib/emotion-check.ts`（296行）。**纯规则引擎，0次LLM调用**。

**6项信号 → 3级分类**：

| 信号 | 计算方式 | Yellow阈值 | Red阈值 |
|------|---------|-----------|--------|
| 挫败感 (frustration) | 尾部连续错误数 | ≥3题 | ≥5题 |
| 疲劳 (fatigue) | 焦虑↑ ∧ 正确率≤0.5 ∧ 时长≥20min | — | 三者同时满足 |
| 脱离 (disengagement) | 全 session 最长连续正确数 | ≥8题 | — |
| 焦虑突增 (anxiety_spike) | Δanxiety = after − before | ≥15 | ≥25 |
| 同类错误 (repeated_same_error) | 同一维度答错次数 | ≥2次 | ≥3次 |
| 正确率趋势 (accuracy_trend) | <0.4→declining; >0.8→improving | — | — |

**干预动作**：

| 状态 | 条件 | 动作 | 难度系数 |
|------|------|------|---------|
| Red | 疲劳 | `suggest_break` | — |
| Red | 挫败/同类错误 | `lower_difficulty` | 0.7 |
| Yellow | 脱离（太简单） | `raise_difficulty` | 1.2 |
| Green | — | 正常 | 1.0 |

**跨文化话术**：干预提示按母语文化圈定制（英语/日语/韩语/西班牙语/法语），中文兜底。

### 9.3 学习者画像闭环

详见 `docs/LEARNER_MODEL.md`。四层记忆 + 五个子系统全部闭环在 results pipeline：

```
L1 learning_records → L2 assessment_records → L3 learners/snapshots → L4 Neo4j Graph
    原始答题数据              聚合评估快照                 长期画像状态                认知图谱
```

- **焦虑追踪**: `applyAnxietyDelta()` — 系统唯一焦虑更新入口
- **能力估计**: EWMA α=0.7 — 对近期表现高度敏感
- **知识追踪**: BKT 按知识点粒度 — 驱动推荐引擎解锁判断
- **情感检测**: `detectEmotionState()` — 6信号→3级→干预
- **路径推荐**: 5因子加权（动机0.20 + HSK邻近0.25 + 解锁0.25 + 弱项0.15 + 新颖0.15）

---

## 10. 实验框架 — 论文实验怎么跑

详见 `docs/论文框架-方向二-多智能体协同.md`。

### 10.1 核心模块

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/lib/evaluation-metrics.ts` | 774 | 8个自动评估指标 + 聚合统计 + Markdown表格生成 |
| `src/lib/experiment-runner.ts` | 828 | ExperimentRunner：TestCase生成 + 5条件切换 + 批量运行 |
| `scripts/run-experiments.ts` | 302 | CLI批量运行脚本 |

### 10.2 5个消融条件

| 条件 | 流水线 | 含义 |
|------|--------|------|
| **C1_Full** | A1→A2+A3→A4→A5+KG | 完整系统 |
| **C2_NoAgent** | 单体Agent | 一个Agent干所有事 |
| **C3_NoA3** | A1→A2→A4→A5 | 去掉文化对比 |
| **C4_NoA5** | A1→A2+A3→A4 | 去掉质量管控 |
| **C5_NoA2A3** | A1→A4→A5 | 去掉阐释和对比 |

### 10.3 8个评估指标

| # | 指标 | 测量方法 |
|---|------|---------|
| 1 | JSON格式正确率 | GeneratedContent字段完整性验证 |
| 2 | HSK词汇超纲率 | 中文字符 vs HSK 1~N级字表白名单 |
| 3 | 图谱事实一致性 | 文化断言→Neo4j节点搜索匹配率 |
| 4 | 偏见度 | detectBias()关键词+句式检测 |
| 5 | 题型种类 | 选择题/判断题/填空题分布 |
| 6 | 词汇多样性 | type-token ratio |
| 7 | 答案可判别率 | 正确选项唯一性 + 格式正确性 |
| 8 | 生成效率 | 各Agent耗时分解 |

### 10.4 使用方式

```bash
# 列出所有可用测试用例
npx tsx scripts/run-experiments.ts --list-test-cases

# 干运行（只生成用例不调LLM）
npx tsx scripts/run-experiments.ts --experiment rq1 --samples 2 --dry-run

# 正式运行 RQ1 消融实验
npx tsx scripts/run-experiments.ts --experiment rq1 --samples 2

# 自定义参数
npx tsx scripts/run-experiments.ts --experiment rq1 --samples 4 \
  --languages en,ja,ko,ar --hsk-levels 1,4,7

# 全量实验
npx tsx scripts/run-experiments.ts --experiment all --samples 2
```

结果保存到 `experiment_results/` 目录，按条件分JSON文件，实时写JSONL进度日志。

---

## 11. Python 脚本 — 批量数据工具

### 11.1 图谱种子脚本（7个Python脚本）

| 脚本 | 行数 | 功能 | 何时运行 |
|------|------|------|----------|
| `seed_neo4j.py` | 427 | 将 `knowledge_graph_seed.json` 导入Neo4j（MERGE幂等） | 每次修改种子数据后 |
| `seed_hsk_vocab.py` | 354 | 从 `hsk_word_new.jsonl` 导入15,246个HSKWord节点 | 词汇数据更新后 |
| `seed_layer3_links.py` | 340 | 创建REQUIRES_VOCAB + REQUIRES_GRAMMAR关系 | HSK词汇导入后 |
| `seed_cross_cultural_links.py` | 347 | 创建跨文化维度链接（CulturalConcept→Dimension→HomeCulture） | 种子数据更新后 |
| `seed_manifested_in.py` | 271 | 导入MANIFESTED_IN边（双模型裁判评分通过率91%） | 跨文化数据更新后 |
| `extract_layer1_nodes.py` | 332 | 从KP的l1_conflict_points提取CulturalConcept/LanguagePoint | 种子数据更新后 |
| `generate_kps.py` | 651 | LLM批量生成新领域的KnowledgePoint | 扩展新领域时 |

### 11.2 Cypher 种子脚本（4个）

| 脚本 | 行数 | 功能 |
|------|------|------|
| `neo4j_schema_v2.cypher` | 73 | 约束和索引（18个约束） |
| `neo4j_seed_pragmatic_tasks.cypher` | 157 | 语用任务直接Cypher种子 |
| `seed_error_patterns.cypher` | 836 | 偏误模式分类学（ErrorCategory/ErrorPattern/LinguisticFeature/Etiology/InterventionStrategy） |
| `seed_cultural_dimensions.cypher` | 372 | 12文化维度 + 9母语文化圈 + SCORES关系 |

### 11.3 数据库迁移脚本

| 脚本 | 功能 |
|------|------|
| `migrate_data.js` | 从旧Supabase实例迁移到新实例 |
| `migrate_emotion.js` | 给assessment_records添加emotion相关字段 |

### 11.4 启动脚本

| 脚本 | 功能 |
|------|------|
| `dev.sh` | 开发模式启动（杀端口5000→next dev） |
| `build.sh` | 生产构建（pnpm install + next build + tsup server.ts） |
| `start.sh` | 生产启动（BGE嵌入服务:8765 + Next.js:5000） |

---

## 12. 常见问题排查

### 12.1 学习请求失败

1. 检查 `.env` 中的LLM API密钥是否有效
2. 检查Neo4j是否在线：`python3 scripts/seed_neo4j.py --dry-run`
3. 查看终端日志，搜索 `[LangGraph]` 或 `[AgentError]` 前缀
4. 检查 `LLM_MOCK_MODE` 是否意外为 `true`

### 12.2 知识图谱页面加载不出节点

1. 确认Neo4j有数据：Neo4j Browser中 `MATCH (d:Domain) RETURN count(d)`
2. 检查 `NEO4J_URI/USERNAME/PASSWORD` 环境变量
3. 前端Network检查 `GET /api/admin/graph?action=pragmatic_tree` 返回值

### 12.3 Agent生成的练习题质量差

1. 检查LLM模型配置：`AGENT_CONFIGS` 在 `constants.ts` 中
2. 检查A5质量控制日志（搜索 `[A5]`）
3. 检查A4是否正确读取了词汇约束（搜索 `REQUIRES_VOCAB` 日志）
4. 检查 `EXERCISES_PER_SESSION=5` 是否影响了A4的输出

### 12.4 缓存命中但不返回内容

1. 检查 `rag_cache` 表中对应key的数据是否完整
2. 检查 `guardrail-service.ts` 的四道防线是否误拦截
3. 检查 `pipeline_confidence` 是否 < `CACHE_WRITE_CONFIDENCE_THRESHOLD`(0.80)

### 12.5 页面打开一直loading

1. DevTools → Network，找 `/api/learning` 请求，看状态码和响应时间
2. 如果502：LLM调用超时，4次串行LLM调用总耗时可能超120秒
3. 如果503：Supabase连接问题
4. 如果一直pending：检查Neo4j查询是否挂起

### 12.6 修改知识图谱后前端不更新

1. 重新运行 `python3 scripts/seed_neo4j.py`
2. 如果是新增领域，需更新 `src/lib/constants.ts` 中的 `SCENE_TYPE_MAP`

### 12.7 实验框架运行报错

1. 确认Neo4j连接正常（实验框架从Neo4j读测试用例）
2. 确认LLM API密钥有效（实验调用真实LLM）
3. 先用 `--dry-run` 验证测试用例生成
4. 查看 `experiment_results/rq1_progress.jsonl` 日志

---

## 附录：关键文件速查

| 你想做什么 | 去找这个文件 |
|-----------|-------------|
| 改Agent的prompt或行为 | `src/lib/multi-agent-system.ts` |
| 改流水线编排（加节点、改顺序） | `src/lib/learning-graph.ts` |
| 改前端页面 | `src/app/page.tsx`（首页）、`src/app/learning/page.tsx`（学习页） |
| 加新的API接口 | `src/app/api/` 下新建文件夹 |
| 改数据库表结构 | `src/storage/database/shared/schema.ts` |
| 改知识图谱种子数据 | `scripts/knowledge_graph_seed.json` |
| 改偏误模式分类 | `scripts/seed_error_patterns.cypher` |
| 改文化维度定义 | `scripts/seed_cultural_dimensions.cypher` |
| 批量生成新知识点 | `scripts/generate_kps.py` |
| 改语言/场景映射 | `src/lib/constants.ts` |
| 改情感检测逻辑 | `src/lib/emotion-check.ts` |
| 改防幻觉网关 | `src/services/guardrail-service.ts` |
| 改学习者画像算法 | `src/lib/multi-agent-system.ts`（焦虑/BKT/能力向量） |
| 改学习路径推荐 | `src/lib/learner-graph.ts` → `getRecommendations()` |
| 跑论文实验 | `scripts/run-experiments.ts` |
| 计算评估指标 | `src/lib/evaluation-metrics.ts` |
| 了解图谱结构 | `docs/KNOWLEDGE_GRAPH.md` |
| 了解论文框架 | `docs/论文框架-方向二-多智能体协同.md` |
| 给AI助手上下文 | `AGENTS.md` |
