// 验证 llm_content_cache 是否还存在旧的 3 列唯一约束（PRIMARY KEY pk_llm_cache）。
// 原理：用同一 (kp, hsk, scene) + 不同 target_culture 插入两行。
//  - 若 3 列 PK 仍在 → 第二行插入报 unique_violation（23505），证明跨语言仍被禁止（修复失败）。
//  - 若已彻底改为 4 列唯一索引 → 两行都插入成功，证明每种语言可独立缓存（修复成功）。
// 无论结果如何，脚本最后清理掉测试行。
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const SENTINEL = 'verify_culture_pk_' + Date.now();
const SCENE = 'general';
const HSK = 3;

async function cleanup() {
  await sb.from('llm_content_cache').delete().eq('knowledge_point_id', SENTINEL);
}

(async () => {
  try {
    // 行 1：英语
    const r1 = await sb.from('llm_content_cache').insert({
      knowledge_point_id: SENTINEL, hsk_level: HSK, scene_id: SCENE, target_culture: '英语',
      content_payload: { probe: 'row1' }, confidence_score: 0.99, status: 'ACTIVE',
    });
    if (r1.error) { console.log(`[行1 英语] 插入失败: ${r1.error.code} ${r1.error.message}`); await cleanup(); return; }
    console.log('[行1 英语] 插入成功 ✓');

    // 行 2：日语（同 kp+hsk+scene，不同语言）
    const r2 = await sb.from('llm_content_cache').insert({
      knowledge_point_id: SENTINEL, hsk_level: HSK, scene_id: SCENE, target_culture: '日语',
      content_payload: { probe: 'row2' }, confidence_score: 0.99, status: 'ACTIVE',
    });
    if (r2.error) {
      console.log(`\n❌ 修复未完成：3 列唯一约束仍在！`);
      console.log(`   行2(日语) 插入报 ${r2.error.code}: ${r2.error.message}`);
      console.log(`   结论：同 kp+hsk+scene 只允许一种语言，跨语言污染未在 DB 层隔离。`);
    } else {
      console.log('[行2 日语] 插入成功 ✓');
      console.log(`\n✅ 修复完成：同 kp+hsk+scene 不同 target_culture 可各自独立缓存，跨语言隔离 OK。`);
    }
  } catch (e) {
    console.error('异常:', e);
  } finally {
    await cleanup();
    console.log('[清理] 测试行已删除。');
  }
})();
