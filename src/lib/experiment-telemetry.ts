import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname } from "node:path";

export interface ExperimentTelemetryContext {
  run_id: string;
  base_case_id: string;
  condition: string;
  category?: "generation" | "guardrail" | "judge" | "local";
  knowledge_sha256?: string;
  generation_profile?: "daily" | "quality";
  model_routing_sha256?: string;
}

export interface SafeCallRecord {
  call_id: string;
  run_id: string;
  base_case_id: string;
  condition: string;
  category: "generation" | "guardrail" | "judge" | "local";
  label: string;
  provider: string;
  model: string;
  messages_sha256: string;
  output_sha256?: string | null;
  config_sha256: string;
  knowledge_sha256: string | null;
  generation_profile: "daily" | "quality" | null;
  model_routing_sha256: string | null;
  temperature: number | null;
  max_tokens: number | null;
  started_at: string;
  ended_at: string;
  latency_ms: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated: boolean;
  } | null;
  cost_cny: number | null;
  status: "success" | "failed";
  error: { name: string; message: string } | null;
}

type Sink = (record: SafeCallRecord) => void;
const storage = new AsyncLocalStorage<ExperimentTelemetryContext>();
let testSink: Sink | null = null;
let telemetryDirEnsured = false;

/**
 * 无实验上下文（普通 web 请求）时的兜底上下文。
 * 目的：生产链路的每次 LLM 调用也必须落盘（调用次数/Token/延迟/成本/实验标识），
 * 不能因为没跑 runWithExperimentContext 就静默丢弃。
 */
function fallbackContext(): ExperimentTelemetryContext {
  return {
    run_id: process.env.EXPERIMENT_RUN_ID || "web",
    base_case_id: process.env.EXPERIMENT_BASE_CASE_ID || "web",
    condition: process.env.EXPERIMENT_CONDITION || "production",
  };
}

/** 遥测落盘路径：env 可覆盖；默认 logs/llm-telemetry.jsonl（相对进程 cwd，Next 下为项目根）。 */
function telemetryPath(): string | null {
  const explicit = process.env.EXPERIMENT_TELEMETRY_PATH;
  if (explicit) return explicit;
  return process.env.LLM_TELEMETRY_ENABLED === "false" ? null : "logs/llm-telemetry.jsonl";
}

function writeTelemetryRecord(record: SafeCallRecord): void {
  const path = telemetryPath();
  if (!path) return;
  try {
    if (!telemetryDirEnsured) {
      mkdirSync(dirname(path), { recursive: true });
      telemetryDirEnsured = true;
    }
    appendFileSync(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // 遥测尽力而为，绝不能影响业务调用
  }
}

export function runWithExperimentContext<T>(
  context: ExperimentTelemetryContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

export function currentExperimentContext(): ExperimentTelemetryContext | undefined {
  return storage.getStore();
}

/** Test-only injection. Passing null restores the file/no-op production sink. */
export function setExperimentTelemetrySinkForTest(sink: Sink | null): void {
  testSink = sink;
}

export function hashMessages(messages: Array<{ role: string; content: string }>): string {
  return createHash("sha256")
    .update(JSON.stringify(messages.map(({ role, content }) => ({ role, content }))))
    .digest("hex");
}

export function emitExperimentCall(
  partial: Omit<SafeCallRecord, "call_id" | "run_id" | "base_case_id" | "condition" | "category" | "knowledge_sha256" | "generation_profile" | "model_routing_sha256">,
): void {
  const context = storage.getStore() ?? fallbackContext();
  const record: SafeCallRecord = {
    call_id: randomUUID(),
    run_id: context.run_id,
    base_case_id: context.base_case_id,
    condition: context.condition,
    category: context.category ?? "generation",
    knowledge_sha256: context.knowledge_sha256 ?? null,
    generation_profile: context.generation_profile ?? null,
    model_routing_sha256: context.model_routing_sha256 ?? null,
    ...partial,
  };
  if (record.error) {
    const status = record.error.message.match(/\b(?:4|5)\d\d\b/)?.[0];
    record.error = {
      name: record.error.name || "Error",
      message: status ? `LLM call failed with HTTP status ${status}` : "LLM call failed; details omitted",
    };
  }
  if (testSink) {
    testSink(record);
    return;
  }
  writeTelemetryRecord(record);
}
