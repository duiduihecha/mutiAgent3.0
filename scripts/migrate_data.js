#!/usr/bin/env node
/**
 * 数据迁移：volces 旧库 → supabase.co 新库
 * 用法: node scripts/migrate_data.js
 */
const { createClient } = require('@supabase/supabase-js');

const OLD_URL = 'https://br-zesty-loon-cb5357b0.supabase2.aidap-global.cn-beijing.volces.com';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNTY3Mzg2NzIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.UVgtM5wgU-WSB4yBuC1s2P0VT8jaxIbD5gF9DOAa-d0';

const NEW_URL = 'https://bhxtvcaejtexlqqzxflo.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeHR2Y2FlanRleGxxcXp4ZmxvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg2NDA1OSwiZXhwIjoyMDk1NDQwMDU5fQ.hv-7eDATi-O_JtKiTtY_wyYxPE3Pi-9lawdCuf4tX2s';

const oldClient = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newClient = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

async function clearNewDB() {
  const tables = [
    'llm_content_cache', 'agent_messages', 'learner_profile_snapshots',
    'assessment_records', 'learning_records', 'cross_cultural_comparisons',
    'cultural_explanations', 'cultural_knowledge_points', 'learners'
  ];
  for (const t of tables) {
    const { data } = await newClient.from(t).select('id').limit(1000);
    if (data && data.length > 0) {
      const ids = data.map(r => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        await newClient.from(t).delete().in('id', ids.slice(i, i + 100));
      }
    }
    console.log(`  🗑️ ${t}: 已清空 ${data?.length || 0} 行`);
  }
}

async function fetchAll(tableName) {
  let allRows = [];
  let from = 0;
  const pageSize = 200;
  while (true) {
    const { data, error } = await oldClient.from(tableName).select('*').range(from, from + pageSize - 1);
    if (error) { console.log(`  ⚠️ 读取失败: ${error.message}`); return []; }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    from += data.length;
    if (data.length < pageSize) break;
  }
  return allRows;
}

async function migrateTable(tableName, options = {}) {
  const { skipColumns = [], transform = null, onConflict = 'id', onConflictFallback = null } = options;
  console.log(`\n📦 迁移 ${tableName}...`);

  const rows = await fetchAll(tableName);
  console.log(`  读取 ${rows.length} 行`);
  if (rows.length === 0) return { read: 0, written: 0, skipped: 0 };

  // 清洗列：先 transform 再去掉 skipColumns
  let processed = rows;
  if (transform) {
    processed = processed.map(transform);
  }
  const cleaned = processed.map(row => {
    const c = { ...row };
    for (const col of skipColumns) delete c[col];
    return c;
  });

  let written = 0, skipped = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const row = cleaned[i];
    const { error } = await newClient.from(tableName).upsert(row, { onConflict });
    if (!error) {
      written++;
    } else if (error.code === '23505' && onConflictFallback) {
      // 唯一约束冲突，尝试 fallback conflict key
      const { error: e2 } = await newClient.from(tableName).upsert(row, { onConflict: onConflictFallback });
      if (!e2) written++;
      else { skipped++; if (skipped <= 5) console.log(`  ⚠️ row ${i}: ${e2.message}`); }
    } else {
      skipped++;
      if (skipped <= 5) console.log(`  ⚠️ row ${i} [${error.code}]: ${error.message}`);
    }
  }
  console.log(`  ✅ ${written} 写 / ${skipped} 跳过`);
  return { read: rows.length, written, skipped };
}

async function main() {
  console.log('🚀 数据迁移 volces → supabase.co\n');

  console.log('🧹 清空新库...');
  await clearNewDB();

  const results = {};

  // 1. learners — 先按 id 写入，uid 冲突时按 uid 更新
  console.log('\n--- 第一批：无依赖表 ---');
  results.learners = await migrateTable('learners', {
    skipColumns: ['profile_snapshots'],
    onConflict: 'uid',  // 按 UID 去重，避免同 UID 不同 ID 冲突
  });

  results.cultural_knowledge_points = await migrateTable('cultural_knowledge_points');
  results.cross_cultural_comparisons = await migrateTable('cross_cultural_comparisons');

  // 2. 依赖表
  console.log('\n--- 第二批：依赖 learners ---');
  results.learning_records = await migrateTable('learning_records', {
    transform: (row) => ({
      ...row,
      knowledge_point_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.knowledge_point_id) ? row.knowledge_point_id : null,
      scene_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.scene_id) ? row.scene_id : null
    })
  });
  results.assessment_records = await migrateTable('assessment_records');
  results.learner_profile_snapshots = await migrateTable('learner_profile_snapshots');

  console.log('\n--- 第三批：依赖 knowledge_points ---');
  results.cultural_explanations = await migrateTable('cultural_explanations');

  console.log('\n--- 第四批：其他 ---');
  results.agent_messages = await migrateTable('agent_messages');
  results.llm_content_cache = await migrateTable('llm_content_cache', {
    skipColumns: ['id'],
    onConflict: 'knowledge_point_id,hsk_level,scene_id'
  });

  // 汇总
  console.log('\n📊 迁移汇总:');
  let totalRead = 0, totalWritten = 0, totalSkipped = 0;
  for (const [name, r] of Object.entries(results)) {
    console.log(`  ${name}: ${r.read} 读 → ${r.written} 写 / ${r.skipped} 跳过`);
    totalRead += r.read;
    totalWritten += r.written;
    totalSkipped += r.skipped;
  }
  console.log(`  总计: ${totalRead} → ${totalWritten} (${totalSkipped} 跳过)`);
}

main().catch(console.error);
