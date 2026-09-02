// 补丁：给"半连线"KP（有RELATES_TO但CC没挂HAS_DIMENSION）补维度边
// 这些KP是之前种子数据遗留，被主seed脚本的"孤岛"筛选跳过了。
// 用法: node scripts/seed-graph-edges-patch.mjs [--apply]
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { requireApprovedLLMExecution } from './lib/llm-execution-gate.mjs';
config();
const DRY = !process.argv.includes('--apply');

const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const sess = driver.session();

// 1. 查缺口KP + 维度池
const gap = await sess.run(`
  MATCH (kp:KnowledgePoint)-[:RELATES_TO]->(cc:CulturalConcept)
  WHERE NOT (cc)-[:HAS_DIMENSION]->(:CulturalDimension)
  WITH DISTINCT kp
  RETURN kp
`);
const islands = gap.records.map(r => {
  const p = r.get('kp');
  return { id: p.properties.id, name: p.properties.name, hsk_level: p.properties.hsk_level, pragmatic_intent: p.properties.pragmatic_intent || '' };
});

const dimsR = await sess.run('MATCH (cd:CulturalDimension) RETURN cd');
const dims = dimsR.records.map(r => { const p = r.get('cd').properties; return { id: p.id, name: p.name, short_def: p.short_def || '' }; });
const dimIds = new Set(dims.map(d => d.id));
const dimInfo = dims.map(d => `${d.id} (${d.name}): ${String(d.short_def).slice(0, 60)}`).join('\n');

// 2. LLM 判定
const DS_BASE = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
const DS_URL = DS_BASE.endsWith('/chat/completions') ? DS_BASE : DS_BASE.replace(/\/$/, '') + '/chat/completions';
const DS_KEY = process.env.DEEPSEEK_API_KEY;

async function askDS(batch) {
  requireApprovedLLMExecution('seed-graph-edges-patch');
  const kpText = batch.map(kp => `- id=${kp.id} | name=${kp.name} | hsk=${kp.hsk_level ?? ''} | 意图=${String(kp.pragmatic_intent || '').slice(0, 140)}`).join('\n');
  const sys = `你是跨文化中文教育知识图谱标注专家。给定中文知识点和Hofstede式文化维度列表，为每个知识点判定最相关的1~3个维度(基于中外文化对比最易冲突的维度)。只能从给定id中选。输出JSON: {"assignments":[{"kp_id":"...","dim_ids":["dim_x"]}]}`;
  const usr = `可选维度(只选这些id):\n${dimInfo}\n\n待标注:\n${kpText}\n\n输出JSON。`;
  const resp = await fetch(DS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DS_KEY}` }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.2, response_format: { type: 'json_object' } }) });
  const text = await resp.text();
  if (!resp.ok) { console.error(`[DS] HTTP ${resp.status}:`, text.slice(0, 300)); process.exit(1); }
  let j; try { j = JSON.parse(text); } catch (e) { console.error('非JSON:', text.slice(0, 300)); return { assignments: [] }; }
  const c = j.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(c); } catch { return { assignments: [] }; }
}

const plan = [];
for (let i = 0; i < islands.length; i += 12) {
  const batch = islands.slice(i, i + 12);
  const res = await askDS(batch);
  for (const a of (res.assignments || [])) {
    const valid = (a.dim_ids || []).filter(id => dimIds.has(id));
    if (valid.length) plan.push({ kpId: a.kp_id, kpName: (islands.find(k => k.id === a.kp_id)?.name) || a.kp_id, dimIds: valid });
  }
}

console.log(`\n=== 补丁计划: ${plan.length}/${islands.length} 个半连线KP ===`);
const edge = plan.reduce((s, p) => s + p.dimIds.length, 0);
console.log(`将新建 CulturalConcept ${edge} 个 | RELATES_TO ${plan.length} | HAS_DIMENSION ${edge}`);
for (const p of plan) console.log(`  ${p.kpName} (${p.kpId}) -> ${p.dimIds.join(', ')}`);

if (DRY) { console.log('\n[DRY-RUN] 未写库。加 --apply 执行。'); await sess.close(); await driver.close(); process.exit(0); }

// 3. 写库 (per-dim CC, 不冲突旧per-culture CC)
for (const p of plan) {
  const kp = islands.find(k => k.id === p.kpId);
  const hsk = kp?.hsk_level ?? 1;
  for (const dimId of p.dimIds) {
    const dim = dims.find(d => d.id === dimId);
    const ccId = `cc_${p.kpId}_${dimId}`;
    const ccName = `${p.kpName} · ${dim?.name || dimId}`;
    await sess.run(`
      MERGE (kp:KnowledgePoint {id:$kpId})
      MERGE (cc:CulturalConcept {id:$ccId})
      SET cc.name=$ccName, cc.knowledge_point_id=$kpId, cc.hsk_level=$hsk, cc.home_culture_id='generic', cc.home_culture_code='generic', cc.updated_at=datetime()
      MERGE (kp)-[:RELATES_TO]->(cc)
      WITH cc
      MATCH (cd:CulturalDimension {id:$dimId})
      MERGE (cc)-[:HAS_DIMENSION {weight:0.8}]->(cd)
    `, { kpId: p.kpId, ccId, ccName, hsk, dimId });
  }
}
console.log('\n[APPLY] 补丁完成');
await sess.close();
await driver.close();
