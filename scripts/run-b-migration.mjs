// B 线迁移：修复 Supabase 线上 schema drift
// 1) assessment_records 加 cumulative_correct / memory_strength 两列（L2 持久化 → A1 历史可读）
// 2) learning_records 删 scene_id 外键（scenes 表已损坏，去掉失效依赖）
// 3) learning_records 删 knowledge_point_id 外键（场景型 KP id 如 daily_greet_basic 不在
//    cultural_knowledge_points 中，插入练习记录时外键冲突导致 L1 永远失败）
// 幂等：所有操作带 IF NOT EXISTS / IF EXISTS，可重复执行。
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const stmts = [
  `ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS cumulative_correct bigint DEFAULT 0;`,
  `ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS memory_strength numeric DEFAULT 30;`,
  `ALTER TABLE learning_records DROP CONSTRAINT IF EXISTS learning_records_scene_id_fkey;`,
  `ALTER TABLE learning_records DROP CONSTRAINT IF EXISTS learning_records_knowledge_point_id_fkey;`,
];

let ok = 0;
for (const sql of stmts) {
  const { error } = await sb.rpc('exec_sql', { query: sql });
  if (error) {
    console.error(`✗ 失败: ${sql}\n   ${error.message}`);
  } else {
    console.log(`✓ 成功: ${sql}`);
    ok++;
  }
}

// 验证：读回结构确认
const { data, error: e2 } = await sb.from('assessment_records').select('*').limit(1);
if (!e2 && data) {
  const cols = Object.keys(data[0] || {});
  console.log(`\n[验证] assessment_records 含 cumulative_correct=${cols.includes('cumulative_correct')}, memory_strength=${cols.includes('memory_strength')}`);
}

console.log(`\n--- 迁移完成：${ok}/${stmts.length} 条成功 ---`);
