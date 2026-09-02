# 多智能体协同机制

## 摘要

本节阐述面向跨文化对外汉语教学的多智能体协同生成框架中的Agent协同机制。系统定义5个专业化Agent，按有向无环图（DAG）拓扑组织，通过共享状态对象实现上下文传递，采用内联门控（in-line gating）策略将6种异构Guardrail校验嵌入关键管线节点。Agent间通信遵循统一的消息结构，执行策略混合了串行依赖链与并行fan-out/fan-in模式。学习者画像的7维信息通过不同路径注入Agent prompt，驱动个性化的内容生成。

## 1. Agent角色定义

系统将教学内容生成管线分解为5个功能互补的Agent角色，每个Agent继承自统一的`BaseAgent`抽象基类，共享LLM调用接口和超时重试机制。

### 1.1 A1：学习者画像建模Agent

A1是系统中唯一不调用LLM的Agent。其核心职责为三个纯计算任务：（1）从数据库读取文化焦虑度数值并映射为离散等级（high [80,100] / medium [40,80) / low [0,40)）；（2）根据焦虑等级计算母语占比（$native\_ratio \in \{0.75, 0.50, 0.25\}$）；（3）调用`getRecentLearningTrend(learnerId, N=5)`函数从`assessment_records`表聚合L2短期记忆趋势，包括弱项维度（正确率 < 40%）、准确率趋势（improving/stable/declining）、重复错误模式（出现 ≥ 2次）和重复场景（出现 ≥ 2次）。

A1遵循严格的单一数据源原则：焦虑度仅从数据库`learners.cultural_anxiety_score`读取，不从行为指标（错误率、答题时长、放弃率、负面反馈）独立计算。`aggregateLearnerMetrics()`仅用于日志记录和未来扩展，不参与当前焦虑度决策。该设计消除了多Agent系统中状态多源写入导致的不一致风险。

### 1.2 A2：母语阐释Agent

A2负责生成面向学习者母语的文化阐释内容。其prompt采用四段式XML标签约束结构：（1）`<system_prompt>`定义角色——"拥有15年对外汉语教研经验的跨文化教育专家"；（2）`<strict_constraints>`定义四类硬约束：语言约束（非中文内容必须使用目标母语，严禁英语替代）、文化安全红线（禁止绝对化表述、负面刻板印象、文化优劣判断和神秘化东方表述）、事实性约束（不确定的细节宁可省略）、等级匹配约束（超纲词汇须附带拼音与母语注释）；（3）`<tier_guidelines>`按HSK1-3/4-6/7-9三层指导阐释深度——基础层聚焦"是什么"和"何时用"，进阶层阐释"为什么"和"跟谁用"，高阶层分析"从何而来"和"当代演变"；（4）`<output_schema>`以JSON Schema约束输出结构，包括`precise_definition`（2-4句精准定义）、`scene_introduction`（场景介绍附对话示例）、`pragmatic_rules`（3条语用规则）、`examples`（附拼音与文化注释的例句）、`taboo_warnings`（禁忌提醒）和`difficulty_notes`（学习难点预判）。

### 1.3 A3：跨文化对比Agent

A3生成基于学术框架的跨文化对比分析。其prompt要求"基于Hofstede文化维度理论或Hall高低语境理论进行学术级别的对比分析"，禁止捏造事实、网络段子和刻板印象。输出为XML四段结构：`framework_used`（选用的学术框架及具体维度）、`chinese_perspective`（中国文化视角，≤100字）、`target_culture_perspective`（目标文化视角，≤100字）、`learning_pitfall`（一句交际误区总结）。生成后执行`detectBias()`进行关键词和句式模式的初步检测，作为轻量级预警机制。

### 1.4 A4：教案生成Agent

A4是管线中逻辑最复杂的Agent，负责合成A2的文化阐释、A3的跨文化对比和A1的L2趋势数据，生成完整的教案对象（`GeneratedContent`）。输出结构包含：`cultural_context`（80-150词母语文化背景说明，含`native_ratio`控制母语与中文的比例）、`language_points`（3-5个核心中文表达，附母语翻译）、`comparison`（跨文化对比摘要）、`exercises`（3-5道练习题，须涵盖至少2种题型）。A4的prompt额外包含`<adaptive_guidance>`块，以结构化自然语言指令注入L2趋势数据：弱项维度题目占比提高至40%+、declining趋势降低难度、improving趋势适度提升难度、重复错误模式靶向出题、重复场景避免使用。`validateExercisesFormat()`方法对输出进行格式校验：选择题须4选项且正确答案为A-D字母、判断题选项固定["对","错"]、填空题选项为空数组且答案非空。

### 1.5 A5：质量审核Agent

A5以temperature=0进行确定性四维盲审。审核维度包括：拼音准确度（`pinyin_score`）——检查是否符合《汉语拼音方案》及声调位置，一处错误扣0.5分，两处以上0分；干扰项合理性（`distractor_score`）——错误选项须具有语法或语义迷惑性，"一眼假"选项直接0分；HSK等级匹配度（`hsk_compliance_score`）——超纲词汇无拼音注释直接0分；文化政治安全性（`safety_score`）——任意一丝敏感风险直接0分。四项得分均 ≥ 0.85方判定`is_qualified = true`。A5的输出经`verifyA5JointArbitration`进行双模型交叉验证。

## 2. 通信与状态管理

### 2.1 消息结构

Agent间通信通过统一的`AgentMessage`接口承载，包含消息标识（`id`）、请求追踪标识（`event_id`）、收发方Agent标识（`sender_agent`/`receiver_agent`）、用户关联（`learner_id`）、语义类型（`message_type`：profile_update / content_request / comparison_result / quality_check / approval）、业务载荷（`payload`）和处理状态（`status`）。`event_id`采用`evt_<timestamp>_<random>`格式，实现请求级全链路追踪。

### 2.2 共享状态机制

系统采用共享状态对象而非点对点消息传递作为主要的上下文共享机制。在LangGraph实现路径中，所有节点共享一个由`Annotation.Root`定义的`GraphState`对象，包含13个字段。字段按更新策略分为两类：覆盖型字段（如`learner_profile`、`anxiety_data`、`cultural_explanation`、`generated_content`等）使用replace reducer，后继节点的输出完全覆盖前驱值；累积型字段（`guardrail_results: Record<string, GuardrailVerdict>`）使用merge reducer（`(a, b) => ({ ...a, ...b })`），使得分布在A2、A3、A4、A5各节点中的Guardrail判决能够逐步聚合到一个统一的映射中，供最终的加权置信度计算使用。

在手写编排路径中，`MultiAgentCoordinator.processLearningRequest()`通过局部变量手动管理状态传递，`guardrailResults`变量以对象字段赋值的方式累积，与LangGraph的merge reducer逻辑等效。

### 2.3 上下文传递路径

关键上下文在Agent间的传递路径如下：`learner_profile`从API层全量注入，贯穿全部Agent；`anxiety_data`（含焦虑等级、母语占比、L2趋势）由A1产出，供A2、A3、A4消费；`cultural_explanation`由A2产出，供A4消费和`verifyA2Translation`、`verifyA4Grounding`校验；`cross_cultural_comparison`由A3产出，供A4消费和`verifyA3Comparison`校验；`generated_content`由A4产出，供A5审核和`verifyA4SolverAdversarial`、`preA5HardRulesFilter`、`verifyA5JointArbitration`校验。这种树状的上下文传播路径确保了每个下游节点仅接收其所需的输入，避免了全量状态拷贝。

## 3. 执行时序与并行策略

### 3.1 DAG拓扑

管线的DAG拓扑包含9个节点（含缓存检查节点和汇聚节点），按以下拓扑顺序执行：`checkCache → (a1Profiler) → [a2Explainer ‖ a3Comparator] → mergeA2A3 → a4Generator → a5Controller → saveKB`。缓存命中时，通过条件边跳过A1-A5的完整链路，直接进入练习题生成节点。

### 3.2 A2与A3的并行执行

A2与A3是管线中唯一可并行的Agent对。两者仅依赖A1的输出——A2需要`anxiety_level`和`hsk_level`来调节阐释的语言选择与深度，A3需要同样的参数来控制对比分析的复杂度——彼此之间无数据依赖，也不修改对方所需的共享状态字段。在LangGraph实现中，A1节点的两条出边（`.addEdge("a1Profiler", "a2Explainer")`和`.addEdge("a1Profiler", "a3Comparator")`）声明了A2和A3无相互依赖，LangGraph运行时自动并行调度。在手写实现中，`Promise.all([a2.process(...), a3.process(...)])`实现等效的运行时并行。A2和A3均完成后，通过`mergeA2A3`汇聚节点（barrier同步点）进入A4。mergeA2A3为一个空操作节点，仅作为fan-in的汇聚点存在——实际的状态合并由LangGraph的reducer自动完成。

### 3.3 Guardrail的同步阻塞

所有Guardrail校验均采用同步阻塞模式——在校验完成之前，下游Agent不会启动。这种设计是有意为之的架构选择，体现了系统"内联门控"（in-line gating）范式的核心特征。与"先完全生成、后统一过滤"的事后策略不同，内联门控在错误内容传播到下一个处理节点之前进行拦截。例如，若A2的阐释未通过回译校验，则A4的内容合成阶段不会开始；若A4的练习题未通过对抗盲测，则A5的审核阶段不会启动。这种策略虽然增加了端到端延迟（每个Guardrail增加约5-15秒的同步等待），但从根本上阻断了幻觉在多节点管线中的级联放大。

### 3.4 条件分支与缓存短路

缓存检查节点（`checkCache`）引入管线的唯一条件分支。该节点通过`queryKnowledgeBase()`以三维复合主键查询缓存，通过双重校验（`status='ACTIVE'`且`confidence_score ≥ 0.60`）判定命中。命中时，`routeAfterCache(state)`返回`"generateExercises"`，跳过A1-A3的LLM调用，仅在缓存基础上生成练习题。此短路路径可节省约15-45秒的LLM调用延迟，并避免不必要的模型计算成本。

### 3.5 异步写入

知识库回写（`saveKB`节点）以异步方式执行。`saveToKnowledgeBase()`返回的Promise通过`.catch(err => console.error(...))`处理，不阻塞`final_result`的返回。该设计确保缓存写入失败不影响用户的即时体验——即使PostgreSQL不可用，学习者仍然获得完整的生成内容。

## 4. 学习者画像对Agent的驱动

### 4.1 HSK等级的多层影响

HSK等级（1-9）在4个Agent和1个Guardrail中产生影响，形成从生成到校验的完整闭环。在A2中，`<tier_guidelines>`按三层指导阐释深度，决定了文化内容的抽象层次和语言复杂度。在A3中，HSK等级控制对比分析的理论深度——低层级做现象级对等比较，高层级引入Hofstede维度分析。在A4中，HSK等级约束词汇选择范围，超纲词汇须附带拼音注释。在A5中，`hsk_compliance_score`维度以目标等级为基准审核词汇合规性。在`preA5HardRulesFilter`中，目标HSK等级对应的单字白名单（从HSK 3.0词汇表打散为单字集合）与题干中的中文字符逐一比对，标记超纲字。这种"生成约束 + 校验拦截"的双重机制确保HSK等级适配不仅是prompt中的软指导，也是可强制执行的硬规则。

### 4.2 母语文化圈的注入路径

母语信息在三个层面影响Agent行为。语言层面：A2、A3、A4的所有面向学习者的内容（定义、翻译、注释、解析）强制使用目标母语，由prompt中的硬约束和Guardrail中的回译校验双重保障。对比层面：A3以学习者母语文化为参照系，在中方视角与目标文化视角之间建立对称分析结构。认知层面：A2的`difficulty_notes`字段根据不同母语文化圈的学习难点预判，针对性地调整阐释策略。

### 4.3 文化焦虑度的自适应传导

文化焦虑度是贯穿A1→A2→A3→A4的核心自适应变量。其传导路径为：数据库→A1（映射为离散等级+母语占比）→A2（影响情感基调和语言选择）→A3（影响分析复杂度）→A4（影响母语与中文的比例、练习难度）。焦虑度变化通过`POST /api/learning/results`的`applyAnxietyDelta(correctnessRate)`函数写回数据库，形成"学习→评估→画像更新→下次自适应的生成"的闭环。增量公式$\Delta = (0.5 - r) \times 20$保证了焦虑度的更新仅依赖于学习者的实际表现（正确率$r$），不受任何Agent的主观判断影响。

### 4.4 L2短期记忆的趋势注入

L2短期记忆趋势是连接评估数据与生成策略的桥梁。`getRecentLearningTrend(learnerId, 5)`函数通过纯统计算法从最近5轮评估记录中提取4项指标，以结构化自然语言指令注入A4的`<adaptive_guidance>`块。这种设计将数据驱动的趋势提取（确定性、可审计）与LLM的生成策略（灵活性、语境感知）解耦——趋势提取由传统算法完成，LLM仅在prompt指导下将趋势"翻译"为具体的出题策略。该架构确保了自适应决策的可复现性和可解释性，避免了LLM直接访问原始评估数据可能引入的隐私风险和统计偏差。

## 5. Guardrail内联校验体系

### 5.1 校验方法的分布与协同

6种Guardrail校验方法分布在管线的4个关键节点，形成分层递进的防御体系。A2回译校验以跨模型（qwen3.6回译 + DeepSeek裁判）、跨语言（目标母语→中文）的双保险机制验证阐释的语义保真度。A3客观性校验以NLI范式从客观性、无偏见性和事实基础三个标准评估跨文化对比的学术质量。A4层级的三重校验——对抗盲测（独立Solver验证可解性）、硬规则过滤（确定性拼音+HSK校验）和交叉校验（练习题与阐释的忠实度）——从不同维度确保练习题质量。A5仲裁原设计为两个异构模型（DeepSeek + MiniMax）独立评分并计算分歧度（$\delta = \max_i |s_i^{DS} - s_i^{MM}|$）提供最终质量判定；当前 MiniMax 通道失效，已降级为 DeepSeek 单模型仲裁（见 limitation）。这种分层递进的校验策略确保了不同类型、不同层级的幻觉在管线的不同阶段被对应的Guardrail拦截。

### 5.2 加权置信度聚合

`computeCacheConfidence()`函数将6种Guardrail的判决结果加权聚合为单一的置信度分数$C$，用于缓存准入决策：

$$C = \frac{\sum_i w_i \cdot c_i}{\sum_i w_i}$$

权重分配反映各校验方法的可靠性和信息粒度：A5双模型仲裁$w=0.40$（唯一实值评分+双模型共识）、A2回译裁判$w=0.25$（跨语言语义验证）、A3客观性裁判$w=0.15$（学术质量判定）、A4交叉校验$w=0.10$（内容忠实度）、硬规则$w=0.05$（轻量结构校验）、Solver盲测$w=0.05$（轻量可解性校验）。未执行的Guardrail（如在缓存短路路径中仅执行Solver盲测）不参与加权计算，避免缺失值引入偏差。

## 6. 小结

本文提出的多智能体协同机制以DAG拓扑组织5个专业化Agent，通过共享状态对象实现高效的上下文传递，采用fan-out/fan-in实现A2/A3的天然并行，以同步阻塞的Guardrail内联校验阻断幻觉传播，以条件分支实现缓存短路优化。学习者画像的7维信息通过不同路径注入Agent prompt，形成从学习者状态到生成策略的完整自适应链路。Agent实现层与编排层解耦——Agent不感知拓扑结构，编排器不侵入生成逻辑——确保了系统的模块化、可测试性和渐进演化能力。
