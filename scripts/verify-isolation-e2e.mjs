// 端到端跨语言隔离验证（正式修法的最终证明）
// 步骤：
//   1) 真实 POST /api/learning：日语 daily HSK3  → 写缓存行(target_culture=日语)
//   2) 真实 POST /api/learning：英语 daily HSK3   → 不应命中日语行，重新生成并写自己的行(target_culture=英语)
//   3) 查 DB：同一 (kp, hsk, scene) 下是否出现两条 target_culture 不同的行
//        - 出现 2 行 → 正式修法生效（每种语言独立缓存行）
//        - 只有 1 行 → 仍被 3 列键合并，污染未消除（stopgap 只是临时兜底）
//   4) 校验两次响应的 A2 母语阐释文本确实不同（无语言串味）
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
const BASE = 'http://localhost:5000';

async function post(lang, scene, hsk, learnerId) {
  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/learning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      learner_id: learnerId || 'new',
      knowledge_point_id: scene,
      hsk_level: hsk,
      native_language: lang,
      learning_motivation: 'interest',
      use_langgraph: true,
    }),
  });
  const json = await resp.json();
  const d = json.data || {};
  const kpId = d.knowledge_point?.id ?? d.knowledge_point_id ?? scene;
  const explain = String(d.cultural_explanation ?? d.learning_content?.cultural_explanation ?? '');
  return {
    lang, ms: Date.now() - t0,
    ok: resp.ok && json.success,
    fromCache: !!d.from_cache,
    kpId,
    explainHead: explain.slice(0, 80),
  };
}

(async () => {
  console.log('① 日语 daily HSK3（冷生成）...');
  const ja = await post('日语', 'daily', 3);
  console.log(`   结果: ok=${ja.ok} from_cache=${ja.fromCache} kp=${ja.kpId} 用时${(ja.ms/1000).toFixed(1)}s`);
  console.log(`   A2阐释头: ${ja.explainHead}`);

  console.log('\n② 英语 daily HSK3（应独立生成，不命中日语行）...');
  const en = await post('英语', 'daily', 3);
  console.log(`   结果: ok=${en.ok} from_cache=${en.fromCache} kp=${en.kpId} 用时${(en.ms/1000).toFixed(1)}s`);
  console.log(`   A2阐释头: ${en.explainHead}`);

  // ③ DB 验证：同一 kp+hsk 下不同 target_culture 的行数
  const kp = en.kpId;
  const { data: rows, error } = await sb
    .from('llm_content_cache')
    .select('knowledge_point_id, hsk_level, scene_id, target_culture, status')
    .eq('knowledge_point_id', kp)
    .in('target_culture', ['日语', '英语']);
  if (error) { console.error('DB 查询失败:', error.message); process.exit(1); }

  // 只看 hsk=3 的行
  const hsk3 = (rows || []).filter(r => r.hsk_level === 3);
  console.log(`\n③ DB 验证：kp=${kp} hsk=3 且 target_culture∈{日语,英语} 共 ${hsk3.length} 行`);
  hsk3.forEach(r => console.log(`   - scene=${r.scene_id} target_culture=${r.target_culture} status=${r.status}`));

  const langs = new Set(hsk3.map(r => r.target_culture));
  if (hsk3.length >= 2 && langs.has('日语') && langs.has('英语')) {
    console.log('\n✅ 正式修法生效：同 kp+hsk+scene 下日语/英语各占独立缓存行，跨语言污染已彻底隔离。');
  } else {
    console.log('\n❌ 隔离未完成：仍只有单一语言行，跨语言污染未消除。');
  }

  // ④ 内容差异检查
  if (ja.explainHead && en.explainHead && ja.explainHead !== en.explainHead) {
    console.log('✅ 两次响应的 A2 母语阐释内容不同，无语言串味。');
  } else {
    console.log('⚠️ 两次响应 A2 阐释头相同，需人工确认是否串味。');
  }
})();
