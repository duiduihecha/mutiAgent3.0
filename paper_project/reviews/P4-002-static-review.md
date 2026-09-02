# P4-002 四页短文 Pilot 独立静态复审

- 日期：2026-08-26（Asia/Shanghai）
- 角色：P4 导师与红队审查 Agent
- 依据：`MILESTONE_REVIEW.md`
- 审查对象：P1-005 产物及反向自审；P2-005 实施、反向自审及双知识图谱审计；对应协议、代码、测试与派生产物
- 冻结路线：Human PI 已批准 4 页短文；18 份材料仅作 6-case Pilot；RQ3 降为描述性
- 成本：0 CNY；未调用外部 LLM、Judge 或付费 API
- 修改边界：未修改代码、原始数据、`CLAIMS.yaml` 或 `DECISIONS.md`

## 1. 执行结论

P1-005 已把文献任务从“证明领域 Gap”正确降为“给四页短文的保守定位和具体背景论断提供可追踪来源”。在这一降级目标下，21 篇分层池基本够用，但不构成检索饱和或新颖性证明，投稿前更新门仍必须执行。

P2-005 的核心修复方向成立：converter 改为读取所有条件共同拥有的最终生成容器；`native_ratio` 已从评价材料移除；历史 156 条被正确降级为结构与错误模式诊断；NoA3 的最终 A4 任务静态上保持不变；遥测已接到非流式统一 LLM 边界并避免保存 prompt、密钥和 endpoint；双知识图谱审计总体诚实。

但静态包尚有三项关键不一致：目标文化错配规则被称为“高召回”过强；RQ3 冻结定义与真实 API action/测试模式不一致；付费运行缺实际成本、真实 provider usage 验证及可接受的类型检查基线。因此 P4 允许进入**问卷设计**，不允许问卷发放，也不允许进入付费 smoke。

## 2. 独立核验记录

### 2.1 文献、元数据与证据位置

- `approved_literature.csv`、`approved_references.bib` 与 `reference_tiers.csv` 均为 21 条；本轮抽查的 citation ID 已统一，包括 `liu2025intercultural` 与修正后的 `liffiton2023codehelp`。
- 7 篇 `main-citable` 能覆盖短文所需的五类背景：教育角色系统、跨文化语用/文化适配、中文二语教学内容、Judge 偏差、预算控制。
- P1 已如实把原检索改称不可完全重放的“主题增量检索摘要”，并只把 Tran & Kiela 的一层 backward chain 称为真实引用链；没有继续声称覆盖率或饱和。
- `citation_claim_map.csv` 对新增文献给出了页码、章节、表或图，整体可用于正文核对。例外是 MultiTutor 的若干描述仍以 `PDF pp.174–190` 作为宽范围定位；若正文使用超出权威摘要的框架或评价细节，仍需定位到具体节/页。
- Tran & Kiela 被明确标为 under-review preprint，其 thinking-token budget 也被明确区分于本项目的输入+输出 token；该边界是必要的。

结论：这些文献足以支持“已有多个分别相关的先例；本文报告一个评价污染审计、统一协议和描述性 6-case Pilot”的短文定位；不足以支持 `little prior work`、领域 Gap、首次性、组合新颖性或一般架构优势。

### 2.2 研究对象措辞

`condition-invariant generated instructional artifact` 基本诚实，前提是它被定义为：从所有条件共同的最终 `generated_content`（仅在缺失时回退 `learning_content`）映射出的统一研究对象，而不是声称完整复现部署 UI、学习体验或 A2/A3 全部内部信息。

该措辞有两个必须保留的限定：

1. `condition-invariant` 修饰的是**字段来源规则和评价结构**，不是说各条件内容、长度、完整性或可识别风格相同；
2. `artifact` 是研究者构造的评价视图，不等于用户实际看到的页面。论文应直接给出 included/excluded 字段表。

历史 156 条中 `cultural_context` 均为对象，130 条含 `native_ratio`，因此当前 `render_explanation()` 只取 `.explanation` 对这批数据是确定且可审计的。但 `source_audit.explanation_source` 固定写成 `.cultural_context.explanation`，若未来 `cultural_context` 是字符串，该来源标签会不准确；新 smoke 前应让来源标签反映实际类型。

### 2.3 Converter、strict completeness 与 156 条诊断

P4 本地复核结果：

- protocol Python tests：10/10 通过；
- 派生文件：156/156 记录保留；
- 156/156 为 schema version 1.1 静态 validator 可接受；
- 141/156 `strict_complete=true`，15 条不完整；
- Monolith 26/26 的最终 `generated_content.comparison` 已映射；
- 评价材料中 `native_ratio` 为 0/156；
- `UNEXPECTED_ENGLISH_CULTURE_REFERENCE` 为 108/156。

字段来源符合 canonical 原则：主材料只读最终容器的 `cultural_context`、`comparison`、`language_points`、`exercises`，不回退到 A2/A3 专用字段。`native_ratio` 被明确排除。strict completeness 将 schema/type 合法与“3–5 个语言点、恰好 5 道且题型完整的练习”分开，方向正确。

需要注意：`validate_canonical_static()` 只严格检查顶层集合、version、material 形状/类型以及四个对象类型；它并不等价于 JSON Schema 2020-12 的全部嵌套约束。报告已经披露这一点，因此 156/156 只能写“通过锁定静态 validator”，不能写“通过完整 JSON Schema 引擎验证”。

### 2.4 108 条文化错配警报与旧材料废弃

108 条警报的实现规则是：当目标 culture code 不是 `en` 时，仅在 canonical `comparison` 中匹配 `English/Western/American/British/英语/西方文化/美国文化`。它是对历史“默认英语/西方”故障的高敏感专项规则，但不是一般意义上的目标文化错配高召回检测：

- 它不扫描 explanation、language points 或 exercises；
- 它不能发现日语目标写成韩语/法国文化等非英语错配；
- 合理提及第三文化也可能触发；
- 拉丁字母文化目标被标为 `NOT_CHECKABLE_LATIN_SCRIPT`，不能靠 script 判定正确语言。

因此 108 是“英语/西方异常指称警报”，不是 108 个已证实错配，也不是所有错配的高召回估计。旧盲包废弃是充分且必要的：目录已有 `DEPRECATED.md`，明确禁止发放、评分或作效果证据。但旧 `items.jsonl` 和顺序文件仍可被脚本直接读取；后续 blind builder/问卷导出必须 fail closed 拒绝带 `DEPRECATED.md` 的输入目录，不能只依赖人工看到说明。

### 2.5 NoA3 静态操作

静态代码支持“NoA3 只移除 A3 中间产物”的限定结论：

- ExperimentRunner 通过 `skipAgents: ['A3']` 走同一 LangGraph；
- A4 的 final content requirements 对 Full/NoA3 相同，均要求 cultural context、3–5 language points、含异同与提示的 comparison、5 道练习；
- `<cross_cultural_comparison>` 在 NoA3 中为空，而不再写条件名、占位符或“请勿生成比较”；
- A4 仍自行完成相同最终用户任务。

这只是源码契约，不证明真模型下 prompt、token、失败率或格式行为公平。NoA3 节省的 A3 token 必须照实报告；短文只能称“移除专业 A3 中间过程的策略对比”，不能称等 token 的纯角色因果效应。

### 2.6 Telemetry、token fail-closed 与密钥保护

遥测实现的安全边界基本合理：

- `ExperimentRunner.runSingle()` 用 `AsyncLocalStorage` 写入 run/case/condition/category/knowledge hash；
- `UnifiedLLMService.chat()` 在真实非流式边界记录 provider、model、message hash、配置、usage、时间、状态；
- 输出不保存完整 prompt、API key 或 endpoint；文件模式为 `0600`；离线 fetch mock 覆盖了 secret、endpoint 与 prompt 不落盘；
- token checker 对缺 pair、缺/错 usage、重复 call ID、未知 cost、预算超限 fail closed，并排除 Judge token。

剩余限制足以阻止付费 smoke：

1. 当前每条真实记录的 `cost_cny` 固定为 `null`，所以预算门必然失败；
2. 尚未验证拟用 provider 对所有成功响应都返回 usage，也未定义缺 usage 时的冻结 tokenizer 估算；
3. `chatStream()` 未接入遥测；若 smoke 保证只走非流式路径可以接受，但必须在 manifest 中冻结并测试；
4. Guardrail 自有 `callLLM` 不经过该边界，必须明确其 category/cost 是否另记；它不能悄悄混入 generation token，也不能从总费用账本消失；
5. `retry_of` 未进入当前 `SafeCallRecord` 发射接口，真实技术重试链尚未得到端到端证明；
6. 全库 `tsc` 仍失败，尚无“与 smoke 相关错误为零”的冻结基线。

### 2.7 RQ3 真实 API action

真实 API 的一般生产路径是：只有任一 guardrail `action === FLAG_REJECT` 时返回 422 阻断；`FLAG_PENDING_REVIEW` 仍返回材料并标记 `needs_review`。缓存写入另由 `overallConfidence >= 0.85` 决定。这支持 RQ3 只报告 action、实际 deliver/block、缓存准入和运行模式，不把 `passed=false` 当作阻断。

但存在必须修复的协议冲突：

- `P2-003-frozen-estimands-and-operations.md` 仍把 A5 `passed=false / FLAG_PENDING_REVIEW` 映射为 `deliver=0`，并把 A5 `passed` 定为唯一主 gate；
- `human-blind-review-protocol.md` 与真实 route 则写 pending review 仍交付；
- 当 `LLM_TEST_MODE=true` 时，route 会让 `FLAG_REJECT` 也透传为 `needs_review`，此时“只有 reject 阻断”也不成立。

由于 RQ3 已降为描述性，最低风险修复不是再造一个主分类器，而是逐条保存并报告：guardrail name、`passed`、`action`、`LLM_TEST_MODE`、HTTP/delivery action、cache attempted/written。正文只描述本次冻结运行模式中的观察计数，不使用误杀/漏放或 Gate vs NoGate 因果措辞。

### 2.8 双知识图谱边界

P2-005 双图谱审计总体准确，P4 静态抽查未发现将 LangGraph 错当 KG：

- 两者是同一 Neo4j 内相连的两个逻辑子图，不是两个独立数据库；
- `learning-graph.ts` 使用 LangGraph `StateGraph`，是流程编排，不是知识图谱；
- 本地 seed 的 14 Domain / 56 Scene / 166 KnowledgePoint 只证明种子文件，不证明云库现状或每次生成命中；
- 教学/文化子图可生成 case、查询词汇/语法和文化关系，但存在空命中、本地回退、断边与 ID 漂移；
- A4 的 KG 使用是 prompt 注入加部分本地规则，不是端到端硬约束；A2/A3 也不是每次由 KG 事实硬 grounding；
- learner 子图把 pipeline confidence 和答题 correct rate 写入同一 `MASTERED.score`，且 culture ID 可能漂移，不能宣称 BKT、掌握度或推荐形成已验证闭环。

四页短文可利用点仅限：用冻结 seed 做 case 分层/ID 检查，用人工核源后的关系制作证据卡候选，以及离线诊断空命中、断边、culture/HSK 覆盖。KG/NoKG 不应进入当前关键路径。禁止 `GraphRAG`、硬 grounding、KG 因果增益和个性化学习闭环主张。

## 3. Blocker

### B1. 付费 smoke 的成本与调用账本尚未闭合

`cost_cny=null` 会使 token/cost checker fail closed；真实 provider usage、guardrail 直接调用、技术重试链和非流式限定也未端到端验证。没有可追溯实际成本就不能动用 20 CNY smoke 预算。

**解除条件：**冻结模型/endpoint 类别与定价来源；为每次 generation/guardrail 调用计算或记录 CNY；真实/fixture manifest 对未知 cost、缺 usage、漏 call、无效 retry 全部拒绝；证明 smoke 不走未遥测的流式路径。

### B2. RQ3 协议与真实交付动作冲突

P2-003、v1.1 人评协议、生产 route 和 `LLM_TEST_MODE=true` 四者对 pending/reject 的 deliver 定义不一致。即使 RQ3 只描述，若不冻结运行模式与真实 HTTP action，计数仍会错误。

**解除条件：**废止或修订 P2-003 的旧动作表，指定描述性 RQ3 以 API 实际 delivery/cache 事件为准；manifest 记录 `LLM_TEST_MODE`；测试模式和生产模式分别报告，不合并。

### B3. 新 Pilot 的文化来源卡和材料准入尚未完成

六张证据卡仍是 `UNVERIFIED` 模板；旧 18 份材料已废弃；108 条专项警报证明历史管线存在严重目标文化风险。因此没有任何材料可进入评审或作为 smoke 后自动准入的默认样本。

**解除条件：**Human PI 指定的人工核完六张证据卡；新输出逐份通过 strict completeness、目标文化人工检查与泄盲诊断；高风险 unresolved/contradicted case 不进入 Pilot。医疗/急诊 case 尤其需要权威来源，不能只靠通用文化印象。

## 4. Major

### M1. 108 条规则的“高召回文化错配”命名过强

该规则只对非英语目标扫描 comparison 中的英语/西方关键词。建议统一命名为 `unexpected English/Western reference warning`，并明确它既可能误报也会漏掉其他错配。新 Pilot 的目标文化准入必须人工核对，不能由该规则单独通过。

### M2. 静态 schema validator 与正式 JSON Schema 的等价性未建立

静态 validator 没有验证 task/completeness/source_audit/diagnostics 的完整嵌套结构，也未检查每个 language point/exercise 的全部类型约束。短文可报告 156/156 通过“locked static shape validator”，但付费产物还应通过正式 schema engine，或扩展静态 validator 并用同一组正反 fixture 证明行为一致。

### M3. 旧盲包的废弃依赖人工纪律

`DEPRECATED.md` 足以形成审计记录，但目录内仍保留可直接分发的 items/order 文件。后续工具必须识别 tombstone 并拒绝导出；论文资产索引也应只指向新 run ID，避免旧材料被误发。

### M4. 文献池只适合保守短文，不是完整邻近工作地图

21 篇、一个 seed 的一层 backward chain 已足够当前降级定位，但 MultiTutor 细节定位仍偏宽，投稿前更新门尚未执行。任何把 `main-citable` 写成“最相关工作全集”或把 P1-005 写成系统检索的方法描述都会越界。

### M5. 人评协议正文仍有内部残留

协议前半仍列五个 1–5 维度和 RQ2 两个“主结果”，后面的 D-016 覆盖段与 CSV 实际只保留文化正确性和整体质量。实施者若只读前半会产生两套问卷。P5 应以 CSV 简化接口为唯一源，并在新问卷协议中删除而非仅覆盖旧字段；RQ2 主指标应保持 P2-003 所冻的文化理论正确性，比较质量仅诊断/次要。

### M6. 类型检查失败尚未被限定到 smoke 安全边界

全库历史 `tsc` 失败不必阻止四页短文或 P5 设计，但实验 runner、telemetry、LLM wrapper、NoA3 路径与导出工具相关错误必须清零或建立明确的冻结基线和例外清单。否则真 smoke 可能在未覆盖路径上失败或记录不完整。

## 5. Minor

1. `source_audit.explanation_source` 应按 cultural_context 的实际 string/object 类型生成，避免未来来源标签与转换行为不符。
2. 文化 script 检查对西/法/英不可判定，对日/韩/阿/俄/泰也只能证明某字符出现，不能证明语言整体正确；字段名和报告应避免 `language_valid` 一类强措辞。
3. `condition-invariant` 容易被误读为材料不可泄盲；建议首次出现时写 `condition-invariant field mapping`。
4. `SafeCallRecord.error.message` 可能包含 provider 返回的请求片段。当前测试只覆盖成功路径；失败路径应清洗 authorization、URL query、prompt 片段与密钥样式后再落盘。
5. RQ3 的“缓存准入”应区分 attempted、written、active/readable；仅 `shouldWriteCache=true` 不等于数据库写入成功或后续可命中。

## 6. 四个独立裁决

### 6.1 文献门：PASS_WITH_CONDITIONS

可以进入四页短文写作与问卷设计。条件是：正文严格使用保守综合定位；`main-citable` 不被当作新颖性证明；MultiTutor 若写细节须补精确位置；2026-09-29 至 10-02 必须执行 submission update gate，并对 material competitor 重新交 P4/P0。

### 6.2 静态实验门：PASS_WITH_CONDITIONS

converter、NoA3 静态契约、历史诊断、非流式 telemetry 原型和双图谱边界足以进入下一轮**零成本设计与修复**。这不是效果证据通过，不是材料发放通过，也不是付费执行通过。B2、M1、M2、M5、M6 应在 smoke 前闭合；B3 应在任何问卷发放前闭合。

### 6.3 P5 问卷设计门：PASS_WITH_CONDITIONS

允许 P5-001 开始设计低负担选择题式 Pilot 问卷，因为设计本身不需要有效的新生成材料，也不产生 API 成本。P5 必须：

- 以简化 CSV 字段为唯一实施接口，只保留文化理论正确性、盲化整体质量、两个 yes/no、问题标签、文化熟悉度和泄盲诊断；
- 明写 18 份是 6-case Pilot，不做显著性或一般优越结论；
- 不把 RQ3 误杀/漏放作为问卷主任务；`exercise_qualified` 只作描述性连接标签；
- 不使用或嵌入旧 `blind_pilot_fixture` 材料；
- 问卷设计完成后必须再次反向审查并交 P4，未经 B3 解除不得发放。

### 6.4 付费 smoke 门：FAIL_REVISE

当前不得运行任何付费 smoke。最小再准入条件：

1. B1 成本/usage/retry/guardrail 账本闭合，20 CNY 自动停止可验证；
2. B2 RQ3 action 与 `LLM_TEST_MODE` 口径统一；
3. 六张证据卡完成人工核验，case list/hash 冻结；
4. smoke 相关 TypeScript 路径通过或有 P0 批准的明确基线；
5. canonical 正式 schema/等价静态验证、strict completeness、目标 culture 人工检查和 tombstone 拒绝均成为 fail-closed gate；
6. P0/Human PI 对具体模型、版本、prompt、运行模式和 ≤20 CNY 上限另行书面批准。

## 7. 时间、成本与降级路径

- 本轮花费/承诺/最坏 API 成本：0/0/0 CNY。
- P5 可立即并行做零成本问卷设计；文献无需再扩为系统综述。
- smoke 关键路径是成本账本与运行模式统一、六张证据卡、相关类型门，而不是 KG/NoKG。
- 双知识图谱只保留为方法边界、质控资源与 Limitations；不进入当前付费关键路径。
- 若 smoke 前无法闭合上述条件，继续用历史 156 条做诊断性短文素材，不能恢复被污染的效果结论，也不能为赶进度发放旧盲包。

**P4-002 最终状态：文献门条件通过；静态实验门条件通过；P5 问卷设计门条件通过；付费 smoke 门不通过。**
