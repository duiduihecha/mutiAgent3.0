import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  EFLOW_VERIFIED_MODELS, getLLMConfig, getModelRoutingSnapshot,
  resetGenerationProfileLocksForTest,
} from "@/lib/llm-config";
import { GuardrailService } from "@/services/guardrail-service";

afterEach(() => {
  for (const key of ["LLM_GENERATION_PROFILE", "EXPERIMENT_RUN_ID", "LLM_JUDGE_MODEL",
    "LLM_GUARDRAIL_SOLVER_MODEL", "LLM_GENERATION_DAILY_MODEL", "LLM_GENERATION_QUALITY_MODEL",
    "LLM_A2_MODEL", "LLM_A3_MODEL", "LLM_A4_MODEL", "LLM_A5_MODEL"]) delete process.env[key];
  delete process.env.LLM_MOCK_MODE;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_REAL_CALLS_ENABLED;
  resetGenerationProfileLocksForTest();
  vi.unstubAllGlobals();
});

describe("verified e-flowcode routing", () => {
  it("resolves the frozen model matrix", () => {
    expect(getLLMConfig("generation").model).toBe("deepseek-v4-flash");
    resetGenerationProfileLocksForTest();
    process.env.LLM_GENERATION_PROFILE = "quality";
    expect(getLLMConfig("generation").model).toBe("deepseek-v4-pro");
    expect(getLLMConfig("judge").model).toBe("qwen3.8-max");
    expect(getLLMConfig("judge2").model).toBe("glm-5.2");
    expect(getLLMConfig("guardrail_backtranslation").model).toBe("kimi-k2.6");
    expect(getLLMConfig("guardrail_binary").model).toBe("qwen3.6-flash");
    expect(getLLMConfig("guardrail_solver").model).toBe("qwen3.7-max");
    expect(getLLMConfig("guardrail_final").model).toBe("glm-5.2");
    expect(EFLOW_VERIFIED_MODELS).not.toContain("qwen3.7-plus" as never);
  });

  it("forbids profile mixing within one experiment run", () => {
    process.env.EXPERIMENT_RUN_ID = "run-1";
    process.env.LLM_GENERATION_PROFILE = "daily";
    getLLMConfig("generation");
    process.env.LLM_GENERATION_PROFILE = "quality";
    expect(() => getLLMConfig("generation")).toThrow("changed within run");
  });

  it("applies daily/quality profiles to every generation agent unless explicitly overridden", () => {
    process.env.LLM_GENERATION_DAILY_MODEL = "qwen3.6-flash";
    process.env.LLM_GENERATION_PROFILE = "daily";
    for (const preset of ["generation_a2", "generation_a3", "generation_a4", "generation_a5"] as const) {
      expect(getLLMConfig(preset).model).toBe("qwen3.6-flash");
    }

    resetGenerationProfileLocksForTest();
    process.env.LLM_GENERATION_PROFILE = "quality";
    for (const preset of ["generation_a2", "generation_a3", "generation_a4", "generation_a5"] as const) {
      expect(getLLMConfig(preset).model).toBe("deepseek-v4-pro");
    }

    process.env.LLM_A4_MODEL = "qwen3.8-max";
    expect(getLLMConfig("generation_a4").model).toBe("qwen3.8-max");
    expect(getLLMConfig("generation_a3").model).toBe("deepseek-v4-pro");
  });

  it("fails closed for unverified model overrides", () => {
    process.env.LLM_JUDGE_MODEL = "qwen3.7-plus";
    expect(() => getLLMConfig("judge")).toThrow("not in the verified");
  });

  it("snapshot contains profile and exact IDs but no endpoint or key", () => {
    const text = JSON.stringify(getModelRoutingSnapshot());
    expect(text).toContain("deepseek-v4-flash");
    expect(text).toContain("qwen3.8-max");
    expect(text).not.toContain("API_KEY");
    expect(text).not.toContain("http");
  });

  it("snapshot freezes an approved override instead of reporting the old default", () => {
    process.env.LLM_JUDGE_MODEL = "glm-5.3";
    expect(getModelRoutingSnapshot().judge_primary).toBe("glm-5.3");
  });

  it("keeps intended role models visible while recording mock execution", () => {
    process.env.LLM_MOCK_MODE = "true";
    const snapshot = getModelRoutingSnapshot();
    expect(snapshot.generation_model).toBe("deepseek-v4-flash");
    expect(snapshot.judge_primary).toBe("qwen3.8-max");
    expect(snapshot.execution_provider).toBe("mock");
    expect(snapshot.execution_model).toBe("offline-mock");
  });

  it("has no parameterless UnifiedLLMService constructor in active src callers", () => {
    const files = ["knowledge-base-service.ts", "multi-language-explanation-service.ts", "ai-judge.ts",
      "cieval-judge.ts", "multi-agent-system.ts"];
    for (const file of files) {
      const source = readFileSync(new URL(`../lib/${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/new UnifiedLLMService\(\)/);
    }
  });
});

describe("guardrail local-first cascade", () => {
  it("does not call an LLM for a structurally clean exercise", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await new GuardrailService().verifyA5JointArbitration({
      type: "multiple_choice", question: "q", options: ["A", "B", "C", "D"],
      correct_answer: "A", explanation: "e", dimension: "language",
    }, 3);
    expect(result.action).toBe("PASS");
    expect(result.detail.llm_called).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
