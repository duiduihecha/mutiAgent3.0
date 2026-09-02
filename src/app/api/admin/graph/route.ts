import { NextRequest, NextResponse } from "next/server";
import { neo4jService } from "@/lib/neo4j-service";
import { buildPrerequisiteEdges } from "@/lib/learner-graph";
import neo4j from "neo4j-driver";

interface VisNode {
  id: string;
  label: string;
  group: string;
  title?: string;
  [key: string]: unknown;
}

interface VisEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  title?: string;
  dashes?: boolean;
}

const NODE_LABEL_MAP: Record<string, string> = {
  Domain: "领域",
  Scene: "场景",
  KnowledgePoint: "知识点",
  CulturalConcept: "文化概念",
  CulturalDimension: "文化维度",
  HomeCulture: "母语文化圈",
  HSKWord: "HSK词汇",
  GrammarPoint: "语法点",
  LanguagePoint: "语言点",
  Learner: "学习者",
  CultureNode: "文化节点",
  CrossCultureContrast: "跨文化对比",
  ErrorCategory: "偏误大类",
  ErrorPattern: "偏误模式",
  LinguisticFeature: "语言学特征",
  Etiology: "偏误成因",
  InterventionStrategy: "干预策略",
};

const NODE_COLORS: Record<string, string> = {
  Domain: "#0EA5E9",
  Scene: "#14B8A6",
  KnowledgePoint: "#3B82F6",
  CulturalConcept: "#8B5CF6",
  CulturalDimension: "#EF4444",
  HomeCulture: "#F59E0B",
  HSKWord: "#6B7280",
  GrammarPoint: "#10B981",
  LanguagePoint: "#EC4899",
  Learner: "#6366F1",
  CultureNode: "#84CC16",
  CrossCultureContrast: "#F97316",
  ErrorCategory: "#DC2626",
  ErrorPattern: "#EA580C",
  LinguisticFeature: "#7C3AED",
  Etiology: "#0891B2",
  InterventionStrategy: "#059669",
};

const NODE_SHAPES: Record<string, string> = {
  Domain: "dot",
  Scene: "dot",
  KnowledgePoint: "dot",
  CulturalConcept: "diamond",
  CulturalDimension: "triangle",
  HomeCulture: "star",
  HSKWord: "dot",
  GrammarPoint: "hexagon",
  LanguagePoint: "square",
  Learner: "dot",
  CultureNode: "dot",
  CrossCultureContrast: "diamond",
  ErrorCategory: "square",
  ErrorPattern: "diamond",
  LinguisticFeature: "triangle",
  Etiology: "hexagon",
  InterventionStrategy: "star",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const includeHSK = searchParams.get("include_hsk") === "1";
  const hskLimit = parseInt(searchParams.get("hsk_limit") || "100", 10);
  const includeLearners = searchParams.get("include_learners") === "1";

  // 管理操作：构建 PREREQUISITE 边
  if (action === "build_prerequisites") {
    try {
      await neo4jService.connect();
      const result = await buildPrerequisiteEdges();
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: (err as Error).message || "构建前置边失败" },
        { status: 500 },
      );
    }
  }

  try {
    await neo4jService.connect();

    // --- 查询所有核心节点 ---
    const coreLabels = [
      // L1 文化语用概念层
      "Domain", "Scene", "KnowledgePoint",
      "CulturalConcept", "LanguagePoint", "GrammarPoint",
      "CultureNode", "CrossCultureContrast",
      // L2 跨文化维度层
      "CulturalDimension", "HomeCulture",
      // L4 学习者认知层
      "ErrorCategory", "ErrorPattern", "LinguisticFeature",
      "Etiology", "InterventionStrategy",
    ];

    const nodeQueries = coreLabels.map((label) =>
      neo4jService.query<{
        id: string; labels: string[]; properties: Record<string, unknown>;
      }>(
        `MATCH (n:${label}) RETURN n.id AS id, labels(n) AS labels, properties(n) AS properties LIMIT 5000`
      )
    );

    if (includeHSK) {
      nodeQueries.push(
        neo4jService.query<{
          id: string; labels: string[]; properties: Record<string, unknown>;
        }>(
          `MATCH (n:HSKWord) RETURN n.id AS id, labels(n) AS labels, properties(n) AS properties LIMIT $limit`,
          { limit: neo4j.int(hskLimit) }
        )
      );
    }

    if (includeLearners) {
      nodeQueries.push(
        neo4jService.query<{
          id: string; labels: string[]; properties: Record<string, unknown>;
        }>(
          `MATCH (n:Learner) RETURN n.id AS id, labels(n) AS labels, properties(n) AS properties LIMIT 100`
        )
      );
    }

    const allNodeResults = await Promise.all(nodeQueries);
    const nodes: VisNode[] = [];
    const seenIds = new Set<string>();

    for (const rows of allNodeResults) {
      for (const row of rows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);

        const nodeLabel = row.labels[row.labels.length - 1];
        const props = row.properties;
        const displayLabel = props.name || props.lemma || props.id || row.id;

        nodes.push({
          id: row.id,
          label: typeof displayLabel === "string" ? displayLabel.slice(0, 40) : String(displayLabel).slice(0, 40),
          group: nodeLabel,
          title: buildNodeTooltip(nodeLabel, props),
          color: NODE_COLORS[nodeLabel] || "#999",
          shape: NODE_SHAPES[nodeLabel] || "dot",
          size: nodeLabel === "KnowledgePoint" ? 18 : nodeLabel === "Domain" ? 22 : 12,
          ...Object.fromEntries(
            Object.entries(props).filter(([, v]) =>
              typeof v === "string" || typeof v === "number" || typeof v === "boolean"
            )
          ),
        });
      }
    }

    // --- 查询所有关系 ---
    const relQueries = [
      // L1 教学内容结构
      {
        cypher: `MATCH (a)-[r:HAS_SCENE]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:HAS_KNOWLEDGE_POINT]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:RELATES_TO]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:INVOLVES]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      // L2 跨文化维度
      {
        cypher: `MATCH (a)-[r:HAS_DIMENSION]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type, r.weight AS weight LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:MANIFESTED_IN]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:SCORES]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type, r.score AS score LIMIT 2000`,
        params: {},
      },
      // L3 HSK 约束
      {
        cypher: `MATCH (a)-[r:REQUIRES_GRAMMAR]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      // L3/L4 通用
      {
        cypher: `MATCH (a)-[r:BELONGS_TO]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      // L4 偏误诊断链路
      {
        cypher: `MATCH (a)-[r:CAUSED_BY]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type, r.primary AS primary LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:REMEDIATED_BY]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:HAS_FEATURE]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      {
        cypher: `MATCH (a)-[r:FREQUENT_ERROR]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
      // L4 学习路径
      {
        cypher: `MATCH (a)-[r:PREREQUISITE]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT 2000`,
        params: {},
      },
    ];

    if (includeHSK) {
      relQueries.push({
        cypher: `MATCH (a)-[r:REQUIRES_VOCAB]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type LIMIT $limit`,
        params: { limit: neo4j.int(Math.min(hskLimit * 3, 5000)) },
      });
    }

    if (includeLearners) {
      relQueries.push({
        cypher: `MATCH (a:Learner)-[r:MASTERED]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type, r.score AS score LIMIT 2000`,
        params: {},
      });
    }

    const allRelResults = await Promise.all(
      relQueries.map((q) => neo4jService.query<{ from: string; to: string; type: string; [k: string]: unknown }>(q.cypher, q.params))
    );

    const edges: VisEdge[] = [];
    const seenEdgeKeys = new Set<string>();

    for (const rows of allRelResults) {
      for (const row of rows) {
        const edgeKey = `${row.from}|${row.type}|${row.to}`;
        if (seenEdgeKeys.has(edgeKey)) continue;
        seenEdgeKeys.add(edgeKey);

        edges.push({
          id: edgeKey,
          from: row.from,
          to: row.to,
          label: row.type,
          title: buildEdgeTooltip(row),
          dashes: row.type === "REQUIRES_VOCAB",
        });
      }
    }

    // --- 统计信息 ---
    const groupCounts: Record<string, number> = {};
    for (const n of nodes) {
      groupCounts[n.group] = (groupCounts[n.group] || 0) + 1;
    }

    return NextResponse.json({
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        groupCounts,
        nodeColors: NODE_COLORS,
        nodeShapes: NODE_SHAPES,
        nodeLabelMap: NODE_LABEL_MAP,
      },
    });
  } catch (err) {
    console.error("[admin/graph] 查询失败:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Neo4j 查询失败" },
      { status: 500 }
    );
  }
}

function buildNodeTooltip(label: string, props: Record<string, unknown>): string {
  const lines = [`<strong>${NODE_LABEL_MAP[label] || label}</strong>`];
  const showKeys = ["name", "name_en", "lemma", "level", "hsk_level", "framework",
    "short_def", "home_culture_code", "language_code", "knowledge_point_id"];
  for (const key of showKeys) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== "") {
      const val = typeof props[key] === "string" ? props[key] : JSON.stringify(props[key]);
      lines.push(`${key}: ${(val as string).slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}

function buildEdgeTooltip(row: Record<string, unknown>): string {
  const lines = [`<strong>${row.type}</strong>`];
  for (const [k, v] of Object.entries(row)) {
    if (k !== "from" && k !== "to" && k !== "type" && v !== null && v !== undefined) {
      lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}
