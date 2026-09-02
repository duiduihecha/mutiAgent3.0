/**
 * 学习者管理API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/learners - 获取学习者列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const page_size = parseInt(searchParams.get('page_size') || '20');
    const native_language = searchParams.get('native_language');
    const hsk_level = searchParams.get('hsk_level');

    let query = client.from('learners').select('*', { count: 'exact' });

    if (native_language) {
      query = query.eq('native_language', native_language);
    }
    if (hsk_level) {
      query = query.eq('hsk_level', parseInt(hsk_level));
    }

    const { data, error, count } = await query
      .range((page - 1) * page_size, page * page_size)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询学习者失败: ${error.message}`);

    return NextResponse.json({
      success: true,
      data: {
        items: data,
        total: count || 0,
        page,
        page_size
      }
    });
  } catch (error) {
    console.error('Error fetching learners:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/learners - 创建学习者
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();

    // 验证必填字段
    const { uid, native_language, hsk_level, learning_motivation } = body;
    
    if (!uid || !native_language || !hsk_level) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: uid, native_language, hsk_level' },
        { status: 400 }
      );
    }

    // 初始化能力向量
    const ability_vector = body.ability_vector || [50, 50, 50, 50, 50]; // [语法,听力,口语,文化语用,阅读]
    const cultural_anxiety_score = body.cultural_anxiety_score || 50;

    const { data, error } = await client
      .from('learners')
      .insert({
        uid,
        native_language,
        hsk_level,
        learning_motivation: learning_motivation || 'interest',
        cultural_anxiety_score,
        ability_vector
      })
      .select()
      .single();

    if (error) throw new Error(`创建学习者失败: ${error.message}`);

    return NextResponse.json({
      success: true,
      data
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating learner:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
