/**
 * Neo4j 知识图谱服务
 * 连接、查询、创建节点和关系
 * 
 * 必须通过环境变量配置 NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD
 * 缺失配置时会抛出明确错误，禁止静默使用假数据
 */

import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver';

// Neo4j 连接配置 - 必须通过环境变量配置
// 注意：必须在「每次调用时」从 process.env 现读，不能在模块顶层快照。
// 否则若本模块在 dotenv 加载 .env 之前被 import，配置会被冻结成 undefined，
// 之后 connect() 永远报"缺少环境变量"，导致图谱增强走 LLM-only 降级。
function getNeo4jConfig() {
  return {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000
  };
}

// ==================== 真实 Neo4j 服务 ====================

class RealNeo4jService {
  private driver: Driver | null = null;
  private isConnectedFlag: boolean = false;
  private lastErrorMessage: string | null = null;

  async connect(): Promise<boolean> {
    if (this.driver && this.isConnectedFlag) {
      return true;
    }

    try {
      const cfg = getNeo4jConfig();
      if (!cfg.uri || !cfg.username || !cfg.password) {
        throw new Error(
          '[Neo4j] 缺少必要环境变量 (NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD)，请在 .env 中配置后重启服务'
        );
      }

      this.driver = neo4j.driver(
        cfg.uri,
        neo4j.auth.basic(cfg.username, cfg.password),
        {
          maxConnectionPoolSize: cfg.maxConnectionPoolSize,
          connectionAcquisitionTimeout: cfg.connectionAcquisitionTimeout
        }
      );

      const session: Session = this.driver.session();
      await session.run('RETURN 1 as test');
      await session.close();

      this.isConnectedFlag = true;
      this.lastErrorMessage = null;
      console.log('[Neo4j] 连接成功');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Neo4j] 连接失败:', message);
      this.lastErrorMessage = message;
      this.isConnectedFlag = false;
      return false;
    }
  }

  getLastError(): string | null {
    return this.lastErrorMessage;
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.isConnectedFlag = false;
    }
  }

  async query<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
    if (!this.driver || !this.isConnectedFlag) {
      await this.connect();
    }

    if (!this.driver) {
      throw new Error('Neo4j 未连接');
    }

    const session: Session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map(record => {
        const obj: Record<string, unknown> = {};
        for (const key of record.keys) {
          const value = record.get(key);
          if (typeof key === 'string') {
            obj[key] = this.convertNeo4jValue(value);
          }
        }
        return obj as T;
      });
    } finally {
      await session.close();
    }
  }

  async write(cypher: string, params: Record<string, unknown> = {}): Promise<number> {
    if (!this.driver || !this.isConnectedFlag) {
      await this.connect();
    }

    if (!this.driver) {
      throw new Error('Neo4j 未连接');
    }

    const session: Session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.summary.counters.updates().nodesCreated || 0;
    } finally {
      await session.close();
    }
  }

  async batchWrite(operations: Array<{ cypher: string; params: Record<string, unknown> }>): Promise<{ success: boolean; created: number }> {
    if (!this.driver || !this.isConnectedFlag) {
      await this.connect();
    }

    if (!this.driver) {
      throw new Error('Neo4j 未连接');
    }

    const session: Session = this.driver.session();
    let totalCreated = 0;

    try {
      await session.executeWrite(async (tx: ManagedTransaction) => {
        for (const op of operations) {
          const result = await tx.run(op.cypher, op.params);
          totalCreated += result.summary.counters.updates().nodesCreated || 0;
        }
      });
      return { success: true, created: totalCreated };
    } catch (error) {
      console.error('[Neo4j] 批量写入失败:', error);
      return { success: false, created: 0 };
    } finally {
      await session.close();
    }
  }

  private convertNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (neo4j.isInt(value)) return value.toNumber();
    if (neo4j.isDate(value) || neo4j.isDateTime(value) || neo4j.isLocalDateTime(value)) {
      return new Date(value.toString()).toISOString();
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map(v => this.convertNeo4jValue(v));
      }
      // Neo4j Node/Relationship 对象 — 展开其 properties
      if ('properties' in value && typeof (value as Record<string, unknown>).properties === 'object') {
        return this.convertNeo4jValue((value as { properties: unknown }).properties);
      }
      // 递归转换 Cypher map 字面量中的嵌套 Neo4j Integer 等值
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.convertNeo4jValue(obj[key]);
      }
      return result;
    }
    return value;
  }

  async healthCheck(): Promise<{ connected: boolean; version?: string; nodes?: number; relationships?: number }> {
    try {
      if (!this.isConnectedFlag) {
        await this.connect();
      }

      if (!this.driver) {
        return { connected: false };
      }

      const nodeCount = await this.query<{ count: number }>('MATCH (n) RETURN count(n) as count');
      const relCount = await this.query<{ count: number }>('MATCH ()-[r]->() RETURN count(r) as count');

      return {
        connected: true,
        nodes: nodeCount[0]?.count || 0,
        relationships: relCount[0]?.count || 0
      };
    } catch (error) {
      return { connected: false };
    }
  }
}

// ==================== 统一服务入口 ====================

// 配置校验：缺失必要配置时显式报错
function validateNeo4jConfig(): void {
  const missing: string[] = [];
  if (!process.env.NEO4J_URI) missing.push('NEO4J_URI');
  if (!process.env.NEO4J_USERNAME) missing.push('NEO4J_USERNAME');
  if (!process.env.NEO4J_PASSWORD) missing.push('NEO4J_PASSWORD');
  if (missing.length > 0) {
    throw new Error(
      `[Neo4j] 缺少必要环境变量: ${missing.join(', ')}。` +
      `请在 .env 文件中配置这些变量后重启服务。`
    );
  }
}

class Neo4jServiceWrapper {
  private realService = new RealNeo4jService();

  private ensureConfig(): void {
    validateNeo4jConfig();
  }

  get service(): RealNeo4jService {
    this.ensureConfig();
    return this.realService;
  }

  async connect(): Promise<boolean> {
    this.ensureConfig();
    return this.realService.connect();
  }

  async close(): Promise<void> {
    return this.realService.close();
  }

  async query<T = Record<string, unknown>>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
    this.ensureConfig();
    return this.realService.query(cypher, params);
  }

  async write(cypher: string, params: Record<string, unknown> = {}): Promise<number> {
    this.ensureConfig();
    return this.realService.write(cypher, params);
  }

  async batchWrite(operations: Array<{ cypher: string; params: Record<string, unknown> }>): Promise<{ success: boolean; created: number }> {
    this.ensureConfig();
    return this.realService.batchWrite(operations);
  }

  async healthCheck(): Promise<{ connected: boolean; version?: string; nodes?: number; relationships?: number }> {
    // healthCheck 允许在配置缺失时返回 disconnected 状态（不抛异常）
    if (!process.env.NEO4J_URI || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD) {
      return { connected: false };
    }
    return this.realService.healthCheck();
  }

  getLastError(): string | null {
    return this.realService.getLastError();
  }
}

export const neo4jService = new Neo4jServiceWrapper();

// ==================== 知识图谱操作函数 ====================

/**
 * 创建文化知识点节点
 */
export async function createCultureNode(params: {
  id: string;
  topic: string;
  hsk_level: number;
  category: string;
  subcategory: string;
  properties?: Record<string, unknown>;
}): Promise<boolean> {
  const cypher = `
    MERGE (n:CultureNode {id: $id})
    SET n.topic = $topic,
        n.hsk_level = $hsk_level,
        n.category = $category,
        n.subcategory = $subcategory,
        n.properties = $properties,
        n.updated_at = datetime()
    RETURN n
  `;

  try {
    await neo4jService.write(cypher, params);
    return true;
  } catch (error) {
    console.error('[Neo4j] 创建节点失败:', error);
    return false;
  }
}

/**
 * 创建跨文化对比关系
 */
export async function createContrastRelation(params: {
  source_id: string;
  target_id: string;
  target_culture: string;
  cultural_dimension: string;
  similarities: string[];
  differences: string[];
}): Promise<boolean> {
  const cypher = `
    MATCH (source:CultureNode {id: $source_id})
    MERGE (target:CultureNode {id: $target_id})
    MERGE (source)-[r:CONTRASTS_WITH {target_culture: $target_culture}]->(target)
    SET r.cultural_dimension = $cultural_dimension,
        r.similarities = $similarities,
        r.differences = $differences,
        r.updated_at = datetime()
    RETURN r
  `;

  try {
    await neo4jService.write(cypher, params);
    return true;
  } catch (error) {
    console.error('[Neo4j] 创建关系失败:', error);
    return false;
  }
}

/**
 * 创建层级关系（上下位）
 */
export async function createHierarchyRelation(params: {
  parent_id: string;
  child_id: string;
  relation_type: string;
}): Promise<boolean> {
  const cypher = `
    MATCH (parent:CultureNode {id: $parent_id})
    MATCH (child:CultureNode {id: $child_id})
    MERGE (parent)-[r:${params.relation_type}]->(child)
    SET r.updated_at = datetime()
    RETURN r
  `;

  try {
    await neo4jService.write(cypher, params);
    return true;
  } catch (error) {
    console.error('[Neo4j] 创建层级关系失败:', error);
    return false;
  }
}

/**
 * 查询跨文化对比
 */
export async function queryCrossCulturalContrast(params: {
  knowledge_point_id: string;
  target_culture: string;
}): Promise<Record<string, unknown> | null> {
  const cypher = `
    MATCH (n:CultureNode {id: $knowledge_point_id})
    MATCH (n)-[r:CONTRASTS_WITH {target_culture: $target_culture}]->(target)
    RETURN n, r, target
  `;

  try {
    const results = await neo4jService.query(cypher, params);
    if (results.length > 0) {
      return results[0];
    }
    return null;
  } catch (error) {
    console.error('[Neo4j] 查询对比失败:', error);
    return null;
  }
}

/**
 * 查询相邻节点（相关知识点）
 */
export async function queryRelatedNodes(params: {
  knowledge_point_id: string;
  depth?: number;
}): Promise<Record<string, unknown>[]> {
  const depth = params.depth || 1;
  const cypher = `
    MATCH path = (n:CultureNode {id: $knowledge_point_id})-[*1..${depth}]-(related)
    UNWIND nodes(path) as node
    WITH collect(DISTINCT node) as nodes, collect(DISTINCT relationships(path)) as rels
    RETURN nodes, rels
  `;

  try {
    return await neo4jService.query(cypher, params);
  } catch (error) {
    console.error('[Neo4j] 查询相邻节点失败:', error);
    return [];
  }
}

/**
 * 获取知识点图谱统计
 */
export async function getKnowledgeGraphStats(): Promise<{
  nodes: number;
  relationships: number;
  cultures: string[];
  dimensions: string[];
}> {
  try {
    // 获取节点总数
    const nodeCount = await neo4jService.query<{ count: number }>('MATCH (n) RETURN count(n) as count');
    
    // 获取 CultureNode 类型节点数
    const cultureNodes = await neo4jService.query<{ count: number }>('MATCH (n:CultureNode) RETURN count(n) as count');
    
    // 获取关系类型
    const relTypes = await neo4jService.query<{ relationshipType: string; count: number }>(
      'CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType, count(*) as count'
    ).catch(() => [] as { relationshipType: string; count: number }[]);

    // 获取有 topic 或 name 的节点数
    const nodesWithTopic = await neo4jService.query<{ count: number }>(
      'MATCH (n:CultureNode) WHERE n.topic IS NOT NULL OR n.name IS NOT NULL RETURN count(n) as count'
    ).catch(() => [{ count: nodeCount[0]?.count || 0 }]);

    // 统计文化维度
    const cultures = ['英语圈', '日语圈', '韩语圈', '西班牙语圈'];
    const dimensions = ['饮食文化', '社交礼仪', '节日习俗', '校园生活'];

    return {
      nodes: cultureNodes[0]?.count || nodesWithTopic[0]?.count || 0,
      relationships: relTypes.reduce((sum: number, r) => sum + r.count, 0),
      cultures,
      dimensions
    };
  } catch (error) {
    console.error('[Neo4j] 获取统计失败:', error);
    return { nodes: 0, relationships: 0, cultures: [], dimensions: [] };
  }
}

export default neo4jService;
