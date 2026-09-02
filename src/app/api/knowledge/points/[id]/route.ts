/**
 * 知识点详情API
 */

import { NextRequest, NextResponse } from 'next/server';
import { culturalKnowledgeService, culturalExplanationService } from '@/lib/knowledge-base-service';

// GET /api/knowledge/points/[id] - 获取知识点详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const language_code = searchParams.get('language_code');

    // 获取知识点详情
    const knowledgePoint = await culturalKnowledgeService.getKnowledgePointById(id);

    // 如果指定了语言，获取该语言的阐释
    let explanation = null;
    if (language_code) {
      explanation = await culturalExplanationService.getExplanation(id, language_code);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...knowledgePoint,
        explanation
      }
    });
  } catch (error) {
    console.error('Error fetching knowledge point:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/knowledge/points/[id] - 更新知识点
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    const allowedFields = ['hsk_level', 'layer', 'language_binding_points', 'content_json'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const data = await culturalKnowledgeService.updateKnowledgePoint(id, updates);

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error updating knowledge point:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/knowledge/points/[id] - 删除知识点
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await culturalKnowledgeService.deleteKnowledgePoint(id);

    return NextResponse.json({
      success: true,
      message: 'Knowledge point deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting knowledge point:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
