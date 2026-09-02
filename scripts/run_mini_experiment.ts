/**
 * 最小批量实验 — 从 JSON 文件读取预选测试用例，快速跑结果
 * 用法: npx tsx scripts/run_mini_experiment.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  getExperimentRunner,
  exportResultsToJSON,
  type TestCase,
} from "../src/lib/experiment-runner";
import {
  formatAggregateTable,
  aggregateResults,
  type ExperimentCondition,
  type EvaluationResult,
} from "../src/lib/evaluation-metrics";

async function main() {
  // 读测试用例
  const casesPath = path.resolve("experiment_results/test_cases_mini.json");
  if (!fs.existsSync(casesPath)) {
    console.error("请先运行: python3 scripts/make_mini_cases.py");
    process.exit(1);
  }
  const testCases: TestCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"));

  console.log("=".repeat(60));
  console.log(`  最小批量实验: ${testCases.length} 条 × 5 条件 = ${testCases.length * 5} 次LLM调用`);
  console.log("=".repeat(60));
  for (const tc of testCases) {
    console.log(`  ${tc.domain_name} | ${tc.native_language} | HSK${tc.hsk_level}`);
  }

  const conditions: ExperimentCondition[] = [
    "C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3",
  ];

  const runner = getExperimentRunner();
  const outputDir = path.resolve("experiment_results");

  const results = await runner.runBatch(testCases, conditions, (summary) => {
    const line = JSON.stringify(summary) + "\n";
    fs.appendFileSync(path.join(outputDir, "rq1_mini_progress.jsonl"), line, "utf-8");
  });

  // 按条件分组保存
  for (const cond of conditions) {
    const condResults = results.filter(r => r.condition === cond);
    fs.writeFileSync(
      path.join(outputDir, `rq1_mini_${cond}.json`),
      exportResultsToJSON(condResults),
      "utf-8",
    );
  }

  // 按条件分组聚合统计
  const groups = new Map<ExperimentCondition, EvaluationResult[]>();
  for (const r of results) {
    if (!groups.has(r.condition)) groups.set(r.condition, []);
    groups.get(r.condition)!.push(r);
  }
  const aggregates = [];
  for (const [, group] of groups) {
    aggregates.push(aggregateResults(group));
  }
  const order: ExperimentCondition[] = [
    "C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3",
  ];
  aggregates.sort((a: any, b: any) => order.indexOf(a.condition) - order.indexOf(b.condition));
  fs.writeFileSync(
    path.join(outputDir, "rq1_mini_aggregates.json"),
    JSON.stringify(aggregates, null, 2),
    "utf-8",
  );

  console.log(`\n📊 结果:\n${formatAggregateTable(aggregates)}`);
  console.log("\n✅ 完成");
}

main().catch(err => { console.error(err); process.exit(1); });
