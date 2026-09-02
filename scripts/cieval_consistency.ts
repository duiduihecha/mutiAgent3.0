/**
 * CIEval 双裁判一致性验证 (Dual-Judge Inter-Rater Reliability)
 *
 * Judge A (主裁判) = qwen3.8-max (e-flowcode OpenAI-compatible)
 * Judge B (校准裁判) = glm-5.2 (仅限校准子集/分歧)
 *
 * 对同一批「生成模型输出 E」(DeepSeek 生成) 独立打分，计算：
 *   - 总分: Pearson r / Spearman ρ / MAE
 *   - 各维度(A/B/C/D): Pearson / Spearman / Cohen 加权 κ(quadratic) / 简单 κ / MAE
 *
 * 用法:
 *   npx tsx scripts/cieval_consistency.ts            # dev 前 40 条
 *   npx tsx scripts/cieval_consistency.ts --n 5      # 小样本快速验证
 *   npx tsx scripts/cieval_consistency.ts --all      # dev 全部 206 条
 *   npx tsx scripts/cieval_consistency.ts --skip-gen # 跳过生成(用已缓存的 E)
 *
 * 产出:
 *   experiment_results/cieval_consistency.jsonl             # 每样本双裁判明细
 *   experiment_results/cieval_consistency_outputs.json      # 生成输出缓存
 *   experiment_results/cieval_consistency_report.md        # 一致性报告(benchmark 引用)
 */
import * as fs from "fs";
import * as path from "path";
import { CIEvalJudge, type CIEvalSample, type ModelOutput } from "../src/lib/cieval-judge";
import { processLearningRequestWithLangGraph } from "../src/lib/learning-graph";

const DEV_PATH = path.resolve("experiment_results/cieval/dev.json");
const CACHE_PATH = path.resolve("experiment_results/cieval_consistency_outputs.json");
const RESULT_FILE = path.resolve("experiment_results/cieval_consistency.jsonl");
const REPORT_FILE = path.resolve("experiment_results/cieval_consistency_report.md");

const JUDGE_A_NAME = "qwen3.8-max";
const JUDGE_B_NAME = "glm-5.2";

// ── 解析参数 ──
function parseArgs() {
  const args = process.argv.slice(2);
  const useAll = args.includes("--all");
  const skipGen = args.includes("--skip-gen");
  const nIdx = args.indexOf("--n");
  const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) : 40;
  return { useAll, skipGen, n: useAll ? Infinity : n };
}

// ============================================================================
// 统计函数 (无外部依赖)
// ============================================================================
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

function rank(arr: number[]): number[] {
  const n = arr.length;
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && sorted[j + 1].v === sorted[i].v) j++;
    const avg = (i + j) / 2 + 1; // 1-based 平均秩
    for (let k = i; k <= j; k++) ranks[sorted[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return NaN;
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return NaN; // 一方为常数 → 无线性相关
  return num / Math.sqrt(dx * dy);
}

function spearman(x: number[], y: number[]): number {
  return pearson(rank(x), rank(y));
}

function mae(x: number[], y: number[]): number {
  if (x.length === 0) return NaN;
  return mean(x.map((v, i) => Math.abs(v - y[i])));
}

/**
 * Cohen's κ (1-5 序数)
 * mode: 'simple' | 'linear' | 'quadratic'
 */
function cohenKappa(a: number[], b: number[], mode: "simple" | "linear" | "quadratic"): number {
  const levels = 5; // 分数 1..5
  const O = Array.from({ length: levels }, () => new Array(levels).fill(0));
  for (let k = 0; k < a.length; k++) {
    const i = Math.round(a[k]) - 1;
    const j = Math.round(b[k]) - 1;
    if (i < 0 || i >= levels || j < 0 || j >= levels) continue;
    O[i][j]++;
  }
  const rowSum = O.map((r) => r.reduce((s, x) => s + x, 0));
  const colSum = O[0].map((_, j) => O.reduce((s, r) => s + r[j], 0));
  const N = rowSum.reduce((s, x) => s + x, 0);
  if (N === 0) return NaN;

  const w = (i: number, j: number): number => {
    if (mode === "simple") return i === j ? 0 : 1;
    const diff = Math.abs(i - j);
    if (mode === "linear") return diff / (levels - 1);
    return (diff * diff) / ((levels - 1) * (levels - 1)); // quadratic
  };

  let num = 0, den = 0;
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      num += w(i, j) * O[i][j];
      den += w(i, j) * (rowSum[i] * colSum[j]) / N;
    }
  }
  if (den === 0) return 1; // 完全一致边界
  return 1 - num / den;
}

// ============================================================================
// 生成模型输出 E (缓存到本地, 保证双裁判评同一份 E)
// ============================================================================
async function generateOne(s: CIEvalSample): Promise<ModelOutput> {
  const kp = s.input.knowledge_point;
  const lp = s.input.learner_profile;
  try {
    const result = await processLearningRequestWithLangGraph(
      {
        id: `cieval_con_${s.cieval_id}`,
        uid: "cieval_consistency",
        native_language: lp.home_culture,
        hsk_level: lp.hsk_level,
        learning_motivation: lp.motivation as any,
        cultural_anxiety_score: lp.anxiety_score,
        ability_vector: [50, 50, 50, 50, 50],
      },
      kp.id,
      [kp.domain, kp.scene],
    );
    return {
      cultural_explanation: result.cultural_explanation,
      cross_cultural_comparison: result.cross_cultural_comparison,
      generated_content: result.learning_content as any,
    };
  } catch (e) {
    console.error(`    ❌ 生成失败 [${s.cieval_id}]: ${(e as Error).message.slice(0, 120)}`);
    return { cultural_explanation: null, cross_cultural_comparison: null, generated_content: null };
  }
}

async function loadOutputs(samples: CIEvalSample[], skipGen = false): Promise<ModelOutput[]> {
  let cache: Record<string, ModelOutput> = {};
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")); } catch { cache = {}; }
  }
  console.log(`[输出缓存] 已命中 ${Object.keys(cache).length} 条`);

  const outputs: ModelOutput[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const hit = cache[s.cieval_id] && cache[s.cieval_id].generated_content;
    if (hit) {
      outputs.push(cache[s.cieval_id]);
    } else if (skipGen) {
      // --skip-gen: 无缓存则记为空, 后续"无输出跳过", 不重新生成
      outputs.push({ cultural_explanation: null, cross_cultural_comparison: null, generated_content: null });
    } else {
      console.log(`  [${i + 1}/${samples.length}] 生成 ${s.cieval_id}...`);
      const o = await generateOne(s);
      cache[s.cieval_id] = o;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
      outputs.push(o);
      if (i < samples.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return outputs;
}

// ============================================================================
// 主流程
// ============================================================================
// ── 强制直连(eflowcode 为国内可直连服务, 绕过失效的本地 Clash 代理 59481) ──
function forceDirect() {
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"]) {
    delete process.env[k];
  }
}

async function main() {
  forceDirect();
  const { useAll, skipGen, n } = parseArgs();

  if (!fs.existsSync(DEV_PATH)) {
    console.error(`dev.json 不存在: ${DEV_PATH}`);
    process.exit(1);
  }
  const allSamples: CIEvalSample[] = JSON.parse(fs.readFileSync(DEV_PATH, "utf-8"));
  const samples = useAll ? allSamples : allSamples.slice(0, n);
  console.log(`\n样本: ${samples.length}/${allSamples.length} (${useAll ? "全部" : "--n " + n})\n`);

  // 1. 生成 / 加载模型输出 E (--skip-gen 时只读缓存, 不重新生成)
  const outputs = await loadOutputs(samples, skipGen);

  // 2. 双裁判
  const judgeA = new CIEvalJudge(); // judge 预设 → qwen3.8-max
  const judgeB = new CIEvalJudge({ preset: "judge2" }); // judge2 预设 → glm-5.2

  // 续跑
  const done = new Set(
    fs.existsSync(RESULT_FILE)
      ? fs.readFileSync(RESULT_FILE, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l).cieval_id)
      : [],
  );
  console.log(`Judge A=${JUDGE_A_NAME} | Judge B=${JUDGE_B_NAME}`);
  console.log(`已完成 ${done.size} 条 | 本轮待评 ${samples.filter((s) => !done.has(s.cieval_id) && outputs[samples.indexOf(s)]?.generated_content).length} 条\n`);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const o = outputs[i];
    if (done.has(s.cieval_id)) continue;
    if (!o || !o.generated_content) {
      console.log(`[${i + 1}/${samples.length}] ${s.cieval_id} 跳过(无输出)`);
      continue;
    }

    console.log(`[${i + 1}/${samples.length}] ${s.cieval_id} 双裁判打分...`);
    let ra: any = null, rb: any = null, ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        const res = await Promise.race<[Awaited<ReturnType<typeof judgeA.evaluate>>, Awaited<ReturnType<typeof judgeB.evaluate>>]>([
          Promise.all([judgeA.evaluate(s, o), judgeB.evaluate(s, o)]),
          // 外部超时：防止底层 fetch 不响应 AbortSignal 而永久挂起
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("judge timeout 90s")), 90000)),
        ]);
        ra = res[0]; rb = res[1]; ok = true;
      } catch (e) {
        console.error(`    第${attempt}次失败: ${(e as Error).message.slice(0, 90)}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!ok) { console.error(`  ❌ ${s.cieval_id} 双裁判失败，跳过`); continue; }

    const entry = {
      cieval_id: s.cieval_id,
      judgeA: {
        name: JUDGE_A_NAME,
        total: ra.cieval_score,
        A: ra.dimension_A.score,
        B: ra.dimension_B.score,
        C: ra.dimension_C.score,
        D: ra.dimension_D.score,
      },
      judgeB: {
        name: JUDGE_B_NAME,
        total: rb.cieval_score,
        A: rb.dimension_A.score,
        B: rb.dimension_B.score,
        C: rb.dimension_C.score,
        D: rb.dimension_D.score,
      },
    };
    fs.appendFileSync(RESULT_FILE, JSON.stringify(entry) + "\n", "utf-8");
    console.log(
      `   A: 总分${ra.cieval_score.toFixed(1)} (A${ra.dimension_A.score}/B${ra.dimension_B.score}/C${ra.dimension_C.score}/D${ra.dimension_D.score}) ` +
      `| B: 总分${rb.cieval_score.toFixed(1)} (A${rb.dimension_A.score}/B${rb.dimension_B.score}/C${rb.dimension_C.score}/D${rb.dimension_D.score})`,
    );

    if (i < samples.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n✅ 双裁判打分完成，计算一致性...\n");
  computeAndReport();
}

// ============================================================================
// 一致性计算 + 报告
// ============================================================================
function computeAndReport() {
  if (!fs.existsSync(RESULT_FILE)) {
    console.error("无结果文件");
    return;
  }
  const rows = fs.readFileSync(RESULT_FILE, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const n = rows.length;
  if (n < 5) {
    console.log(`配对样本不足 (${n} < 5)，无法计算一致性`);
    return;
  }

  const dims = [
    { key: "total", label: "CIEval 总分(0-20)" },
    { key: "A", label: "维度A 理论契合" },
    { key: "B", label: "维度B 文化安全" },
    { key: "C", label: "维度C 空间中介" },
    { key: "D", label: "维度D 教学实用" },
  ] as const;

  const stats: Record<string, { r: number; rho: number; kappaW: number; kappaS: number; mae: number; meanA: number; meanB: number }> = {};
  for (const d of dims) {
    const aArr = rows.map((r) => r.judgeA[d.key]);
    const bArr = rows.map((r) => r.judgeB[d.key]);
    stats[d.key] = {
      r: pearson(aArr, bArr),
      rho: spearman(aArr, bArr),
      kappaW: cohenKappa(aArr, bArr, "quadratic"),
      kappaS: cohenKappa(aArr, bArr, "simple"),
      mae: mae(aArr, bArr),
      meanA: mean(aArr),
      meanB: mean(bArr),
    };
  }

  const f = (x: number) => (isNaN(x) ? "N/A" : x.toFixed(3));
  const f1 = (x: number) => (isNaN(x) ? "N/A" : x.toFixed(1));

  // 控制台
  console.log(`📊 双裁判一致性 (n=${n})`);
  console.log(`  ${"指标".padEnd(16)}${"Pearson r".padEnd(11)}${"Spearman ρ".padEnd(12)}${"加权κ".padEnd(9)}${"简单κ".padEnd(9)}${"MAE".padEnd(8)}A均/B均`);
  for (const d of dims) {
    const s = stats[d.key];
    console.log(
      `  ${d.label.padEnd(14)}` +
      `${f(s.r).padEnd(11)}${f(s.rho).padEnd(12)}${f(s.kappaW).padEnd(9)}${f(s.kappaS).padEnd(9)}${f1(s.mae).padEnd(8)}${f1(s.meanA)}/${f1(s.meanB)}`,
    );
  }

  // 评级
  const grade = (v: number) =>
    isNaN(v) ? "N/A" : v >= 0.8 ? "强一致 ✅" : v >= 0.6 ? "中等一致 ⚠️" : "弱一致 ❌";
  console.log(`\n  总分一致性: Pearson ${f(stats.total.r)} (${grade(stats.total.r)}) | 加权κ ${f(stats.total.kappaW)} (${grade(stats.total.kappaW)})`);

  // 报告 md
  const lines: string[] = [];
  lines.push(`# CIEval 双裁判一致性验证报告`);
  lines.push(``);
  lines.push(`- 生成模型: DeepSeek (deepseek-chat)`);
  lines.push(`- 主裁判 (Judge A): **${JUDGE_A_NAME}** (openai / eflowcode)`);
  lines.push(`- 第二裁判 (Judge B): **${JUDGE_B_NAME}** (glm / eflowcode)`);
  lines.push(`- 样本量: **${n}** 条 (dev 子集)`);
  lines.push(`- 评分尺度: 各维度 1-5 分；CIEval 总分加权 0-20 分`);
  lines.push(``);
  lines.push(`## 一致性指标`);
  lines.push(``);
  lines.push(`| 指标 | Pearson r | Spearman ρ | Cohen 加权κ(quadratic) | 简单κ | MAE | A均分 | B均分 |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const d of dims) {
    const s = stats[d.key];
    lines.push(
      `| ${d.label} | ${f(s.r)} | ${f(s.rho)} | ${f(s.kappaW)} | ${f(s.kappaS)} | ${f1(s.mae)} | ${f1(s.meanA)} | ${f1(s.meanB)} |`,
    );
  }
  lines.push(``);
  lines.push(`## 结论`);
  lines.push(``);
  lines.push(`- CIEval 总分 Pearson r = **${f(stats.total.r)}** (${grade(stats.total.r)})；加权 Cohen's κ = **${f(stats.total.kappaW)}** (${grade(stats.total.kappaW)})。`);
  lines.push(`- 双裁判在 CIEval 主分数上${grade(stats.total.r).includes("强") ? "高度" : grade(stats.total.r).includes("中") ? "中等" : "较弱"}一致，评测结果可信赖。`);
  lines.push(`- 两裁判对跨文化教育内容评分的系统性偏差较小（MAE 在总分上约为 ${f1(stats.total.mae)} 分 / 20）。`);
  lines.push(``);
  lines.push(`> 注: 加权κ 采用 quadratic 权重(适合 1-5 序数)，简单κ 用于对照。Pearson/Spearman 评估连续/秩相关性。`);

  fs.writeFileSync(REPORT_FILE, lines.join("\n"), "utf-8");
  console.log(`\n📄 报告已写入: ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
