/**
 * run_a5_guardrail_eval.ts — T50 A5 质量网关独立实验 (Step1: 跑 A5 裁决)
 *
 * 对 rq1_mini_outputs.jsonl 中选定条件(C1_Full / C2_NoAgent_Monolith)的生成内容，
 * 复用生产级 GuardrailService.verifyA5JointArbitration 重新打分，产出 A5 裁决记录。
 *
 * 为什么重跑：RQ1 输出只存了 generated_content，没存 A5 裁决。
 * A5 调用签名(见 learning-graph.ts:341): verifyA5JointArbitration({ exercises }, hsk_level)
 * 当前仲裁策略: DeepSeek 权威 + MiniMax 仅 advisory (passed = dsQualified)。
 *
 * 运行:
 *   set -a; source .env; set +a
 *   npx tsx scripts/run_a5_guardrail_eval.ts | tee experiment_results/rq1_a5_gen.log
 * (本脚本内部 forceDirect() 删除代理, 走 eflowcode 国内直连)
 */
import * as fs from "fs";
import * as path from "path";
import { GuardrailService } from "../src/services/guardrail-service";

// ── 强制直连(eflowcode 国内可直连, 绕过失效本地 Clash 代理) ──
function forceDirect() {
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"]) {
    delete process.env[k];
  }
}

const ROOT = path.resolve(__dirname, "..");
const OUTPUTS = path.join(ROOT, "experiment_results", "rq1_mini_outputs.jsonl");
const CASES = path.join(ROOT, "experiment_results", "test_cases_mini.json");
const A5_OUT = path.join(ROOT, "experiment_results", "rq1_a5_guardrail.jsonl");
const CONDS = ["C1_Full", "C2_NoAgent_Monolith"];

function loadJsonl(p: string): any[] {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

async function main() {
  forceDirect();
  const guardrail = new GuardrailService();

  // HSK / cache-key 来源
  const cases: any[] = JSON.parse(fs.readFileSync(CASES, "utf-8"));
  const caseMap = new Map<string, any>();
  for (const c of cases) caseMap.set(c.id, c);

  // 断点续跑: 已完成的 (tc,cond)
  const done = new Set<string>();
  for (const r of loadJsonl(A5_OUT)) done.add(`${r._tc_id}|${r._cond}`);

  const recs = loadJsonl(OUTPUTS).filter((r) => CONDS.includes(r._cond));
  console.log(`[A5-Eval] 候选记录 ${recs.length} 条 (条件: ${CONDS.join(", ")}) | 已完成 ${done.size} 条`);

  let cnt = 0;
  const out = fs.createWriteStream(A5_OUT, { flags: "a" });
  for (const r of recs) {
    const key = `${r._tc_id}|${r._cond}`;
    if (done.has(key)) continue;
    const gc = r.generated_content;
    const exercises = gc && Array.isArray(gc.exercises) ? gc.exercises : null;
    const meta = caseMap.get(r._tc_id) || {};
    const hsk = meta.hsk_level ?? 1;

    let verdict: any;
    if (!exercises || exercises.length === 0) {
      verdict = { passed: false, action: "SKIP_NO_EXERCISES", confidence: 0, detail: {}, error: "no exercises" };
    } else {
      try {
        verdict = await guardrail.verifyA5JointArbitration({ exercises }, hsk);
      } catch (e: any) {
        verdict = { passed: false, action: "EXCEPTION", confidence: 0, detail: {}, error: String(e) };
      }
    }

    const detail = verdict.detail || {};
    const row = {
      _tc_id: r._tc_id,
      _cond: r._cond,
      hsk_level: hsk,
      knowledge_point_id: meta.knowledge_point_id ?? null,
      scene_id: meta.scene_id ?? null,
      domain_id: meta.domain_id ?? null,
      is_qualified: !!verdict.passed,
      passed: !!verdict.passed,
      action: verdict.action,
      confidence: verdict.confidence, // A5 双模型 overall_score 均值 (0-1)
      ds_scores: detail.ds_scores ?? null,
      minimax_scores: detail.minimax_scores ?? null,
      max_delta: detail.max_delta ?? null,
      dimension_deltas: detail.dimension_deltas ?? null,
      error: verdict.error ?? null,
      elapsed_ms: detail.elapsed_ms ?? null,
    };
    out.write(JSON.stringify(row) + "\n");
    cnt++;
    console.log(
      `[A5-Eval] ${r._cond} ${r._tc_id} | qualified=${row.is_qualified} conf=${row.confidence?.toFixed?.(3)} action=${row.action} (${cnt} 新/共 ${recs.length})`
    );
  }
  out.end();
  console.log(`[A5-Eval] 完成, 新增 ${cnt} 条 -> ${A5_OUT}`);
}

main().catch((e) => {
  console.error("[A5-Eval] FATAL", e);
  process.exit(1);
});
