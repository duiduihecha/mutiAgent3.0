export function requireApprovedLLMExecution(label) {
  if (process.env.LLM_REAL_CALLS_ENABLED !== 'true') {
    throw new Error(`[${label}] Real LLM calls are disabled; explicit budget approval is required`);
  }
  const limit = Number(process.env.LLM_RUN_BUDGET_CNY || '0');
  const committed = Number(process.env.LLM_RUN_COMMITTED_CNY || '0');
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(committed) || committed < 0 || committed >= limit) {
    throw new Error(`[${label}] Invalid or exhausted run budget`);
  }
  if (process.env.LLM_LEGACY_PRICE_VERIFIED !== 'true') {
    throw new Error(`[${label}] Legacy route pricing is unverified; execution fails closed`);
  }
}
