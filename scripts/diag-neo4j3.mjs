// 只读诊断：导出孤岛KP清单 + 维度池 + HomeCulture池 + 一个已连线KP的子图模板
// 不写库。输出 scripts/neo4j_islands.json
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();
const uri = process.env.NEO4J_URI;
const u = process.env.NEO4J_USERNAME;
const p = process.env.NEO4J_PASSWORD;
if (!uri || !u || !p) { console.error('缺少 NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD'); process.exit(1); }

const driver = neo4j.driver(uri, neo4j.auth.basic(u, p));
const sess = driver.session();

function conv(v) {
  if (v == null) return null;
  if (neo4j.isInt(v)) return v.toNumber();
  if (typeof v === 'object' && 'properties' in v) return conv(v.properties);
  if (Array.isArray(v)) return v.map(conv);
  if (typeof v === 'object') { const r = {}; for (const k of Object.keys(v)) r[k] = conv(v[k]); return r; }
  return v;
}

try {
  // 1. 孤岛KP：没有任何 RELATES_TO 出边
  const islands = await sess.run(`MATCH (kp:KnowledgePoint) WHERE NOT (kp)-[:RELATES_TO]->() RETURN kp`);
  const islandList = islands.records.map(r => conv(r.get('kp')));

  // 2. 维度池
  const dims = await sess.run(`MATCH (cd:CulturalDimension) RETURN cd`);
  const dimList = dims.records.map(r => conv(r.get('cd')));

  // 3. HomeCulture池
  const hcs = await sess.run(`MATCH (hc:HomeCulture) RETURN hc`);
  const hcList = hcs.records.map(r => conv(r.get('hc')));

  // 4. 模板：已连线KP的完整四跳子图（含CulturalConcept属性）
  const tmpl = await sess.run(`
    MATCH (kp:KnowledgePoint)-[:RELATES_TO]->(cc:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)
    WITH kp, collect({cc: cc, cd: cd}) AS chain
    WHERE size(chain) > 0
    RETURN kp, chain LIMIT 2
  `);
  const templates = tmpl.records.map(r => ({ kp: conv(r.get('kp')), chain: conv(r.get('chain')) }));

  // 5. 现有CulturalConcept结构样例（看属性key）
  const ccSamp = await sess.run(`MATCH (cc:CulturalConcept) RETURN cc LIMIT 3`);
  const ccSamples = ccSamp.records.map(r => conv(r.get('cc')));

  const out = {
    islandCount: islandList.length,
    islands: islandList,
    dims: dimList,
    hcs: hcList,
    ccSamples,
    templates,
  };
  writeFileSync('scripts/neo4j_islands.json', JSON.stringify(out, null, 2));

  console.log('孤岛KP数:', islandList.length);
  console.log('维度池:', dimList.map(d => `${d.id}:${d.name || ''}`).join(' | '));
  console.log('HomeCulture池:', hcList.map(h => `${h.id}:${h.name || ''}`).join(' | '));
  console.log('\n=== 模板KP子图(第1个) ===');
  console.log(JSON.stringify(templates[0], null, 2));
  console.log('\n=== CulturalConcept 现有属性样例 ===');
  console.log(JSON.stringify(ccSamples, null, 2));
} catch (e) {
  console.error('诊断失败:', e.message);
} finally {
  await sess.close();
  await driver.close();
}
