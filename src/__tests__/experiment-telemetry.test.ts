import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { UnifiedLLMService, llmService } from "@/lib/unified-llm-service";
import { resetGenerationProfileLocksForTest, getGenerationModel } from "@/lib/llm-config";
import { MotherTongueExplainerAgent, CulturalComparatorAgent, ContentGeneratorAgent,
  QualityControllerAgent, type AgentMessage } from "@/lib/multi-agent-system";
import {
  runWithExperimentContext,
  setExperimentTelemetrySinkForTest,
  type SafeCallRecord,
} from "@/lib/experiment-telemetry";

afterEach(() => {
  setExperimentTelemetrySinkForTest(null);
  vi.unstubAllGlobals();
  resetGenerationProfileLocksForTest();
  // 注意：不要 delete LLM_GENERATION_PROFILE —— vitest 启动时已从 .env 载入，
  // 一旦 delete 不会重载，后续用例 profile 会错落成 daily，与 agent 导入时固定的
  // quality 模型冲突（Model override conflicts with preset）。
  delete process.env.LLM_REAL_CALLS_ENABLED;
  delete process.env.LLM_RUN_BUDGET_CNY;
  delete process.env.LLM_RUN_COMMITTED_CNY;
  delete process.env.LLM_PRICE_OPENAI_INPUT_CNY_PER_M;
  delete process.env.LLM_PRICE_OPENAI_OUTPUT_CNY_PER_M;
  delete process.env.EFLOWCODE_API_KEY;
  delete process.env.EFLOWCODE_API_URL;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_MOCK_MODE;
});

describe("NoA3 A4 contract", () => {
  it("removes only the A3 intermediate and does not announce a different task", () => {
    // 兼容 barrel 拆分后：A4 的 Prompt 已经从 multi-agent-system.ts（整体 monolith）
    // 抽到了 src/lib/multi-agent/prompts/a4.ts 的 buildA4UserPrompt。
    // 若目录存在新 prompts/a4.ts → 用新文件作为断言目标；否则回落老 barrel（拆分前）。
    const a4PromptUrl = new URL("../lib/multi-agent/prompts/a4.ts", import.meta.url);
    const legacySourceUrl = new URL("../lib/multi-agent-system.ts", import.meta.url);
    let promptSource: string;
    try {
      promptSource = readFileSync(a4PromptUrl, "utf8");
    } catch {
      promptSource = readFileSync(legacySourceUrl, "utf8");
    }
    const barrelSource = readFileSync(legacySourceUrl, "utf8");
    // 对外兼容契约：A2 的文化阐释与 A3 的跨文化对比在进 A4 前都过 truncateForA4
    // （瘦身目标：A4 user prompt 长度锁死 <=~2000 字符）
    expect(promptSource).toContain('${ccProvided ? truncateForA4(cross_cultural_comparison) : ""}');
    // 实验条件文案的"已移除模块"黑名单：不应出现在 A4 正文中（即 ccProvided=false 分支的降级文案
    // 必须是 [未提供：…] 而不是"本实验条件已移除 A3"—— 后者会在用户视角泄漏实验分组）。
    expect(promptSource).not.toContain("本实验条件已移除跨文化对比模块(A3)");
    expect(promptSource).not.toContain("请勿编造跨文化对比");
    // 跨文化对比的业务表述必须仍在 Prompt 契约中出现（A4 输出 comparison 段要有同/异/实用提示）。
    // 这条契约即使在 Prompt 抽取后仍写在 buildA4SystemPrompt 里。
    expect(promptSource).toContain("包括相同点、差异与实用提示");
    // 兼容 barrel 至少要再导出 A4 类（供 11 处 consumer 使用）。拆分后的 barrel 是 export * 清单，
    // 不再内联大段模板 → 这里显式写一个期望，避免未来有人误删整个 barrel 的 content-generator 再导出。
    expect(barrelSource).toMatch(/content-generator\.agent|ContentGeneratorAgent/);
  });
});

describe("experiment telemetry at the real chat boundary", () => {
  it("captures offline mock usage without persisting secrets, endpoint, or prompt", async () => {
    const records: SafeCallRecord[] = [];
    process.env.LLM_REAL_CALLS_ENABLED = "true";
    process.env.LLM_RUN_BUDGET_CNY = "1";
    process.env.LLM_RUN_COMMITTED_CNY = "0";
    process.env.LLM_PRICE_OPENAI_INPUT_CNY_PER_M = "1";
    process.env.LLM_PRICE_OPENAI_OUTPUT_CNY_PER_M = "1";
    process.env.EFLOWCODE_API_KEY = "TOP_SECRET";
    process.env.EFLOWCODE_API_URL = "https://must-not-appear.invalid";
    setExperimentTelemetrySinkForTest((r) => records.push(r));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "offline-result" } }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await runWithExperimentContext({
      run_id: "offline", base_case_id: "case-1", condition: "C1_Full",
      knowledge_sha256: "k".repeat(64),
      generation_profile: "daily", model_routing_sha256: "r".repeat(64),
    }, () => llmService.chat([{ role: "user", content: "PRIVATE PROMPT" }], {
      preset: "generation", telemetry_label: "A2",
    }));

    expect(response.content).toBe("offline-result");
    expect(records).toHaveLength(1);
    expect(records[0].usage?.total_tokens).toBe(10);
    expect(records[0].provider).toBe("openai");
    // model 必须等于当前路由解析出的生成模型（不硬编码，避免依赖 .env 的 profile 档位）
    expect(records[0].model).toBe(getGenerationModel());
    expect(records[0].knowledge_sha256).toBe("k".repeat(64));
    expect(records[0].generation_profile).toBe("daily");
    expect(records[0].model_routing_sha256).toBe("r".repeat(64));
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain("TOP_SECRET");
    expect(serialized).not.toContain("must-not-appear");
    expect(serialized).not.toContain("PRIVATE PROMPT");
  });

  it("ignores legacy LLM_PROVIDER and gates the constructor-bound generation route", async () => {
    process.env.LLM_PROVIDER = "deepseek";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(llmService.chat([{ role: "user", content: "x" }])).rejects.toThrow("disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses an explicit mock preset without fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const mockService = new UnifiedLLMService("mock");
    expect((await mockService.chat([{ role: "user", content: "x" }])).content).toContain("mock");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes every intended business preset through offline mock when mock mode is enabled", async () => {
    process.env.LLM_MOCK_MODE = "true";
    process.env.LLM_PROVIDER = "deepseek";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const presets = ["generation", "judge", "judge2", "guardrail_backtranslation",
      "guardrail_binary", "guardrail_solver", "guardrail_final"] as const;
    for (const preset of presets) {
      const service = new UnifiedLLMService(preset);
      const result = await service.chat([{ role: "user", content: preset }]);
      expect(result.content).toContain("mock");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats legacy LLM_PROVIDER=mock as offline execution while real calls are disabled", async () => {
    process.env.LLM_PROVIDER = "mock";
    process.env.LLM_REAL_CALLS_ENABLED = "false";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await new UnifiedLLMService("guardrail_solver").chat([{ role: "user", content: "x" }])).content).toContain("mock");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed before fetch when e-flowcode pricing is unconfigured", async () => {
    process.env.LLM_REAL_CALLS_ENABLED = "true";
    process.env.LLM_RUN_BUDGET_CNY = "1";
    process.env.LLM_RUN_COMMITTED_CNY = "0";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(llmService.chat([{ role: "user", content: "x" }])).rejects.toThrow("Pricing is not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps mock streaming offline and emits stream telemetry", async () => {
    const records: SafeCallRecord[] = [];
    setExperimentTelemetrySinkForTest((r) => records.push(r));
    process.env.LLM_MOCK_RESPONSE = "offline-stream";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    let output = "";
    await runWithExperimentContext({ run_id: "s", base_case_id: "c", condition: "mock" }, async () => {
      const mockService = new UnifiedLLMService("mock");
      for await (const chunk of mockService.chatStream([{ role: "user", content: "private" }])) output += chunk;
    });
    expect(output).toBe("offline-stream");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(records[0].label).toBe("unlabeled-stream");
    expect(records[0].cost_cny).toBe(0);
    delete process.env.LLM_MOCK_RESPONSE;
  });
});

describe("role-aware offline learning-chain fixtures", () => {
  it("runs A2 -> A3 -> A4 -> A5 with renderable deterministic mock content", async () => {
    process.env.LLM_MOCK_MODE = "true";
    process.env.USE_SLOT_GENERATION = "false";
    const fetchSpy = vi.fn(async () => { throw new Error("network forbidden in offline chain test"); });
    vi.stubGlobal("fetch", fetchSpy);
    const base: AgentMessage = {
      id: "mock-chain", event_id: "mock-event", sender_agent: "test", receiver_agent: "A2_MotherTongueExplainer",
      learner_id: "mock-learner", message_type: "content_request", status: "pending", created_at: new Date(),
      payload: { knowledge_point_id: "mock-kp", target_language: "en", native_language_code: "en", hsk_level: 1,
        anxiety_level: "medium", chinese_culture_point: "mock-kp", target_culture: "英语" },
    };
    const a2 = await new MotherTongueExplainerAgent().process(base);
    expect((a2.payload.cultural_explanation as Record<string, unknown>)._mock_fixture).toBe(true);
    const a3 = await new CulturalComparatorAgent().process({ ...base, receiver_agent: "A3_CulturalComparator" });
    expect((a3.payload.cross_cultural_comparison as Record<string, unknown>)._mock_fixture).toBe(true);
    const a4 = await new ContentGeneratorAgent().process({
      ...base, receiver_agent: "A4_ContentGenerator", payload: {
        ...base.payload, cultural_explanation: a2.payload.cultural_explanation,
        cross_cultural_comparison: a3.payload.cross_cultural_comparison, scene_type: "daily",
        learner_profile: { id: "mock-learner", native_language: "英语", hsk_level: 1, cultural_anxiety_score: 50 },
      },
    });
    const generated = a4.payload.generated_content as Record<string, unknown>;
    const exercises = generated.exercises as Array<Record<string, unknown>>;
    expect(generated._mock_fixture).toBe(true);
    expect(exercises).toHaveLength(5);
    expect(exercises[0].options).toHaveLength(4);
    expect(exercises[0].correct_answer).toBe("A");
    const a5 = await new QualityControllerAgent().process(a4);
    expect(a5.payload.generated_content).toEqual(generated);
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.USE_SLOT_GENERATION;
  }, 15000);
});
