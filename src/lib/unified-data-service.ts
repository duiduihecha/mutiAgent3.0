/**
 * 统一数据服务
 * 整合Supabase PostgreSQL和Neo4j知识图谱两个数据源
 * 
 * 设计原则：
 * - Supabase: 结构化学习者数据、学习记录、评估数据
 * - Neo4j: 文化知识点、跨文化对比、语义关联图谱
 */

import { knowledgeGraphService, type CultureNode, type CrossCultureContrast } from './knowledge-graph-neo4j-service';
import { CulturalKnowledgeService, CrossCulturalComparisonService } from './knowledge-base-service';

// ==================== 类型定义 ====================

export interface UnifiedKnowledgePoint {
  id: string;
  source: 'supabase' | 'neo4j' | 'merged';
  hsk_level: number;
  layer: number;
  name: string;
  content: string;
  language_bindings: string[];
  category: string;
  subcategory: string;
  embedding?: number[];
}

export interface UnifiedCrossCulturalComparison {
  id: string;
  source: 'supabase' | 'neo4j';
  knowledge_point_id: string;
  knowledge_point_name: string;
  culture_code: string;
  culture_name: string;
  dimension: string;
  similarities: string;
  differences: string;
  chinese_feature: string;
  target_culture_feature: string;
  pragmatic_tips: string;
  demographic_diff: string;
}

export interface SystemStats {
  supabase: {
    knowledge_points: number;
    cross_cultural_comparisons: number;
    learners: number;
  };
  neo4j: {
    culture_nodes: number;
    cross_culture_contrasts: number;
    users: number;
    relationships: number;
  };
  unified: {
    total_knowledge_points: number;
    total_comparisons: number;
    integration_status: 'partial' | 'full';
  };
}

// ==================== 统一数据服务 ====================

export class UnifiedDataService {
  private neo4jService = knowledgeGraphService;
  private supabaseKnowledge = new CulturalKnowledgeService();
  private supabaseComparisons = new CrossCulturalComparisonService();

  /**
   * 获取系统整体统计
   */
  async getSystemStats(): Promise<SystemStats> {
    try {
      // 并行获取两个数据源的统计
      const [neo4jStats, supabaseStats] = await Promise.all([
        this.neo4jService.getStats().catch(() => ({
          cultureNodes: 0,
          crossCultureContrasts: 0,
          users: 0,
          relationships: 0,
        })),
        this.getSupabaseStats().catch(() => ({
          knowledge_points: 0,
          cross_cultural_comparisons: 0,
          learners: 0,
        })),
      ]);

      return {
        supabase: {
          knowledge_points: supabaseStats.knowledge_points,
          cross_cultural_comparisons: supabaseStats.cross_cultural_comparisons,
          learners: supabaseStats.learners,
        },
        neo4j: {
          culture_nodes: neo4jStats.cultureNodes,
          cross_culture_contrasts: neo4jStats.crossCultureContrasts,
          users: neo4jStats.users,
          relationships: neo4jStats.relationships,
        },
        unified: {
          total_knowledge_points: Math.max(neo4jStats.cultureNodes, supabaseStats.knowledge_points),
          total_comparisons: Math.max(neo4jStats.crossCultureContrasts, supabaseStats.cross_cultural_comparisons),
          integration_status: 'partial',
        },
      };
    } catch (error) {
      console.error('Failed to get system stats:', error);
      throw error;
    }
  }

  private async getSupabaseStats(): Promise<{
    knowledge_points: number;
    cross_cultural_comparisons: number;
    learners: number;
  }> {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

    const [kpResult, ccResult, learnerResult] = await Promise.all([
      supabase.from('cultural_knowledge_points').select('id', { count: 'exact', head: true }),
      supabase.from('cross_cultural_comparisons').select('id', { count: 'exact', head: true }),
      supabase.from('learners').select('id', { count: 'exact', head: true }),
    ]);

    return {
      knowledge_points: kpResult.count || 0,
      cross_cultural_comparisons: ccResult.count || 0,
      learners: learnerResult.count || 0,
    };
  }

  /**
   * 获取统一的知识点点列表（优先Neo4j，补充Supabase）
   */
  async getUnifiedKnowledgePoints(hskLevel?: number): Promise<UnifiedKnowledgePoint[]> {
    try {
      // 从Neo4j获取知识点
      const neo4jNodes = await this.neo4jService.getAllCultureNodes();
      
      // 转换为统一格式
      const unified = neo4jNodes.map(node => this.convertNeo4jNode(node));
      
      // 如果有HSK等级筛选
      if (hskLevel) {
        return unified.filter(kp => kp.hsk_level === hskLevel);
      }
      
      return unified;
    } catch (error) {
      console.error('Neo4j query failed, falling back to Supabase:', error);
      // 降级到Supabase
      const result = await this.supabaseKnowledge.getKnowledgePoints({
        page: 1,
        page_size: 100,
        hsk_level: hskLevel,
      });
      return result.items.map((item: Record<string, unknown>) => this.convertSupabaseKP(item));
    }
  }

  /**
   * 获取知识点的跨文化对比（合并两个数据源）
   */
  async getUnifiedComparisons(knowledgePointId: string): Promise<UnifiedCrossCulturalComparison[]> {
    const results: UnifiedCrossCulturalComparison[] = [];

    try {
      // 从Neo4j获取
      const neo4jContrasts = await this.neo4jService.getCrossCultureContrasts(knowledgePointId);
      results.push(...neo4jContrasts.map(c => this.convertNeo4jContrast(c, knowledgePointId)));
    } catch (error) {
      console.error('Neo4j contrasts query failed:', error);
    }

    try {
      // 从Supabase获取
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const supabase = getSupabaseClient();
      const { data: supabaseContrasts } = await supabase
        .from('cross_cultural_comparisons')
        .select('*')
        .eq('knowledge_point_id', knowledgePointId);
      
      if (supabaseContrasts) {
        results.push(...supabaseContrasts.map(c => this.convertSupabaseContrast(c)));
      }
    } catch (error) {
      console.error('Supabase contrasts query failed:', error);
    }

    return results;
  }

  /**
   * 获取推荐学习路径（基于知识图谱关联）
   */
  async getRecommendedLearningPath(startKpId: string, targetLevel: number): Promise<string[]> {
    try {
      // 获取知识点的关联图
      const graph = await this.neo4jService.getRelatedKnowledgeGraph(startKpId, 3);
      
      // 简单路径：按HSK等级排序
      const sortedNodes = graph.nodes
        .filter(n => this.parseHskLevel(n.hsk_level) <= targetLevel)
        .sort((a, b) => this.parseHskLevel(a.hsk_level) - this.parseHskLevel(b.hsk_level));
      
      return sortedNodes.map(n => n.id);
    } catch (error) {
      console.error('Failed to get learning path:', error);
      return [startKpId];
    }
  }

  /**
   * 智能问答（结合知识图谱）
   */
  async answerWithKnowledgeGraph(question: string): Promise<{
    answer: string;
    related_points: CultureNode[];
    confidence: number;
  }> {
    try {
      // 简单的关键词匹配
      const allNodes = await this.neo4jService.getAllCultureNodes();
      const keywords = question.toLowerCase().split(/\s+/);
      
      const scored = allNodes.map(node => {
        const name = node.name.toLowerCase();
        const binding = (node.language_binding || '').toLowerCase();
        let score = 0;
        
        for (const keyword of keywords) {
          if (name.includes(keyword)) score += 2;
          if (binding.includes(keyword)) score += 1;
        }
        
        return { node, score };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
      
      if (scored.length > 0) {
        const best = scored[0];
        const contrasts = await this.neo4jService.getCrossCultureContrasts(best.node.id);
        
        return {
          answer: `关于"${best.node.name}"的文化知识点：\n\n${contrasts[0]?.chinese_feature || '暂无详细说明'}`,
          related_points: scored.slice(0, 3).map(s => s.node),
          confidence: Math.min(best.score / 4, 1),
        };
      }
      
      return {
        answer: '抱歉，我在知识图谱中未找到相关内容。',
        related_points: [],
        confidence: 0,
      };
    } catch (error) {
      console.error('Failed to answer with knowledge graph:', error);
      throw error;
    }
  }

  // ==================== 私有转换方法 ====================

  private convertNeo4jNode(node: CultureNode): UnifiedKnowledgePoint {
    return {
      id: node.id,
      source: 'neo4j',
      hsk_level: this.parseHskLevel(node.hsk_level),
      layer: this.getLayerFromHierarchy(node.hierarchy),
      name: node.name,
      content: node.name,
      language_bindings: node.language_binding ? [node.language_binding] : [],
      category: this.getCategoryFromHierarchy(node.hierarchy),
      subcategory: '',
      embedding: node.embedding,
    };
  }

  private convertSupabaseKP(kp: Record<string, unknown>): UnifiedKnowledgePoint {
    const contentJson = kp.content_json as Record<string, unknown> || {};
    const zh = contentJson.zh as Record<string, unknown> || contentJson;
    
    return {
      id: kp.id as string,
      source: 'supabase',
      hsk_level: kp.hsk_level as number,
      layer: kp.layer as number,
      name: zh.topic as string || '',
      content: JSON.stringify(contentJson),
      language_bindings: (zh.language_bindings as string[]) || [],
      category: kp.category as string || '',
      subcategory: (kp.subcategory as string) || '',
    };
  }

  private convertNeo4jContrast(
    contrast: CrossCultureContrast, 
    knowledgePointId: string
  ): UnifiedCrossCulturalComparison {
    return {
      id: contrast.id,
      source: 'neo4j',
      knowledge_point_id: knowledgePointId,
      knowledge_point_name: '',
      culture_code: this.getCultureCode(contrast.target_language),
      culture_name: contrast.target_language,
      dimension: 'cultural_customs',
      similarities: contrast.similarities,
      differences: contrast.differences,
      chinese_feature: contrast.chinese_feature,
      target_culture_feature: contrast.home_feature,
      pragmatic_tips: contrast.pragmatic_tips,
      demographic_diff: contrast.demographic_diff,
    };
  }

  private convertSupabaseContrast(contrast: Record<string, unknown>): UnifiedCrossCulturalComparison {
    return {
      id: contrast.id as string,
      source: 'supabase',
      knowledge_point_id: contrast.knowledge_point_id as string,
      knowledge_point_name: '',
      culture_code: contrast.culture_code as string,
      culture_name: this.getCultureName(contrast.culture_code as string),
      dimension: contrast.dimension as string,
      similarities: contrast.similarities as string,
      differences: contrast.differences as string,
      chinese_feature: contrast.chinese_feature as string,
      target_culture_feature: contrast.target_culture_feature as string,
      pragmatic_tips: (contrast.pragmatic_tips as string) || '',
      demographic_diff: (contrast.demographic_diff as string) || '',
    };
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
    if (hierarchy.includes('饮食')) return 'social_life';
    if (hierarchy.includes('传统')) return 'traditional_culture';
    if (hierarchy.includes('当代')) return 'contemporary_china';
    return 'social_life';
  }

  private getCultureCode(language: string): string {
    const map: Record<string, string> = {
      'English': 'en', 'english': 'en',
      'Japanese': 'ja', 'japanese': 'ja',
      '한국어': 'ko', 'korean': 'ko',
      'Español': 'es',
      'العربية': 'ar',
      'Русский': 'ru',
      'Français': 'fr',
      'ภาษาไทย': 'th',
    };
    return map[language] || 'en';
  }

  private getCultureName(code: string): string {
    const map: Record<string, string> = {
      'en': 'English',
      'ja': '日本語',
      'ko': '한국어',
      'es': 'Español',
      'ar': 'العربية',
      'ru': 'Русский',
      'fr': 'Français',
      'th': 'ภาษาไทย',
    };
    return map[code] || code;
  }
}

export const unifiedDataService = new UnifiedDataService();
