#!/usr/bin/env node
/**
 * 端到端批量冒烟测试 — 真实打 /api/learning，跑完整 5 智能体链路
 *
 * 和现有测试的区别：
 *   - src/__tests__/*.test.ts  → 纯函数单测，不碰 LLM/DB/API
 *   - scripts/run-experiments.ts → 论文消融实验，绕开真实路由
 *   - 本脚本                    → 真实 HTTP 回归，验证线上链路是否健康
 *
 * 用法：
 *   node scripts/batch-smoke.mjs                                   # 默认 6 场景 × 英语, HSK3
 *   node scripts/batch-smoke.mjs --scenes daily,food --langs 英语,日语
 *   node scripts/batch-smoke.mjs --all                             # 14 场景 × 3 母语（慢）
 *   node scripts/batch-smoke.mjs --twice                           # 每例跑两次，验证缓存写入
 *   node scripts/batch-smoke.mjs --concurrency 3 --hsk 4
 *   node scripts/batch-smoke.mjs --base http://localhost:5000
 *
 * 退出码：0 = 全绿；1 = 有 FAIL
 */

import fs from 'node:fs';
import path from 'node:path';

// ==================== 配置 ====================

const ALL_SCENES = [
  'daily', 'campus', 'food', 'travel', 'shopping', 'transport', 'workplace',
  'medical', 'banking', 'housing', 'entertainment', 'emergency', 'family', 'festival',
];
const DEFAULT_SCENES = ['daily', 'food', 'transport', 'shopping', 'medical', 'festival'];
const ALL_LANGS = ['英语', '日语', '韩语', '西班牙语', '阿拉伯语', '俄语', '法语', '泰语'];

/** A2/A3 结构化字段名 —— 这些键如果出现在渲染文本里说明 JSON 泄漏到了前端 */
const LEAK_KEYS = [
  'precise_definition', 'scene_introduction', 'pragmatic_rules',
  'common_misuse', 'chinese_practice', 'native_culture_practice',
  'similarities', 'differences', 'cultural_root',
];

const CONF_CACHE_WRITE = 0.85; // 达到才会写缓存
const CONF_WARN = 0.60;        // 低于此值内容不可信

// ==================== CLI ====================

function parseArgs(argv) {
  const a = {
    base: 'http://localhost:5000',
    scenes: DEFAULT_SCENES,
    langs: ['英语'],
    hsk: 3,
    concurrency: 2,
    timeout: 180_000,
    twice: false,
    learner: null,
    out: 'experiment_results/smoke',
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case '--all':         a.scenes = ALL_SCENES; a.langs = ['英语', '日语', '韩语']; break;
      case '--scenes':      a.scenes = v.split(','); i++; break;
      case '--langs':       a.langs = v === 'all' ? ALL_LANGS : v.split(','); i++; break;
      case '--hsk':         a.hsk = Number(v); i++; break;
      case '--concurrency': a.concurrency = Number(v); i++; break;
      case '--timeout':     a.timeout = Number(v) * 1000; i++; break;
      case '--twice':       a.twice = true; break;
      case '--learner':     a.learner = v; i++; break;
      case '--base':        a.base = v.replace(/\/$/, ''); i++; break;
      case '--out':         a.out = v; i++; break;
      case '-h': case '--help':
        console.log(fs.readFileSync(new URL(import.meta.url), 'utf-8').split('*/')[0]);
        process.exit(0);
    }
  }
  return a;
}

// ==================== 单例校验 ====================

/**
 * 对一次 API 响应做全面体检。
 * 返回 { level: 'PASS'|'WARN'|'FAIL', issues: string[], metrics: {...} }
 */
function inspect(data) {
  const issues = [];
  let level = 'PASS';
  const fail = (m) => { issues.push('FAIL ' + m); level = 'FAIL'; };
  const warn = (m) => { issues.push('WARN ' + m); if (level === 'PASS') level = 'WARN'; };

  const meta = data.pipeline_metadata || {};
  const conf = typeof meta.overall_confidence === 'number' ? meta.overall_confidence : null;
  const guardrail = data.guardrail || {};
  const lc = data.learning_content || {};
  const exercises = lc.exercises || [];

  // --- 1. 置信度 ---
  if (conf === null) {
    warn('无 pipeline_metadata.overall_confidence');
  } else if (conf < CONF_WARN) {
    fail(`置信度过低 ${conf.toFixed(3)} < ${CONF_WARN}`);
  } else if (conf < CONF_CACHE_WRITE) {
    warn(`置信度 ${conf.toFixed(3)} < ${CONF_CACHE_WRITE}，本次不会写缓存`);
  }

  // --- 2. Guardrail 逐项 ---
  const flagged = Object.entries(guardrail)
    .filter(([, v]) => v && v.passed === false)
    .map(([k]) => k);
  if (flagged.length) warn(`guardrail 未通过: ${flagged.join(', ')}`);

  // --- 3. 练习题 ---
  if (!exercises.length) {
    fail('练习题为空');
  } else {
    exercises.forEach((ex, i) => {
      const tag = `ex[${i}]`;
      if (!ex.question || !String(ex.question).trim()) fail(`${tag} question 为空`);
      if (ex.type === '选择题') {
        if (!Array.isArray(ex.options) || ex.options.length !== 4) {
          fail(`${tag} 选择题选项数=${ex.options?.length ?? 0}，应为 4`);
        }
        const ans = String(ex.correct_answer ?? '').trim();
        const inOptions = Array.isArray(ex.options) && ex.options.some(
          (o) => String(o).trim() === ans || String(o).trim().startsWith(ans + '.') || String(o).trim().startsWith(ans + '、')
        );
        if (!/^[A-D]$/.test(ans) && !inOptions) {
          fail(`${tag} 答案 "${ans}" 不在选项内`);
        }
      }
      if (ex.type === '判断题') {
        const ans = String(ex.correct_answer ?? '').trim();
        if (!/^(对|错|正确|错误|true|false)$/i.test(ans)) {
          warn(`${tag} 判断题答案格式异常: "${ans}"`);
        }
      }
    });
  }

  // --- 4. JSON 泄漏（回归之前修的前端渲染 bug） ---
  const explain = String(data.cultural_explanation ?? '');
  const compare = String(data.cross_cultural_comparison ?? '');
  // 正常情况这两个是 JSON 字符串，检测的是「值里面又套了一层 JSON 字符串」
  for (const [name, raw] of [['cultural_explanation', explain], ['cross_cultural_comparison', compare]]) {
    if (!raw) { fail(`${name} 为空`); continue; }
    let obj;
    try { obj = JSON.parse(raw); } catch { warn(`${name} 不是合法 JSON`); continue; }
    const nested = [];
    const walk = (node, depth = 0) => {
      if (depth > 4) return;
      if (typeof node === 'string') {
        const s = node.trim();
        if (s.startsWith('{') && LEAK_KEYS.some((k) => s.includes(`"${k}"`))) nested.push(s.slice(0, 40));
      } else if (Array.isArray(node)) node.forEach((n) => walk(n, depth + 1));
      else if (node && typeof node === 'object') Object.values(node).forEach((n) => walk(n, depth + 1));
    };
    walk(obj);
    if (nested.length) fail(`${name} 存在嵌套 JSON 字符串（前端会渲染出原始键）: ${nested[0]}...`);
  }

  // --- 5. 正文非空 ---
  if (!lc.cultural_background || String(lc.cultural_background).trim().length < 10) {
    warn('cultural_background 过短或为空');
  }
  if (!Array.isArray(lc.core_language_points) || !lc.core_language_points.length) {
    warn('core_language_points 为空');
  }

  // --- 6. 图谱维度是否注入（A3 是否还在 LLM-only 兜底） ---
  const graphHint = /dimension|维度|hofstede|权力距离|集体主义|不确定性规避/i.test(compare);

  return {
    level,
    issues,
    metrics: {
      confidence: conf,
      from_cache: !!data.from_cache,
      status: data.status,
      engine: data.engine,
      guardrail_total: meta.guardrail_count ?? Object.keys(guardrail).length,
      guardrail_flagged: flagged.length,
      flagged_names: flagged,
      exercise_count: exercises.length,
      requires_human_review: !!meta.requires_human_review,
      graph_dimension_hint: graphHint,
      learner_id: data.learner?.id ?? null,
      kp_id: data.knowledge_point?.id ?? null,
    },
  };
}

// ==================== 执行 ====================

async function runOne(cfg, scene, lang, learnerId, round) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeout);
  try {
    const resp = await fetch(`${cfg.base}/api/learning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learner_id: learnerId || 'new',
        knowledge_point_id: scene,
        hsk_level: cfg.hsk,
        native_language: lang,
        learning_motivation: 'interest',
        use_langgraph: true,
      }),
      signal: ctrl.signal,
    });
    const ms = Date.now() - t0;
    const text = await resp.text();

    if (!resp.ok) {
      return { scene, lang, round, ms, level: 'FAIL', issues: [`FAIL HTTP ${resp.status}: ${text.slice(0, 160)}`], metrics: {} };
    }
    let json;
    try { json = JSON.parse(text); }
    catch { return { scene, lang, round, ms, level: 'FAIL', issues: ['FAIL 响应不是 JSON: ' + text.slice(0, 160)], metrics: {} }; }

    if (!json.success) {
      return { scene, lang, round, ms, level: 'FAIL', issues: [`FAIL success=false: ${json.error}`], metrics: {} };
    }
    const r = inspect(json.data);
    return { scene, lang, round, ms, ...r };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e.name === 'AbortError' ? `超时 >${cfg.timeout / 1000}s` : e.message;
    return { scene, lang, round, ms, level: 'FAIL', issues: ['FAIL ' + msg], metrics: {} };
  } finally {
    clearTimeout(timer);
  }
}

const ICON = { PASS: '\x1b[32m✓\x1b[0m', WARN: '\x1b[33m!\x1b[0m', FAIL: '\x1b[31m✗\x1b[0m' };

async function main() {
  const cfg = parseArgs(process.argv);

  // 预检
  try {
    const ping = await fetch(cfg.base, { signal: AbortSignal.timeout(5000) });
    if (!ping.ok) throw new Error('HTTP ' + ping.status);
  } catch {
    console.error(`\x1b[31m服务未启动：${cfg.base}\x1b[0m\n请先 pnpm dev`);
    process.exit(1);
  }

  const combos = [];
  for (const s of cfg.scenes) for (const l of cfg.langs) combos.push({ scene: s, lang: l });
  const rounds = cfg.twice ? 2 : 1;
  const total = combos.length * rounds;

  console.log('='.repeat(72));
  console.log(`  端到端批量冒烟  ${cfg.scenes.length} 场景 × ${cfg.langs.length} 母语 × HSK${cfg.hsk}` +
              `${cfg.twice ? ' × 2轮(缓存验证)' : ''} = ${total} 次真实请求`);
  console.log(`  并发 ${cfg.concurrency}  超时 ${cfg.timeout / 1000}s  ${cfg.base}`);
  console.log('='.repeat(72));

  // 复用一个 learner，避免每次请求都往 learners 表插脏数据
  const results = [];
  let learnerId = cfg.learner;
  let seedKey = null;
  if (!learnerId) {
    process.stdout.write('创建测试学习者... ');
    const seed = await runOne(cfg, cfg.scenes[0], cfg.langs[0], null, 1);
    learnerId = seed.metrics?.learner_id || null;
    console.log(learnerId ? `\x1b[32m${learnerId}\x1b[0m` : '\x1b[33m失败，后续每次新建\x1b[0m');
    console.log(`  ${ICON[seed.level]} ${cfg.scenes[0].padEnd(13)} ${cfg.langs[0].padEnd(6)} r1 ` +
                `${String((seed.ms / 1000).toFixed(1)).padStart(6)}s  ${fmtMetrics(seed)}`);
    seed.issues.forEach((m) => console.log('      ' + color(m)));
    results.push(seed);
    seedKey = `${cfg.scenes[0]}|${cfg.langs[0]}`; // 该组合的第 1 轮已由 seed 覆盖
  }

  // 分批并发（第 2 轮完整跑，用于验证首轮是否成功写入缓存）
  const queue = [];
  for (let r = 1; r <= rounds; r++) {
    for (const c of combos) {
      if (r === 1 && `${c.scene}|${c.lang}` === seedKey) continue;
      queue.push({ ...c, round: r });
    }
  }

  for (let i = 0; i < queue.length; i += cfg.concurrency) {
    const batch = queue.slice(i, i + cfg.concurrency);
    const done = await Promise.all(batch.map((b) => runOne(cfg, b.scene, b.lang, learnerId, b.round)));
    for (const d of done) {
      results.push(d);
      console.log(`  ${ICON[d.level]} ${d.scene.padEnd(13)} ${d.lang.padEnd(6)} r${d.round} ` +
                  `${String((d.ms / 1000).toFixed(1)).padStart(6)}s  ${fmtMetrics(d)}`);
      d.issues.forEach((m) => console.log('      ' + color(m)));
    }
  }

  report(cfg, results);
  process.exit(results.some((r) => r.level === 'FAIL') ? 1 : 0);
}

function fmtMetrics(r) {
  const m = r.metrics || {};
  if (m.confidence == null && !m.exercise_count) return '';
  const parts = [];
  parts.push(`conf=${m.confidence != null ? m.confidence.toFixed(3) : '—'}`);
  parts.push(m.from_cache ? '\x1b[36mcache\x1b[0m' : 'fresh');
  parts.push(`题${m.exercise_count ?? 0}`);
  parts.push(`flag ${m.guardrail_flagged ?? 0}/${m.guardrail_total ?? 0}`);
  if (m.graph_dimension_hint) parts.push('\x1b[35mgraph\x1b[0m');
  return parts.join('  ');
}

function color(msg) {
  if (msg.startsWith('FAIL')) return `\x1b[31m${msg}\x1b[0m`;
  if (msg.startsWith('WARN')) return `\x1b[33m${msg}\x1b[0m`;
  return msg;
}

function report(cfg, results) {
  const pass = results.filter((r) => r.level === 'PASS').length;
  const warn = results.filter((r) => r.level === 'WARN').length;
  const fail = results.filter((r) => r.level === 'FAIL').length;
  const withConf = results.filter((r) => r.metrics?.confidence != null);
  const avgConf = withConf.length
    ? withConf.reduce((s, r) => s + r.metrics.confidence, 0) / withConf.length : 0;
  const avgMs = results.reduce((s, r) => s + r.ms, 0) / (results.length || 1);
  const cacheHit = results.filter((r) => r.metrics?.from_cache).length;
  const graphHit = results.filter((r) => r.metrics?.graph_dimension_hint).length;

  console.log('\n' + '='.repeat(72));
  console.log(`  PASS ${pass}   WARN ${warn}   FAIL ${fail}   / 共 ${results.length}`);
  console.log(`  平均置信度 ${avgConf.toFixed(3)}   平均耗时 ${(avgMs / 1000).toFixed(1)}s`);
  console.log(`  缓存命中 ${cacheHit}/${results.length}   图谱维度注入 ${graphHit}/${results.length}`);
  console.log('='.repeat(72));

  // 高频问题排行
  const freq = {};
  results.flatMap((r) => r.issues).forEach((m) => {
    const key = m.replace(/\d+(\.\d+)?/g, 'N').replace(/".*?"/g, '"…"').slice(0, 70);
    freq[key] = (freq[key] || 0) + 1;
  });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    console.log('\n  高频问题：');
    top.forEach(([k, v]) => console.log(`    ${String(v).padStart(3)}×  ${color(k)}`));
  }

  // 落盘
  const dir = path.resolve(cfg.out);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(dir, `smoke-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    config: cfg,
    summary: { pass, warn, fail, avgConfidence: avgConf, avgMs, cacheHit, graphHit, total: results.length },
    results,
  }, null, 2));

  const md = [
    `# 端到端冒烟报告 ${stamp}`,
    '',
    `- 配置：${cfg.scenes.length} 场景 × ${cfg.langs.length} 母语 × HSK${cfg.hsk}，并发 ${cfg.concurrency}`,
    `- 结果：**PASS ${pass} / WARN ${warn} / FAIL ${fail}**（共 ${results.length}）`,
    `- 平均置信度 ${avgConf.toFixed(3)}，平均耗时 ${(avgMs / 1000).toFixed(1)}s`,
    `- 缓存命中 ${cacheHit}，图谱维度注入 ${graphHit}`,
    '',
    '| 场景 | 母语 | 轮 | 结果 | 耗时 | 置信度 | 缓存 | 题数 | flag | 问题 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      const m = r.metrics || {};
      return `| ${r.scene} | ${r.lang} | ${r.round} | ${r.level} | ${(r.ms / 1000).toFixed(1)}s | ` +
             `${m.confidence != null ? m.confidence.toFixed(3) : '—'} | ${m.from_cache ? '✓' : ''} | ` +
             `${m.exercise_count ?? 0} | ${m.guardrail_flagged ?? 0}/${m.guardrail_total ?? 0} | ` +
             `${r.issues.join('<br>').replace(/\|/g, '\\|') || '—'} |`;
    }),
  ].join('\n');
  const mdPath = path.join(dir, `smoke-${stamp}.md`);
  fs.writeFileSync(mdPath, md);

  console.log(`\n  报告已写入：\n    ${jsonPath}\n    ${mdPath}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
