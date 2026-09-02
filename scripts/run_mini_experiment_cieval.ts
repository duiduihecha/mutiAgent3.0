/**
 * 最小批量消融实验 — CIEval Judge 版
 * 10条 × 5条件 = 50次LLM生成 + 50次CIEval评测
 * 用法: npx tsx scripts/run_mini_experiment_cieval.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  getExperimentRunner,
  exportResultsToJSON,
  type TestCase,
} from "../src/lib/experiment-runner";
import {
  CIEvalJudge,
  type CIEvalSample,
  type ModelOutput,
  type CIEvalResult,
  type DimBScore,
  type DimCScore,
  type DimDScore,
} from "../src/lib/cieval-judge";
import { getLanguageCode } from "../src/lib/constants";

// ── 加载 CIEval样本 & 建立 kp_id×culture×hsk → sample 索引 ──
function loadCIEvalSamples(): Map<string, CIEvalSample> {
  const map = new Map<string, CIEvalSample>();
  const dir = path.resolve("experiment_results/cieval");
  for (const split of ["train", "dev", "test", "challenge"]) {
    const f = path.join(dir, `${split}.json`);
    if (!fs.existsSync(f)) continue;
    const data: CIEvalSample[] = JSON.parse(fs.readFileSync(f, "utf-8"));
    for (const s of data) {
      const lp = s.input.learner_profile;
      const key = `${s.input.knowledge_point.id}|${lp.home_culture_code}|${lp.hsk_level}`;
      map.set(key, s);
    }
  }
  return map;
}

function formatTable(rows: Array<{ cond: string; a: number; b: number; c: number; d: number; total: number; n: number }>) {
  let out = "\n| 条件 | A理论▲ | B安全▲ | C空间▲ | D教学▲ | CIEval总分 | 样本数 |\n|------|--------|--------|--------|--------|----------|--------|\n";
  for (const r of rows) {
    out += `| ${r.cond} | ${r.a.toFixed(1)} | ${r.b.toFixed(1)} | ${r.c.toFixed(1)} | ${r.d.toFixed(1)} | ${r.total.toFixed(1)} | ${r.n} |\n`;
  }
  return out;
}

async function main() {
  // 1. 加载
  const casesPath = path.resolve("experiment_results/test_cases_mini.json");
  if (!fs.existsSync(casesPath)) {
    console.error("请先运行: python3 scripts/make_mini_cases.py");
    process.exit(1);
  }
  const testCases: TestCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"));
  const cievals = loadCIEvalSamples();
  console.log(`测试用例: ${testCases.length} 条 | CIEval样本索引: ${cievals.size} 条\n`);

  // 2. 生成（复用消融实验5条件）
  const conditions = ["C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3"] as const;
  const runner = getExperimentRunner();

  console.log("生成模型输出 (10条 × 5条件 = 50次)...\n");
  const outputs: Array<{ tc: TestCase; cond: string; output: ModelOutput }> = [];

  for (const tc of testCases) {
    for (const cond of conditions) {
      const result = await runner.runSingle(tc, cond);
      outputs.push({
        tc,
        cond,
        output: {
          cultural_explanation: result.raw_output.cultural_explanation,
          cross_cultural_comparison: result.raw_output.cross_cultural_comparison,
          generated_content: result.raw_output.generated_content as any,
        },
      });
      console.log(`  [${outputs.length}/50] ${cond} | ${tc.domain_name} | ${tc.native_language} HSK${tc.hsk_level}`);
    }
  }

  // 3. CIEval 评测
  console.log("\n🔍 CIEval Judge 评测 (50次)...\n");
  const judge = new CIEvalJudge(); // 裁判走 llm-config 的 judge 预设 (eflowcode / qwen3.8-max)

  const byCond = new Map<string, CIEvalResult[]>();
  for (const { tc, cond, output } of outputs) {
    if (!output.generated_content) {
      console.log(`  [${cond}] ${tc.knowledge_point_id} 跳过（生成失败）`);
      continue;
    }

    const langCode = getLanguageCode(tc.native_language);
    const key = `${tc.knowledge_point_id}|${langCode}|${tc.hsk_level}`;
    const sample = cievals.get(key);

    if (!sample) {
      console.log(`  [${cond}] ${tc.knowledge_point_id} 跳过（无CIEval样本）`);
      continue;
    }

    // 覆盖学习者画像（保持一致）
    sample.input.learner_profile.anxiety_score = 50; // 消融实验固定焦虑50

    const result = await judge.evaluate(sample, output);
    if (!byCond.has(cond)) byCond.set(cond, []);
    byCond.get(cond)!.push(result);

    console.log(`  [${cond}] ${result.cieval_id} A=${result.dimension_A.score} B=${result.dimension_B.score} C=${result.dimension_C.score} D=${result.dimension_D.score} → ${result.cieval_score.toFixed(1)}/20`);

    // 限流
    await new Promise(r => setTimeout(r, 2000));
  }

  // 4. 汇总
  console.log("\n📊 消融实验 — CIEval 对比:\n");

  const order = ["C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3"];
  const rows: Array<{ cond: string; a: number; b: number; c: number; d: number; total: number; n: number }> = [];

  for (const cond of order) {
    const results = byCond.get(cond) || [];
    if (results.length === 0) continue;
    const n = results.length;
    const avgA = results.reduce((s, r) => s + r.dimension_A.score, 0) / n;
    const avgB = results.reduce((s, r) => s + r.dimension_B.score, 0) / n;
    const avgC = results.reduce((s, r) => s + r.dimension_C.score, 0) / n;
    const avgD = results.reduce((s, r) => s + r.dimension_D.score, 0) / n;
    const avgTotal = results.reduce((s, r) => s + r.cieval_score, 0) / n;
    rows.push({ cond, a: avgA, b: avgB, c: avgC, d: avgD, total: avgTotal, n });
  }

  console.log(formatTable(rows));

  // 保存
  const outDir = path.resolve("experiment_results");
  fs.writeFileSync(
    path.join(outDir, "rq1_mini_cieval.json"),
    JSON.stringify(Object.fromEntries(byCond), null, 2),
    "utf-8",
  );
  console.log("✅ 保存到 experiment_results/rq1_mini_cieval.json");
}

main().catch(e => { console.error(e); process.exit(1); });
