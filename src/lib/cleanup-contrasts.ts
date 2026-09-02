/**
 * 清理无效的跨文化对比节点
 */

import neo4j, { Driver } from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  throw new Error('[Neo4j] 缺少必要环境变量: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD');
}

// 上述检查保证了这些值为 string（非 undefined）
const _NEO4J_URI: string = NEO4J_URI;
const _NEO4J_USERNAME: string = NEO4J_USERNAME;
const _NEO4J_PASSWORD: string = NEO4J_PASSWORD;

async function main() {
  console.log('🔌 连接 Neo4j...');
  const driver: Driver = neo4j.driver(
    _NEO4J_URI,
    neo4j.auth.basic(_NEO4J_USERNAME, _NEO4J_PASSWORD)
  );
  const session = driver.session();

  try {
    // 删除名字为 null 的节点
    const result = await session.run(`
      MATCH (c:CrossCultureContrast)
      WHERE c.name IS NULL OR c.name = ''
      DETACH DELETE c
      RETURN count(c) as deleted
    `);
    
    const deleted = result.records[0]?.get('deleted') || 0;
    console.log(`✅ 删除了 ${deleted} 个无效节点`);

    // 验证清理后的节点
    const remaining = await session.run(`
      MATCH (c:CrossCultureContrast)
      RETURN c.id as id, c.name as name, c.theme as theme, c.node_count as count
      ORDER BY count DESC
    `);
    
    console.log('\n📋 清理后的跨文化对比节点:');
    remaining.records.forEach(r => {
      console.log(`  - ${r.get('name')}: ${r.get('count')} 个知识点`);
    });
    
    console.log(`\n总计: ${remaining.records.length} 个节点`);

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
