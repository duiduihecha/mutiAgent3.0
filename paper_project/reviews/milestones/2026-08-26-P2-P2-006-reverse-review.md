# P2-006 反向自审

## 最强反对意见

“统一边界”可能只是 TypeScript 主路的表面统一：独立 Python/Node 脚本仍可 HTTP 直连，stream usage 仍为空，budget 闸不是原子记账器，而 guardrail 的 endpoint→provider 推断可能改变历史运行细节。因此不能声称“全系统已完全统一”或“成本已被精确控制”。

## 主要发现

1. **AGENTS.md 已过时**：它声称五 Agent 直连 Coze SDK，但当前活跃代码是 `BaseAgent→UnifiedLLMService`。若仍按文档估计 provider/成本，将得到错误结论。
2. **默认 mock 是破坏性可见变更**：未显式配置真调用的部署会改为离线 mock，不再默认 DeepSeek。这是安全所需，但 P4/部署负责人必须确认运维文档，否则可把 mock 输出误当真内容。
3. **guardrail 迁移需专门回归**：离线测试证明统一边界可运行，但没有验证 DeepSeek/MiniMax/eflowcode 三种真实端点的 URL 形式、usage 字段和错误语义。不得用“130 项测试通过”代替 provider smoke。
4. **调用次数仍取决于 guardrail 分支**：基础 A2/A3/A4/A5 是 4 次，但 solver 可对每道题调用，联席仲裁可并行两模型，回译可 fallback。在实际 manifest 之前不能把“每项 4 次”写成成本事实。
5. **budget gate 只是准入，不是 ledger**：它检查 run limit 和 committed，但并发进程可同时通过；真实付费 pilot 仍需单一调度器、事前 planned calls 与事后 actual ledger。
6. **telemetry 有上下文盲区**：无 AsyncLocalStorage experiment context 时 `emitExperimentCall` 不写记录。这能避免普通用户数据误落实验文件，但也意味调试 API/数据构建不是全局可计费。
7. **hash 不等于可复现内容**：message/config hash 能检查一致性，但若 prompt template 源文、代码 commit 和 case 数据未安全冻结，第三方仍无法仅靠 hash 复现。
8. **测试不是论文证据**：130/130 只证明当前本地测试契约未被破坏；不证明 RQ1/RQ2、文化正确性、provider 稳定性或成本优势。

## 回滚与失败征兆

- 若真实 guardrail 出现 URL 404/模型不匹配，先回滚 `guardrail-service.ts` 适配器，不回滚默认禁用/provider fail-closed。
- 若部署出现 `{"mock":true}`，说明真调用未按新规约配置；不应将 provider 默认改回真模型，而应显式设置开关/预算/价格。
- 若 stream 进入 Pilot，必须先增 usage/timeout/retry 契约；否则冻结非流式。

## 时间与成本

- 本轮 API 花费/承诺：**0/0 CNY**。
- P4 静态复核：0.5–1 天，0 API CNY。
- 真 provider 的 1-case 非流式 smoke：必须另行预算批准与价格表；本轮不估造其实际费用。
- 全部 standalone 脚本迁移：预计 1–2 天，对 4 页短文非关键，不进当前关键路径。

## 裁决

**PASS_WITH_CONDITIONS（可交 P4 静态审查）**。

条件：P4 重点检查 provider fail-closed、mock 无网络、guardrail provider 映射、错误净化、stream usage 缺口和 budget 闸并非 ledger。在 P4/P0/Human PI 单独准入前，付费 smoke 仍禁止。
