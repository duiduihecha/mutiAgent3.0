// 批量补图谱边：给孤岛 KnowledgePoint 连 RELATES_TO -> CulturalConcept -> HAS_DIMENSION -> CulturalDimension
// 数据模型对齐现有已连线KP（见 scripts/neo4j_islands.json 模板）：
//   KnowledgePoint -[:RELATES_TO]-> CulturalConcept -[:HAS_DIMENSION {weight}]-> CulturalDimension
// 维度判定由 DeepSeek 完成（每个KP选1~3个Hofstede维度），属于语义标注，非编造事实。
// MANIFESTED_IN（维度→母语冲突点）已有通用兜底数据，本次不动，A2检索不受影响。
//
// 用法:
//   node scripts/seed-graph-edges.mjs             # dry-run：调LLM+打印计划，不写库
//   node scripts/seed-graph-edges.mjs --apply    # 真正写库（MERGE，幂等可重跑）
//   node scripts/seed-graph-edges.mjs --limit 12 # 只处理前12个KP（验证用）
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { requireApprovedLLMExecution } from './lib/llm-execution-gate.mjs';

config();
const DRY = !process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity;

// ---- 1. 读导出数据 ----
const data = JSON.parse(readFileSync('scripts/neo4j_islands.json', 'utf8'));
const islands = data.islands.slice(0, LIMIT);
const dims = data.dims || [];
const dimIds = new Set(dims.map(d => d.id));
const dimInfo = dims.map(d => `${d.id} (${d.name}): ${(d.short_def || '').slice(0, 60)}`).join('\n');

// ---- 2. DeepSeek 批量判定维度 ----
const DS_BASE = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
const DS_URL = DS_BASE.endsWith('/chat/completions') ? DS_BASE : DS_BASE.replace(/\/$/, '') + '/chat/completions';
const DS_KEY = process.env.DEEPSEEK_API_KEY;
if (!DS_KEY) { console.error('缺少 DS_API_KEY'); process.exit(1); }

async function askDS(batch) {
  requireApprovedLLMExecution('seed-graph-edges');
  const kpText = batch.map(kp =>
    `- id=${kp.id} | name=${kp.name || ''} | hsk=${kp.hsk_level ?? ''} | 意图=${String(kp.pragmatic_intent || kp.description || kp.topic || '').slice(0, 140)}`
  ).join('\n');
  const sys = `你是跨文化中文教育知识图谱的标注专家。给定一系列中文知识点(KnowledgePoint)和一组Hofstede式文化维度，请为每个知识点判定它最相关的1~3个文化维度(基于该知识点在中外文化对比中最容易产生误解或冲突的维度)。只能从给定维度列表中选择id，不要编造维度。输出严格JSON: {"assignments":[{"kp_id":"...","dim_ids":["dim_x"]}]}`;
  const usr = `可选文化维度列表(只能选这些id):\n${dimInfo}\n\n待标注知识点:\n${kpText}\n\n请输出JSON。`;
  const resp = await fetch(DS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DS_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  const text = await resp.text();
  if (!resp.ok) { console.error(`[DS] HTTP ${resp.status}:`, text.slice(0, 400)); process.exit(1); }
  let j;
  try { j = JSON.parse(text); } catch (e) { console.error('[DS] 非JSON响应:', text.slice(0, 400)); process.exit(1); }
  const content = j.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(content); } catch (e) { console.error('JSON解析失败:', content.slice(0, 200)); return { assignments: [] }; }
}

const BATCH = 12;
const plan = [];
for (let i = 0; i < islands.length; i += BATCH) {
  const batch = islands.slice(i, i + BATCH);
  const res = await askDS(batch);
  for (const a of (res.assignments || [])) {
    const valid = (a.dim_ids || []).filter(id => dimIds.has(id));
    if (valid.length) {
      const kp = islands.find(k => k.id === a.kp_id);
      plan.push({ kpId: a.kp_id, kpName: (kp?.name) || a.kp_id, dimIds: valid });
    }
  }
  console.error(`批次 ${Math.floor(i / BATCH) + 1}/${Math.ceil(islands.length / BATCH)} 完成`);
}

console.log(`\n=== 计划: 将为 ${plan.length}/${islands.length} 个KP建立维度关联 ===`);
const edgeCount = plan.reduce((s, p) => s + p.dimIds.length, 0);
console.log(`预计新建/合并 CulturalConcept 节点: ${edgeCount} 个 | RELATES_TO 边: ${plan.length} 条 | HAS_DIMENSION 边: ${edgeCount} 条`);
console.log('样例(前8):');
for (const p of plan.slice(0, 8)) console.log(`  ${p.kpName} (${p.kpId}) -> ${p.dimIds.join(', ')}`);

if (DRY) { console.log('\n[DRY-RUN] 未写库。加 --apply 执行。'); process.exit(0); }

// ---- 3. 写库 ----
const uri = process.env.NEO4J_URI, u = process.env.NEO4J_USERNAME, pw = process.env.NEO4J_PASSWORD;
if (!uri || !u || !pw) { console.error('缺少 NEO4J env'); process.exit(1); }
const driver = neo4j.driver(uri, neo4j.auth.basic(u, pw));
const sess = driver.session();
let createdCC = 0, createdRel = 0;
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
      SET cc.name=$ccName, cc.knowledge_point_id=$kpId, cc.hsk_level=$hsk,
          cc.home_culture_id='generic', cc.home_culture_code='generic', cc.updated_at=datetime()
      MERGE (kp)-[:RELATES_TO]->(cc)
      WITH cc
      MATCH (cd:CulturalDimension {id:$dimId})
      MERGE (cc)-[:HAS_DIMENSION {weight:0.8}]->(cd)
    `, { kpId: p.kpId, ccId, ccName, hsk, dimId });
    createdCC++; createdRel += 2;
  }
}
console.log(`\n[APPLY] 完成: CulturalConcept ${createdCC} 个, 关系 ${createdRel} 条`);
await sess.close();
await driver.close();
