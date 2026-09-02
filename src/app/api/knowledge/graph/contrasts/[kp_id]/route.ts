/**
 * 获取知识点的跨文化对比
 * GET /api/knowledge/graph/contrasts/[kp_id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/lib/knowledge-graph-neo4j-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kp_id: string }> }
) {
  try {
    const { kp_id } = await params;
    const contrasts = await knowledgeGraphService.getCrossCultureContrasts(kp_id);
    return NextResponse.json({ success: true, data: contrasts, count: contrasts.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
