/**
 * Phase 3: CIEval Leaderboard — 4个模型变体 × 30 条样本
 * 用法: npx tsx scripts/cieval_leaderboard_run.ts
 */
import * as fs from "fs";
import * as path from "path";
import { CIEvalJudge, type CIEvalSample, type ModelOutput } from "../src/lib/cieval-judge";
import { processLearningRequestWithLangGraph } from "../src/lib/learning-graph";
import { getExperimentRunner } from "../src/lib/experiment-runner";

const CASES_FILE = path.resolve("experiment_results/cieval_leaderboard_cases.json");
const OUT_DIR = path.resolve("experiment_results/cieval_leaderboard");
const PROGRESS_FILE = path.join(OUT_DIR, "progress.txt");

// 6个模型变体（4个自己的 + 2个外部LLM单体）
const MODELS = [
  { id: "M1_Full_KG_Slot",  desc: "本文 Full+KG+θ₃",  mode: "C1_Full", slot: true,  kg: true,  provider: "" },
  { id: "M2_Full_KG_NoSlot",desc: "本文 Full+KG",      mode: "C1_Full", slot: false, kg: true,  provider: "" },
  { id: "M3_Full_NoKG",     desc: "本文 Full NoKG",    mode: "C1_Full", slot: true,  kg: false, provider: "" },
  { id: "M4_DeepSeek",      desc: "DeepSeek 单体",     mode: "ext_mono", provider: "deepseek" },
  { id: "M5_GLM5",          desc: "GLM-5 单体",        mode: "ext_mono", provider: "glm" },
  { id: "M6_MiniMax",       desc: "MiniMax 单体",      mode: "ext_mono", provider: "minimax" },
];

/** 外部LLM单体: 用一个简单prompt直接调API，不经过多Agent系统 */
async function generateExternalMonolith(
  sample: CIEvalSample, provider: string,
): Promise<ModelOutput | null> {
  const { UnifiedLLMService } = await import("../src/lib/unified-llm-service");
  // Legacy external-provider comparison. Central routing rejects the obsolete
  // provider override, so this cannot bypass the current generation preset.
  const llm = new UnifiedLLMService("generation");
  const lp = sample.input.learner_profile;
  const kp = sample.input.knowledge_point;
  const langName = lp.home_culture;

  const sysPrompt = `你是国际中文教育专家。为${langName}母语HSK${lp.hsk_level}学习者生成学习材料。
输出JSON:
{
  "cultural_context": {"explanation": "用${langName}书写的文化背景"},
  "language_points": [{"zh": "中文", "native": "${langName}翻译"}],
  "comparison": {"cn": "中方表现", "target": "${langName}表现", "differences": [{"cn":"","target":"","description":""}]},
  "exercises": [{"type": "multiple_choice|true_false", "question": "", "options": ["A","B","C","D"], "correct_answer": "A", "explanation": "", "dimension": "cultural_pragmatic"}]
}`;

  const userMsg = `知识点: ${kp.pragmatic_intent || kp.scene} | 场景: ${kp.domain}/${kp.scene}`;

  const r = await llm.chat(
    [{ role: "system", content: sysPrompt }, { role: "user", content: userMsg }],
    { provider: provider as any, temperature: 0.3, max_tokens: 4096 },
  );

  const match = (r.content || "").match(/\{[\s\S]*\}/);
  return {
    cultural_explanation: { precise_definition: `(${provider} 单体生成)` },
    cross_cultural_comparison: { framework_used: `(${provider} 单体)` },
    generated_content: match ? JSON.parse(match[0]) : null,
  };
}

async function generateContent(sample: CIEvalSample, model: typeof MODELS[0]): Promise<ModelOutput | null> {
  const lp = sample.input.learner_profile;
  const kp = sample.input.knowledge_point;

  if (model.mode === "ext_mono") {
    return generateExternalMonolith(sample, model.provider);
  }

  if (model.mode === "C2") {
    const runner = getExperimentRunner();
    const tc = {
      id: `${kp.id}_${lp.home_culture_code}_hsk${lp.hsk_level}`,
      knowledge_point_id: kp.id, domain_id: kp.id.split("_")[0], scene_id: kp.scene,
      domain_name: kp.domain, scene_name: kp.scene,
      pragmatic_intent: kp.pragmatic_intent,
      native_language: lp.home_culture, hsk_level: lp.hsk_level,
    };
    const result = await runner.runSingle(tc, "C2_NoAgent_Monolith");
    return {
      cultural_explanation: result.raw_output.cultural_explanation,
      cross_cultural_comparison: result.raw_output.cross_cultural_comparison,
      generated_content: result.raw_output.generated_content as any,
    };
  }

  // C1_Full: 用 LangGraph
  process.env.USE_SLOT_GENERATION = model.slot ? "true" : "false";
  if (!model.kg) process.env.EXP_NO_KG_QUERY = "true";

  const result = await processLearningRequestWithLangGraph(
    {
      id: `lb_${model.id}_${sample.cieval_id}`,
      uid: "leaderboard",
      native_language: lp.home_culture,
      hsk_level: lp.hsk_level,
      learning_motivation: lp.motivation as any,
      cultural_anxiety_score: lp.anxiety_score,
      ability_vector: [50, 50, 50, 50, 50],
    },
    kp.id,
    [kp.domain, kp.scene],
  );

  if (!model.kg) delete process.env.EXP_NO_KG_QUERY;

  return {
    cultural_explanation: result.cultural_explanation,
    cross_cultural_comparison: result.cross_cultural_comparison,
    generated_content: result.learning_content as any,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const samples: CIEvalSample[] = JSON.parse(fs.readFileSync(CASES_FILE, "utf-8"));

  // 续跑
  const done = new Set(fs.existsSync(PROGRESS_FILE) ? fs.readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean) : []);
  const total = samples.length * MODELS.length;

  console.log(`样本: ${samples.length} × ${MODELS.length} 模型 = ${total} 次\n`);

  // 使用 MiniMax Judge
  const judge = new CIEvalJudge();

  for (const s of samples) {
    for (const m of MODELS) {
      const taskKey = `${s.cieval_id}|${m.id}`;
      if (done.has(taskKey)) continue;

      try {
        console.log(`[${m.id}] ${s.cieval_id} ${s.input.knowledge_point.domain} ${s.input.learner_profile.home_culture}...`);
        const output = await generateContent(s, m);
        if (!output || !output.generated_content) { console.log(`  跳过（生成失败）`); continue; }

        const evalResult = await judge.evaluate(s, output);
        const entry = { ...evalResult, model: m.id };
        fs.appendFileSync(path.join(OUT_DIR, `${m.id}.jsonl`), JSON.stringify(entry) + "\n", "utf-8");
        fs.writeFileSync(PROGRESS_FILE, taskKey + "\n", { flag: "a" });

        console.log(`  A=${evalResult.dimension_A.score} B=${evalResult.dimension_B.score} C=${evalResult.dimension_C.score} D=${evalResult.dimension_D.score} → ${evalResult.cieval_score.toFixed(1)}`);

      } catch (e) {
        console.error(`  ❌ ${taskKey}: ${(e as Error).message.slice(0, 100)}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 汇总
  console.log("\n📊 Leaderboard:\n");
  console.log("| Rank | Model | A理论 | B安全 | C空间 | D教学 | CIEval总分 | n |");
  console.log("|------|-------|-------|-------|-------|-------|----------|---|");

  const rows: Array<{ id: string; desc: string; a: number; b: number; c: number; d: number; t: number; n: number }> = [];
  for (const m of MODELS) {
    const f = path.join(OUT_DIR, `${m.id}.jsonl`);
    if (!fs.existsSync(f)) continue;
    const results = fs.readFileSync(f, "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l));
    const n = results.length;
    if (n === 0) continue;
    const a = results.reduce((s: number, r: any) => s + r.dimension_A.score, 0) / n;
    const b = results.reduce((s: number, r: any) => s + r.dimension_B.score, 0) / n;
    const c = results.reduce((s: number, r: any) => s + r.dimension_C.score, 0) / n;
    const d = results.reduce((s: number, r: any) => s + r.dimension_D.score, 0) / n;
    const t = results.reduce((s: number, r: any) => s + r.cieval_score, 0) / n;
    rows.push({ id: m.id, desc: m.desc, a, b, c, d, t, n });
  }

  rows.sort((a, b) => b.t - a.t);
  rows.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.desc} | ${r.a.toFixed(1)} | ${r.b.toFixed(1)} | ${r.c.toFixed(1)} | ${r.d.toFixed(1)} | ${r.t.toFixed(1)} | ${r.n} |`);
  });

  console.log("\n✅ Leaderboard 完成");
}

main().catch(e => { console.error(e); process.exit(1); });
