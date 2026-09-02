/**
 * 干净消融验证脚本 v2 — 字段级 diff，定位 C1 与 C4 从哪个 Agent 输出开始分叉。
 *
 * 设计（固定 3 个 case × {C1, C4}）：
 *   - 对每个 case 分别跑 C1(bypassCache) 与 C4(skipAgents=['A5'], bypassCache)
 *   - 字段级比对：cultural_explanation / cross_cultural_comparison / learning_content 整体
 *     以及 learning_content 的每个子字段（定位分叉点）
 *   - 对 learning_content 额外跑一次“C1 同条件第二次”，用于区分：
 *       若是采样随机性 → C1_run1 ≠ C1_run2（同条件都不一致）
 *       若是架构残留   → C1_run1 == C1_run2 但 C1 ≠ C4
 *   - 完整结果 dump 到 experiment_results/verify_c1c4_dump.json 供离线分析
 *
 * 用法：npx tsx scripts/verify_c1_c4.ts
 */
import { createHash } from "crypto";
import fs from "fs";
import { processLearningRequestWithLangGraph } from "../src/lib/learning-graph";
import { generateTestCases } from "../src/lib/experiment-runner";

const DUMP = "/Users/wanglei/Desktop/code/mutiAgent3.0/experiment_results/verify_c1c4_dump.json";

function makeLearner(nativeLanguage: string, hskLevel: number) {
  return {
    id: `exp_learner_${nativeLanguage}_hsk${hskLevel}`,
    uid: `exp_uid_fixed`,
    native_language: nativeLanguage,
    hsk_level: hskLevel,
    learning_motivation: "interest",
    cultural_anxiety_score: 50,
    ability_vector: [50, 50, 50, 50, 50],
  } as any;
}

function j(o: unknown) {
  return JSON.stringify(o ?? null);
}
function h(o: unknown) {
  return createHash("md5").update(j(o)).digest("hex").slice(0, 10);
}
function eq(a: unknown, b: unknown) {
  return j(a) === j(b);
}

async function run(
  learner: any,
  tc: any,
  opts: { skipAgents?: string[]; bypassCache?: boolean },
) {
  return processLearningRequestWithLangGraph(
    learner,
    tc.knowledge_point_id,
    [tc.domain_name, tc.scene_name],
    undefined,
    opts,
  );
}

async function main() {
  console.log("[verify] 生成测试用例（限 3 个）...");
  const cases = await generateTestCases({
    domains_per_run: 3,
    scenes_per_domain: 1,
    languages: [{ name: "英语", code: "en" }],
    hsk_levels: [3],
  });
  const top = cases.slice(0, 3);
  console.log(`[verify] 取 ${top.length} 个 case: ${top.map((c) => c.id).join(", ")}`);

  const dump: any[] = [];

  for (const tc of top) {
    const learner = makeLearner(tc.native_language, tc.hsk_level);

    console.log(`\n========== [verify] ${tc.id} ==========`);
    const c1a = await run(learner, tc, { bypassCache: true });
    const c4a = await run(learner, tc, { skipAgents: ["A5"], bypassCache: true });
    // 同条件再跑一次 C1，用于判断是否为采样随机性
    const c1b = await run(learner, tc, { bypassCache: true });

    const ce = eq(c1a.cultural_explanation, c4a.cultural_explanation);
    const cc = eq(c1a.cross_cultural_comparison, c4a.cross_cultural_comparison);
    const lc = eq(c1a.learning_content, c4a.learning_content);
    const c1self = eq(c1a.learning_content, c1b.learning_content);

    console.log(
      `[verify] ${tc.id} | C1==C4: cultural_explanation=${ce}(${h(c1a.cultural_explanation)}/${h(c4a.cultural_explanation)}) ` +
        `cross_cultural_comparison=${cc}(${h(c1a.cross_cultural_comparison)}/${h(c4a.cross_cultural_comparison)}) ` +
        `learning_content=${lc}(${h(c1a.learning_content)}/${h(c4a.learning_content)})`,
    );
    console.log(`[verify] ${tc.id} | 同条件 C1_run1==C1_run2: ${c1self}(${h(c1a.learning_content)}/${h(c1b.learning_content)})`);

    // learning_content 子字段级 diff
    const lc1: any = c1a.learning_content ?? {};
    const lc4: any = c4a.learning_content ?? {};
    const keys = Array.from(new Set([...Object.keys(lc1), ...Object.keys(lc4)]));
    console.log(`[verify] ${tc.id} | learning_content 子字段: ${keys.join(", ")}`);
    for (const k of keys) {
      const e = eq(lc1[k], lc4[k]);
      if (!e) console.log(`   >>> DIFF learning_content.${k}: ${h(lc1[k])} vs ${h(lc4[k])}`);
      else console.log(`   ===   learning_content.${k}: ${h(lc1[k])} (一致)`);
    }

    dump.push({ id: tc.id, c1a, c4a, c1b });
  }

  fs.writeFileSync(DUMP, JSON.stringify(dump, null, 2));
  console.log(`\n[verify] 完整 dump 已写入 ${DUMP}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify] FATAL", e);
  process.exit(2);
});
