import { createHash } from "node:crypto";
import { getModelRoutingSnapshot } from "./llm-config";

export const KNOWN_LLM_PROVIDERS = ["mock", "deepseek", "minimax", "openai", "glm"] as const;
export type KnownLLMProvider = typeof KNOWN_LLM_PROVIDERS[number];

export class LLMConfigurationError extends Error { name = "LLMConfigurationError"; }
export class LLMCallsDisabledError extends Error { name = "LLMCallsDisabledError"; }
export class LLMBudgetExceededError extends Error { name = "LLMBudgetExceededError"; }
export class LLMProviderError extends Error { name = "LLMProviderError"; }

export function resolveLLMProvider(value?: string): KnownLLMProvider {
  const provider = (value || process.env.LLM_PROVIDER || "mock").trim().toLowerCase();
  if (!(KNOWN_LLM_PROVIDERS as readonly string[]).includes(provider)) {
    throw new LLMConfigurationError(`Unknown LLM provider: ${provider}`);
  }
  return provider as KnownLLMProvider;
}

export function assertLLMCallAllowed(provider: KnownLLMProvider): void {
  if (provider === "mock") return;
  if (process.env.LLM_REAL_CALLS_ENABLED !== "true") {
    throw new LLMCallsDisabledError(
      "Real LLM calls are disabled. Set LLM_REAL_CALLS_ENABLED=true only after budget approval.",
    );
  }
  const pricePrefix = provider.toUpperCase();
  if (!process.env[`LLM_PRICE_${pricePrefix}_INPUT_CNY_PER_M`] || !process.env[`LLM_PRICE_${pricePrefix}_OUTPUT_CNY_PER_M`]) {
    throw new LLMBudgetExceededError(`Pricing is not configured for provider=${provider}`);
  }
  const limit = Number(process.env.LLM_RUN_BUDGET_CNY || "0");
  const committed = Number(process.env.LLM_RUN_COMMITTED_CNY || "0");
  if (!Number.isFinite(limit) || limit <= 0) throw new LLMBudgetExceededError("Positive LLM_RUN_BUDGET_CNY is required");
  if (!Number.isFinite(committed) || committed < 0 || committed >= limit) {
    throw new LLMBudgetExceededError(`Run budget unavailable: committed=${committed}, limit=${limit}`);
  }
}

export function estimateCostCny(provider: KnownLLMProvider, promptTokens: number, completionTokens: number): number | null {
  if (provider === "mock") return 0;
  const prefix = provider.toUpperCase();
  const inputPerM = Number(process.env[`LLM_PRICE_${prefix}_INPUT_CNY_PER_M`] || "");
  const outputPerM = Number(process.env[`LLM_PRICE_${prefix}_OUTPUT_CNY_PER_M`] || "");
  if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM)) return null;
  return Math.round(((promptTokens * inputPerM + completionTokens * outputPerM) / 1_000_000) * 1e6) / 1e6;
}

export function safeLLMConfigSnapshot(provider: KnownLLMProvider, model: string, options: {
  temperature?: number; max_tokens?: number; response_format?: unknown;
}): Record<string, unknown> {
  const config = {
    provider, model,
    temperature: options.temperature ?? null,
    max_tokens: options.max_tokens ?? null,
    structured_output: options.response_format ?? null,
    real_calls_enabled: process.env.LLM_REAL_CALLS_ENABLED === "true",
    run_budget_cny: Number(process.env.LLM_RUN_BUDGET_CNY || "0"),
  };
  return { ...config, config_sha256: createHash("sha256").update(JSON.stringify(config)).digest("hex") };
}

export function getLLMRuntimeSnapshot(): Record<string, unknown> {
  const provider = resolveLLMProvider();
  const routing = getModelRoutingSnapshot();
  const snapshot = {
    provider,
    model_routing: routing,
    real_calls_enabled: process.env.LLM_REAL_CALLS_ENABLED === "true",
    run_budget_cny: Number(process.env.LLM_RUN_BUDGET_CNY || "0"),
    run_committed_cny: Number(process.env.LLM_RUN_COMMITTED_CNY || "0"),
    pricing_configured: provider === "mock" || (
      Boolean(process.env[`LLM_PRICE_${provider.toUpperCase()}_INPUT_CNY_PER_M`]) &&
      Boolean(process.env[`LLM_PRICE_${provider.toUpperCase()}_OUTPUT_CNY_PER_M`])
    ),
  };
  return { ...snapshot, snapshot_sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}
