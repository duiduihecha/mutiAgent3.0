/**
 * 跨文化对比管理API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateCrossCulturalComparisons, CULTURAL_DIMENSIONS, TARGET_CULTURES } from '@/lib/generate-cross-cultural-data';

// GET /api/culture/admin/stats - 获取跨文化对比统计
export async function GET(_request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // 按目标文化统计
    const { data: byCulture, error: cultureError } = await client
      .from('cross_cultural_comparisons')
      .select('target_culture');

    if (cultureError) throw cultureError;

    const cultureCount: Record<string, number> = {};
    for (const item of byCulture || []) {
      const culture = item.target_culture;
      cultureCount[culture] = (cultureCount[culture] || 0) + 1;
    }

    // 统计已审核的数量
    const { data: verified } = await client
      .from('cross_cultural_comparisons')
      .select('verified')
      .eq('verified', true);

    return NextResponse.json({
      success: true,
      data: {
        total_comparisons: (byCulture || []).length,
        by_target_culture: cultureCount,
        verified_count: (verified || []).length,
        pending_review: (byCulture || []).length - (verified || []).length,
        dimensions: CULTURAL_DIMENSIONS,
        target_cultures: TARGET_CULTURES.map(c => ({ code: c.code, name: c.name }))
      }
    });
  } catch (error) {
    console.error('Error fetching comparison stats:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/culture/admin/generate - 生成跨文化对比数据
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json().catch(() => ({}));
    
    const { force = false } = body;

    // 检查是否已有数据
    if (!force) {
      const { count } = await client
        .from('cross_cultural_comparisons')
        .select('*', { count: 'exact', head: true });

      if ((count || 0) > 0) {
        return NextResponse.json({
          success: false,
          error: `已有 ${count} 条对比数据，如需重新生成请设置 force=true`,
          existing_count: count
        }, { status: 400 });
      }
    }

    const results = await generateCrossCulturalComparisons();

    return NextResponse.json({
      success: true,
      data: results,
      message: '跨文化对比数据生成完成'
    });
  } catch (error) {
    console.error('Error generating comparisons:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
