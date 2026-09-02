# P2-008 反向自审

## 最强反对意见

1. **“没有旁路”只能限定为 `src` 活跃 TypeScript 业务路径**。仓库仍有 Node/Python HTTP 直连历史脚本；它们现在有多重本地硬闸，但没有迁移到 TypeScript 中央 telemetry。
2. **legacy clients 仍在统一服务文件内**。路由解析使它们不可达，但未来若新增 preset 或放宽 provider override，可能重新引入旁路。因此静态测试不得删除。
3. **`.env` 的 mock 开关是第二道门，不是路由源**。业务服务仍绑定 generation/Judge/Guardrail 角色；在当前 `.env` 下它们会拒绝联网，而非自动生成 mock 结果。只有显式 `mock` preset 返回离线响应。
4. **全库 typecheck 仍不通过**。本轮没有新增类型错误，但不能因 Vitest 139/139 通过就称仓库可完整构建。
5. **仍没有真实 e-flowcode 语义证据**。本轮不能验证 usage、JSON mode、stream、限流或价格。所有结论仅是配置和本地门禁结论。

## 成本、时间和回滚

- 已花/承诺/本轮最坏成本：0/0/0 CNY。
- 时间影响：不扩张短文主线；P4 静态复核预计 0.5 天。
- 回滚点：`UnifiedLLMService.resolveRoute`、各 caller 构造 preset、`.env` 非秘密开关、Guardrail 角色变量名、legacy script price gate。
- 如需恢复历史 provider，不得恢复 `LLM_PROVIDER` 隐式分流；必须新增已审批 preset、白名单 model、价格和测试。

## 裁决

**PASS_WITH_CONDITIONS，可交 P4 静态复核；不可运行付费 smoke。**

条件：保留旁路静态测试；付费前核定 e-flowcode 价格和 manifest；若需 stream，先在同一 preset 抽象中实现 OpenAI-compatible stream；历史直连脚本不得进入 Pilot 关键路径。
