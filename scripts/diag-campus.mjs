// campus 场景质量诊断：实跑 /api/learning，dump 置信度衰减链 + 各 guardrail 判定 + 练习题
import fs from 'node:fs';

async function post(lang, scene, hsk) {
  const t0 = Date.now();
  const resp = await fetch('http://localhost:5000/api/learning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      learner_id: 'new',
      knowledge_point_id: scene,
      hsk_level: hsk,
      native_language: lang,
      learning_motivation: 'interest',
      use_langgraph: true,
    }),
  });
  const json = await resp.json();
  const d = json.data || {};
  const ms = Date.now() - t0;
  return { lang, ms, ok: resp.ok && json.success, d, raw: json };
}

(async () => {
  const lang = process.argv[2] || '英语';
  const scene = process.argv[3] || 'campus';
  const hsk = Number(process.argv[4] || 3);
  console.log(`\n===== campus 诊断：${lang} / ${scene} / HSK${hsk} =====`);
  const { lang: L, ms, ok, d, raw } = await post(lang, scene, hsk);
  console.log(`ok=${ok} 用时${(ms/1000).toFixed(1)}s\n`);

  const meta = d.pipeline_metadata || {};
  console.log('--- 置信度 ---');
  console.log('overall_confidence =', meta.overall_confidence);
  console.log('guardrail_count =', meta.guardrail_count, ' flag 数 =', meta.guardrail_flagged);
  console.log('requires_human_review =', meta.requires_human_review);

  console.log('\n--- decay_log（衰减链，1.0 起逐次减权重）---');
  (meta.decay_log || []).forEach(e =>
    console.log(`  ${e.guardrail.padEnd(18)} weight=${e.weight}  ${e.confidenceBefore} → ${e.confidenceAfter}  [${e.action}]`));
  if (!meta.decay_log?.length) console.log('  (无衰减，全 PASS)');

  console.log('\n--- 各 guardrail 判定 ---');
  const gr = d.guardrail || {};
  for (const [k, v] of Object.entries(gr)) {
    const passed = v?.passed;
    const act = v?.action;
    const conf = v?.confidence;
    const det = v?.detail ? JSON.stringify(v.detail).slice(0, 240) : '';
    console.log(`  ${k.padEnd(18)} passed=${passed} action=${act} conf=${conf}`);
    if (!passed && det) console.log(`       detail: ${det}`);
  }

  console.log('\n--- 练习题 ---');
  const exs = d.learning_content?.exercises || [];
  console.log('题数 =', exs.length);
  exs.forEach((ex, i) => {
    console.log(`  [${i}] type=${ex.type} q="${String(ex.question).slice(0,60)}" ans=${ex.correct_answer}`);
    if (Array.isArray(ex.options)) console.log(`       options=${JSON.stringify(ex.options).slice(0,120)}`);
  });

  // 落盘完整响应供细看
  const stamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const path = `experiment_results/smoke/campus-diag-${L}-${scene}-hsk${hsk}-${stamp}.json`;
  fs.mkdirSync('experiment_results/smoke', { recursive: true });
  fs.writeFileSync(path, JSON.stringify(raw, null, 2));
  console.log(`\n完整响应已存: ${path}`);
})();
