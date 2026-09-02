/**
 * 数据迁移脚本：从 Supabase 迁移到 Neo4j
 * 将文化知识点和跨文化对比迁移到知识图谱
 */

import { neo4jService, createCultureNode, createContrastRelation } from './neo4j-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface CulturalKnowledgePoint {
  id: number;
  topic: string;
  hsk_level: number | null;
  category: string | null;
  subcategory: string | null;
  definition_zh: string | null;
  definition_en: string | null;
  cultural_significance: string | null;
  usage_notes: string | null;
  created_at: string | null;
}

interface CrossCulturalComparison {
  id: number;
  source_kp_id: number;
  target_kp_id: number;
  target_culture: string | null;
  cultural_dimension: string | null;
  similarities: string[] | null;
  differences: string[] | null;
  pragmatic_differences: string[] | null;
}

interface MigrationResult {
  success: boolean;
  nodesCreated: number;
  relationshipsCreated: number;
  errors: string[];
}

/**
 * 主迁移函数
 */
export async function migrateToNeo4j(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    nodesCreated: 0,
    relationshipsCreated: 0,
    errors: []
  };

  try {
    // 1. 连接 Neo4j
    console.log('[Migration] 开始连接 Neo4j...');
    const connected = await neo4jService.connect();
    if (!connected) {
      throw new Error('无法连接到 Neo4j');
    }

    // 2. 创建索引（加速查询）
    console.log('[Migration] 创建索引...');
    await createIndexes();

    // 3. 迁移知识点节点
    console.log('[Migration] 迁移知识点节点...');
    const kpResult = await migrateKnowledgePoints();
    result.nodesCreated = kpResult.nodes;
    if (kpResult.errors.length > 0) {
      result.errors.push(...kpResult.errors);
    }

    // 4. 迁移跨文化对比关系
    console.log('[Migration] 迁移跨文化对比关系...');
    const ccResult = await migrateCrossCulturalComparisons();
    result.relationshipsCreated = ccResult.relationships;
    if (ccResult.errors.length > 0) {
      result.errors.push(...ccResult.errors);
    }

    result.success = true;
    console.log('[Migration] 迁移完成!', result);
    return result;

  } catch (error) {
    console.error('[Migration] 迁移失败:', error);
    result.errors.push(String(error));
    return result;
  }
}

/**
 * 创建索引
 */
async function createIndexes(): Promise<void> {
  const indexes = [
    'CREATE INDEX culture_node_id IF NOT EXISTS FOR (n:CultureNode) ON (n.id)',
    'CREATE INDEX culture_node_hsk IF NOT EXISTS FOR (n:CultureNode) ON (n.hsk_level)',
    'CREATE INDEX culture_node_category IF NOT EXISTS FOR (n:CultureNode) ON (n.category)',
    'CREATE INDEX contrast_relation IF NOT EXISTS FOR ()-[r:CONTRASTS_WITH]-() ON (r.target_culture)',
  ];

  for (const idx of indexes) {
    try {
      await neo4jService.write(idx);
    } catch (e) {
      // 索引可能已存在，忽略错误
    }
  }
}

/**
 * 迁移知识点节点
 */
async function migrateKnowledgePoints(): Promise<{ nodes: number; errors: string[] }> {
  const errors: string[] = [];
  let nodesCreated = 0;

  // 从 Supabase 获取所有知识点
  const supabase = getSupabaseClient();
  const { data: knowledgePoints, error } = await supabase
    .from('cultural_knowledge_points')
    .select('*');

  if (error) {
    errors.push(`查询知识点失败: ${error.message}`);
    return { nodes: nodesCreated, errors };
  }

  if (!knowledgePoints || knowledgePoints.length === 0) {
    errors.push('没有找到知识点数据');
    return { nodes: nodesCreated, errors };
  }

  console.log(`[Migration] 找到 ${knowledgePoints.length} 个知识点`);

  // 批量创建节点
  const operations = knowledgePoints.map((kp: CulturalKnowledgePoint) => ({
    cypher: `
      MERGE (n:CultureNode {id: $id})
      SET n.topic = $topic,
          n.hsk_level = $hsk_level,
          n.category = $category,
          n.subcategory = $subcategory,
          n.definition_zh = $definition_zh,
          n.definition_en = $definition_en,
          n.cultural_significance = $cultural_significance,
          n.usage_notes = $usage_notes,
          n.created_at = datetime($created_at),
          n.updated_at = datetime()
    `,
    params: {
      id: `kp_${kp.id}`,
      topic: kp.topic,
      hsk_level: kp.hsk_level || 1,
      category: kp.category || 'general',
      subcategory: kp.subcategory || 'general',
      definition_zh: kp.definition_zh || '',
      definition_en: kp.definition_en || '',
      cultural_significance: kp.cultural_significance || '',
      usage_notes: kp.usage_notes || '',
      created_at: kp.created_at || new Date().toISOString()
    }
  }));

  // 分批执行（每批100条）
  const BATCH_SIZE = 100;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    const batchResult = await neo4jService.batchWrite(batch);
    nodesCreated += batchResult.created;
    console.log(`[Migration] 知识点批次 ${Math.floor(i / BATCH_SIZE) + 1} 完成`);
  }

  return { nodes: nodesCreated, errors };
}

/**
 * 迁移跨文化对比关系
 */
async function migrateCrossCulturalComparisons(): Promise<{ relationships: number; errors: string[] }> {
  const errors: string[] = [];
  let relationshipsCreated = 0;

  // 从 Supabase 获取所有对比
  const supabase = getSupabaseClient();
  const { data: comparisons, error } = await supabase
    .from('cross_cultural_comparisons')
    .select('*');

  if (error) {
    errors.push(`查询对比失败: ${error.message}`);
    return { relationships: relationshipsCreated, errors };
  }

  if (!comparisons || comparisons.length === 0) {
    errors.push('没有找到对比数据');
    return { relationships: relationshipsCreated, errors };
  }

  console.log(`[Migration] 找到 ${comparisons.length} 条跨文化对比`);

  // 批量创建关系
  const operations = comparisons.map((comp: CrossCulturalComparison) => ({
    cypher: `
      MATCH (source:CultureNode {id: $source_id})
      MERGE (target:CultureNode {id: $target_id})
      MERGE (source)-[r:CONTRASTS_WITH]->(target)
      SET r.target_culture = $target_culture,
          r.cultural_dimension = $cultural_dimension,
          r.similarities = $similarities,
          r.differences = $differences,
          r.pragmatic_differences = $pragmatic_differences,
          r.updated_at = datetime()
    `,
    params: {
      source_id: `kp_${comp.source_kp_id}`,
      target_id: `kp_${comp.target_kp_id}`,
      target_culture: comp.target_culture || 'unknown',
      cultural_dimension: comp.cultural_dimension || 'general',
      similarities: JSON.stringify(comp.similarities || []),
      differences: JSON.stringify(comp.differences || []),
      pragmatic_differences: JSON.stringify(comp.pragmatic_differences || [])
    }
  }));

  // 分批执行
  const BATCH_SIZE = 100;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    const batchResult = await neo4jService.batchWrite(batch);
    relationshipsCreated += batchResult.created;
    console.log(`[Migration] 对比批次 ${Math.floor(i / BATCH_SIZE) + 1} 完成`);
  }

  return { relationships: relationshipsCreated, errors };
}

/**
 * 创建额外的关系（基于场景和HSK等级）
 */
export async function createAdditionalRelations(): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  try {
    // 创建 HSK 等级层级关系
    const hskRelations = `
      MATCH (n1:CultureNode), (n2:CultureNode)
      WHERE n1.hsk_level = n2.hsk_level - 1
        AND n1.category = n2.category
      MERGE (n1)-[r:BUILD_UPON]->(n2)
      SET r.updated_at = datetime()
    `;
    created += await neo4jService.write(hskRelations);

    // 创建同一场景的关系
    const sameSceneRelations = `
      MATCH (n1:CultureNode), (n2:CultureNode)
      WHERE n1.category = n2.category
        AND n1.id <> n2.id
      MERGE (n1)-[r:SAME_CATEGORY]->(n2)
      SET r.updated_at = datetime()
    `;
    // 注意：这个查询可能产生大量关系，需要限制
    console.log('[Migration] 创建额外关系完成');
  } catch (error) {
    errors.push(`创建额外关系失败: ${error}`);
  }

  return { created, errors };
}

/**
 * 验证迁移结果
 */
export async function validateMigration(): Promise<{
  valid: boolean;
  stats: {
    nodes: number;
    relationships: number;
    missingNodes: string[];
  };
}> {
  const stats = await neo4jService.query<{ nodes: number; rels: number }>(`
    MATCH (n:CultureNode)
    WITH count(n) as nodes
    MATCH ()-[r]->()
    WITH nodes, count(r) as rels
    RETURN nodes, rels
  `);

  const nodeCount = await neo4jService.query<{ count: number }>('MATCH (n) RETURN count(n) as count');

  // 检查是否有孤立节点（没有关系的节点）
  const orphanNodes = await neo4jService.query<{ id: string }>(`
    MATCH (n:CultureNode)
    WHERE NOT (n)--()
    RETURN n.id as id
    LIMIT 10
  `);

  return {
    valid: orphanNodes.length === 0,
    stats: {
      nodes: nodeCount[0]?.count || 0,
      relationships: stats[0]?.rels || 0,
      missingNodes: orphanNodes.map(n => n.id)
    }
  };
}

/**
 * 一键迁移（包含所有步骤）
 */
export async function fullMigration(): Promise<MigrationResult> {
  console.log('========== 开始完整迁移 ==========');
  
  // 执行迁移
  const result = await migrateToNeo4j();
  
  if (result.success) {
    // 创建额外关系
    await createAdditionalRelations();
    
    // 验证
    const validation = await validateMigration();
    console.log('[Migration] 验证结果:', validation);
  }
  
  console.log('========== 迁移完成 ==========');
  return result;
}

export default {
  migrateToNeo4j,
  createAdditionalRelations,
  validateMigration,
  fullMigration
};
