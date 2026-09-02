// 缓存跨语言污染 —— 正式修法（修正版）
// 上一版迁移只删了 contype='u' 的约束，但 llm_content_cache 的唯一性其实是
// PRIMARY KEY pk_llm_cache (kp, hsk, scene)，contype='p'，且 DROP INDEX 对 PK 支撑索引会报错，
// 导致 3 列唯一性从未被真正移除。本脚本修正：
//  1) DROP CONSTRAINT pk_llm_cache（真正的 3 列唯一性来源）
//  2) 把所有 target_culture 为 NULL 的行回填为 'unknown'
//  3) ALTER COLUMN target_culture SET NOT NULL DEFAULT 'unknown'，杜绝空语言污染
//  4) 保留 4 列唯一索引 llm_content_cache_kp_hsk_scene_culture 作为唯一性保障
// 幂等：全部 IF EXISTS / 容错。
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const stmts = [
  `ALTER TABLE llm_content_cache DROP CONSTRAINT IF EXISTS pk_llm_cache;`,
  `UPDATE llm_content_cache SET target_culture = 'unknown' WHERE target_culture IS NULL;`,
  `ALTER TABLE llm_content_cache ALTER COLUMN target_culture SET DEFAULT 'unknown';`,
  `ALTER TABLE llm_content_cache ALTER COLUMN target_culture SET NOT NULL;`,
];

let ok = 0;
for (const sql of stmts) {
  const { error } = await sb.rpc('exec_sql', { query: sql });
  if (error) {
    console.error(`✗ 失败: ${sql.slice(0, 70)}...\n   ${error.message}`);
  } else {
    console.log(`✓ 成功: ${sql.split('\n')[0].slice(0, 70)}`);
    ok++;
  }
}
console.log(`\n--- PK 修正迁移：${ok}/${stmts.length} 条成功 ---`);
console.log('注意：exec_sql 会吞掉报错只返回 success，请以 verify-cache-pk.mjs 功能测试为准。');
