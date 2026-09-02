// 验证补边后覆盖率：总KP / 有RELATES_TO的KP / 四跳链可跑通KP
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
config();
const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const sess = driver.session();
const num = (r) => r.records[0].get('c').toNumber();

const total = await sess.run('MATCH (kp:KnowledgePoint) RETURN count(kp) as c');
const withRel = await sess.run('MATCH (kp:KnowledgePoint)-[:RELATES_TO]->() RETURN count(DISTINCT kp) as c');
const fourHop = await sess.run('MATCH (kp:KnowledgePoint)-[:RELATES_TO]->(:CulturalConcept)-[:HAS_DIMENSION]->(:CulturalDimension) RETURN count(DISTINCT kp) as c');
const tp = await sess.run(`MATCH (kp:KnowledgePoint {id:'transport_subway_basic'})-[:RELATES_TO]->(cc)-[:HAS_DIMENSION]->(cd) RETURN cc.name as cc, cd.name as dim`);
const dimNodes = await sess.run('MATCH (cd:CulturalDimension) RETURN count(cd) as c');

console.log('总KP数:', num(total));
console.log('有RELATES_TO边的KP:', num(withRel), `(${((num(withRel)/num(total))*100).toFixed(1)}%)`);
console.log('四跳链(KP→CC→CD)可跑通KP:', num(fourHop), `(${((num(fourHop)/num(total))*100).toFixed(1)}%)`);
console.log('CulturalDimension节点数:', num(dimNodes));
console.log('\ntransport_subway_basic 现在关联维度:');
for (const r of tp.records) console.log('  ', r.get('cc'), '->', r.get('dim'));

await sess.close();
await driver.close();
