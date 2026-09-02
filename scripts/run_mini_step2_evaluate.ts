/**
 * Step 2: 读取Step1生成的输出，用CIEval Judge评测，断点续跑
 * 用法: npx tsx scripts/run_mini_step2_evaluate.ts
 */
import * as fs from "fs";
import * as path from "path";
import { CIEvalJudge, type CIEvalSample, type ModelOutput, type CIEvalResult } from "../src/lib/cieval-judge";
import { getLanguageCode } from "../src/lib/constants";

const INPUT_FILE = path.resolve("experiment_results/rq1_mini_outputs.jsonl");
const RESULT_FILE = path.resolve("experiment_results/rq1_mini_cieval.jsonl");
const PROGRESS_FILE = path.resolve("experiment_results/rq1_mini_step2_progress.txt");

function loadCIEvalSamples(): Map<string, CIEvalSample> {
  const map = new Map<string, CIEvalSample>();
  const dir = path.resolve("experiment_results/cieval");
  for (const split of ["train", "dev", "test", "challenge"]) {
    const f = path.join(dir, `${split}.json`);
    if (!fs.existsSync(f)) continue;
    const data: CIEvalSample[] = JSON.parse(fs.readFileSync(f, "utf-8"));
    for (const s of data) {
      map.set(s.cieval_id, s);
    }
  }
  return map;
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("请先运行 Step1: npx tsx scripts/run_mini_step1_generate.ts");
    process.exit(1);
  }

  // 加载
  const lines = fs.readFileSync(INPUT_FILE, "utf-8").split("\n").filter(Boolean);
  const outputs: Array<ModelOutput & { _tc_id: string; _cond: string }> = lines.map(l => JSON.parse(l));
  const cievals = loadCIEvalSamples();

  // 续跑
  const done = new Set(fs.existsSync(PROGRESS_FILE)
    ? fs.readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean)
    : []);

  console.log(`待评测: ${outputs.length} 条 | 已完成: ${done.size}\n`);

  const judge = new CIEvalJudge(); // 使用 llm-config 的 judge 预设

  for (let i = 0; i < outputs.length; i++) {
    const o = outputs[i];
    const idx = `${i}`;
    if (done.has(idx)) continue;

    if (!o.generated_content) {
      console.log(`[${i + 1}/${outputs.length}] 跳过（生成失败）`);
      fs.appendFileSync(PROGRESS_FILE, idx + "\n", "utf-8");
      continue;
    }

    // 用 Step1 注入的 _cieval_id 直接查，不再拼 key
    const cievalId = (o as any)._cieval_id || "";
    const sample = cievals.get(cievalId);

    if (!sample) {
      console.log(`[${i + 1}/${outputs.length}] ${o._cond} | ${o._tc_id} 跳过（无CIEval样本, cieval_id=${cievalId || "空"}）`);
      fs.appendFileSync(PROGRESS_FILE, idx + "\n", "utf-8");
      continue;
    }

    try {
      const result = await judge.evaluate(sample, o);
      fs.appendFileSync(RESULT_FILE, JSON.stringify({ _tc_id: o._tc_id, _cond: o._cond, ...result }) + "\n", "utf-8");
      fs.appendFileSync(PROGRESS_FILE, idx + "\n", "utf-8");

      console.log(`[${i + 1}/${outputs.length}] ${o._cond} | ${o._tc_id} | A=${result.dimension_A.score} B=${result.dimension_B.score} C=${result.dimension_C.score} D=${result.dimension_D.score} → ${result.cieval_score.toFixed(0)}/20`);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`  ❌ [${i + 1}] ${o._tc_id} 评测失败: ${msg.slice(0, 100)}`);
      if (msg.includes("429") || msg.includes("rate")) {
        await new Promise(r => setTimeout(r, 60000));
      }
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // 汇总
  const results: Array<CIEvalResult & { _cond: string }> = fs.existsSync(RESULT_FILE)
    ? fs.readFileSync(RESULT_FILE, "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l))
    : [];

  const byCond = new Map<string, CIEvalResult[]>();
  for (const r of results) {
    if (!byCond.has(r._cond)) byCond.set(r._cond, []);
    byCond.get(r._cond)!.push(r);
  }

  console.log("\n📊 消融实验 — CIEval 对比:\n");
  console.log("| 条件 | A理论▲ | B安全▲ | C空间▲ | D教学▲ | CIEval总分 | 样本数 |");
  console.log("|------|--------|--------|--------|--------|----------|--------|");

  const order = ["C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3"];
  for (const cond of order) {
    const group = byCond.get(cond) || [];
    const n = group.length;
    if (n === 0) continue;
    const a = group.reduce((s, r) => s + r.dimension_A.score, 0) / n;
    const b = group.reduce((s, r) => s + r.dimension_B.score, 0) / n;
    const c = group.reduce((s, r) => s + r.dimension_C.score, 0) / n;
    const d = group.reduce((s, r) => s + r.dimension_D.score, 0) / n;
    const t = group.reduce((s, r) => s + r.cieval_score, 0) / n;
    console.log(`| ${cond} | ${a.toFixed(1)} | ${b.toFixed(1)} | ${c.toFixed(1)} | ${d.toFixed(1)} | ${t.toFixed(1)} | ${n} |`);
  }

  console.log("\n✅ Step2 完成");
}

main().catch(e => { console.error(e); process.exit(1); });
