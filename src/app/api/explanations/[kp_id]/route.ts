/**
 * 获取指定知识点的所有语言阐释
 * GET /api/explanations/[kp_id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { multiLanguageService } from '@/lib/multi-language-explanation-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kp_id: string }> }
) {
  try {
    const { kp_id } = await params;
    
    if (!kp_id) {
      return NextResponse.json({ error: '缺少知识点ID' }, { status: 400 });
    }

    const explanations = await multiLanguageService.getExplanationsByKnowledgePoint(kp_id);

    return NextResponse.json({
      success: true,
      data: explanations,
      count: explanations.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `获取阐释失败: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
