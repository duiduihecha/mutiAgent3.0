/**
 * Neo4j知识图谱服务
 * 连接并查询用户的Neo4j知识图谱数据库
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

// ==================== 类型定义 ====================

export interface CultureNode {
  id: string;
  name: string;
  hsk_level: string;
  hierarchy: string | null;
  language_binding: string;
  embedding: number[];
}

export interface CrossCultureContrast {
  id: string;
  target_language: string;
  similarities: string;
  differences: string;
  chinese_feature: string;
  home_feature: string;
  pragmatic_tips: string;
  demographic_diff: string;
}

export interface KnowledgeGraphStats {
  cultureNodes: number;
  crossCultureContrasts: number;
  users: number;
  relationships: number;
}

// ==================== Neo4j客户端 ====================

class Neo4jClient {
  private driver: Driver | null = null;
  private readonly uri = process.env.NEO4J_URI;
  private readonly user = process.env.NEO4J_USERNAME;
  private readonly password = process.env.NEO4J_PASSWORD;

  private initDriver(): Driver {
    if (!this.uri || !this.user || !this.password) {
      throw new Error('[Neo4j] 缺少必要环境变量: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD');
    }
    if (!this.driver) {
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password),
        {
          maxConnectionPoolSize: 10,
          connectionAcquisitionTimeout: 30000,
        }
      );
    }
    return this.driver;
  }

  getSession(): Session {
    return this.initDriver().session();
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const session = this.getSession();
      await session.run('RETURN 1');
      await session.close();
      return true;
    } catch (error) {
      console.error('Neo4j connection failed:', error);
      return false;
    }
  }
}

// 单例
let client: Neo4jClient | null = null;

export function getNeo4jClient(): Neo4jClient {
  if (!client) {
    client = new Neo4jClient();
  }
  return client;
}

// ==================== 知识图谱服务 ====================

export class KnowledgeGraphService {
  private neo4j = getNeo4jClient();

  /**
   * 获取知识图谱统计信息
   */
  async getStats(): Promise<KnowledgeGraphStats> {
    const session = this.neo4j.getSession();
    try {
      // 统计各类节点
      const countResult = await session.run(`
        MATCH (n) 
        RETURN CASE 
          WHEN 'CultureNode' IN labels(n) THEN 'cultureNodes'
          WHEN 'CrossCultureContrast' IN labels(n) THEN 'crossCultureContrasts'
          WHEN 'User' IN labels(n) THEN 'users'
          ELSE 'other'
        END as type, count(*) as count
      `);
      
      const counts: KnowledgeGraphStats = {
        cultureNodes: 0,
        crossCultureContrasts: 0,
        users: 0,
        relationships: 0,
      };
      
      countResult.records.forEach(r => {
        const type = r.get('type') as string;
        const count = r.get('count').toNumber();
        if (type === 'cultureNodes') counts.cultureNodes = count;
        if (type === 'crossCultureContrasts') counts.crossCultureContrasts = count;
        if (type === 'users') counts.users = count;
      });
      
      // 统计关系数量
      const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
      counts.relationships = relResult.records[0].get('count').toNumber();
      
      return counts as KnowledgeGraphStats;
    } finally {
      await session.close();
    }
  }

  /**
   * 获取所有文化知识点（不包含embedding）
   */
  async getAllCultureNodes(limit?: number): Promise<CultureNode[]> {
    const session = this.neo4j.getSession();
    try {
      // 不返回embedding以提高性能
      const query = limit 
        ? `MATCH (n:CultureNode) RETURN n.id, n.name, n.hsk_level, n.hierarchy, n.language_binding LIMIT ${limit}`
        : 'MATCH (n:CultureNode) RETURN n.id, n.name, n.hsk_level, n.hierarchy, n.language_binding';
      
      const result = await session.run(query);
      return result.records.map(r => {
        return {
          id: r.get('n.id'),
          name: r.get('n.name'),
          hsk_level: r.get('n.hsk_level'),
          hierarchy: r.get('n.hierarchy'),
          language_binding: r.get('n.language_binding'),
          embedding: [],
        } as CultureNode;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * 根据HSK等级获取知识点
   */
  async getCultureNodesByLevel(hskLevel: string): Promise<CultureNode[]> {
    const session = this.neo4j.getSession();
    try {
      const result = await session.run(
        'MATCH (n:CultureNode) WHERE n.hsk_level CONTAINS $level RETURN n.id, n.name, n.hsk_level, n.hierarchy, n.language_binding',
        { level: hskLevel }
      );
      return result.records.map(r => {
        return {
          id: r.get('n.id'),
          name: r.get('n.name'),
          hsk_level: r.get('n.hsk_level'),
          hierarchy: r.get('n.hierarchy'),
          language_binding: r.get('n.language_binding'),
          embedding: [],
        } as CultureNode;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * 获取知识点的跨文化对比
   */
  async getCrossCultureContrasts(knowledgePointId: string): Promise<CrossCultureContrast[]> {
    const session = this.neo4j.getSession();
    try {
      const result = await session.run(
        `MATCH (c:CultureNode {id: $id})-[r:HAS_CONTRAST]->(cc:CrossCultureContrast)
         RETURN cc`,
        { id: knowledgePointId }
      );
      return result.records.map(r => {
        const props = r.get(0).properties;
        return {
          id: props.id,
          target_language: props.target_language,
          similarities: props.similarities,
          differences: props.differences,
          chinese_feature: props.chinese_feature,
          home_feature: props.home_feature,
          pragmatic_tips: props.pragmatic_tips,
          demographic_diff: props.demographic_diff,
        } as CrossCultureContrast;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * 获取所有跨文化对比
   */
  async getAllCrossCultureContrasts(language?: string): Promise<CrossCultureContrast[]> {
    const session = this.neo4j.getSession();
    try {
      const query = language
        ? 'MATCH (cc:CrossCultureContrast) WHERE cc.target_language = $lang RETURN cc'
        : 'MATCH (cc:CrossCultureContrast) RETURN cc';
      
      const result = await session.run(query, language ? { lang: language } : {});
      return result.records.map(r => {
        const props = r.get(0).properties;
        return {
          id: props.id,
          target_language: props.target_language,
          similarities: props.similarities,
          differences: props.differences,
          chinese_feature: props.chinese_feature,
          home_feature: props.home_feature,
          pragmatic_tips: props.pragmatic_tips,
          demographic_diff: props.demographic_diff,
        } as CrossCultureContrast;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * 语义搜索：使用embedding查找相似知识点
   */
  async semanticSearch(embedding: number[], topK: number = 5): Promise<Array<CultureNode & { similarity: number }>> {
    const session = this.neo4j.getSession();
    try {
      // 获取所有有embedding的节点
      const result = await session.run(
        'MATCH (n:CultureNode) WHERE n.embedding IS NOT NULL RETURN n'
      );
      
      // 计算余弦相似度
      const nodes = result.records.map(r => {
        const props = r.get(0).properties;
        return {
          id: props.id,
          name: props.name,
          hsk_level: props.hsk_level,
          hierarchy: props.hierarchy,
          language_binding: props.language_binding,
          embedding: props.embedding,
        } as CultureNode;
      });
      
      // 计算相似度并排序
      const scored = nodes.map(node => {
        const similarity = this.cosineSimilarity(embedding, node.embedding);
        return { ...node, similarity };
      }).sort((a, b) => b.similarity - a.similarity);
      
      return scored.slice(0, topK);
    } finally {
      await session.close();
    }
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 获取知识点关联图
   */
  async getRelatedKnowledgeGraph(knowledgePointId: string, depth: number = 2): Promise<{
    nodes: CultureNode[];
    edges: Array<{ from: string; to: string; type: string }>;
  }> {
    const session = this.neo4j.getSession();
    try {
      const result = await session.run(
        `MATCH path = (start:CultureNode {id: $id})-[*1..${depth}]->(end:CultureNode)
         UNWIND relationships(path) as rel
         RETURN start, collect(DISTINCT end) as relatedNodes, collect(DISTINCT rel) as rels`,
        { id: knowledgePointId }
      );
      
      const nodes: CultureNode[] = [];
      const edges: Array<{ from: string; to: string; type: string }> = [];
      
      result.records.forEach(r => {
        const start = r.get('start').properties;
        nodes.push({
          id: start.id,
          name: start.name,
          hsk_level: start.hsk_level,
          hierarchy: start.hierarchy,
          language_binding: start.language_binding,
          embedding: start.embedding || [],
        });
        
        r.get('relatedNodes').forEach((n: any) => {
          const props = n.properties;
          nodes.push({
            id: props.id,
            name: props.name,
            hsk_level: props.hsk_level,
            hierarchy: props.hierarchy,
            language_binding: props.language_binding,
            embedding: props.embedding || [],
          });
        });
        
        r.get('rels').forEach((rel: any) => {
          edges.push({
            from: rel.start.properties.id,
            to: rel.end.properties.id,
            type: rel.type,
          });
        });
      });
      
      // 去重
      const uniqueNodes = nodes.filter((node, index, self) => 
        index === self.findIndex(n => n.id === node.id)
      );
      
      return { nodes: uniqueNodes, edges };
    } finally {
      await session.close();
    }
  }

  /**
   * 同步到Supabase：将Neo4j数据备份到Supabase
   */
  async syncToSupabase(): Promise<{ success: boolean; message: string }> {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();
    
    try {
      // 获取所有文化节点
      const nodes = await this.getAllCultureNodes();
      
      // 获取所有跨文化对比
      const contrasts = await this.getAllCrossCultureContrasts();
      
      // 同步CultureNode到Supabase
      for (const node of nodes) {
        await supabase.from('cultural_knowledge_points').upsert({
          id: node.id,
          hsk_level: this.parseHskLevel(node.hsk_level),
          layer: this.getLayerFromHierarchy(node.hierarchy),
          category: this.getCategoryFromHierarchy(node.hierarchy),
          content_json: {
            zh: { topic: node.name, language_bindings: [node.language_binding] },
            neo4j_id: node.id,
          },
        }, { onConflict: 'id' });
      }
      
      // 同步CrossCultureContrast到Supabase
      for (const contrast of contrasts) {
        if (!contrast.target_language) continue;
        
        await supabase.from('cross_cultural_comparisons').upsert({
          id: contrast.id,
          culture_code: this.getCultureCode(contrast.target_language),
          dimension: 'cultural_customs',
          similarities: contrast.similarities,
          differences: contrast.differences,
          chinese_feature: contrast.chinese_feature,
          target_culture_feature: contrast.home_feature,
          pragmatic_tips: contrast.pragmatic_tips,
          demographic_diff: contrast.demographic_diff,
          knowledge_point_id: this.extractKnowledgePointId(contrast.id),
        }, { onConflict: 'id' });
      }
      
      return { success: true, message: `已同步 ${nodes.length} 个知识点和 ${contrasts.length} 条对比数据` };
    } catch (error) {
      return { success: false, message: `同步失败: ${error}` };
    }
  }

  private parseHskLevel(level: string | null): number {
    if (!level) return 1;
    const match = level.match(/HSK\s*(\d+)/i);
    return match ? parseInt(match[1]) : 1;
  }

  private getLayerFromHierarchy(hierarchy: string | null): number {
    if (!hierarchy) return 1;
    if (hierarchy.includes('基础')) return 1;
    if (hierarchy.includes('进阶')) return 2;
    return 3;
  }

  private getCategoryFromHierarchy(hierarchy: string | null): string {
    if (!hierarchy) return 'social_life';
    if (hierarchy.includes('交际') || hierarchy.includes('寒暄')) return 'social_life';
    if (hierarchy.includes('饮食') || hierarchy.includes('饮食')) return 'social_life';
    if (hierarchy.includes('传统')) return 'traditional_culture';
    if (hierarchy.includes('当代')) return 'contemporary_china';
    return 'social_life';
  }

  private getCultureCode(language: string): string {
    const map: Record<string, string> = {
      'English': 'en',
      'english': 'en',
      'Japanese': 'ja',
      'japanese': 'ja',
      '한국어': 'ko',
      'korean': 'ko',
      'Español': 'es',
      'espanol': 'es',
      'العربية': 'ar',
      'arabic': 'ar',
      'Русский': 'ru',
      'russian': 'ru',
      'Français': 'fr',
      'french': 'fr',
      'ภาษาไทย': 'th',
      'thai': 'th',
    };
    return map[language] || 'en';
  }

  private extractKnowledgePointId(contrastId: string): string {
    // 假设contrast_id格式为: contrast_xxx_lang
    const parts = contrastId.split('_');
    if (parts.length >= 2) {
      return parts.slice(1, -1).join('_');
    }
    return contrastId;
  }
}

// 导出单例
export const knowledgeGraphService = new KnowledgeGraphService();
