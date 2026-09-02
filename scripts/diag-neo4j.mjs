// 只读诊断：查清 Neo4j 里到底是"没数据"还是"检索 schema 对不上"
// 不执行任何写操作
import { config } from 'dotenv';
config();
import neo4j from 'neo4j-driver';

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USERNAME;
const pwd = process.env.NEO4J_PASSWORD;
if (!uri || !user || !pwd) {
  console.error('缺少 NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD');
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, pwd));
const session = driver.session();

async function run(label, cypher, params = {}) {
  try {
    const res = await session.run(cypher, params);
    const rows = res.records.map(r => {
      const o = {};
      for (const k of r.keys) {
        const v = r.get(k);
        o[k] = (v && typeof v === 'object' && 'toNumber' in v) ? v.toNumber() : (v && typeof v === 'object' && v.properties ? v.properties : v);
      }
      return o;
    });
    console.log(`\n=== ${label} ===`);
    if (rows.length === 0) console.log('  (空结果 / 0 行)');
    else console.log(JSON.stringify(rows.slice(0, 30), null, 2));
    return rows;
  } catch (e) {
    console.log(`\n=== ${label} === [查询失败] ${e.message}`);
    return [];
  }
}

try {
  // 1. 节点标签分布
  await run('① 节点标签分布 (MATCH (n) RETURN labels(n), count)',
    `MATCH (n) UNWIND labels(n) AS lbl RETURN lbl AS label, count(*) AS c ORDER BY c DESC`);

  // 2. 关系类型分布
  await run('② 关系类型分布',
    `CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType`);

  // 3. 总数
  await run('③ 总节点 / 总关系数',
    `MATCH (n) RETURN count(n) AS nodes
     UNION ALL
     MATCH ()-[r]->() RETURN count(r) AS rels`);

  // 4. A2/A3 检索期望的标签是否存在
  await run('④ KnowledgePoint 节点是否存在 (A2/A3 检索依赖)',
    `MATCH (kp:KnowledgePoint) RETURN kp.id AS id LIMIT 50`);
  await run('④b CulturalDimension 节点是否存在',
    `MATCH (cd:CulturalDimension) RETURN cd.name AS name, cd.name_en AS name_en LIMIT 20`);
  await run('④c HomeCulture 节点是否存在',
    `MATCH (hc:HomeCulture) RETURN hc.id AS id LIMIT 20`);
  await run('④d CultureNode 节点是否存在 (可视化页依赖)',
    `MATCH (cn:CultureNode) RETURN cn.id AS id, cn.topic AS topic LIMIT 20`);

  // 5. 关键四跳链：以 transport_subway_basic 为例
  await run('⑤ 四跳链 dimResults (KnowledgePoint→RELATES_TO→CulturalConcept→HAS_DIMENSION→CulturalDimension)',
    `MATCH (kp:KnowledgePoint {id:$kp})-[:RELATES_TO]->(cc:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)
     RETURN cd.name AS dim LIMIT 20`, { kp: 'transport_subway_basic' });

  // 6. 该 KP 的 KnowledgePoint 节点本身是否存在
  await run('⑥ KnowledgePoint{id:transport_subway_basic} 是否存在',
    `MATCH (kp:KnowledgePoint {id:$kp}) RETURN kp.id AS id, kp.topic AS topic`, { kp: 'transport_subway_basic' });

  // 7. 兜底查询（不带 KP 前缀，跨全图）
  await run('⑦ 兜底 MANIFESTED_IN (CulturalDimension→HomeCulture{hc_ja})',
    `MATCH (cd:CulturalDimension)-[:MANIFESTED_IN]->(hc:HomeCulture {id:$hc}) RETURN cd.name AS dim, hc.id AS hc LIMIT 10`, { hc: 'hc_ja' });
  await run('⑦b 兜底 MANIFESTED_IN (hc_en)',
    `MATCH (cd:CulturalDimension)-[:MANIFESTED_IN]->(hc:HomeCulture {id:$hc}) RETURN count(*) AS c`, { hc: 'hc_en' });

} finally {
  await session.close();
  await driver.close();
}
