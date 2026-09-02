/**
 * 跨文化对比API
 */

import { NextRequest, NextResponse } from 'next/server';
import { crossCulturalComparisonService } from '@/lib/knowledge-base-service';

// GET /api/culture/compare - 获取跨文化对比列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const source_culture_id = searchParams.get('source_culture_id');
    const target_culture = searchParams.get('target_culture');
    const verified = searchParams.get('verified');
    const page = parseInt(searchParams.get('page') || '1');
    const page_size = parseInt(searchParams.get('page_size') || '20');

    const result = await crossCulturalComparisonService.getComparisons({
      source_culture_id: source_culture_id || undefined,
      target_culture: target_culture || undefined,
      verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
      page,
      page_size
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching cross-cultural comparisons:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/culture/compare - 创建跨文化对比
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // 如果是生成对比
    if (action === 'generate') {
      const { chinese_culture_point, target_culture, hsk_level } = body;

      if (!chinese_culture_point || !target_culture || !hsk_level) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: chinese_culture_point, target_culture, hsk_level' },
          { status: 400 }
        );
      }

      const generatedContent = await crossCulturalComparisonService.generateComparison({
        chinese_culture_point,
        target_culture,
        hsk_level
      });

      return NextResponse.json({
        success: true,
        data: {
          generated: true,
          content: generatedContent
        }
      });
    }

    // 否则创建对比记录
    const { source_culture_id, target_culture, similarities, differences, pragmatic_hints, regional_variants } = body;

    if (!source_culture_id || !target_culture) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: source_culture_id, target_culture' },
        { status: 400 }
      );
    }

    const data = await crossCulturalComparisonService.createComparison({
      source_culture_id,
      target_culture,
      similarities: similarities || [],
      differences: differences || [],
      pragmatic_hints: pragmatic_hints || [],
      regional_variants
    });

    return NextResponse.json({
      success: true,
      data
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating cross-cultural comparison:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
