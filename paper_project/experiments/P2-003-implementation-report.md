# P2-003 零成本协议修复与本地工具实施报告

- 日期：2026-08-26
- 预算上限/实际：0 / 0 CNY
- 外部 LLM、Judge、API：0 次
- 原始实验数据修改：无

## 1. B1–B4 修复状态

| Blocker | 修复 | 状态 |
|---|---|---|
| B1：6-case pilot 被过度解释、formal无计划 | 明确18份只是6-case pilot；冻结不看pilot结果的 Wilson 精度规划，n=24最低、n=43长文推荐 | 协议解除；人工资源仍是实施Blocker |
| B2：RQ3 gate/动作/真值/分母不唯一 | 主gate固定为A5 final `passed`；动作表、NoGate反事实、exercise标签范围、误杀/漏放分母、NA规则及逐uncertain精确极值全部冻结 | 已解除并有fixture测试 |
| B3：RQ1 estimand与公平性未冻结 | 冻结固定总token下多阶段角色策略 vs 一次性策略；明确知识可见性、prompt、配额、停止、一次技术重试和ITT | 协议解除；付费smoke尚未验证 |
| B4：NoA3可能测缺字段 | 最终任务/schema与Full相同，仅删除A3专业中间产物；A4仍必须生成完整比较，空字段按失败处理 | 协议解除；运行实现尚待smoke验证 |

冻结全文见 `P2-003-frozen-estimands-and-operations.md`。

## 2. 已实现本地组件

实现文件：`paper_project/experiments/tools/p2_protocol_tools.py`。

1. canonical converter：只读最终 `generated_content`/`learning_content`，统一解释、comparison、语言点和练习；缺失仍保留；
2. manifest/telemetry fixture：记录模型、prompt hash、温度、token、调用数、延迟、成本、失败与版本字段；
3. token 公平检查器：只累计 generation，逐case 10%和条件均值5%双门；Judge/guardrail不混入；
4. 盲评包生成器：条件隐藏、两位评审者相同item集合/不同顺序、同case不相邻、泄盲文本扫描；
5. 人工标签聚合：两人一致规则、uncertain；
6. RQ3 敏感性统计：逐uncertain赋值的精确极值，U>24时使用按gate动作分组的解析等价枚举；零分母为 `None/NA`。

协议增加 `cultural_familiarity_1_3`、`suspected_pattern` 和 `suspected_group`，分别用于文化能力和泄盲诊断；另将RQ3专用标签冻结为 `exercise_qualified_yes_no`。

## 3. 现有156条本地转换

输入：`experiment_results/rq1_mini_outputs.jsonl`（只读）。

输出：`paper_project/experiments/derived/p2-003-existing-rq1/`。

- 输入/输出：156 / 156；
- 唯一匿名 item：156；
- 六条件：各26；
- Monolith comparison 非空并正确来自最终容器：26/26；
- mapping warning：0；
- 原始输入 SHA-256：`b0b59d4edc1073b09f858b53fd1cba2461321a0d67b9cceb68ab30a7b8123b91`；
- canonical SHA-256：`473b2392e8106204f9c954b4032610f708d723dfa3d410a99d2a5c48d227e5d7`；
- restricted key SHA-256：`164714ba46c78785d08ec5ddb6bd35b50b5f254c946e0a15e5950d9ecae5978c`。

注意：这次转换修复评价输入，不恢复或重新认可已污染的旧 CIEval A/总分。

## 4. Pilot 盲包 fixture

从既有结果构造了6 case ×3条件=18份 fixture，HSK1/3/5各2个，覆盖5个文化圈和6个domain。它只验证工具，不是新实验结果。

- item数：18；
- 显式泄盲扫描命中：0；
- 两位评审者item集合完全相同；顺序不同；同base case不相邻；
- blind items SHA-256：`8c3812f828a6e3c5acfeb116742614ea203c048e15059eb8e9c566e427979368`。

固定标题、长度、理论术语等隐性泄盲不能由正则完全排除，因此评分表要求评审后记录 suspected pattern/group；正式方法只能称 condition-blind，而非完全双盲。

## 5. 测试结果

新增测试：`paper_project/experiments/tools/test_p2_protocol_tools.py`。

- 10/10 通过；
- 覆盖最终字段优先、Monolith comparison、失败保留、题型别名、泄盲扫描、token公平/缺配对、盲包顺序、双评聚合、uncertain极值、零分母及零成本telemetry fixture；
- JSON schema 文件均通过标准 JSON 解析；当前环境未安装 JSON Schema validator，因此完整 draft-2020-12 schema validation仍列为smoke前静态任务；
- 未运行项目付费 smoke。

## 6. 剩余 Blocker

1. **人工formal资源**：n=43推荐formal意味着每位评审者需评价129份三条件材料，超出当前每人15–20份批准范围；即使最低n=24也需72份。需要 Human PI 批准扩大负荷/增加评审资源，或降短文并把18份仅作pilot。
2. **真实telemetry接线**：fixture已实现，但尚未把记录器接入生产LLM调用边界；在接线与密钥泄漏测试前不得smoke。
3. **真实Full/Monolith配额**：prompt、每阶段token配额和单体配额必须由P0冻结并通过5-case smoke验证；本地工具不能证明服务端实际usage公平。
4. **NoA3运行语义**：协议已冻结，但现有运行代码是否完全保持A4最终任务需要在不调用模型的代码审查/测试中进一步确认，随后由smoke验证。
5. **评审者与文化覆盖**：两位人选、可用日期、case文化熟悉范围及评后证据卡流程尚待 Human PI 确认。
6. **RQ3分母**：只有人工pilot后才知道qualified/unqualified是否均有足够分母；任一类不足20则formal RQ3只能描述性/附录。
7. **Schema validator**：当前环境缺少本地 validator；不得为此联网安装。可复用已锁定依赖或由P0批准后补充本地验证。

## 7. Smoke 状态

付费 smoke 仍未获准且本轮未运行。只有剩余静态接线、schema validation、prompt/配额冻结、评审资源确认及P0复核完成后，才能申请≤20 CNY的5-case smoke。

