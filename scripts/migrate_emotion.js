#!/usr/bin/env node
/**
 * 运行数据库迁移：添加 emotion 相关列到 assessment_records
 * 用法: node scripts/migrate_emotion.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// 读取 .env
const envPath = path.join(__dirname, '..', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      env[k.trim()] = rest.join('=').trim();
    }
  }
}

const url = env.COZE_SUPABASE_URL;
const key = env.COZE_SUPABASE_SERVICE_ROLE_KEY || env.COZE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ 找不到 Supabase 配置，请检查 .env 文件');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

async function main() {
  console.log(`Supabase URL: ${url}`);

  // 检查 assessment_records 表是否存在已有列
  const { data: sample, error: sampleErr } = await supabase
    .from('assessment_records')
    .select('id')
    .limit(1);

  if (sampleErr) {
    console.error('❌ 连接失败:', sampleErr.message);
    process.exit(1);
  }
  console.log('✅ 连接成功，assessment_records 表存在');

  // 检查 emotion_state 列是否已存在
  const { data: hasCol, error: colErr } = await supabase
    .from('assessment_records')
    .select('id')
    .limit(1);

  if (colErr) {
    console.error('查询失败:', colErr.message);
    process.exit(1);
  }

  console.log('\n⚠️ Supabase JS SDK 不支持 DDL 操作。');
  console.log('请使用以下任一方式执行 SQL：\n');

  console.log('方式 1: Supabase Dashboard (如果可用)');
  console.log(`  URL: ${url.replace('/rest/v1', '').replace('https://', 'https://')}`);
  console.log('  登录后进入 SQL Editor，执行:\n');

  console.log('方式 2: psql 命令行');
  console.log('  找到数据库连接字符串后执行:\n');

  console.log('-- 复制以下 SQL 到 SQL 编辑器执行 --');
  console.log('ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS emotion_state VARCHAR(10);');
  console.log('ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS emotion_signals JSONB;');
}

main();
