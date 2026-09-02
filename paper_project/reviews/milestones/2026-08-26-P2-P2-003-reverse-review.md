# P2-004：P2-003 反向自审

- 审查日期：2026-08-26（Asia/Shanghai）
- 审查角色：P2（对自身 P2-003 产物作反向审查）
- 审查对象：冻结定义、本地工具、156条 canonical 转换、10项新增测试、6-case盲包、formal规划
- 成本：0 CNY；未调用外部 LLM、Judge 或 API
- 修改边界：未修改系统代码、P2-003工具或原始实验数据；只新增本审查

## 1. 裁决

**本地实施节点：`FAIL_REVISE`。长文路线：建议 `STOP_OR_DOWNGRADE` 为4页短文，除非 Human PI 在 2026-08-29 前解决人工formal资源并批准新的可执行排期。**

P2-003 正确修复了“评价器只读A3专用字段”的原始循环，但把“统一读取最终容器”过早表述成“最终用户可见内容”。代码对照和数据反例显示该表述不成立；converter 还会把结构合法但目标文化错误的材料判为零warning。Telemetry仍是硬编码fixture，不是运行系统的可追踪证据；10项测试验证的是若干函数分支，不是端到端实验协议。当前不满足付费smoke静态准入条件。

即便返工后smoke通过，现有两位评审者每人15–20份的批准负荷也只允许18份pilot，无法完成n=24或n=43 formal。按当前资源与9月25日实验停止日，长文确认性证据路径不可执行。

## 2. 最强反对意见

### 2.1 Converter 可能忠实地映射了“错误的评价对象”

P2-003 宣称主评价只使用学习者最终可见的 `generated_content`/`learning_content`。真实接口和前端却显示：

- API 的 `cultural_explanation` 来自顶层 `result.cultural_explanation`；
- API 的 `cross_cultural_comparison` 来自顶层 `result.cross_cultural_comparison`；
- `learning_content.cultural_background` 才来自 `result.learning_content.cultural_context.explanation`；
- 前端跨文化tab实际解析 `data.cross_cultural_comparison`。

证据：`src/app/api/learning/route.ts:357-362`、`src/app/learning/page.tsx:662-674`。

Canonical converter 却丢弃顶层A2/A3输出，只读取最终容器的 `cultural_context` 和 `comparison`。这可以作为一个**统一的生成artifact estimand**，但不能再称为“部署界面中最终用户实际看到的完整材料”。对于既有 Monolith，顶层 comparison 是占位符，而内部 comparison 有真实内容；converter 评价的是一个潜在生成字段，不是当时产品真正展示的跨文化tab。

反例：如果论文声称评价端到端系统对用户交付的材料，那么 converter 当前选择错误；如果论文只比较统一生成artifact，则必须重命名estimand并明确与部署UI脱节。

### 2.2 156/156与零warning掩盖了目标文化错配

纯本地复算：

- 126条任务的 `native_culture` 不是英语圈；
- 其中103条 canonical comparison 仍出现 `English-speaking`、`英语国家`、`Western/西方国家`；
- 条件分布：C1_Full 21、C3_NoA3 21、C4_NoA5 21、C5_NoA2A3 21、C1_Full_r2 19；Monolith 0；
- 6-case盲包中10/18存在该错配，分别为 Full 5条、NoA3 5条。

这既是内容有效性失败，也是明显的条件指纹：评审者可能通过“是否错误地谈英语圈”区分 Monolith 与其他条件。现有正则泄盲扫描报告0条，是因为扫描器只识别显式 `C1/Monolith/A3` 标签，不识别目标文化错配、长度、理论词和结构风格。

因此：

- `schema-valid` 不能推出内容有效；
- `mapping_warnings=[]` 不能推出映射正确；
- “18份盲包显式泄盲0条”不能推出condition-blind有效；
- 现有18份fixture不得交给评审者，除非明确只作为错误材料测试且不用于pilot结论。

### 2.3 Converter 会把非用户内容包装成可见内容

130/156条 explanation 含 `native_ratio:`，这是最终容器对象的控制/元数据字段，被 converter 固定序列化进评价文本。真实API的 `cultural_background`只取 `.explanation`，不会展示 `native_ratio`。这进一步证明当前converter不是忠实UI渲染器。

此外，converter 对任意dict采用通用字符串化：只要对象非空，即可得到非空文本并通过 completeness。未知键、错误语言、错误文化、空字符串子字段、错误答案、题型不可交互均可能 schema-valid。它没有“源字段—规范字段”的逐字段审计表或round-trip fidelity检查。

## 3. Schema-valid 与内容有效的混淆

P2-003实施报告把“mapping warning 0”放在成功结果中，但 warning 只检查容器和四类字段是否存在。它没有检查：

- task native culture 与comparison目标文化一致；
- 母语语言是否正确；
- cultural/pragmatic intent是否真正被回答；
- HSK适配；
- 练习答案是否可判、选项数量和前端可交互性；
- explanation中是否混入内部元数据；
- 顶层交付字段与内部生成字段是否一致；
- NoA3是否真的只删除A3而保持相同A4任务。

JSON Schema本身允许 explanation/comparison为空字符串、语言点内容为空、练习关键文本为空；schema-valid只是结构语法，不是completeness，更不是质量。当前环境也没有draft-2020-12 validator，所以甚至“schema-valid”尚未实际验证，只有JSON可解析。

## 4. 10项测试不能支持的结论

新增10项测试均通过，但覆盖面不足：

1. 没有针对六个真实条件分别做fixture测试；
2. 没有端到端读取156条、写出、schema校验和审计报告的测试；
3. 没有前端/API渲染一致性测试；
4. 没有目标文化/目标语言一致性测试；
5. 没有检查 `native_ratio` 等内部字段泄漏；
6. 没有内容长度/理论术语/结构指纹的泄盲诊断；
7. 没有验证restricted key的访问隔离；
8. 标签聚合未验证两个记录来自两个不同reviewer；同一reviewer重复两行也可形成“二人真值”；
9. 没有验证文化熟悉度、1–5评分范围、必填评论、时间戳或重复item；
10. 未实现/测试协议承诺的Wilson CI、Cohen kappa、连续评分聚合、Holm校正和paired分析；
11. token公平检查器不验证usage恒等式、是否估算、planned case全集、失败调用、重试、预算上限、相同模型/prompt/知识输入；一个缺失但未出现在calls中的case不会被发现；
12. manifest fixture是硬编码JSON，不是运行时telemetry；没有schema validator，也没有验证密钥不落盘。

因此“10/10通过”只证明有限单元逻辑按作者设想运行，不能证明协议可复现或smoke可准入。

## 5. RQ定义仍有未闭合处

### RQ1

冻结estimand已诚实限定为固定token策略比较，这是进步。但仍未冻结真实prompt文本、各阶段最大输入/输出配额、知识包序列化、服务端reasoning token处理以及失败最低分如何呈现给人工评审。实际total token是结果变量；只有真实telemetry接线后才能验证预注册预算，而当前fixture无法证明。

研究计划和盲评协议仍写“人工总体偏好”，评分表没有pairwise preference，只能支持blind overall-quality rating difference。措辞冲突尚未修复。

### RQ2 / NoA3

协议冻结了正确语义，但没有审计或修改运行代码来证明A4 prompt在NoA3下保持完全相同任务。现有156条反而显示NoA3 final comparison完整且普遍使用英语圈参照；这可能来自A4默认prompt、母语参数错误或共享上下文，而非“无A3仍完成任务”的有效实现。运行语义仍是Blocker。

### RQ3

主gate、分母、uncertain极值和NA规则已定义，局部算法也有测试。但：

- `passed=false`当前对应 `FLAG_PENDING_REVIEW`，实际生产API只硬拦 `FLAG_REJECT`；P2协议把pending定义为不deliver，与当前部署行为不一致；
- 现有A5实验只评exercises且MiniMax失败降级，主gate实际上是DeepSeek单模型；
- 18份pilot总共不足40份，按自身“qualified/unqualified分母各至少20”规则，RQ3不可能在pilot中达到formal精度；
- 人工事实卡未建立，文化合规标签缺少独立核验来源；
- 没有真实人工CSV fixture连接A5记录的端到端测试。

RQ3本地定义可计算，但与生产动作和可获得分母尚未对齐，仍阻止smoke。

## 6. Formal n=24/43 的现实性

Wilson最坏情形半宽复算：n=24约±18.6个百分点，n=43约±14.3个百分点；数值近似本身没有明显错误。但规划量是“方向一致率”，而论文主estimand又定义为1–5评分平均配对差，两者不是同一个estimand。用方向率规划样本量、再以均值差作主结论，精度论证不闭合。

人工负荷：

| base case | 三条件材料/每位评审者 | 两人总评分数 | 现有批准是否允许 |
|---:|---:|---:|---|
| 6 | 18 | 36 | 是，仅pilot |
| 24 | 72 | 144 | 否 |
| 43 | 129 | 258 | 否 |

两位朋友每人15–20条与任何formal档直接冲突。增加base case而不增加人工负荷会使“人工为主证据”失效；增加评审负荷需要Human PI新决策、时间承诺和文化覆盖审查。

成本方面，用smoke批准上限20 CNY/5 case作最坏单价：

- 每base case三条件最坏4 CNY；
- n=24 formal generation约96 CNY，勉强落在100 CNY formal generation桶内；
- n=43约172 CNY，超过formal generation桶72 CNY；
- 要让n=43落入100 CNY，5-case smoke实际成本必须≤约11.63 CNY。

这些仍不含人工成本，且没有真实token/cost telemetry。n=43“长文推荐档”当前不是预算内承诺，只是条件性目标。

## 7. 关键路径与最晚日期

以下为不并行核心依赖的最乐观排期；任何一天延期都会侵蚀9月15日门：

| 最晚完成 | 必须完成事项 |
|---|---|
| 08-27 | 决定estimand是统一生成artifact还是实际部署UI；修订converter定义 |
| 08-28 | 增加目标文化/语言/元数据泄漏检查、真实schema validator与端到端测试 |
| 08-30 | telemetry接入真实调用边界；manifest/call记录、密钥排除测试完成 |
| 09-01 | 冻结并代码验证Full/Monolith prompt、知识包、配额；验证NoA3操作 |
| 09-02 | P2反审返工完成，P4/P0静态门复核；确认两位评审者及文化覆盖 |
| 09-03 | 最早可申请并运行5-case smoke |
| 09-05 | smoke失败修复及最多一次重跑完成 |
| 09-07 | 生成pilot完成，盲包与文化事实卡冻结 |
| 09-08 | 评审者训练完成 |
| 09-13 | 两位评审者18份pilot全部回收冻结 |
| 09-14 | 一致性、泄盲、RQ3分母与公平日志分析完成 |
| 09-15 | 长/短文门裁决 |

该排期只有约0–1天实质缓冲，且评审者目前仍未确认，因此可信度低。

若9月15日后才开始formal，实验停止日9月25日前只有10天。最乐观也需：2–4天生成、1天盲包/事实卡、至少3–5天人工评审、1–2天清洗分析和P4复核。n=24要求每位72份、n=43要求129份，不可能在当前15–20份承诺下完成。因此长文formal关键路径当前断裂，不是单纯“有风险”。

## 8. 成本反审

- 本节点已花费：0 CNY；
- 已发生不可撤销API支出：0 CNY；
- 已批准阶段上限：250 CNY；
- 若所有桶全部使用，最坏新增支出：250 CNY，低于350 CNY缩减线和500 CNY硬上限；
- 若取消两类Judge并只做人评，理论最坏为190 CNY（Smoke20 + Pilot generation60 + Formal generation100 + Reserve10）；
- n=43按smoke上限外推会要求约172 CNY formal generation，不能在现有100 CNY桶内执行；不得从Judge桶自行挪用。

预算总额不是当前最大风险；人工吞吐、工具真实性和截止时间才是硬约束。零成本替代方案是：不做formal，不启动Judge，把18份严格定位为系统/协议pilot，转短文并把RQ3降为描述性或附录。

## 9. 最可能错误的既有结论与替代解释

最可能错误的是“统一canonical后，现有材料已适合公平盲评”。反例已经出现：目标文化错配集中在特定条件，既降低内容质量又泄露条件。即使人工最终偏好Monolith，也可能只是它正确使用目标文化；即使偏好Full，也可能来自长度和理论术语，而不是角色分解。

可能的替代解释包括：

- 母语/文化参数在多agent链路传播错误；
- Full获得更多阶段、prompt和生成机会，而非角色本身；
- NoA3 final comparison来自A4先验模板，不代表A3没有作用；
- 评审者对目标文化不熟悉，无法识别文化事实错配；
- A5只检测练习，而论文叙事扩大成全材料质量；
- schema与单元测试只验证作者预设，没有独立oracle。

## 10. Smoke 前仍未满足的准入条件

1. 明确并冻结“统一生成artifact”与“真实部署UI”的研究对象，修正用户可见措辞；
2. 修复或隔离目标文化传播错误；现有18份盲包作废，不得送评；
3. converter增加来源字段审计、禁止内部元数据渲染、目标文化/语言诊断与严格completeness；
4. 安装或使用已锁定的本地JSON Schema validator并执行完整验证；不得联网临时安装后不锁版本；
5. telemetry接入真实LLM边界并完成无网络mock端到端测试；
6. token checker验证planned case全集、usage恒等、失败/重试、模型/prompt/知识hash和预算；
7. 代码级证明NoA3只删除A3中间产物、A4最终任务不变；
8. 对齐RQ3协议动作与实际API的pending/reject/deliver行为；
9. 实现并测试真实人工CSV校验、一致性、Wilson CI、连续主estimand和端到端A5连接；
10. 建立6个case的文化事实卡和可核验来源；确认两位评审者熟悉度与日期；
11. 删除“总体偏好”或增加真正pairwise preference；
12. Human PI决定formal人工负荷；未解决前不得声称formal可执行。

## 11. 剩余 Blocker

- **B-UI/Estimand**：converter与部署UI不一致；
- **B-Culture**：103/126非英语任务出现英语/西方参照，且形成条件泄盲；
- **B-Telemetry**：真实调用未接线，公平性无法测量；
- **B-NoA3**：协议已写，运行语义未证明；
- **B-RQ3-Action**：主gate动作与生产API交付行为不一致；
- **B-Schema/Test**：无validator、测试缺端到端与内容有效性oracle；
- **B-FactCard**：文化事实卡和评审者文化覆盖未落实；
- **B-HumanFormal**：现有两人15–20份负荷不支持n=24/43；
- **B-Time**：9月15日前pilot零缓冲，9月25日前formal不可执行。

## 12. 最终建议与下一门

### 对P2-003节点

裁决：`FAIL_REVISE`。P2不得把“156/156、10/10、0 warnings、0 leak regex”继续作为smoke就绪证据。完成第10节1–11项并由P4复审前，不得申请付费smoke。

### 对论文篇幅

建议现在启动4页短文降级准备，主线改为：污染审计、统一评价协议、角色化系统的可行性pilot；RQ3移入描述性附录，避免承诺formal风险率。若 Human PI 希望暂保长文，只能作为有时限的例外：最迟08-29确认扩展人工资源，09-02完成所有静态Blocker，09-15完成双人pilot且批准预算内formal排期。任一日期未满足即自动降短文，不再顺延。

本自审不能批准下一阶段；须由P0整合并交P4独立复审。

