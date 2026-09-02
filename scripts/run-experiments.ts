/**
 * 论文实验批量运行脚本
 *
 * 用法：
 *   npx tsx scripts/run-experiments.ts --experiment rq1 --samples 2
 *   npx tsx scripts/run-experiments.ts --experiment rq2 --samples 2
 *   npx tsx scripts/run-experiments.ts --experiment all --samples 2
 *   npx tsx scripts/run-experiments.ts --experiment rq1 --samples 2 --dry-run
 *   npx tsx scripts/run-experiments.ts --list-test-cases
 *
 * 参数说明：
 *   --experiment   rq1 | rq2 | rq3 | rq4 | all
 *   --samples      每个 Domain 取几个 Scene (默认2，最多4)
 *   --languages    测试母语，逗号分隔 (默认: en,ja,ko,ar)
 *   --hsk-levels   测试HSK等级，逗号分隔 (默认: 1,4,7)
 *   --dry-run      仅生成测试用例，不实际调用 LLM
 *   --output       输出目录 (默认: ./experiment_results/)
 *   --list-test-cases  列出所有可用的测试用例
 */

import * as fs from "fs";
import * as path from "path";
import {
  getExperimentRunner,
  generateTestCases,
  exportResultsToJSON,
  groupAndAggregate,
} from "../src/lib/experiment-runner";
import {
  formatAggregateTable,
  aggregateResults,
  type ExperimentCondition,
} from "../src/lib/evaluation-metrics";

// ============================================================================
// CLI 参数解析
// ============================================================================

interface CliArgs {
  experiment: "rq1" | "rq2" | "rq3" | "rq4" | "all";
  samples: number;
  languages: string[];
  hskLevels: number[];
  dryRun: boolean;
  output: string;
  listTestCases: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      parsed[key] = value;
      if (value !== "true") i++;
    }
  }

  const langMap: Record<string, string> = {
    en: "英语", ja: "日语", ko: "韩语", es: "西班牙语",
    ar: "阿拉伯语", ru: "俄语", fr: "法语", th: "泰语",
  };

  const langCodes = (parsed["languages"] || "en,ja,ko,ar").split(",");
  const languages = langCodes.map(c => ({ name: langMap[c.trim()] || c.trim(), code: c.trim() }));

  return {
    experiment: (parsed["experiment"] || "all") as CliArgs["experiment"],
    samples: parseInt(parsed["samples"] || "2"),
    languages,
    hskLevels: (parsed["hsk-levels"] || "1,4,7").split(",").map(Number),
    dryRun: parsed["dry-run"] === "true",
    output: parsed["output"] || "./experiment_results",
    listTestCases: parsed["list-test-cases"] === "true",
  };
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const cli = parseArgs();

  console.log("=".repeat(60));
  console.log("  论文实验框架 — 批量运行脚本");
  console.log("=".repeat(60));
  console.log(`  实验: ${cli.experiment}`);
  console.log(`  每领域场景数: ${cli.samples}`);
  console.log(`  测试母语: ${cli.languages.map(l => l.name).join(", ")}`);
  console.log(`  HSK 等级: ${cli.hskLevels.join(", ")}`);
  console.log(`  Dry Run: ${cli.dryRun ? "是 (仅生成用例)" : "否"}`);
  console.log(`  输出目录: ${cli.output}`);
  console.log("=".repeat(60));

  // 生成测试用例
  const testCases = await generateTestCases({
    scenes_per_domain: cli.samples,
    languages: cli.languages,
    hsk_levels: cli.hskLevels,
  });

  console.log(`\n📋 测试用例: ${testCases.length} 个`);
  for (const tc of testCases.slice(0, 10)) {
    console.log(`   [${tc.id}] ${tc.domain_name}/${tc.scene_name} - ${tc.native_language} HSK${tc.hsk_level}`);
  }
  if (testCases.length > 10) {
    console.log(`   ... 还有 ${testCases.length - 10} 个`);
  }

  if (cli.listTestCases) {
    console.log("\n📋 全部测试用例:");
    for (const tc of testCases) {
      console.log(`   ${tc.id} | ${tc.knowledge_point_id} | ${tc.domain_name} | ${tc.scene_name} | ${tc.native_language} | HSK${tc.hsk_level}`);
    }
    return;
  }

  if (cli.dryRun) {
    console.log("\n✅ Dry run 完成，未调用 LLM。使用 --experiment <name> 开始正式实验。");
    // 保存测试用例列表
    const outputDir = path.resolve(cli.output);
    fs.mkdirSync(outputDir, { recursive: true });
    const tcFile = path.join(outputDir, "test_cases.json");
    fs.writeFileSync(tcFile, JSON.stringify(testCases, null, 2), "utf-8");
    console.log(`   测试用例已保存到: ${tcFile}`);
    return;
  }

  // 确认用户意图
  const totalLLMCalls = testCases.length * getConditionCount(cli.experiment);
  console.log(`\n⚠️  将进行约 ${totalLLMCalls} 次 LLM 调用，预计耗时约 ${Math.round(totalLLMCalls * 5 / 60)} 分钟`);
  console.log("   按 Ctrl+C 可随时终止。继续运行...\n");

  // 创建输出目录
  const outputDir = path.resolve(cli.output);
  fs.mkdirSync(outputDir, { recursive: true });

  // 保存配置
  fs.writeFileSync(
    path.join(outputDir, "experiment_config.json"),
    JSON.stringify({ experiment: cli.experiment, samples: cli.samples, languages: cli.languages, hskLevels: cli.hskLevels, totalTestCases: testCases.length, timestamp: new Date().toISOString() }, null, 2),
    "utf-8",
  );

  const runner = getExperimentRunner();

  if (cli.experiment === "rq1" || cli.experiment === "all") {
    console.log("\n🔬 RQ1: 多智能体架构消融实验\n");
    const conditions: ExperimentCondition[] = [
      "C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3",
    ];
    const results = await runner.runBatch(testCases, conditions,
      (summary) => {
        // 实时写 JSONL
        const line = JSON.stringify(summary) + "\n";
        fs.appendFileSync(path.join(outputDir, "rq1_progress.jsonl"), line, "utf-8");
      }
    );

    // 按条件分组并保存
    for (const cond of conditions) {
      const condResults = results.filter(r => r.condition === cond);
      fs.writeFileSync(
        path.join(outputDir, `rq1_${cond}.json`),
        exportResultsToJSON(condResults),
        "utf-8",
      );
    }

    // 按条件分组聚合统计
    const groupAggregates = groupAndAggregate(results);
    fs.writeFileSync(
      path.join(outputDir, "rq1_aggregates.json"),
      JSON.stringify(groupAggregates, null, 2),
      "utf-8",
    );

    console.log(`\n📊 RQ1 汇总:\n${formatAggregateTable(groupAggregates)}`);
  }

  if (cli.experiment === "rq2" || cli.experiment === "all") {
    console.log("\n🔬 RQ2: 知识图谱增强效果实验\n");
    const conditions: ExperimentCondition[] = ["NoKG", "RAG_only"];
    const results = await runner.runBatch(testCases, conditions,
      (summary) => {
        const line = JSON.stringify(summary) + "\n";
        fs.appendFileSync(path.join(outputDir, "rq2_progress.jsonl"), line, "utf-8");
      }
    );

    // 使用 RQ1 的 C1_Full 结果作为 Full+KG (如果存在)
    const c1File = path.join(outputDir, "rq1_C1_Full.json");
    if (fs.existsSync(c1File)) {
      const c1Results = JSON.parse(fs.readFileSync(c1File, "utf-8"));
      const c1AsFullKG = c1Results.map((r: any) => ({ ...r, condition: "Full+KG" }));
      results.push(...c1AsFullKG);
    }

    for (const cond of [...conditions, "Full+KG" as ExperimentCondition]) {
      const condResults = results.filter(r => r.condition === cond);
      if (condResults.length > 0) {
        fs.writeFileSync(
          path.join(outputDir, `rq2_${cond}.json`),
          exportResultsToJSON(condResults),
          "utf-8",
        );
      }
    }

    const rq2Aggregates = groupAndAggregate(results);
    fs.writeFileSync(
      path.join(outputDir, "rq2_aggregates.json"),
      JSON.stringify(rq2Aggregates, null, 2),
      "utf-8",
    );
  }

  if (cli.experiment === "rq3") {
    console.log("\n🔬 RQ3: 跨文化适配效果评估\n");
    console.log("   (需要人工评估，此处仅生成各母语圈的内容样本)");
    // RQ3: 固定知识点，所有8种母语各生成一份
    const all8Languages = [
      { name: "英语", code: "en" }, { name: "日语", code: "ja" },
      { name: "韩语", code: "ko" }, { name: "西班牙语", code: "es" },
      { name: "阿拉伯语", code: "ar" }, { name: "俄语", code: "ru" },
      { name: "法语", code: "fr" }, { name: "泰语", code: "th" },
    ];
    const rq3TestCases = await generateTestCases({
      scenes_per_domain: 1,
      languages: all8Languages,
      hsk_levels: [4], // 固定中级
    });

    const results = await runner.runBatch(rq3TestCases, ["C1_Full"]);
    fs.writeFileSync(
      path.join(outputDir, "rq3_cross_cultural_samples.json"),
      exportResultsToJSON(results),
      "utf-8",
    );
    console.log(`\n✅ RQ3 完成，${results.length} 个样本已保存`);
  }

  if (cli.experiment === "rq4") {
    console.log("\n🔬 RQ4: 防幻觉网关有效性验证\n");
    console.log("   使用 RQ1 C4 (NoA5) 的输出作为待检测样本...");
    // RQ4: 使用 C4_NoA5 的原始输出作为输入，重跑各防线
    // 结果分析由 guardrail-service 的遥测数据提供
    const conditions: ExperimentCondition[] = ["C4_NoA5"];
    const results = await runner.runBatch(testCases, conditions);

    // 提取 guardrail 数据
    const guardrailStats: Array<{
      test_case_id: string;
      guardrail_results: Record<string, unknown>;
      pipeline_confidence: number;
    }> = [];
    for (const r of results) {
      guardrailStats.push({
        test_case_id: r.test_case_id,
        guardrail_results: r.raw_output.pipeline_metadata || {},
        pipeline_confidence: r.metrics.bias_score,
      });
    }

    fs.writeFileSync(
      path.join(outputDir, "rq4_guardrail_analysis.json"),
      JSON.stringify(guardrailStats, null, 2),
      "utf-8",
    );
    console.log(`\n✅ RQ4 完成，${guardrailStats.length} 个样本已保存`);
  }

  console.log(`\n✅ 实验完成。结果已保存到: ${outputDir}`);
  console.log("   使用以下命令查看结果:");
  console.log(`   cat ${outputDir}/*_aggregates.json | python3 -m json.tool`);
}

// ============================================================================
// 辅助函数
// ============================================================================

function getConditionCount(experiment: string): number {
  switch (experiment) {
    case "rq1": return 5;
    case "rq2": return 2; // NoKG + RAG_only (Full+KG = C1_Full from RQ1)
    case "rq3": return 1;
    case "rq4": return 1;
    case "all": return 7; // 5 + 2
    default: return 1;
  }
}

// ============================================================================
// 入口
// ============================================================================

main().catch(err => {
  console.error("实验运行失败:", err);
  process.exit(1);
});
