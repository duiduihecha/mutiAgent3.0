/**
 * AI 裁判运行脚本 — 对已有实验结果进行补充性 LLM 盲评
 *
 * 用法:
 *   # 对 RQ1 所有样本评分
 *   npx tsx scripts/run-ai-judge.ts --input experiment_results/rq1 --sample-size 30
 *
 *   # 对全部5个条件的所有有效样本评分
 *   npx tsx scripts/run-ai-judge.ts --input experiment_results/rq1 --sample-size 0
 *
 *   # 只评分不保存
 *   npx tsx scripts/run-ai-judge.ts --input experiment_results/rq1 --sample-size 10 --dry-run
 *
 * 参数:
 *   --input       实验数据目录或单文件
 *   --sample-size 每条件抽样数（0=全量，默认20）
 *   --dry-run     仅生成样本不实际评分
 */

import * as fs from "fs";
import * as path from "path";
import {
  sampleForHumanEval,
  summarizeHumanRatings,
  formatHumanEvalTable,
  correlateHumanAndAuto,
  type EvaluationResult,
  type HumanEvalSample,
  type HumanRating,
} from "../src/lib/evaluation-metrics";
import { AIJudge, getAIJudge } from "../src/lib/ai-judge";

// ============================================================================
// CLI 参数
// ============================================================================

interface CliArgs {
  input: string;
  sampleSize: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      parsed[key] = val;
      if (val !== "true") i++;
    }
  }
  return {
    input: parsed["input"] || "experiment_results",
    sampleSize: parseInt(parsed["sample-size"] || "20"),
    dryRun: parsed["dry-run"] === "true",
  };
}

// ============================================================================
// 数据加载
// ============================================================================

function loadResults(inputPath: string): EvaluationResult[] {
  const results: EvaluationResult[] = [];

  if (fs.statSync(inputPath).isFile()) {
    results.push(...JSON.parse(fs.readFileSync(inputPath, "utf-8")));
  } else {
    // 加载目录下所有 rq1_C*.json 文件
    const files = fs.readdirSync(inputPath).filter(f =>
      f.startsWith("rq1_C") && f.endsWith(".json") && !f.includes("aggregat")
    );
    for (const f of files) {
      results.push(...JSON.parse(fs.readFileSync(path.join(inputPath, f), "utf-8")));
    }
  }

  // 重新计算 JSON 格式校验（修复 language_points 字段名问题）
  for (const r of results) {
    const gc = r.raw_output?.generated_content;
    if (gc) {
      // 快速格式校验：至少有 exercises 和 cultural_context
      const hasExercises = Array.isArray((gc as any).exercises) && (gc as any).exercises.length > 0;
      const hasCulturalContext = (gc as any).cultural_context?.explanation;
      r.metrics.json_format_valid = hasExercises && !!hasCulturalContext;
    }
  }

  console.log(`加载: ${results.length} 条结果 (来自 ${inputPath})`);
  return results;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const cli = parseArgs();

  console.log("=".repeat(60));
  console.log("  AI 裁判 — 主裁判盲评");
  console.log("=".repeat(60));
  console.log(`  输入: ${cli.input}`);
  console.log(`  每条件抽样: ${cli.sampleSize === 0 ? "全量" : cli.sampleSize}`);
  console.log(`  Dry run: ${cli.dryRun ? "是" : "否"}`);
  console.log(`  主裁判: qwen3.8-max；glm-5.2 仅由校准/分歧流程显式启用`);
  console.log("=".repeat(60));

  // 1. 加载数据
  const results = loadResults(cli.input);

  // 统计各条件样本数
  const condCounts = new Map<string, number>();
  for (const r of results) condCounts.set(r.condition, (condCounts.get(r.condition) || 0) + 1);
  console.log("\n各条件样本数:");
  for (const [cond, count] of condCounts) {
    const jsonValid = results.filter(r => r.condition === cond && r.metrics.json_format_valid).length;
    console.log(`  ${cond}: ${count} 条 (JSON有效: ${jsonValid})`);
  }

  // 2. 抽样
  const samplesPerStratum = cli.sampleSize === 0 ? 999 : cli.sampleSize; // 0=全量
  const samples = sampleForHumanEval(results, samplesPerStratum);

  console.log(`\n抽样结果: ${samples.length} 个盲评样本`);
  // 统计每个条件抽到多少
  const sampleCondCounts = new Map<string, number>();
  for (const s of samples) sampleCondCounts.set(s.condition, (sampleCondCounts.get(s.condition) || 0) + 1);
  for (const [cond, count] of sampleCondCounts) {
    console.log(`  ${cond}: ${count} 个`);
  }

  if (cli.dryRun) {
    // 保存盲评样本（供人工评估备用）
    const outputDir = path.resolve("experiment_results");
    fs.writeFileSync(
      path.join(outputDir, "blind_samples.json"),
      JSON.stringify(samples, null, 2),
    );
    console.log(`\n✅ Dry run 完成。盲评样本已保存到 experiment_results/blind_samples.json`);
    return;
  }

  // 3. 确认
  const totalCalls = samples.length;
  console.log(`\n⚠️  将进行 ${totalCalls} 次主 Judge 调用`);
  console.log(`   预计耗时约 ${Math.ceil(samples.length * 4 / 60)} 分钟`);

  // 4. AI 裁判评分
  const judge = getAIJudge();
  const ratings = await judge.rateBatch(samples, (completed, total) => {
    if (completed % 5 === 0 || completed === total) {
      console.log(`[进度] ${completed}/${total} 样本完成`);
    }
  });

  // 5. 汇总
  console.log("\n📊 汇总评分...");
  const summary = summarizeHumanRatings(ratings, samples);

  // 6. 输出结果
  const outputDir = path.resolve("experiment_results");

  // 保存原始评分
  fs.writeFileSync(
    path.join(outputDir, "ai_judge_ratings.json"),
    JSON.stringify(ratings, null, 2),
  );
  // 保存汇总
  fs.writeFileSync(
    path.join(outputDir, "ai_judge_summary.json"),
    JSON.stringify(summary, null, 2),
  );

  // 打印汇总表
  console.log("\n" + "=".repeat(60));
  console.log("  人工评估汇总（AI裁判版）");
  console.log("=".repeat(60) + "\n");
  console.log(formatHumanEvalTable(summary));

  // 7. 人工vs自动指标相关性
  console.log("\n📊 人工(AI裁判) vs 自动指标 相关性:");
  const correlations = correlateHumanAndAuto(summary, results);
  for (const c of correlations) {
    console.log(`  ${c.human_dim} ↔ ${c.auto_metric}: r=${c.spearman_r} (${c.interpretation})`);
  }

  // 保存相关性
  fs.writeFileSync(
    path.join(outputDir, "ai_judge_correlations.json"),
    JSON.stringify(correlations, null, 2),
  );

  console.log("\n✅ AI裁判评分完成");
  console.log(`   评分记录: ${path.join(outputDir, "ai_judge_ratings.json")}`);
  console.log(`   汇总统计: ${path.join(outputDir, "ai_judge_summary.json")}`);
  console.log(`   相关性分析: ${path.join(outputDir, "ai_judge_correlations.json")}`);
}

main().catch(err => {
  console.error("AI裁判运行失败:", err);
  process.exit(1);
});
