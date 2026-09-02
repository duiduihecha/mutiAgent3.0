/**
 * 重新分析已有实验数据 — 按条件分组 + 修正后的评估逻辑
 */
import * as fs from "fs";
import * as path from "path";
import {
  aggregateResults,
  formatAggregateTable,
  evaluateJsonFormat,
  type EvaluationResult,
  type ExperimentCondition,
} from "../src/lib/evaluation-metrics";

const resultsDir = path.resolve("./experiment_results");
const files = [
  "rq1_C1_Full.json",
  "rq1_C2_NoAgent_Monolith.json",
  "rq1_C3_NoA3.json",
  "rq1_C4_NoA5.json",
  "rq1_C5_NoA2A3.json",
];

const allResults: EvaluationResult[] = [];

for (const file of files) {
  const filePath = path.join(resultsDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`跳过: ${file} (不存在)`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as EvaluationResult[];
  
  // 重新计算 JSON 格式校验（因为修复了 language_points 字段名）
  for (const r of data) {
    const gc = r.raw_output?.generated_content || null;
    const jsonResult = evaluateJsonFormat(gc);
    r.metrics.json_format_valid = jsonResult.valid;
    r.metrics.json_parse_error = jsonResult.error;
  }
  
  allResults.push(...data);
  console.log(`加载: ${file} (${data.length} 条)`);
}

// 按条件分组
const groups = new Map<ExperimentCondition, EvaluationResult[]>();
for (const r of allResults) {
  if (!groups.has(r.condition)) groups.set(r.condition, []);
  groups.get(r.condition)!.push(r);
}

// 聚合统计
const aggregates = [];
for (const [cond, results] of groups) {
  aggregates.push(aggregateResults(results));
}

const order: ExperimentCondition[] = [
  "C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3",
];
aggregates.sort((a, b) => order.indexOf(a.condition!) - order.indexOf(b.condition!));

console.log("\n📊 RQ1 消融实验 — 按条件分组汇总:\n");
console.log(formatAggregateTable(aggregates));

// 保存
fs.writeFileSync(
  path.join(resultsDir, "rq1_aggregates_per_condition.json"),
  JSON.stringify(aggregates, null, 2),
  "utf-8",
);
console.log("\n已保存到: experiment_results/rq1_aggregates_per_condition.json");
