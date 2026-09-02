/**
 * 知识库管理API - 知识库填充管理
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 知识点分类映射
const CATEGORY_MAP: Record<string, string> = {
  'social_life': '社会生活',
  'traditional_culture': '传统文化',
  'contemporary_china': '当代中国'
};

const SUBCATEGORY_MAP: Record<string, string> = {
  'diet': '饮食',
  'housing': '居住',
  'clothing': '衣着',
  'transportation': '出行',
  'family': '家庭',
  'festivals': '节庆',
  'leisure': '休闲',
  'consumption': '消费',
  'language_communication': '语言交际',
  'nonverbal_communication': '非语言交际',
  'social_interaction': '交往',
  'language_and_culture': '语言与文化',
  'cultural_heritage': '文化遗产',
  'literature': '文学',
  'arts': '艺术',
  'inventions': '发明',
  'geography': '地理',
  'education': '教育',
  'language_writing': '语言文字'
};

// GET /api/knowledge/admin/stats - 获取知识库统计
export async function GET(_request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // 统计各HSK等级知识点数量
    const { data: levelStats, error: levelError } = await client
      .from('cultural_knowledge_points')
      .select('hsk_level')
      .order('hsk_level');

    if (levelError) throw levelError;

    const levelCount: Record<number, number> = {};
    for (const item of levelStats || []) {
      const level = item.hsk_level;
      levelCount[level] = (levelCount[level] || 0) + 1;
    }

    // 统计总数
    const totalCount = (levelStats || []).length;

    // 获取各语言阐释数量
    const { count: explanationCount } = await client
      .from('cultural_explanations')
      .select('*', { count: 'exact', head: true });

    // 获取跨文化对比数量
    const { count: comparisonCount } = await client
      .from('cross_cultural_comparisons')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      data: {
        total_knowledge_points: totalCount,
        by_hsk_level: levelCount,
        total_explanations: explanationCount || 0,
        total_comparisons: comparisonCount || 0,
        categories: CATEGORY_MAP,
        subcategories: SUBCATEGORY_MAP
      }
    });
  } catch (error) {
    console.error('Error fetching knowledge stats:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/knowledge/admin/populate - 填充知识库
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json().catch(() => ({}));
    
    const { force = false } = body;

    // 检查是否已有数据
    if (!force) {
      const { count } = await client
        .from('cultural_knowledge_points')
        .select('*', { count: 'exact', head: true });

      if ((count || 0) > 0) {
        return NextResponse.json({
          success: false,
          error: `知识库已有 ${count} 条数据，如需重新填充请设置 force=true`,
          existing_count: count
        }, { status: 400 });
      }
    }

    // 导入知识点（初级/中级/高级）
    const { populateKnowledgeBase } = await import('@/lib/populate-knowledge-base');
    const results = await populateKnowledgeBase();

    return NextResponse.json({
      success: true,
      data: results,
      message: '知识库填充完成'
    });
  } catch (error) {
    console.error('Error populating knowledge base:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
