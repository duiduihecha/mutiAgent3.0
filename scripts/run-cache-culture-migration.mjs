// 缓存跨语言污染 —— 正式修法迁移
// 给 llm_content_cache 加 target_culture 列，并把它纳入唯一约束，
// 让每种语言 (kp, hsk, scene, target_culture) 各自一条缓存行，彻底隔离跨语言污染。
// 幂等：所有操作带 IF NOT EXISTS / IF EXISTS / 动态查找，可重复执行。
//
// 步骤：
//  1) 动态删掉旧的 3 列唯一约束/索引（按 conkey 长度=3 或 indexdef 含 3 列且不含 target_culture 精确定位）
//  2) ADD COLUMN target_culture
//  3) 回填：从 content_payload->>'target_culture' 取，取不到标 'unknown'
//  4) CREATE UNIQUE INDEX on (kp, hsk, scene, target_culture)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const stmts = [
  // 1) 动态 drop 旧 3 列唯一约束/索引（不依赖具体名字）
  `DO $$
DECLARE
  obj text;
BEGIN
  SELECT conname INTO obj FROM pg_constraint
  WHERE conrelid = 'llm_content_cache'::regclass AND contype = 'u'
    AND array_length(conkey,1) = 3;
  IF obj IS NOT NULL THEN
    EXECUTE format('ALTER TABLE llm_content_cache DROP CONSTRAINT %I', obj);
    RAISE NOTICE 'dropped constraint %', obj;
  END IF;
  SELECT indexname INTO obj FROM pg_indexes
  WHERE tablename = 'llm_content_cache'
    AND indexdef LIKE '%knowledge_point_id%'
    AND indexdef LIKE '%hsk_level%'
    AND indexdef LIKE '%scene_id%'
    AND indexdef NOT LIKE '%target_culture%';
  IF obj IS NOT NULL THEN
    EXECUTE format('DROP INDEX IF EXISTS %I', obj);
    RAISE NOTICE 'dropped index %', obj;
  END IF;
END $$;`,

  // 2) 加列
  `ALTER TABLE llm_content_cache ADD COLUMN IF NOT EXISTS target_culture text;`,

  // 3) 回填：从 content_payload 取语言，取不到标 'unknown'
  `UPDATE llm_content_cache
   SET target_culture = COALESCE(content_payload->>'target_culture', 'unknown')
   WHERE target_culture IS NULL;`,

  // 4) 新建 4 列唯一索引（每种语言独立缓存行）
  `CREATE UNIQUE INDEX IF NOT EXISTS llm_content_cache_kp_hsk_scene_culture
   ON llm_content_cache (knowledge_point_id, hsk_level, scene_id, target_culture);`,
];

let ok = 0;
for (const sql of stmts) {
  const { error } = await sb.rpc('exec_sql', { query: sql });
  if (error) {
    console.error(`✗ 失败: ${sql.slice(0, 80)}...\n   ${error.message}`);
  } else {
    console.log(`✓ 成功: ${sql.split('\n')[0].slice(0, 70)}`);
    ok++;
  }
}

// 验证：通过 REST 读回，确认列存在且有值
const { data, error: e2 } = await sb.from('llm_content_cache').select('target_culture').limit(5);
if (!e2 && data) {
  const vals = data.map(d => d.target_culture);
  console.log(`\n[验证] 抽样 target_culture 值: ${JSON.stringify(vals)}`);
  const distinct = [...new Set(vals)];
  console.log(`[验证] 含目标语言: ${distinct.join(', ')}`);
} else {
  console.error('[验证] 读取失败:', e2?.message);
}

console.log(`\n--- 迁移完成：${ok}/${stmts.length} 条成功 ---`);
