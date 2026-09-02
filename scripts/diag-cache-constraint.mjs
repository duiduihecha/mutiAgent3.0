// 诊断 llm_content_cache 上现有的唯一约束/索引名（DROP 时要精确）
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();
const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const q1 = `SELECT conname FROM pg_constraint WHERE conrelid = 'llm_content_cache'::regclass AND contype = 'u';`;
const { data: cons, error: ce } = await sb.rpc('exec_sql', { query: q1 });
console.log('唯一约束(pg_constraint):', JSON.stringify(cons), ce?.message || '');

const q2 = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'llm_content_cache';`;
const { data: idx, error: ie } = await sb.rpc('exec_sql', { query: q2 });
console.log('索引(pg_indexes):', JSON.stringify(idx), ie?.message || '');

const { data: cols, error: cole } = await sb.rpc('exec_sql', { query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'llm_content_cache' ORDER BY ordinal_position;` });
console.log('列:', JSON.stringify(cols), cole?.message || '');
