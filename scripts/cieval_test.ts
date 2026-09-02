/**
 * CIEval Judge 测试 — 取5条dev样本，生成+评测
 * 用法: npx tsx scripts/cieval_test.ts
 */
import * as fs from "fs";
import * as path from "path";
import { CIEvalJudge, type CIEvalSample, type ModelOutput } from "../src/lib/cieval-judge";
import { processLearningRequestWithLangGraph } from "../src/lib/learning-graph";
import { getLanguageCode } from "../src/lib/constants";

async function main() {
  // 1. 加载 5 条 dev 样本
  const devPath = path.resolve("experiment_results/cieval/dev.json");
  const samples: CIEvalSample[] = JSON.parse(fs.readFileSync(devPath, "utf-8")).slice(0, 5);
  console.log(`加载 ${samples.length} 条样本\n`);

  // 2. 用系统生成模型输出
  console.log("生成模型输出...\n");
  const outputs: ModelOutput[] = [];

  for (const s of samples) {
    const kp = s.input.knowledge_point;
    const lp = s.input.learner_profile;
    const langCode = getLanguageCode(lp.home_culture);

    console.log(`  [${s.cieval_id}] ${kp.domain}/${kp.scene} → ${lp.home_culture} HSK${lp.hsk_level}`);

    try {
      const result = await processLearningRequestWithLangGraph(
        {
          id: `cieval_test_${s.cieval_id}`,
          uid: "cieval_test",
          native_language: lp.home_culture,
          hsk_level: lp.hsk_level,
          learning_motivation: lp.motivation as any,
          cultural_anxiety_score: lp.anxiety_score,
          ability_vector: [50, 50, 50, 50, 50],
        },
        kp.id,
        [kp.domain, kp.scene],
      );

      outputs.push({
        cultural_explanation: result.cultural_explanation,
        cross_cultural_comparison: result.cross_cultural_comparison,
        generated_content: result.learning_content as any,
      });
      console.log(`    ✅ 生成成功 (${JSON.stringify(result.cultural_explanation).length} chars)`);
    } catch (e) {
      console.error(`    ❌ 生成失败: ${(e as Error).message}`);
      outputs.push({ cultural_explanation: null, cross_cultural_comparison: null, generated_content: null });
    }
  }

  // 3. CIEval Judge 评测
  console.log("\n🔍 CIEval Judge 评测...\n");

  // 用 llm-config 的 judge 预设 (eflowcode / qwen3.8-max，与生成 DeepSeek 不同族)
  const judge = new CIEvalJudge();

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const o = outputs[i];
    if (!o.generated_content) {
      console.log(`[${s.cieval_id}] 跳过（生成失败）\n`);
      continue;
    }

    const result = await judge.evaluate(s, o);

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[${s.cieval_id}] ${s.input.knowledge_point.domain}/${s.input.knowledge_point.scene}`);
    console.log(`学习者: ${s.input.learner_profile.home_culture} HSK${s.input.learner_profile.hsk_level} 焦虑=${s.input.learner_profile.anxiety_score}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  A 理论契合度: ${result.dimension_A.score}/5`);
    console.log(`     ${result.dimension_A.rationale.slice(0, 150)}...`);
    console.log(`  B 文化安全性: ${result.dimension_B.score}/5  (BTR=${result.dimension_B.btr.toFixed(3)}, 触发${result.dimension_B.suspicious_sentences.length}句)`);
    console.log(`  C 空间中介:   ${result.dimension_C.score}/5  (C1比率=${result.dimension_C.sub_C1_ratio.toFixed(2)}, C2=${result.dimension_C.sub_C2_score}, C3=${result.dimension_C.sub_C3_score})`);
    console.log(`  D 教学实用性: ${result.dimension_D.score}/5  (D2=${result.dimension_D.sub_D2_score}, D3=${result.dimension_D.sub_D3_score})`);
    console.log(`  ─────────────────────────────`);
    console.log(`  CIEval总分: ${result.cieval_score}/20`);
    console.log();

    // 限流
    if (i < samples.length - 1) await new Promise(r => setTimeout(r, 3000));
  }

  console.log("✅ 测试完成");
}

main().catch(e => { console.error(e); process.exit(1); });
