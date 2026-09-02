import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
config();
const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD));
const sess = driver.session();
const r = await sess.run(`
  MATCH (kp:KnowledgePoint)-[:RELATES_TO]->(cc:CulturalConcept)
  WHERE NOT (cc)-[:HAS_DIMENSION]->(:CulturalDimension)
  RETURN kp.id AS kp, cc.id AS cc, cc.name AS ccname, cc.home_culture_code AS hc
  ORDER BY kp
`);
console.log('有RELATES_TO但四跳链不通的CC数:', r.records.length);
for (const x of r.records) console.log('  KP=' + x.get('kp') + ' | CC=' + x.get('cc') + ' | hc=' + x.get('hc'));
await sess.close();
await driver.close();
