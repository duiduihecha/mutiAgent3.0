/**
 * GPT-5.5 对照组 — 用 e-flowcode 生成内容，MiniMax CIEval 评测
 * 用法: npx tsx scripts/run_gpt5_generate.ts
 */
import * as fs from "fs";
import * as path from "path";
import { UnifiedLLMService } from "../src/lib/unified-llm-service";
import { getLanguageNaturalName } from "../src/lib/constants";

const INPUT_FILE = path.resolve("experiment_results/test_cases_mini.json");
const OUTPUT_FILE = path.resolve("experiment_results/rq1_gpt5_outputs.jsonl");
const PROGRESS_FILE = path.resolve("experiment_results/rq1_gpt5_progress.txt");

async function main() {
  const testCases = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  // Legacy experiment: generation preset is mandatory. The obsolete gpt-5.5
  // override below is deliberately rejected by the centralized verified catalog.
  const llm = new UnifiedLLMService("generation");

  const done = new Set(fs.existsSync(PROGRESS_FILE)
    ? fs.readFileSync(PROGRESS_FILE, "utf-8").split("\n").filter(Boolean) : []);

  console.log(`GPT-5.5 单体生成: ${testCases.length} 条 | 已完成: ${done.size}\n`);

  for (const tc of testCases) {
    const id = (tc as any)._cieval_sample?.cieval_id || tc.id;
    if (done.has(id)) continue;

    const langName = getLanguageNaturalName((tc as any)._cieval_sample?.input?.learner_profile?.home_culture_code || "en");
    const kp = (tc as any)._cieval_sample?.input?.knowledge_point || tc;

    // 避开敏感词的 prompt
    const systemPrompt = `你是一位国际中文教育专家。请为${langName}母语的HSK${tc.hsk_level}学习者生成一份学习材料。

内容包括:
1. 用${langName}解释中国文化概念: ${kp.pragmatic_intent || kp.scene_name || kp.domain_name}
2. 对比中国文化与${langName}母语文化，客观分析两种做法各自的社会适应性
3. 生成5道HSK${tc.hsk_level}练习题(至少2种题型)

输出严格JSON:
{
  "cultural_context": {"explanation": "${langName}书写的文化背景(80-150词)"},
  "language_points": [{"zh": "中文表达", "native": "${langName}翻译"}],
  "comparison": {"cn": "中国表现", "target": "${tc.native_language || langName}表现", "differences": [{"cn":"","target":"","description":""}]},
  "exercises": [{"type": "multiple_choice|true_false|fill_blank", "question": "题目", "options": ["A","B","C","D"], "correct_answer": "A", "explanation": "", "dimension": "cultural_pragmatic"}]
}`;

    try {
      const r = await llm.chat(
        [{ role: "system", content: systemPrompt }, { role: "user", content: `知识点: ${kp.id} | 场景: ${kp.domain_name || kp.domain} | 母语: ${langName} | HSK: ${tc.hsk_level}` }],
        { provider: "openai", model: "gpt-5.5", temperature: 0.3, max_tokens: 4096 }
      );

      // 解析JSON
      let content = r.content;
      const match = content.match(/\{[\s\S]*\}/);
      const output = {
        _tc_id: tc.id,
        _cond: "GPT5.5_Monolith",
        _cieval_id: id,
        cultural_explanation: null as any,
        cross_cultural_comparison: null as any,
        generated_content: match ? JSON.parse(match[0]) : null,
      };

      fs.appendFileSync(OUTPUT_FILE, JSON.stringify(output) + "\n", "utf-8");
      fs.writeFileSync(PROGRESS_FILE, id + "\n", { flag: "a" });

      const n = (done.size || 0) + 1;
      console.log(`[${n}/${testCases.length}] ${tc.domain_name} | ${tc.native_language} HSK${tc.hsk_level} | 完成`);
    } catch (e) {
      console.error(`  ❌ ${id} 失败: ${(e as Error).message.slice(0, 100)}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ 完成。输出: ${OUTPUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
