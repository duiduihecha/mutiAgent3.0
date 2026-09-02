/**
 * Step 1: 仅生成模型输出（不评测），每条立即存盘，中断可续跑
 * 用法: npx tsx scripts/run_mini_step1_generate.ts
 */
import * as fs from "fs";
import * as path from "path";
import { getExperimentRunner, type TestCase } from "../src/lib/experiment-runner";
import type { ModelOutput } from "../src/lib/cieval-judge";

const OUTPUT_FILE = path.resolve("experiment_results/rq1_mini_outputs.jsonl");
const PROGRESS_FILE = path.resolve("experiment_results/rq1_mini_step1_progress.txt");

async function main() {
  process.env.OPENAI_API_URL = "https://e-flowcode.cc";
  const casesPath = path.resolve(process.env.CASES || "experiment_results/test_cases_mini.json");
  const allCases: TestCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"));
  const conditions = ["C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3"] as const;

  // —— 可配置规模（默认全量；T45 统计版推荐 50 条 + 同源对照）——
  const NCASES = process.env.NCASES ? Math.max(1, parseInt(process.env.NCASES, 10)) : allCases.length;
  const USE_CONTROL = process.env.CONTROL === "1"; // 同源对照：C1_Full 再跑一次 → 标记 C1_Full_r2
  const testCases = allCases.slice(0, NCASES);

  // 构建任务列表（含可选同源对照）
  type Task = { tc: TestCase; runCond: string; outCond: string };
  const tasks: Task[] = [];
  for (const tc of testCases) {
    for (const cond of conditions) tasks.push({ tc, runCond: cond, outCond: cond });
    if (USE_CONTROL) tasks.push({ tc, runCond: "C1_Full", outCond: "C1_Full_r2" });
  }

  // 断点续跑：读已完成的
  const done = new Set<string>();
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean).forEach(l => done.add(l.trim()));
    console.log(`已恢复 ${done.size} 条已完成的任务`);
  }

  const runner = getExperimentRunner();
  const total = tasks.length;
  let completed = done.size;

  console.log(`规模: ${testCases.length} cases | 条件 ${conditions.length} + 对照${USE_CONTROL ? "(C1_Full_r2)" : ""} ` +
              `| 总计 ${total} 次生成 | 已完成: ${completed}\n`);

  for (const { tc, runCond, outCond } of tasks) {
    const taskKey = `${tc.id}|${outCond}`;
    if (done.has(taskKey)) continue;

    try {
      const result = await runner.runSingle(tc, runCond as any);
      // 从测试用例中提取 CIEval 样本 ID（make_mini_cases.py 已注入）
      const cievalId = (tc as any)._cieval_sample?.cieval_id || "";

      const output: ModelOutput & { _tc_id: string; _cond: string; _cieval_id: string } = {
        _tc_id: tc.id,
        _cond: outCond,
        _cieval_id: cievalId,
        cultural_explanation: result.raw_output.cultural_explanation,
        cross_cultural_comparison: result.raw_output.cross_cultural_comparison,
        generated_content: result.raw_output.generated_content as any,
      };

      // 每条立即追加写入
      fs.appendFileSync(OUTPUT_FILE, JSON.stringify(output) + "\n", "utf-8");
      fs.writeFileSync(PROGRESS_FILE, taskKey + "\n", { flag: "a" });

      completed++;
      const pct = (completed / total * 100).toFixed(0);
      console.log(`[${completed}/${total} ${pct}%] ${outCond} | ${tc.domain_name} | ${tc.native_language} HSK${tc.hsk_level}`);

      // DeepSeek 限流间隔
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`  ❌ ${taskKey} 失败: ${msg.slice(0, 100)}`);
      if (msg.includes("429") || msg.includes("rate") || msg.includes("limit")) {
        console.log("  ⏳ 触发限流，等待 60s...");
        await new Promise(r => setTimeout(r, 60000));
      }
      // 失败不写进度，下次重试
    }
  }

  console.log(`\n✅ Step1 完成。输出: ${OUTPUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
