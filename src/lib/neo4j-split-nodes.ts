/**
 * 知识图谱粒度细化迁移脚本 v2
 * 
 * 问题分析：
 * - Neo4j中部分节点的 name 字段包含 "/" 聚合多个概念
 * - 如 "长城/山海关/八达岭" 实际是3个独立节点
 * 
 * 拆分策略：
 * 1. 找出所有 name 包含 "/" 的聚合节点
 * 2. 将每个子项创建为独立节点
 * 3. 建立 PART_OF 层级关系
 * 4. 保留原有节点作为"组节点"（可选）
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  throw new Error('[Neo4j] 缺少必要环境变量: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD');
}

const _NEO4J_URI: string = NEO4J_URI;
const _NEO4J_USER: string = NEO4J_USER;
const _NEO4J_PASSWORD: string = NEO4J_PASSWORD;

interface MigrationStats {
  totalAggregates: number;
  createdNodes: number;
  createdRelations: number;
  skipped: number;
  errors: string[];
}

interface AggregateNode {
  id: string | null;
  name: string;
  hierarchy: string | null;
  hsk_level: string | null;
  originalNode: Record<string, unknown>;
}

function createDriver() {
  return neo4j.driver(_NEO4J_URI, neo4j.auth.basic(_NEO4J_USER, _NEO4J_PASSWORD));
}

/**
 * 清理节点名称，移除不合法字符
 */
function sanitizeNodeId(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * 生成唯一节点ID
 */
function generateNodeId(baseName: string, existingIds: Set<string>): string {
  let id = sanitizeNodeId(baseName);
  let counter = 1;
  const originalId = id;
  
  while (existingIds.has(id)) {
    id = `${originalId}_${counter}`;
    counter++;
  }
  
  existingIds.add(id);
  return id;
}

/**
 * 预览迁移效果
 */
async function previewMigration(driver: Awaited<ReturnType<typeof neo4j.driver>>): Promise<void> {
  const session = driver.session();
  
  try {
    console.log('🔍 拆分预览（不执行实际迁移）\n');
    console.log('=' .repeat(70));
    
    // 查找聚合节点
    const result = await session.run(`
      MATCH (n:CultureNode)
      WHERE n.name CONTAINS '/'
      RETURN n.id as id, n.name as name, n.hierarchy as hierarchy, n.hsk_level as level
      ORDER BY size(n.name) DESC
    `);
    
    let totalSubNodes = 0;
    let totalAggregates = result.records.length;
    
    console.log(`📊 发现 ${totalAggregates} 个聚合节点\n`);
    console.log('┌─────────────────────────────────────┬────────┬────────────────────────────────────────┐');
    console.log('│ 聚合节点 (name)                     │ 子节点 │ 拆分预览                               │');
    console.log('├─────────────────────────────────────┼────────┼────────────────────────────────────────┤');
    
    for (const record of result.records.slice(0, 20)) {
      const name = record.get('name') as string;
      const parts = name.split('/').filter(p => p.trim().length > 0);
      totalSubNodes += parts.length;
      
      const displayName = name.length > 33 ? name.substring(0, 30) + '...' : name;
      const preview = parts.slice(0, 4).join(', ') + (parts.length > 4 ? '...' : '');
      
      console.log(`│ ${displayName.padEnd(35)} │ ${parts.length.toString().padStart(6)} │ ${preview.padEnd(40)} │`);
    }
    
    console.log('├─────────────────────────────────────┼────────┼────────────────────────────────────────┤');
    console.log(`│ 总计                                 │ ${totalSubNodes.toString().padStart(6)} │`);
    console.log('└─────────────────────────────────────┴────────┴────────────────────────────────────────┘');
    
    console.log('\n📈 效果预估:');
    console.log(`   • 当前节点数: 88`);
    console.log(`   • 聚合节点: ${totalAggregates}`);
    console.log(`   • 拆分后节点数: 88 - ${totalAggregates} + ${totalSubNodes} = ${88 - totalAggregates + totalSubNodes}`);
    console.log(`   • 节点增长率: +${Math.round((totalSubNodes - totalAggregates) / totalAggregates * 100)}%`);
    
    console.log('\n⚠️  如需执行迁移，请运行: npx tsx src/lib/neo4j-split-nodes.ts migrate');
    
  } finally {
    await session.close();
  }
}

/**
 * 执行迁移
 */
async function runMigration(driver: Awaited<ReturnType<typeof neo4j.driver>>): Promise<MigrationStats> {
  const session = driver.session();
  
  const stats: MigrationStats = {
    totalAggregates: 0,
    createdNodes: 0,
    createdRelations: 0,
    skipped: 0,
    errors: []
  };
  
  try {
    console.log('🔄 开始执行数据拆分迁移...\n');
    
    // 1. 获取所有现有节点ID，用于去重
    const existingIdsResult = await session.run(`
      MATCH (n:CultureNode)
      RETURN n.id as id, n.name as name
    `);
    
    const existingIds = new Set<string>();
    existingIdsResult.records.forEach((r: { get: (key: string) => unknown }) => {
      const id = r.get('id') as string | null;
      const name = r.get('name') as string;
      if (id) existingIds.add(id);
      if (name) existingIds.add(sanitizeNodeId(name));
    });
    
    console.log(`📋 已存在 ${existingIds.size} 个节点标识符\n`);
    
    // 2. 查找所有聚合节点
    const aggregateResult = await session.run(`
      MATCH (n:CultureNode)
      WHERE n.name CONTAINS '/'
      RETURN n
      ORDER BY size(n.name) DESC
    `);
    
    stats.totalAggregates = aggregateResult.records.length;
    console.log(`📊 发现 ${stats.totalAggregates} 个聚合节点待拆分\n`);
    
    // 3. 处理每个聚合节点
    for (let i = 0; i < aggregateResult.records.length; i++) {
      const record = aggregateResult.records[i];
      const nodeProps = (record.get('n') as Record<string, unknown>).properties as Record<string, unknown> || record.get('n') as Record<string, unknown>;
      
      const name = nodeProps.name as string;
      const parts = name.split('/').map(p => p.trim()).filter(p => p.length > 0);
      
      console.log(`[${i + 1}/${stats.totalAggregates}] 处理: "${name.substring(0, 40)}${name.length > 40 ? '...' : ''}"`);
      console.log(`   拆分为 ${parts.length} 个节点: ${parts.slice(0, 3).join(', ')}${parts.length > 3 ? '...' : ''}`);
      
      // 为每个子项创建节点
      const createdSubNodes: string[] = [];
      
      for (const part of parts) {
        const subNodeId = generateNodeId(part, existingIds);
        
        // 检查是否已存在
        const checkResult = await session.run(`
          MATCH (n:CultureNode {id: $id})
          RETURN count(n) as cnt
        `, { id: subNodeId });
        
        if (checkResult.records[0].get('cnt').toNumber() > 0) {
          console.log(`   ⏭️  跳过已存在: ${subNodeId}`);
          stats.skipped++;
          createdSubNodes.push(subNodeId);
          continue;
        }
        
        // 创建子节点，继承原节点属性
        await session.run(`
          CREATE (n:CultureNode {
            id: $id,
            name: $name,
            topic: $name,
            hsk_level: $hsk_level,
            hierarchy: $hierarchy,
            category: $category,
            parent_name: $parentName,
            original_node_id: $originalId,
            created_at: datetime(),
            is_split_child: true
          })
        `, {
          id: subNodeId,
          name: part,
          hsk_level: nodeProps.hsk_level || null,
          hierarchy: nodeProps.hierarchy || null,
          category: nodeProps.category || null,
          parentName: name,
          originalId: nodeProps.id || null
        });
        
        stats.createdNodes++;
        createdSubNodes.push(subNodeId);
        console.log(`   ✅ 创建节点: ${subNodeId}`);
      }
      
      // 4. 建立子节点间的 SAME_GROUP 关系
      for (let j = 0; j < createdSubNodes.length - 1; j++) {
        await session.run(`
          MATCH (a:CultureNode {id: $id1}), (b:CultureNode {id: $id2})
          MERGE (a)-[r:SAME_GROUP]->(b)
          SET r.group_name = $groupName
        `, {
          id1: createdSubNodes[j],
          id2: createdSubNodes[j + 1],
          groupName: name
        });
        stats.createdRelations++;
      }
      
      // 5. 为原聚合节点标记（可选：保留作为检索入口）
      if (nodeProps.id) {
        await session.run(`
          MATCH (n:CultureNode {id: $id})
          SET n.is_aggregate = true,
              n.split_children = $children,
              n.split_count = $count
        `, {
          id: nodeProps.id,
          children: createdSubNodes.join(','),
          count: createdSubNodes.length
        });
      }
      
      console.log(`   📎 建立 ${createdSubNodes.length - 1} 个同级关系\n`);
    }
    
    // 6. 创建索引
    console.log('📇 创建索引...');
    try {
      await session.run(`
        CREATE INDEX split_parent_name IF NOT EXISTS
        FOR (n:CultureNode) ON (n.parent_name)
      `);
      await session.run(`
        CREATE INDEX split_original_id IF NOT EXISTS
        FOR (n:CultureNode) ON (n.original_node_id)
      `);
      console.log('   ✅ 索引创建成功');
    } catch {
      console.log('   ⏭️  索引已存在');
    }
    
  } catch (err) {
    stats.errors.push(String(err));
    console.error('❌ 迁移失败:', err);
  } finally {
    await session.close();
  }
  
  return stats;
}

/**
 * 主函数
 */
async function main() {
  const command = process.argv[2] || 'preview';
  
  if (command !== 'preview' && command !== 'migrate') {
    console.log('用法:');
    console.log('  npx tsx src/lib/neo4j-split-nodes.ts preview   # 预览拆分效果');
    console.log('  npx tsx src/lib/neo4j-split-nodes.ts migrate   # 执行拆分迁移');
    process.exit(1);
  }
  
  console.log('⚙️  连接到 Neo4j...\n');
  
  const driver = createDriver();
  
  try {
    // 测试连接
    const session = driver.session();
    await session.run('MATCH (n) RETURN count(n) as cnt');
    await session.close();
    console.log('✅ Neo4j 连接成功\n');
    
    if (command === 'preview') {
      await previewMigration(driver);
    } else {
      console.log('⚠️  即将执行数据拆分迁移...\n');
      console.log('   这将：');
      console.log('   1. 拆分所有 name 包含 "/" 的聚合节点');
      console.log('   2. 为每个子项创建独立节点');
      console.log('   3. 建立 SAME_GROUP 同组关系');
      console.log('   4. 标记原节点为聚合节点\n');
      
      // 确认执行
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise<string>((resolve) => {
        rl.question('是否继续? (y/N): ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() !== 'y') {
        console.log('❌ 已取消迁移');
        process.exit(0);
      }
      
      const stats = await runMigration(driver);
      
      console.log('\n' + '='.repeat(50));
      console.log('📈 迁移完成统计:');
      console.log('='.repeat(50));
      console.log(`   • 分析聚合节点: ${stats.totalAggregates}`);
      console.log(`   • 创建子节点: ${stats.createdNodes}`);
      console.log(`   • 创建关系: ${stats.createdRelations}`);
      console.log(`   • 跳过(已存在): ${stats.skipped}`);
      console.log(`   • 错误: ${stats.errors.length}`);
      
      if (stats.errors.length > 0) {
        console.log('\n错误详情:');
        stats.errors.forEach(e => console.log(`   - ${e}`));
      }
    }
    
  } finally {
    await driver.close();
  }
}

main().catch(console.error);
