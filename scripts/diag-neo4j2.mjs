// 只读诊断 2：定位断点——知识点到底连没连到文化维度
import { config } from 'dotenv';
config();
import neo4j from 'neo4j-driver';
const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const s = driver.session();
async function run(label, cypher, params = {}) {
  try {
    const res = await s.run(cypher, params);
    const rows = res.records.map(r => { const o = {}; for (const k of r.keys) { const v = r.get(k); o[k] = (v && typeof v === 'object' && 'toNumber' in v) ? v.toNumber() : (v && typeof v === 'object' && v.properties ? v.properties : v); } return o; });
    console.log(`\n=== ${label} ===`);
    console.log(rows.length ? JSON.stringify(rows.slice(0, 40), null, 2) : '  (0 行)');
  } catch (e) { console.log(`\n=== ${label} === [失败] ${e.message}`); }
}
try {
  // transport 的所有出边 + 目标标签
  await run('A. transport_subway_basic 所有出边',
    `MATCH (kp:KnowledgePoint {id:$kp})-[r]->(x) RETURN type(r) AS rel, labels(x) AS tgt, count(*) AS c`, { kp: 'transport_subway_basic' });
  await run('A2. transport 是否有 RELATES_TO→CulturalConcept',
    `MATCH (kp:KnowledgePoint {id:$kp})-[:RELATES_TO]->(cc:CulturalConcept) RETURN cc.name AS cc LIMIT 10`, { kp: 'transport_subway_basic' });

  // 全局：有多少 KP 真正连到了 CulturalDimension（四跳链能跑通的）
  await run('B. 全局四跳链能跑通的 KP 数',
    `MATCH (kp:KnowledgePoint)-[:RELATES_TO]->(:CulturalConcept)-[:HAS_DIMENSION]->(:CulturalDimension)
     RETURN count(DISTINCT kp) AS wired_kps`);
  await run('B2. 全局 KP 总数',
    `MATCH (kp:KnowledgePoint) RETURN count(kp) AS total_kps`);

  // 全局：RELATES_TO 边数 / HAS_DIMENSION 边数
  await run('C. RELATES_TO 边总数',
    `MATCH ()-[r:RELATES_TO]->() RETURN count(r) AS c`);
  await run('C2. HAS_DIMENSION 边总数',
    `MATCH ()-[r:HAS_DIMENSION]->() RETURN count(r) AS c`);

  // 找一个"连上了"的 KP 作对照
  await run('D. 抽一个能跑通四跳链的 KP 示例',
    `MATCH (kp:KnowledgePoint)-[:RELATES_TO]->(:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)
     RETURN DISTINCT kp.id AS kp, collect(cd.name) AS dims LIMIT 8`);
} finally { await s.close(); await driver.close(); }
