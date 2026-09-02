# 系统说明书 — 母语驱动的跨文化对比式中文学习系统

> 本文档面向项目作者、接手工程师和AI辅助调试。目标：看懂系统、快速排错、诚实标注实现状态。

***

## 1. 一句话总结：这个系统到底是什么

这个系统是一个**面向8大母语文化圈留学生的智能中文学习平台**。用户选择自己的母语（英语/日语/韩语等）和HSK等级，系统会：

1. 用该用户的母语解释中国文化概念（"母语阐释打底"）
2. 把中国文化跟用户母语文化做对比（"跨文化异同匹配"）
3. 生成场景化的练习题让用户做（"场景化应用闭环"）

核心链路：**首页选参数 → 学习页发请求 → 5个AI智能体串行+并行协作 → LLM生成内容 → 用户做题 → 保存结果**

当前状态：**核心学习流程已跑通，LLM调用链真实可用**。但知识图谱页面偏展示、部分页面功能重复、场景→知识点的映射仍靠模糊匹配不够精准。

***

## 2. 系统总架构（按层讲）

### 2.1 前端层

| 文件                                                   | 作用                               |
| ---------------------------------------------------- | -------------------------------- |
| `src/app/page.tsx`                                   | 首页：选母语/HSK等级/学习场景，启动学习           |
| `src/app/learning/page.tsx`                          | 学习页：展示内容、做题、提交答案                 |
| `src/app/learn/[id]/page.tsx`                        | 学习页(副本)：功能与learning页重复，用的是另一套API |
| `src/app/knowledge-graph/page.tsx`                   | 知识图谱页：Neo4j节点可视化                 |
| `src/app/test/page.tsx`                              | LLM测试页：调试用                       |
| `src/components/interactive-graph-visualization.tsx` | 知识图谱力导向图组件                       |
| `src/components/learning-interaction.tsx`            | 学习交互组件（**死代码，543行，无人引用**）        |

**如果这一层出错**：页面白屏/按钮无响应 → 打开浏览器DevTools看Console错误，优先查 `localStorage` 读写和 `fetch` 调用。

### 2.2 API/后端入口层

所有API都是Next.js App Router的Route Handler，运行在同一个5000端口。

| API路由                        | 方法       | 作用                | 真实可用       |
| ---------------------------- | -------- | ----------------- | ---------- |
| `/api/learning`              | POST     | 主学习流程入口           | ✅ 已接通真实LLM |
| `/api/learning/content/[id]` | GET      | 按知识点获取学习内容        | ✅ 已改为调用LLM |
| `/api/learning/results`      | POST     | 保存学习结果            | ✅ 焦虑值从数据计算 |
| `/api/learners`              | GET/POST | 学习者CRUD           | ✅          |
| `/api/learners/[id]`         | GET/PUT  | 学习者详情             | ✅          |
| `/api/culture/compare`       | GET/POST | 跨文化对比             | ✅ 调用LLM生成  |
| `/api/explanations`          | GET/POST | 多语言阐释(流式SSE)      | ✅          |
| `/api/explanations/[kp_id]`  | GET      | 知识点所有语言阐释         | ✅          |
| `/api/knowledge/graph`       | GET      | 知识图谱查询(Neo4j)     | ✅          |
| `/api/knowledge/points`      | GET/POST | 知识点CRUD(Supabase) | ✅          |
| `/api/data`                  | GET/POST | 统一数据API           | ✅          |
| `/api/test/llm`              | POST     | LLM连通测试           | ✅          |

**如果这一层出错**：前端发了请求但收到500/502/503 → 查 `app.log`，优先看LLM超时和Supabase连接。

### 2.3 核心业务编排层

| 文件                               | 行数   | 作用                           | 关键函数                                                      |
| -------------------------------- | ---- | ---------------------------- | --------------------------------------------------------- |
| `src/lib/multi-agent-system.ts`  | 1401 | **整个系统的核心**。5个AI智能体的定义、协调、调用 | `processLearningRequest()` 是主入口                           |
| `src/lib/unified-llm-service.ts` | 342  | 统一LLM调用封装                    | `chat()`, `chatStream()`, `generateCulturalExplanation()` |

**关键点**：这两个文件的LLM调用路径是**独立的**：

* `multi-agent-system.ts` → 直接用 `coze-coding-dev-sdk` 的 `LLMClient`

* `unified-llm-service.ts` → 封装了 DeepSeek / Qwen / Coze 三个后端

**如果这一层出错**：学习内容生成失败/超时 → 查 `app.log` 里的 `[知识库]`、`[场景映射]` 日志，看是哪个Agent失败。

### 2.4 检索与知识层

| 文件                                         | 作用                              | 数据源                 |
| ------------------------------------------ | ------------------------------- | ------------------- |
| `src/lib/knowledge-base-service.ts`        | Supabase知识库CRUD（知识点、对比、阐释、图谱节点） | Supabase PostgreSQL |
| `src/lib/neo4j-service.ts`                 | Neo4j连接和Cypher查询                | Neo4j Aura          |
| `src/lib/knowledge-graph-neo4j-service.ts` | 知识图谱专用服务                        | Neo4j Aura          |
| `src/lib/unified-data-service.ts`          | 统一数据访问层（Supabase+Neo4j）         | 两者兼有                |
| `src/storage/database/supabase-client.ts`  | Supabase客户端初始化                  | 环境变量自动获取            |

**如果这一层出错**：知识点查不到/图谱空白 → 查Neo4j环境变量是否配置、Supabase连接是否正常。

### 2.5 LLM生成层

系统有**两套LLM调用路径**：

**路径A**（主流程，5智能体使用）：

```
BaseAgent.generateResponse()
  → this.llm_client.invoke()  // coze-coding-dev-sdk 的 LLMClient
  → 豆包模型 doubao-seed-2-0-pro-260215
```

**路径B**（阐释/对比等独立功能使用）：

```
UnifiedLLMService.chat()
  → 根据 LLM_PROVIDER 环境变量选择后端
  → 支持: deepseek / qwen / coze(默认)
```

当前配置：`LLM_PROVIDER=mock`（实际走coze默认路径），5智能体直接用coze SDK。

### 2.6 质量控制层

| 机制       | 位置                                                | 说明                   |
| -------- | ------------------------------------------------- | -------------------- |
| 偏见检测     | `multi-agent-system.ts` 的 `detectBias()`          | 关键词+句式模式匹配，偏见度>0.2标记 |
| JSON格式校验 | `multi-agent-system.ts` 的 `safeJsonParse()`       | 支持代码块提取、首尾花括号提取      |
| 练习题格式验证  | `ContentGeneratorAgent.validateExercisesFormat()` | 选择题必须4选项/判断题固定格式     |
| A5质量管控   | `QualityControllerAgent`                          | 自动评分+LLM二次审核         |

### 2.7 配置与运行环境层

| 配置项      | 环境变量                          | 当前值           | 作用           |
| -------- | ----------------------------- | ------------- | ------------ |
| LLM提供商   | `LLM_PROVIDER`                | mock(实际走coze) | 选择LLM后端      |
| Mock开关   | `LLM_MOCK_MODE`               | false         | true时禁止调用LLM |
| DeepSeek | `DEEPSEEK_API_KEY/URL`        | 已配置           | DeepSeek后端   |
| Qwen     | `QWEN_API_KEY/URL`            | 已配置           | 校内Qwen后端     |
| Neo4j    | `NEO4J_URI/USERNAME/PASSWORD` | 已配置           | 知识图谱数据库      |
| Supabase | `COZE_SUPABASE_URL/ANON_KEY`  | 平台自动注入        | 主数据库         |
| 运行端口     | `DEPLOY_RUN_PORT`             | 5000          | 服务监听端口       |

***

## 3. 主调用链（从用户点击到内容展示）

### 3.1 完整学习流程

```
用户在首页选择：母语=英语, HSK等级=3, 场景=日常社交
    ↓
startLearning() [src/app/page.tsx:251]
    ↓ localStorage写入: native_language, hsk_level, learner_id
    ↓ URL跳转: /learning?learner=xxx&kp=daily&level=3&lang=英语
    
学习页加载 [src/app/learning/page.tsx:150]
    ↓ localStorage读取参数
    ↓ fetch POST /api/learning { learner_id, knowledge_point_id:"daily", hsk_level:3, native_language:"英语" }
    
API路由 [src/app/api/learning/route.ts:30]
    ↓ Step 0: 场景映射 getKnowledgePointByScene("daily")
    ↓          → 查Supabase模糊匹配"日常"关键词 → 返回知识点ID
    ↓ Step 1: 获取/创建学习者 (Supabase learners表)
    ↓ Step 2: 调用 multiAgentCoordinator.processLearningRequest(learner, kpId)
    
多智能体协调 [src/lib/multi-agent-system.ts:1191]
    ↓ Step 0: 查Supabase知识库缓存 (cultural_explanations表)
    ↓         如果命中 → 跳过LLM，只生成练习题 → 返回
    ↓         如果未命中 → 继续下面
    
    ↓ Step 1: A1 计算文化焦虑度 (纯数学计算，不调LLM)
    ↓         公式: a = 0.4*e_c + 0.3*t_c_ratio + 0.2*f_c + 0.1*n_c
    
    ↓ Step 2: A2+A3 并行调用LLM
    ↓         A2 母语阐释 → LLM生成 (1次coze API调用)
    ↓         A3 文化对比 → LLM生成 (1次coze API调用) + 偏见检测
    
    ↓ Step 3: A4 内容生成 → LLM生成 (1次coze API调用, 90秒超时)
    ↓         输出: 文化背景 + 语言点 + 对比 + 练习题
    ↓         格式验证: 选择题4选项/判断题格式/答案格式
    
    ↓ Step 4: A5 质量管控 → LLM生成 (1次coze API调用)
    ↓         自动评分 + LLM二次审核
    
    ↓ Step 5: 异步保存到Supabase知识库 (不阻塞返回)
    
API格式化响应 [src/app/api/learning/route.ts:234]
    ↓ 转换exercises格式: type英文→中文, 映射字段
    ↓ 返回JSON
    
前端渲染 [src/app/learning/page.tsx]
    ↓ 展示文化背景、语言点、对比内容
    ↓ 展示练习题，用户做题
    ↓ 提交答案 → validateAnswer() 判断对错
    ↓ 下一题 → 全部做完 → 保存结果 POST /api/learning/results
```

### 3.2 LLM调用次数

一次完整学习请求（未命中缓存时）：

* A2 母语阐释: 1次

* A3 文化对比: 1次

* A4 内容生成: 1次（90秒超时）

* A5 质量审核: 1次

* **总计: 4次LLM调用**，其中A2和A3并行

命中缓存时：

* A4 仅生成练习题: 1次

* **总计: 1次LLM调用**

### 3.3 主链路 vs 缓存链路

```
主链路（未命中缓存）: A1 → A2+A3(并行) → A4 → A5 → 返回用户
缓存链路（命中缓存）: 查Supabase → A4(仅练习题) → 返回用户
```

***

## 4. 关键模块拆解

### 4.1 `multi-agent-system.ts`（系统核心，1401行）

| 子模块                              | 行号        | 作用            | 依赖                            | 被谁依赖                   |
| -------------------------------- | --------- | ------------- | ----------------------------- | ---------------------- |
| `safeJsonParse()`                | 39-73     | 安全JSON解析，容错提取 | 无                             | A2/A3/A4/A5            |
| `withTimeout()`                  | 78-89     | 超时控制          | 无                             | processLearningRequest |
| `withRetry()`                    | 94-113    | 重试机制          | 无                             | processLearningRequest |
| `calculateCulturalAnxiety()`     | 200+      | 文化焦虑度算法       | 无                             | A1                     |
| `calculateNativeLanguageRatio()` | 220+      | 母语占比算法        | 无                             | A2                     |
| `detectBias()`                   | 302-337   | 偏见检测          | BIAS\_KEYWORDS/BIAS\_PATTERNS | A3/A5                  |
| `bayesianKnowledgeTracing()`     | 342-359   | BKT知识追踪       | 无                             | A1                     |
| `BaseAgent`                      | 432-480   | 智能体基类         | coze-coding-dev-sdk           | 所有Agent                |
| `LearnerProfilerAgent`           | 484-570   | A1: 焦虑度+追踪    | 无LLM调用                        | Coordinator            |
| `MotherTongueExplainerAgent`     | 572-635   | A2: 母语阐释      | 1次LLM                         | Coordinator            |
| `CulturalComparatorAgent`        | 637-704   | A3: 文化对比      | 1次LLM                         | Coordinator            |
| `ContentGeneratorAgent`          | 706-837   | A4: 内容生成      | 1次LLM                         | Coordinator            |
| `QualityControllerAgent`         | 839-925   | A5: 质量管控      | 1次LLM                         | Coordinator            |
| `getKnowledgePointByScene()`     | 953-998   | 场景→知识点映射      | Supabase                      | API路由                  |
| `queryKnowledgeBase()`           | 1021-1127 | 知识库缓存查询       | Supabase                      | Coordinator            |
| `saveToKnowledgeBase()`          | 1132-1168 | 异步保存知识库       | Supabase                      | Coordinator            |
| `MultiAgentCoordinator`          | 1172-1401 | 协调器主类         | 所有Agent                       | API路由                  |

**如果它坏了**：学习页永远loading / 返回502 / 内容为空 → 先看哪个Agent抛出AgentError。

### 4.2 `unified-llm-service.ts`（LLM统一封装，342行）

| 子模块                                               | 作用                    | 被谁调用              |
| ------------------------------------------------- | --------------------- | ----------------- |
| `DeepSeekClient`                                  | DeepSeek API调用（普通+流式） | UnifiedLLMService |
| `QwenClient`                                      | 校内Qwen API调用（普通+流式）   | UnifiedLLMService |
| `UnifiedLLMService.chat()`                        | 统一chat接口，按provider分发  | explanations API等 |
| `UnifiedLLMService.generateCulturalExplanation()` | 生成文化阐释（JSON输出）        | explanations API  |

**注意**：5个智能体**不用这个文件**，直接用 `coze-coding-dev-sdk`。

### 4.3 `knowledge-base-service.ts`（Supabase知识库，550行）

| 子模块                              | 作用                 |
| -------------------------------- | ------------------ |
| `CulturalKnowledgeService`       | 知识点CRUD            |
| `CrossCulturalComparisonService` | 跨文化对比CRUD          |
| `KnowledgeGraphService`          | Supabase中的图谱节点CRUD |
| `CulturalExplanationService`     | 文化阐释CRUD           |

### 4.4 `neo4j-service.ts`（Neo4j连接，\~350行）

提供 `query()` / `execute()` 方法执行Cypher查询。被知识图谱API和可视化组件使用。

**重要**：如果 `NEO4J_URI/USERNAME/PASSWORD` 未配置，会抛出明确错误，不再静默降级到假数据。

### 4.5 `supabase-client.ts`（数据库客户端，\~130行）

初始化Supabase连接。凭证通过平台自动注入（`COZE_SUPABASE_URL/ANON_KEY`），不需要手动配置。

***

## 5. 这个系统里最容易出问题的地方

### 5.1 场景→知识点映射不精确

**现象**：用户选了"日常社交"，但学习内容讲的是"筷子文化"
**原因**：`getKnowledgePointByScene()` 用 `ilike` 模糊匹配Supabase里的知识点，匹配不到就返回场景ID本身作为兜底
**最先查**：`src/lib/multi-agent-system.ts:953-998`，看日志 `[场景映射]` 输出

### 5.2 LLM返回的JSON解析失败

**现象**：学习页显示"内容为空"或只有文化背景没有练习题
**原因**：LLM返回的不是标准JSON（可能有markdown代码块包裹、多余文字），`safeJsonParse` 提取失败
**最先查**：`src/lib/multi-agent-system.ts:39-73`，看Console里 `无法解析JSON` 的日志

### 5.3 LLM调用超时

**现象**：学习页加载超过2分钟后报错
**原因**：4次串行LLM调用，每次60-90秒超时，总时间可能超120秒
**最先查**：`src/app/api/learning/route.ts:156-162`，看 `withTimeout(120000)` 是否够用

### 5.4 localStorage数据残留

**现象**：切换母语后还是显示旧语言的内容
**原因**：`learner_id` 存在localStorage里，API查到旧学习者后用旧数据
**最先查**：浏览器DevTools → Application → Local Storage，清空后重试

### 5.5 知识库缓存返回过时数据

**现象**：换了HSK等级，但内容没有变化
**原因**：`queryKnowledgeBase()` 按 `knowledge_point_id` + `language_code` 查缓存，不区分HSK等级
**最先查**：`src/lib/multi-agent-system.ts:1021-1127`，看日志 `[知识库] 命中缓存`

### 5.6 填空题无法作答

**现象**：填空题出现但无法选择答案
**原因**：A4的Prompt要求填空题 `options` 为空数组 `[]`，前端只支持选择/判断两种交互
**最先查**：`src/app/learning/page.tsx`，搜索 `fill_blank` 或 `填空题`

***

## 6. "理想设计" vs "当前实际实现"

| 模块                | 理想设计              | 当前实际                                     | 差距       |
| ----------------- | ----------------- | ---------------------------------------- | -------- |
| 前端交互              | 单一学习入口，流程清晰       | 3个学习相关页面(首页/learning/learn) + 1个死组件      | 有重复页面    |
| learner profile联动 | 学习结果反馈画像，焦虑度动态变化  | 焦虑度初始固定50，做题后只保存分数，**不回写画像**             | 未闭环      |
| 场景映射              | 精确1:1映射           | 模糊关键词匹配，兜底返回场景ID本身                       | 不够精确     |
| 知识库缓存             | 按知识点+语言+HSK等级精确缓存 | 只按知识点+语言查缓存，**不区分HSK等级**                 | 缓存粒度粗    |
| Neo4j接入           | 图谱查询驱动学习推荐        | Neo4j仅用于知识图谱可视化页面展示                      | 未接入学习主流程 |
| 向量检索接入            | 语义相似度检索知识点        | **未实现**，所有检索都是SQL模糊匹配                    | 完全缺失     |
| LLM生成接入           | 5智能体串并行协作         | ✅ 已实现，4次LLM调用真实执行                        | 基本达标     |
| 质量控制              | A5自动审核+人工审核       | A5自动审核已实现，**人工审核界面未实现**                  | 半成品      |
| 偏见检测              | 关键词+句式+语义三级检测     | 仅关键词+句式模式匹配                              | 无语义检测    |
| 返回协议              | 统一JSON Schema     | A4/A5输出格式由Prompt约束，运行时靠safeJsonParse容错   | 软约束      |
| 多语言阐释             | 8种语言完整阐释          | API已实现，但数据量取决于LLM生成                      | 可用但不全    |
| 贝叶斯知识追踪           | 答题后实时更新掌握度        | BKT算法已实现，但**计算结果未回写到学习者画像**              | 未闭环      |
| 能力向量              | 5维能力动态追踪          | `calculateAbilityVector()` 已实现，**但未被调用** | 死代码      |

***

## 7. 排错地图

### 如果现象是：按钮点击没反应

1. 打开浏览器DevTools → Console，看有没有JS错误
2. 检查是否是首页的 `selectedLanguage` 未选择（`startLearning` 会拦截）
3. 检查 `localStorage` 是否被浏览器隐私策略阻止

### 如果现象是：选了HSK但学习内容等级不对

1. 打开DevTools → Network，找 `/api/learning` 请求，看Request Payload里 `hsk_level` 是多少
2. 查 `src/app/learning/page.tsx:156`，`localStorage.getItem("hsk_level")` 返回什么
3. 查 `src/app/page.tsx:260`，`localStorage.setItem('hsk_level', ...)` 是否执行过

### 如果现象是：页面打开一直loading

1. DevTools → Network，找 `/api/learning` 请求，看状态码和响应时间
2. 如果502：LLM调用超时，查 `app.log` 里 `Agent xxx timeout`
3. 如果503：Supabase连接问题，查 `COZE_SUPABASE_URL` 是否可用
4. 如果一直pending：4次LLM调用总耗时超120秒

### 如果现象是：接口成功但内容像固定模板

1. 查 `app.log` 里 `[知识库] 命中缓存` → 走了缓存链路，内容是之前生成的
2. 如果没命中缓存但内容单调 → 查 `processLearningRequest` 的 `scene_type`，可能是兜底值
3. 清空Supabase的 `cultural_explanations` 和 `cross_cultural_comparisons` 表后重试

### 如果现象是：明明配了Neo4j/LLM但看起来没生效

1. **Neo4j**：查 `app.log` 里 `[Neo4j] 连接成功/失败`，如果没出现则 `neo4j-service.ts` 没被调用
2. **LLM**：查 `app.log` 里 `Agent A2/A3/A4 failed`，如果出现则coze SDK调用失败
3. 检查 `.env` 文件：`LLM_MOCK_MODE` 必须为 `false`，`NEO4J_URI` 必须有值
4. 注意：5智能体用的是 `coze-coding-dev-sdk`，**不走** **`unified-llm-service.ts`**

### 如果现象是：做题判错但实际答对了

1. 查DevTools → Network → `/api/learning` 响应里的 `exercises[].correct_answer`
2. 选择题答案应该是字母(A/B/C/D)，判断题应该是"对"/"错"
3. 查 `src/app/learning/page.tsx` 里的 `validateAnswer()` 函数逻辑
4. 如果答案是中文内容而非字母 → LLM没有遵循Prompt约束

### 如果现象是：知识图谱页面空白

1. 查DevTools → Console 和 Network，找 `/api/knowledge/graph` 请求
2. 如果500：查 `.env` 中 `NEO4J_URI/USERNAME/PASSWORD` 是否配置
3. 如果返回空数组：Neo4j中可能没有数据，需要运行迁移脚本

***

## 8. 答辩版解释模板

> 这个系统是一个面向8大母语文化圈的HSK1-9级智能中文学习平台。核心创新点是"母语驱动的跨文化对比式学习范式"——系统先学习者的母语文化阐释打底，再做中外文化异同精准匹配，最后用场景化练习形成闭环。
>
> **架构层面**，系统采用多智能体网状协同设计，5个AI智能体分工协作：A1负责学习者画像建模和焦虑度计算，A2负责母语化文化阐释，A3负责跨文化对比分析，A4负责场景化内容生成，A5负责质量管控和偏见检测。其中A2和A3并行执行，整体调用链是 A1→(A2+A3)→A4→A5。
>
> **知识层**，系统采用动态混合知识底座设计，融合图数据库Neo4j中的391个文化知识点节点、Supabase中的结构化文化阐释数据，以及LLM实时生成能力。已有数据会缓存到Supabase避免重复生成。
>
> **算法层面**，系统实现了文化焦虑度公式 a=0.4e\_c+0.3t\_c+0.2f\_c+0.1n\_c 来动态调整母语占比，贝叶斯知识追踪BKT来建模学习者的掌握度变化，以及关键词+句式模式的偏见检测机制。
>
> **已完成的部分**：5智能体调用链已真实跑通、LLM内容生成可用、知识图谱可视化可用、多语言阐释API已实现。
>
> **待完善的部分**：BKT和能力向量的计算结果尚未回写到学习者画像形成闭环、Neo4j知识图谱尚未接入学习推荐主流程、语义级偏见检测未实现、专家审核界面未开发。

***

## 9. 系统速查表

| 文件/模块                                     | 作用              | 上游               | 下游                           | 出错现象           | 优先排查                 |
| ----------------------------------------- | --------------- | ---------------- | ---------------------------- | -------------- | -------------------- |
| `src/app/page.tsx`                        | 首页：选参数启动学习      | 用户操作             | `/learning` 页面               | 按钮无反应/参数丢失     | localStorage读写       |
| `src/app/learning/page.tsx`               | 学习页：做题交互        | 首页跳转             | `/api/learning`              | 白屏/一直loading   | fetch请求和响应           |
| `src/app/api/learning/route.ts`           | 学习API：编排全流程     | 学习页fetch         | multi-agent-system           | 502/503/空内容    | Agent错误日志            |
| `src/lib/multi-agent-system.ts`           | 5智能体协调器         | learning API     | LLM+Supabase                 | 生成失败/格式错       | 哪个Agent抛出AgentError  |
| `BaseAgent.generateResponse()`            | LLM调用基类         | 各Agent           | coze-coding-dev-sdk          | 超时/返回空         | coze SDK配置           |
| `safeJsonParse()`                         | JSON容错解析        | 各Agent           | 无                            | 解析失败           | LLM返回的原始文本           |
| `getKnowledgePointByScene()`              | 场景→知识点映射        | learning API     | Supabase                     | 内容与场景不匹配       | Supabase查询结果         |
| `queryKnowledgeBase()`                    | 知识库缓存查询         | Coordinator      | Supabase                     | 内容不随HSK变化      | 缓存是否区分等级             |
| `detectBias()`                            | 偏见检测            | A3/A5            | 无                            | 误报/漏报          | 关键词列表                |
| `src/lib/unified-llm-service.ts`          | 统一LLM封装         | explanations API | DeepSeek/Qwen/Coze           | 阐释生成失败         | LLM\_PROVIDER配置      |
| `src/lib/neo4j-service.ts`                | Neo4j连接查询       | 知识图谱API          | Neo4j Aura                   | 图谱页面空白         | NEO4J\_\*环境变量        |
| `src/lib/knowledge-base-service.ts`       | Supabase知识库CRUD | 各知识API           | Supabase                     | 知识点查不到         | Supabase连接和表数据       |
| `src/storage/database/supabase-client.ts` | Supabase客户端     | 所有Supabase操作     | Supabase云                    | 全局503          | COZE\_SUPABASE\_\*变量 |
| `.env`                                    | 环境变量配置          | 无                | 所有需要配置的模块                    | 配置缺失报错         | 检查各变量是否存在            |
| `src/app/learn/[id]/page.tsx`             | 学习页(重复)         | 无(独立入口)          | `/api/learning/content/[id]` | 与/learning功能冲突 | 建议合并或删除              |
| `src/components/learning-interaction.tsx` | 死组件(543行)       | **无人引用**         | 无                            | 无直接影响          | 建议删除                 |

