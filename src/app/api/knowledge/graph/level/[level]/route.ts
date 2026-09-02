/**
 * 按HSK等级获取知识点
 * GET /api/knowledge/graph/level/[level]
 */

import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/lib/knowledge-graph-neo4j-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { level } = await params;
    const nodes = await knowledgeGraphService.getCultureNodesByLevel(level);
    return NextResponse.json({ success: true, data: nodes, count: nodes.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
