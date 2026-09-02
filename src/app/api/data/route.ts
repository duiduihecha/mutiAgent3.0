/**
 * 统一数据API
 * GET /api/data/stats - 获取系统整体统计
 * GET /api/data/knowledge - 获取统一知识点
 * GET /api/data/comparisons - 获取统一跨文化对比
 * POST /api/data/answer - 智能问答
 */

import { NextRequest, NextResponse } from 'next/server';
import { unifiedDataService } from '@/lib/unified-data-service';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'stats':
        const stats = await unifiedDataService.getSystemStats();
        return NextResponse.json({ success: true, data: stats });

      case 'knowledge':
        const level = searchParams.get('level');
        const knowledgePoints = await unifiedDataService.getUnifiedKnowledgePoints(
          level ? parseInt(level) : undefined
        );
        return NextResponse.json({ success: true, data: knowledgePoints, count: knowledgePoints.length });

      case 'comparisons':
        const kpId = searchParams.get('kp_id');
        if (kpId) {
          const comparisons = await unifiedDataService.getUnifiedComparisons(kpId);
          return NextResponse.json({ success: true, data: comparisons, count: comparisons.length });
        }
        return NextResponse.json({ error: 'Missing kp_id parameter' }, { status: 400 });

      case 'path':
        const startId = searchParams.get('start_id');
        const targetLevel = searchParams.get('target_level');
        if (startId && targetLevel) {
          const path = await unifiedDataService.getRecommendedLearningPath(
            startId,
            parseInt(targetLevel)
          );
          return NextResponse.json({ success: true, data: path });
        }
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

      default:
        const defaultStats = await unifiedDataService.getSystemStats();
        return NextResponse.json({ success: true, data: defaultStats });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, question } = body;

    if (action === 'answer' && question) {
      const result = await unifiedDataService.answerWithKnowledgeGraph(question);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
