/**
 * Neo4j 知识图谱 API
 * GET: 获取图谱统计、节点、关系
 * POST: 触发数据迁移
 */

import { NextRequest, NextResponse } from 'next/server';
import { neo4jService, getKnowledgeGraphStats } from '@/lib/neo4j-service';
import { fullMigration, validateMigration } from '@/lib/neo4j-migration';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const level = searchParams.get('level');
    const kpId = searchParams.get('kp_id');

    // 连接 Neo4j
    const connected = await neo4jService.connect();
    if (!connected) {
      const lastError = neo4jService.getLastError();
      return NextResponse.json({
        success: false,
        error: lastError || 'Neo4j 连接失败，请检查服务端日志',
        hint: '请确认 .env 中 NEO4J_URI/NEO4J_USERNAME/NEO4J_PASSWORD 配置正确，并重启开发服务器',
      }, { status: 503 });
    }

    switch (action) {
      case 'stats':
        // 获取图谱统计
        const stats = await getKnowledgeGraphStats();
        return NextResponse.json({
          success: true,
          stats,
          source: 'neo4j'
        });

      case 'nodes':
        // 获取所有节点（包含完整属性）
        const nodes = await neo4jService.query(`
          MATCH (n:CultureNode)
          RETURN n
          ORDER BY n.hsk_level, n.category
        `);
        // 转换节点数据，保留所有属性
        const graphNodes = nodes.map((record: Record<string, unknown>, idx: number) => {
          const n = record.n as Record<string, unknown>;
          return {
            id: n.id || n.name || `node_${idx}`,
            topic: n.topic || n.name || n.term || n.文化术语 || null,
            hsk_level: n.hsk_level || null,
            category: n.category || null,
            subcategory: n.subcategory || null,
            parent_name: n.parent_name || null,
            is_split_child: Boolean(n.is_split_child) || false,
            is_aggregate: Boolean(n.is_aggregate) || Boolean(n.parent_name) || false,
            // 保留所有详细字段
            hierarchy: n.hierarchy || null,
            language_binding: n.language_binding || null,
            description: n.description || n.description_zh || null,
            definition: n.definition || n.definition_zh || null,
            usage_notes: n.usage_notes || n.usage || null,
            cultural_significance: n.cultural_significance || null,
            // 保留其他可能存在的属性
            ...n
          };
        });
        return NextResponse.json({ success: true, nodes: graphNodes });

      case 'contrasts':
        // 获取跨文化对比节点 (新创建的聚类对比节点)
        const contrastNodes = await neo4jService.query(`
          MATCH (c:CrossCultureContrast)
          RETURN c.id as id, c.name as name, c.theme as theme,
                 c.hsk_level as hsk_level, c.category as category,
                 c.node_count as node_count, c.description as description
          ORDER BY c.node_count DESC
        `);
        return NextResponse.json({ success: true, contrastNodes });

      case 'contrast_nodes':
        // 获取跨文化对比节点及其关联的知识点
        const contrastWithNodes = await neo4jService.query(`
          MATCH (c:CrossCultureContrast)
          OPTIONAL MATCH (cn:CultureNode)-[:BELONGS_TO_CONTRAST]->(c)
          RETURN c.id as contrast_id, c.name as contrast_name, 
                 c.theme as theme, c.hsk_level as hsk_level,
                 c.category as category, c.node_count as node_count,
                 collect({
                   id: cn.id, 
                   topic: cn.topic, 
                   hsk_level: cn.hsk_level,
                   category: cn.category
                 }) as related_nodes
          ORDER BY c.node_count DESC
        `);
        return NextResponse.json({ success: true, contrasts: contrastWithNodes });

      case 'relations':
        // 获取跨文化对比关系 (原始的 CONTRASTS_WITH 关系)
        const contrasts = await neo4jService.query(`
          MATCH (source:CultureNode)-[r:CONTRASTS_WITH]->(target:CultureNode)
          RETURN source.id as source_id, source.topic as source_topic,
                 target.id as target_id, target.topic as target_topic,
                 r.target_culture as target_culture,
                 r.cultural_dimension as cultural_dimension,
                 r.similarities as similarities,
                 r.differences as differences
          LIMIT 50
        `);
        return NextResponse.json({ success: true, contrasts });

      case 'hierarchy':
        // 获取完整的层级结构（Level + Domain + CultureNode）
        const levels = await neo4jService.query(`
          MATCH (l:Level)
          OPTIONAL MATCH (n:CultureNode)-[:BELONGS_TO_LEVEL]->(l)
          WITH l, count(n) as nodeCount
          RETURN l.id as id, l.name as name, l.level_order as order, 
                 l.description as description, l.color as color,
                 nodeCount
          ORDER BY l.level_order
        `);

        const domains = await neo4jService.query(`
          MATCH (d:Domain)
          OPTIONAL MATCH (n:CultureNode)-[:BELONGS_TO_DOMAIN]->(d)
          WITH d, count(n) as nodeCount
          RETURN d.id as id, d.name as name, d.order as order,
                 d.keywords as keywords, d.icon as icon,
                 nodeCount
          ORDER BY d.order
        `);

        // 获取跨文化对比节点作为额外分类
        const crossCultureNodes = await neo4jService.query(`
          MATCH (c:CrossCultureContrast)
          RETURN c.id as id, c.name as name, c.theme as theme,
                 c.hsk_level as hsk_level, c.category as category,
                 c.node_count as node_count
          ORDER BY c.node_count DESC
        `);

        return NextResponse.json({
          success: true,
          levels,
          domains,
          contrastNodes: crossCultureNodes
        });

      case 'pragmatic_tree':
        // 返回三级语用任务树: Domain → Scene（含 Task 计数）
        const pragmaticTree = await neo4jService.query(`
          MATCH (d:Domain)
          OPTIONAL MATCH (d)-[:HAS_SCENE]->(s:Scene)
          OPTIONAL MATCH (s)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
          WITH d, s, count(kp) AS taskCount
          ORDER BY d.name, s.name
          WITH d, collect(
            CASE WHEN s IS NOT NULL THEN {
              id: s.id,
              name: s.name,
              name_en: s.name_en,
              icon: s.icon,
              description: s.description,
              task_count: taskCount
            } ELSE null END
          ) AS scenes
          RETURN {
            id: d.id,
            name: d.name,
            name_en: d.name_en,
            icon: d.icon,
            description: d.description,
            scenes: [scene IN scenes WHERE scene IS NOT NULL]
          } AS domain
          ORDER BY d.name
        `);
        return NextResponse.json({
          success: true,
          domains: pragmaticTree.map((r: Record<string, unknown>) => r.domain),
        });

      case 'scene_tasks':
        // 返回指定 Scene 下的所有 KnowledgePoint (Task) 详情
        const sceneId = searchParams.get('scene_id');
        if (!sceneId) {
          return NextResponse.json({ success: false, error: '缺少 scene_id 参数' }, { status: 400 });
        }
        const tasks = await neo4jService.query(`
          MATCH (s:Scene {id: $sceneId})-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
          RETURN kp.id AS id,
                 kp.name AS name,
                 kp.pragmatic_intent AS pragmatic_intent,
                 kp.cultural_complexity AS cultural_complexity,
                 kp.high_context AS high_context,
                 kp.hsk_level AS hsk_level,
                 kp.l1_conflict_points AS l1_conflict_points
          ORDER BY kp.cultural_complexity
        `, { sceneId });
        return NextResponse.json({ success: true, tasks });

      case 'migrate':
        // 检查是否需要迁移
        const currentStats = await getKnowledgeGraphStats();
        if (currentStats.nodes > 0) {
          return NextResponse.json({
            success: true,
            message: '数据已存在，无需重复迁移',
            stats: currentStats
          });
        }
        return NextResponse.json({
          success: true,
          message: '请使用 POST 方法触发迁移'
        });

      default:
        return NextResponse.json({ error: '未知 action' }, { status: 400 });
    }

  } catch (error) {
    console.error('[Neo4j API] Error:', error);
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    // 连接 Neo4j
    const connected = await neo4jService.connect();
    if (!connected) {
      const lastError = neo4jService.getLastError();
      return NextResponse.json({
        success: false,
        error: lastError || 'Neo4j 连接失败，请检查服务端日志',
      }, { status: 503 });
    }

    switch (action) {
      case 'migrate':
        // 执行完整迁移
        console.log('[Neo4j API] 开始迁移数据...');
        const result = await fullMigration();
        return NextResponse.json({
          success: result.success,
          message: '迁移完成',
          nodesCreated: result.nodesCreated,
          relationshipsCreated: result.relationshipsCreated,
          errors: result.errors
        });

      case 'validate':
        const validation = await validateMigration();
        return NextResponse.json({ success: true, validation });

      case 'test':
        // 测试连接
        const health = await neo4jService.healthCheck();
        return NextResponse.json({
          success: health.connected,
          message: health.connected ? 'Neo4j 连接正常' : 'Neo4j 连接失败',
          connected: health.connected,
          version: health.version,
          nodes: health.nodes,
          relationships: health.relationships
        });

      default:
        return NextResponse.json({ error: '未知 action' }, { status: 400 });
    }

  } catch (error) {
    console.error('[Neo4j API] Error:', error);
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
