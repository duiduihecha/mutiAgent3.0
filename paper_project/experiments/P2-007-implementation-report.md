# P2-007 实施报告

## 结论

模型选择已从分散默认收口到一个可注入配置源；生产关键路径不再依赖校内 MiniMax。默认 mock、真实调用关闭、未配置价格时 fail closed。本轮成本 0 CNY。

## 代码改动

1. `llm-config.ts`：加入 e-flowcode 已验证 model whitelist、daily/quality profile、Judge/Guardrail 角色矩阵、run 内 profile 锁、安全路由快照。未知 model 直接拒绝。
2. `llm-runtime-policy.ts`：仅负责执行门禁；真实调用需显式开启、正预算和 provider 价格。价格缺失不调用。
3. `guardrail-service.ts`：回译/便宜二元/Solver/最终仲裁分别收口到 Kimi/Qwen/Qwen/GLM；A5 先做本地结构检查，只将可疑项交给最终复核；无效返回不换模型。取消单例启动时的自动网络 healthcheck。
4. `ai-judge.ts`：主 Judge 默认单模型，Secondary 需显式开启；新增 seed 可复现乱序和 swap-order。
5. telemetry/manifest：增加 generation profile 和 routing hash；价格不明时允许 `cost=null`并标记 `pricing_unconfigured`。
6. 历史兼容：MiniMax client、密钥环境变量和历史脚本未删除；它们不再是新 profile 或 Guardrail 生产路由。

## 本地验证

- P2-007/P2-006 定向测试：10/10 通过。
- 项目 Vitest：6 files，136/136 通过。
- TypeScript 全库检查：未通过；报错集中在已有 CIEval 脚本、learning UI、evaluation-metrics 和 experiment-runner 类型问题。本轮未为美化结果修改这些无关历史问题。
- 静态扫描证实新活跃矩阵不包含 `qwen3.7-plus`；历史脚本/数据说明中的 MiniMax 字样作为 legacy 保留。路由快照测试还确认：若使用 whitelist 内的显式 override，manifest 冻结的是实际 model id，不是旧默认。

## 未执行

未调用 `/v1/models`，未发送 prompt，未运行 generation/Judge/Guardrail smoke，未获取或写入密钥，未修改业务 prompt。

## 回滚点与剩余条件

- 回滚点：中央路由文件、Guardrail 角色绑定、Judge 批处理选项、manifest/call schema 新字段。
- 付费 smoke 前必须：P4 静态复核；e-flowcode 经 PI 确认的计价表；事先生成的 manifest；锁定单一 profile/run id；明确调用上限与停止规则；付费授权。
