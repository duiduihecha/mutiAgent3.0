/**
 * Phase 2: CIEval Auto-Eval 批量评测
 * 对 Test 集 250 条样本，用系统生成 + CIEval Judge 评测
 *
 * 用法:
 *   npx tsx scripts/cieval_autoeval.ts               ＃ 全量 250 条
 *   npx tsx scripts/cieval_autoeval.ts --first 20    ＃ 只跑前 20 条
 *   npx tsx scripts/cieval_autoeval.ts --resume      ＃ 断点续跑
 */
import * as fs from "fs";
import * as path from "path";
import { CIEvalJudge, type CIEvalSample, type ModelOutput, type CIEvalResult } from "../src/lib/cieval-judge";
import { processLearningRequestWithLangGraph } from "../src/lib/learning-graph";

const TEST_FILE = path.resolve("experiment_results/cieval/test.json");
const RESULT_FILE = path.resolve("experiment_results/cieval_autoeval_test.jsonl");
const PROGRESS_FILE = path.resolve("experiment_results/cieval_autoeval_progress.txt");

async function main() {
  const args = process.argv.slice(2);
  const firstN = args.includes("--first") ? parseInt(args[args.indexOf("--first") + 1] || "0") : 0;
  const resume = args.includes("--resume");

  // 加载 Test 集
  const samples: CIEvalSample[] = JSON.parse(fs.readFileSync(TEST_FILE, "utf-8"));
  const targetSamples = firstN > 0 ? samples.slice(0, firstN) : samples;

  // 断点续跑
  const done = new Set(resume && fs.existsSync(PROGRESS_FILE)
    ? fs.readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean) : []);

  const pending = targetSamples.filter(s => !done.has(s.cieval_id));
  console.log(`Test 集: ${targetSamples.length} 条 | 已完成: ${done.size} | 待评测: ${pending.length}\n`);

  if (pending.length === 0) {
    console.log("全部完成，输出汇总...");
    printSummary();
    return;
  }

  const judge = new CIEvalJudge();

  for (let i = 0; i < pending.length; i++) {
    const s = pending[i];
    const idx = i + 1 + done.size;

    try {
      // Step A: 用系统生成内容
      const lp = s.input.learner_profile;
      const result = await processLearningRequestWithLangGraph(
        {
          id: `cieval_autoeval_${s.cieval_id}`,
          uid: "cieval_autoeval",
          native_language: lp.home_culture,
          hsk_level: lp.hsk_level,
          learning_motivation: lp.motivation as any,
          cultural_anxiety_score: lp.anxiety_score,
          ability_vector: [50, 50, 50, 50, 50],
        },
        s.input.knowledge_point.id,
        [s.input.knowledge_point.domain, s.input.knowledge_point.scene],
      );

      const output: ModelOutput = {
        cultural_explanation: result.cultural_explanation,
        cross_cultural_comparison: result.cross_cultural_comparison,
        generated_content: result.learning_content as any,
      };

      // Step B: CIEval 评测
      const evalResult = await judge.evaluate(s, output);

      // 保存
      const entry = { ...evalResult, _cieval_id: s.cieval_id, _domain: s.input.knowledge_point.domain, _culture: lp.home_culture, _hsk: lp.hsk_level };
      fs.appendFileSync(RESULT_FILE, JSON.stringify(entry) + "\n", "utf-8");
      fs.writeFileSync(PROGRESS_FILE, s.cieval_id + "\n", { flag: "a" });

      console.log(`[${idx}/${targetSamples.length}] ${s.cieval_id} ${s.input.knowledge_point.domain} ${lp.home_culture} HSK${lp.hsk_level} | A=${evalResult.dimension_A.score} B=${evalResult.dimension_B.score} C=${evalResult.dimension_C.score} D=${evalResult.dimension_D.score} → ${evalResult.cieval_score.toFixed(1)}/20`);
    } catch (e) {
      console.error(`  ❌ ${s.cieval_id} 失败: ${(e as Error).message.slice(0, 100)}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log("\n✅ 评测完成\n");
  printSummary();
}

function printSummary() {
  if (!fs.existsSync(RESULT_FILE)) { console.log("无结果"); return; }

  const results: Array<CIEvalResult & { _domain: string; _culture: string; _hsk: number }> =
    fs.readFileSync(RESULT_FILE, "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l));

  const n = results.length;
  if (n === 0) return;

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / n;
  console.log(`\n📊 CIEval Test 集结果 (n=${n}):\n`);
  console.log(`  A 理论契合度:  ${avg(results.map(r => r.dimension_A.score)).toFixed(2)}`);
  console.log(`  B 文化安全性:  ${avg(results.map(r => r.dimension_B.score)).toFixed(2)}`);
  console.log(`  C 空间中介:    ${avg(results.map(r => r.dimension_C.score)).toFixed(2)}`);
  console.log(`  D 教学实用性:  ${avg(results.map(r => r.dimension_D.score)).toFixed(2)}`);
  console.log(`  CIEval 总分:   ${avg(results.map(r => r.cieval_score)).toFixed(2)}/20`);

  // 按文化圈分组
  const byCulture = new Map<string, CIEvalResult[]>();
  for (const r of results) {
    const c = (r as any)._culture || "?";
    if (!byCulture.has(c)) byCulture.set(c, []);
    byCulture.get(c)!.push(r);
  }
  console.log("\n  按文化圈:");
  for (const [c, group] of byCulture) {
    console.log(`    ${c}: ${avg(group.map(r => r.cieval_score)).toFixed(1)} (n=${group.length})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
