/**
 * 知识库服务
 * Knowledge Base Service for Cross-Cultural Chinese Learning
 * 
 * 动态混合知识底座 (K) = K_graph ∪ K_llm ∪ K_expert
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { UnifiedLLMService } from './unified-llm-service';
// 这些导入将在后续功能中启用
// import { knowledge_graph_nodes, knowledge_graph_edges, cultural_knowledge_points, cross_cultural_comparisons, cultural_explanations, bias_keywords } from '@/storage/database/shared/schema';

// ==================== 类型定义 ====================

export interface CulturalKnowledgePointInput {
  hsk_level: number;
  layer: 1 | 2 | 3;
  language_binding_points: string[];
  content_json: Record<string, string>;
}

export interface CrossCulturalComparisonInput {
  source_culture_id: string;
  target_culture: string;
  similarities: string[];
  differences: string[];
  pragmatic_hints: string[];
  regional_variants?: string[];
}

export interface KnowledgeGraphNode {
  id: string;
  node_type: 'culture' | 'language' | 'level' | 'dimension' | 'pragmatic' | 'region';
  node_id: string;
  properties: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: 'correspond' | 'contain' | 'match' | 'taboo' | 'homology' | 'difference';
  properties: Record<string, unknown>;
}

// ==================== 文化知识点服务 ====================

export class CulturalKnowledgeService {
  private client = getSupabaseClient();
  private llmService = new UnifiedLLMService("generation");

  /**
   * 获取知识点列表（支持分页和筛选）
   */
  async getKnowledgePoints(params: {
    hsk_level?: number;
    layer?: number;
    language_binding?: string;
    page?: number;
    page_size?: number;
  }) {
    const { hsk_level, layer, page = 1, page_size = 20 } = params;
    // language_binding参数预留用于后续实现
    
    let query = this.client
      .from('cultural_knowledge_points')
      .select('*', { count: 'exact' });

    if (hsk_level) {
      query = query.eq('hsk_level', hsk_level);
    }
    if (layer) {
      query = query.eq('layer', layer);
    }

    const { data, error, count } = await query
      .range((page - 1) * page_size, page * page_size)
      .order('hsk_level', { ascending: true });

    if (error) throw new Error(`查询知识点失败: ${error.message}`);

    return {
      items: data,
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size)
    };
  }

  /**
   * 获取单个知识点详情
   */
  async getKnowledgePointById(id: string) {
    const { data, error } = await this.client
      .from('cultural_knowledge_points')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`查询知识点详情失败: ${error.message}`);
    if (!data) throw new Error(`知识点不存在: ${id}`);

    return data;
  }

  /**
   * 根据关键词搜索知识点
   */
  async searchKnowledgePoints(keywords: string[]): Promise<unknown[]> {
    // 使用OR条件搜索
    let query = this.client
      .from('cultural_knowledge_points')
      .select('*');

    // 使用textSearch或ilike进行搜索
    const { data, error } = await query
      .limit(100)
      .order('hsk_level', { ascending: true });

    if (error) throw new Error(`搜索知识点失败: ${error.message}`);

    // 客户端过滤 - 确保 content_json 被正确序列化为包含中文的字符串
    const results = data?.filter(item => {
      const contentJsonStr = JSON.stringify(item.content_json || {});
      return keywords.some(keyword => 
        contentJsonStr.includes(keyword)
      );
    }) || [];

    return results;
  }

  /**
   * 创建知识点
   */
  async createKnowledgePoint(input: CulturalKnowledgePointInput) {
    const { data, error } = await this.client
      .from('cultural_knowledge_points')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`创建知识点失败: ${error.message}`);
    return data;
  }

  /**
   * 批量创建知识点
   */
  async batchCreateKnowledgePoints(inputs: CulturalKnowledgePointInput[]) {
    const { data, error } = await this.client
      .from('cultural_knowledge_points')
      .insert(inputs)
      .select();

    if (error) throw new Error(`批量创建知识点失败: ${error.message}`);
    return data;
  }

  /**
   * 更新知识点
   */
  async updateKnowledgePoint(id: string, updates: Partial<CulturalKnowledgePointInput>) {
    const { data, error } = await this.client
      .from('cultural_knowledge_points')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`更新知识点失败: ${error.message}`);
    return data;
  }

  /**
   * 删除知识点
   */
  async deleteKnowledgePoint(id: string) {
    const { error } = await this.client
      .from('cultural_knowledge_points')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`删除知识点失败: ${error.message}`);
    return { success: true };
  }

  /**
   * AI生成知识点内容
   */
  async generateKnowledgeContent(params: {
    topic: string;
    hsk_level: number;
    layer: 1 | 2 | 3;
    target_language: string;
  }) {
    const { topic, hsk_level, layer, target_language } = params;

    const layerDescriptions = {
      1: '基础层(HSK1-3): 仅标注与日常语言表达直接绑定的文化常识，不涉及深度内涵',
      2: '进阶层(HSK4-6): 标注核心文化概念的内涵与语用边界，重点讲解语言应用相关的文化规则',
      3: '高阶层(HSK7-9): 标注文化背后的哲学思想与社会背景，培养跨文化思辨能力'
    };

    const systemPrompt = `你是国际中文教育专家，负责生成标准化的文化知识点内容。

输出格式（严格JSON）：
{
  "language_binding_points": ["绑定的语言点1", "绑定的语言点2"],
  "content_json": {
    "zh": "中文定义",
    "${target_language}": "${target_language}语定义",
    "examples": ["例句1", "例句2"],
    "cultural_notes": "文化注释",
    "taboo_warnings": ["禁忌提醒1", "禁忌提醒2"]
  }
}`;

    const userMessage = `为"${topic}"生成知识点内容：
- HSK等级: ${hsk_level}
- 层级: ${layerDescriptions[layer]}`;

    const response = await this.llmService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], { temperature: 0.5 });

    try {
      return JSON.parse(response.content);
    } catch {
      throw new Error('AI生成内容格式错误');
    }
  }
}

// ==================== 跨文化对比服务 ====================

export class CrossCulturalComparisonService {
  private client = getSupabaseClient();
  private llmService = new UnifiedLLMService("generation");

  /**
   * 获取跨文化对比列表
   */
  async getComparisons(params: {
    source_culture_id?: string;
    target_culture?: string;
    verified?: boolean;
    page?: number;
    page_size?: number;
  }) {
    const { source_culture_id, target_culture, verified, page = 1, page_size = 20 } = params;
    
    let query = this.client
      .from('cross_cultural_comparisons')
      .select('*', { count: 'exact' });

    if (source_culture_id) {
      query = query.eq('source_culture_id', source_culture_id);
    }
    if (target_culture) {
      query = query.eq('target_culture', target_culture);
    }
    if (verified !== undefined) {
      query = query.eq('verified', verified);
    }

    const { data, error, count } = await query
      .range((page - 1) * page_size, page * page_size);

    if (error) throw new Error(`查询跨文化对比失败: ${error.message}`);

    return {
      items: data,
      total: count || 0,
      page,
      page_size
    };
  }

  /**
   * 创建跨文化对比
   */
  async createComparison(input: CrossCulturalComparisonInput) {
    const { data, error } = await this.client
      .from('cross_cultural_comparisons')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`创建跨文化对比失败: ${error.message}`);
    return data;
  }

  /**
   * AI生成跨文化对比内容
   */
  async generateComparison(params: {
    chinese_culture_point: string;
    target_culture: string;
    hsk_level: number;
  }) {
    const { chinese_culture_point, target_culture, hsk_level } = params;

    const systemPrompt = `你是跨文化对比分析专家，负责生成结构化的中西方文化对比内容。

核心原则：
1. 中立性原则：只陈述客观事实差异，绝对不评判文化优劣
2. 边界性原则：明确标注"普遍现象"与"地域/代际差异"
3. 实用性原则：所有对比内容必须对应至少1个中文语用表达点

输出格式（严格JSON）：
{
  "similarities": ["相同点1", "相同点2"],
  "differences": [
    {"chinese_practice": "中国做法", "target_practice": "${target_culture}做法", "description": "描述"}
  ],
  "pragmatic_hints": ["中文表达提示"],
  "regional_variants": ["地域差异说明"]
}`;

    const userMessage = `对比分析：
- 中国文化点：${chinese_culture_point}
- 目标文化：${target_culture}
- HSK等级：${hsk_level}`;

    const response = await this.llmService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], { temperature: 0.4 });

    try {
      return JSON.parse(response.content);
    } catch {
      throw new Error('AI生成内容格式错误');
    }
  }

  /**
   * 标记对比为已审核
   */
  async verifyComparison(id: string) {
    const { data, error } = await this.client
      .from('cross_cultural_comparisons')
      .update({ verified: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`审核跨文化对比失败: ${error.message}`);
    return data;
  }
}

// ==================== 知识图谱服务 ====================

export class KnowledgeGraphService {
  private client = getSupabaseClient();

  /**
   * 创建知识图谱节点
   */
  async createNode(input: Omit<KnowledgeGraphNode, 'id'>) {
    const { data, error } = await this.client
      .from('knowledge_graph_nodes')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`创建知识图谱节点失败: ${error.message}`);
    return data;
  }

  /**
   * 创建知识图谱边
   */
  async createEdge(input: Omit<KnowledgeGraphEdge, 'id'>) {
    const { data, error } = await this.client
      .from('knowledge_graph_edges')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`创建知识图谱边失败: ${error.message}`);
    return data;
  }

  /**
   * 查询节点的所有关系
   */
  async getNodeRelations(nodeId: string) {
    // 查询从该节点出发的边
    const { data: outgoing, error: error1 } = await this.client
      .from('knowledge_graph_edges')
      .select('*, target_node:knowledge_graph_nodes(*)')
      .eq('source_node_id', nodeId);

    if (error1) throw new Error(`查询节点关系失败: ${error1.message}`);

    // 查询指向该节点的边
    const { data: incoming, error: error2 } = await this.client
      .from('knowledge_graph_edges')
      .select('*, source_node:knowledge_graph_nodes(*)')
      .eq('target_node_id', nodeId);

    if (error2) throw new Error(`查询节点关系失败: ${error2.message}`);

    return {
      outgoing: outgoing || [],
      incoming: incoming || []
    };
  }

  /**
   * 根据类型查询节点
   */
  async getNodesByType(nodeType: string) {
    const { data, error } = await this.client
      .from('knowledge_graph_nodes')
      .select('*')
      .eq('node_type', nodeType);

    if (error) throw new Error(`查询节点失败: ${error.message}`);
    return data;
  }

  /**
   * 根据边类型查询关系
   */
  async getEdgesByType(edgeType: string) {
    const { data, error } = await this.client
      .from('knowledge_graph_edges')
      .select('*')
      .eq('edge_type', edgeType);

    if (error) throw new Error(`查询边失败: ${error.message}`);
    return data;
  }

  /**
   * 查找两点之间的路径
   */
  async findPath(sourceNodeId: string, targetNodeId: string, maxDepth = 3) {
    // BFS 查找路径
    const visited = new Set<string>();
    const queue: { node_id: string; path: string[] }[] = [{ node_id: sourceNodeId, path: [sourceNodeId] }];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.node_id === targetNodeId) {
        return { found: true, path: current.path };
      }
      
      if (current.path.length >= maxDepth) {
        continue;
      }
      
      if (visited.has(current.node_id)) {
        continue;
      }
      visited.add(current.node_id);
      
      // 查找相邻节点
      const { data: edges } = await this.client
        .from('knowledge_graph_edges')
        .select('target_node_id')
        .eq('source_node_id', current.node_id);
      
      if (edges) {
        for (const edge of edges) {
          if (!visited.has(edge.target_node_id)) {
            queue.push({
              node_id: edge.target_node_id,
              path: [...current.path, edge.target_node_id]
            });
          }
        }
      }
    }
    
    return { found: false, path: [] };
  }
}

// ==================== 文化阐释服务 ====================

export class CulturalExplanationService {
  private client = getSupabaseClient();

  /**
   * 获取知识点在某语言下的阐释
   */
  async getExplanation(knowledgePointId: string, languageCode: string) {
    const { data, error } = await this.client
      .from('cultural_explanations')
      .select('*')
      .eq('knowledge_point_id', knowledgePointId)
      .eq('language_code', languageCode)
      .maybeSingle();

    if (error) throw new Error(`查询文化阐释失败: ${error.message}`);
    return data;
  }

  /**
   * 创建文化阐释
   */
  async createExplanation(input: {
    knowledge_point_id: string;
    language_code: string;
    precise_definition: string;
    scene_introduction: string;
    pragmatic_rules: string[];
    examples: Array<{ chinese: string; translation: string; notes?: string }>;
    difficulty_notes?: string;
    taboo_warnings?: string[];
  }) {
    const { data, error } = await this.client
      .from('cultural_explanations')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`创建文化阐释失败: ${error.message}`);
    return data;
  }

  /**
   * 批量获取多语言阐释
   */
  async getMultiLanguageExplanations(knowledgePointId: string, languageCodes: string[]) {
    const { data, error } = await this.client
      .from('cultural_explanations')
      .select('*')
      .eq('knowledge_point_id', knowledgePointId)
      .in('language_code', languageCodes);

    if (error) throw new Error(`批量查询文化阐释失败: ${error.message}`);
    return data;
  }
}

// ==================== 导出服务实例 ====================

export const culturalKnowledgeService = new CulturalKnowledgeService();
export const crossCulturalComparisonService = new CrossCulturalComparisonService();
export const knowledgeGraphService = new KnowledgeGraphService();
export const culturalExplanationService = new CulturalExplanationService();
