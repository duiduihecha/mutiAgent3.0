/**
 * 知识库API - 知识点管理
 */

import { NextRequest, NextResponse } from 'next/server';
import { culturalKnowledgeService } from '@/lib/knowledge-base-service';

// GET /api/knowledge/points - 获取知识点列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const hsk_level = searchParams.get('hsk_level');
    const layer = searchParams.get('layer');
    const page = parseInt(searchParams.get('page') || '1');
    const page_size = parseInt(searchParams.get('page_size') || '20');

    const result = await culturalKnowledgeService.getKnowledgePoints({
      hsk_level: hsk_level ? parseInt(hsk_level) : undefined,
      layer: layer ? parseInt(layer) as 1 | 2 | 3 : undefined,
      page,
      page_size
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching knowledge points:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/knowledge/points - 创建知识点
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hsk_level, layer, language_binding_points, content_json } = body;

    if (!hsk_level || !layer || !content_json) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: hsk_level, layer, content_json' },
        { status: 400 }
      );
    }

    const data = await culturalKnowledgeService.createKnowledgePoint({
      hsk_level,
      layer,
      language_binding_points: language_binding_points || [],
      content_json
    });

    return NextResponse.json({
      success: true,
      data
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating knowledge point:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
