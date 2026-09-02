/**
 * 中央 LLM 路由（fail-closed）。
 *
 * 唯一事实源：所有 LLM 调用必须经 getLLMConfig(preset) 解析出 provider/model/key/endpoint，
 * 再由 UnifiedLLMService 统一分发、统一遥测。不允许任何调用方绕过本文件硬写端点。
 *
 * 路由语义（2026-08-27 规范化）：
 *   - 非 mock 一律走 OpenAI 兼容网关（默认 e-flowcode.cc），用「不同模型族」承担不同角色，
 *     对应论文「DeepSeek / Qwen / GLM / Kimi 多模型族」表述（同一网关聚合）。
 *   - 每个角色可通过环境变量 LLM_<ROLE>_MODEL 覆盖默认模型（见 MODEL_BY_ROLE）。
 *   - 密钥只从环境变量读，绝不落日志/遥测。
 */
import { createHash } from "node:crypto";

/**
 * e-flowcode 现网模型目录（allowlist）—— 2026-08-27 实测 GET /v1/models 返回的 26 个全集。
 * 权威来源是网关接口，不是命名推断：带日期/预览后缀的变体（-0731/-0813/-preview 等）
 * 实测仍在线，故保留。网关上新模型后：优先用 env LLM_EXTRA_MODELS 追加，或在此同步。
 */
export const EFLOW_VERIFIED_MODELS = [
  "deepseek-v4-flash", "deepseek-v4-flash-0731", "deepseek-v4-pro", "deepseek-v4-pro-0813",
  "doubao-seed-2.0-lite", "doubao-seed-2.1-turbo", "doubao-seed-evolving",
  "glm-5", "glm-5.1", "glm-5.2", "glm-5.2-fast-preview", "glm-5.3",
  "kimi-k2.5", "kimi-k2.6", "kimi-k2.7-code", "kimi-k3",
  "muse-spark-1.2-contributor", "qwen-vl-ocr",
  "qwen3.5-omni-flash", "qwen3.5-omni-plus", "qwen3.5-plus",
  "qwen3.6-flash", "qwen3.6-max-preview", "qwen3.6-plus", "qwen3.7-max", "qwen3.8-max",
] as const;
export type EflowVerifiedModel = typeof EFLOW_VERIFIED_MODELS[number];
export type GenerationProfile = "daily" | "quality";
export type LLMPreset = "mock" | "generation" | "judge" | "judge2" |
  "guardrail_backtranslation" | "guardrail_binary" | "guardrail_solver" | "guardrail_final" |
  "guardrail_ds" | "guardrail_mm" |
  "generation_a2" | "generation_a3" | "generation_a4" | "generation_a5";

export interface LLMConfig {
  provider: "mock" | "openai";
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  profile?: GenerationProfile;
  role: string;
  legacy_alias?: string;
}

/** 每个角色 → 默认模型。env 覆盖键 = `LLM_${ROLE.toUpperCase()}_MODEL`，
 *  例如 LLM_GENERATION_DAILY_MODEL / LLM_JUDGE_MODEL / LLM_GUARDRAIL_SOLVER_MODEL。
 *  per-agent 生成角色（generation_a2~a5）默认继承当前 daily/quality 档，
 *  可用简写 env LLM_A2_MODEL / LLM_A3_MODEL / LLM_A4_MODEL / LLM_A5_MODEL 单独覆盖。 */
const MODEL_BY_ROLE = {
  generation_daily: "deepseek-v4-flash",
  generation_quality: "deepseek-v4-pro",
  // A2 专用预设：方案三「去 θ₃ 槽位 + 三钉 Prompt + Few-shot」升级后，A2 从「2~14 次 flash 串行/并行」
  // 收敛为「1~1.01 次中档推理」，需要强长程约束能力（母语占比预算 / HSK 硬上限 / 图谱数据接地），
  // 因此不再跟随 daily/quality 档，而是固定中档 qwen3.6-plus。
  // 回滚：同时设置 LLM_A2_MODEL=deepseek-v4-flash 与 USE_SLOT_GENERATION=true 即回到 θ₃ flash 档。
  generation_a2: "qwen3.6-plus",
  generation_a3: "deepseek-v4-flash",
  generation_a4: "deepseek-v4-flash",
  generation_a5: "deepseek-v4-flash",
  judge: "qwen3.8-max",
  judge2: "glm-5.2",
  guardrail_backtranslation: "kimi-k2.6",
  guardrail_binary: "qwen3.6-flash",
  guardrail_solver: "qwen3.7-max",
  guardrail_final: "glm-5.2",
} as const;

/** OpenAI 兼容网关端点与密钥（e-flowcode 国内可直连，无需代理）。 */
const endpoint = () => process.env.EFLOWCODE_API_URL || process.env.OPENAI_API_URL || "https://e-flowcode.cc";
const apiKey = () => process.env.EFLOWCODE_API_KEY || process.env.OPENAI_API_KEY || "";

/** 进程内锁：同一 run 内生成 profile 不允许中途切换（防消融条件串扰）。 */
const profileLocks = new Map<string, GenerationProfile>();

/** 离线 mock：显式开启 LLM_MOCK_MODE，或 LLM_PROVIDER=mock 且未显式放行真实调用。 */
export function isOfflineMockExecution(): boolean {
  return process.env.LLM_MOCK_MODE === "true" ||
    (process.env.LLM_PROVIDER === "mock" && process.env.LLM_REAL_CALLS_ENABLED !== "true");
}

/** 网关新上线的模型可用 env LLM_EXTRA_MODELS 追加（逗号分隔），无需改代码。 */
function extraVerifiedModels(): readonly string[] {
  return (process.env.LLM_EXTRA_MODELS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export function assertVerifiedEflowModel(model: string): asserts model is EflowVerifiedModel {
  const verified = [...EFLOW_VERIFIED_MODELS, ...extraVerifiedModels()];
  if (!verified.includes(model)) throw new Error(`Model is not in the verified e-flowcode catalog: ${model}`);
}

export function resolveGenerationProfile(): GenerationProfile {
  const profile = (process.env.LLM_GENERATION_PROFILE || "daily") as GenerationProfile;
  if (profile !== "daily" && profile !== "quality") throw new Error(`Unknown generation profile: ${profile}`);
  const runId = process.env.EXPERIMENT_RUN_ID || "non-experiment-process";
  const locked = profileLocks.get(runId);
  if (locked && locked !== profile) throw new Error(`Generation profile changed within run ${runId}: ${locked} -> ${profile}`);
  profileLocks.set(runId, profile);
  return profile;
}

export function resetGenerationProfileLocksForTest(): void { profileLocks.clear(); }

function roleForPreset(preset: LLMPreset): { role: keyof typeof MODEL_BY_ROLE; legacy?: string; envAlias?: string } {
  if (preset === "mock") throw new Error("mock preset has no e-flowcode role");
  if (preset === "generation") return { role: `generation_${resolveGenerationProfile()}` as keyof typeof MODEL_BY_ROLE };
  if (preset === "guardrail_ds") return { role: "guardrail_solver", legacy: "guardrail_ds" };
  if (preset === "guardrail_mm") return { role: "guardrail_backtranslation", legacy: "guardrail_mm" };
  // per-agent 生成角色：默认继承 daily 档，可用 LLM_A2_MODEL 等简写 env 覆盖（envAlias）
  if (preset === "generation_a2") return { role: "generation_a2", envAlias: "a2" };
  if (preset === "generation_a3") return { role: "generation_a3", envAlias: "a3" };
  if (preset === "generation_a4") return { role: "generation_a4", envAlias: "a4" };
  if (preset === "generation_a5") return { role: "generation_a5", envAlias: "a5" };
  return { role: preset as keyof typeof MODEL_BY_ROLE };
}

export function getLLMConfig(preset: LLMPreset, overrides?: Partial<Pick<LLMConfig, "model" | "temperature">>): LLMConfig {
  if (preset === "mock") return {
    provider: "mock", model: "offline-mock", apiKey: "", baseUrl: "", temperature: overrides?.temperature ?? 0,
    role: "mock",
  };
  const selected = roleForPreset(preset);
  const isGenerationRole = preset === "generation" || preset.startsWith("generation_a");
  const profile = isGenerationRole ? resolveGenerationProfile() : undefined;
  const profileRole = profile ? (`generation_${profile}` as "generation_daily" | "generation_quality") : null;
  const profileEnvKey = profileRole ? `LLM_${profileRole.toUpperCase()}_MODEL` : "";
  const defaultModel = profileRole
    ? process.env[profileEnvKey] || MODEL_BY_ROLE[profileRole]
    : MODEL_BY_ROLE[selected.role];
  // Offline mock 必须可离线运行：即使开发机 .env 残留过期模型覆盖也不在 mock 模式校验。
  // 真实执行时仍严格验证并 fail-closed。
  // env 覆盖键：per-agent 角色优先用简写（LLM_A2_MODEL），其它用 LLM_<ROLE>_MODEL
  const roleEnvKey = `LLM_${selected.role.toUpperCase()}_MODEL`;
  const aliasEnvKey = selected.envAlias ? `LLM_${selected.envAlias.toUpperCase()}_MODEL` : "";
  const envModel = isOfflineMockExecution()
    ? undefined
    : process.env[aliasEnvKey] || process.env[roleEnvKey];
  const model = overrides?.model || envModel || defaultModel;
  assertVerifiedEflowModel(model);
  return { provider: "openai", model, apiKey: apiKey(), baseUrl: endpoint(),
    temperature: overrides?.temperature ?? (preset === "generation" ? 0.3 : 0),
    profile, role: selected.role, legacy_alias: selected.legacy };
}

export function getGenerationModel(agent?: "a2" | "a3" | "a4" | "a5"): string {
  if (agent) return getLLMConfig(`generation_${agent}` as LLMPreset).model;
  return getLLMConfig("generation").model;
}
export function getGenerationProvider(): string { return getLLMConfig("generation").provider; }

export function getModelRoutingSnapshot(): Record<string, unknown> {
  const profile = resolveGenerationProfile();
  const mockExecution = isOfflineMockExecution();
  const routes = { generation_profile: profile, generation_model: getLLMConfig("generation").model,
    generation_a2: getLLMConfig("generation_a2").model,
    generation_a3: getLLMConfig("generation_a3").model,
    generation_a4: getLLMConfig("generation_a4").model,
    generation_a5: getLLMConfig("generation_a5").model,
    judge_primary: getLLMConfig("judge").model, judge_secondary: getLLMConfig("judge2").model,
    guardrail_backtranslation: getLLMConfig("guardrail_backtranslation").model,
    guardrail_binary: getLLMConfig("guardrail_binary").model, guardrail_solver: getLLMConfig("guardrail_solver").model,
    guardrail_final: getLLMConfig("guardrail_final").model, intended_provider: "openai-compatible",
    execution_provider: mockExecution ? "mock" : "openai",
    execution_model: mockExecution ? "offline-mock" : null,
    pricing_status: "unconfigured_fail_closed" };
  return { ...routes, routing_sha256: createHash("sha256").update(JSON.stringify(routes)).digest("hex") };
}
