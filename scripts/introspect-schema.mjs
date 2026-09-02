// 只读：通过 SELECT * 探测 Supabase 线上表真实列结构
// 不修改任何数据，仅打印列名 + 样本值，用于定位 B 线 schema drift
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

async function probe(table) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) { console.log(`\n[${table}] SELECT 失败: ${error.message}`); return; }
  const row = (data && data[0]) || {};
  const cols = Object.keys(row);
  console.log(`\n=== ${table} 真实列 (${cols.length}) ===`);
  for (const c of cols) {
    const v = row[c];
    const sample = typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v ?? '∅').slice(0, 40);
    console.log(`  - ${c}  =  ${sample}`);
  }
}

async function distinctScene() {
  const { data, error } = await sb.from('learning_records').select('scene_id').limit(50);
  if (error) { console.log(`\nscene_id 采样失败: ${error.message}`); return; }
  const vals = [...new Set((data || []).map(r => r.scene_id).filter(Boolean))];
  console.log(`\n=== learning_records.scene_id 去重样本 (${vals.length}) ===`);
  console.log('  ' + vals.slice(0, 20).join(', '));
}

console.log('--- 只读探测开始 ---');
await probe('assessment_records');
await probe('learning_records');
await distinctScene();
console.log('\n--- 只读探测结束，未修改任何数据 ---');
