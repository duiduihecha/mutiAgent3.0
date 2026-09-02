/**
 * 学习者详情API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { clearLearnerMastery } from '@/lib/learner-graph';

// GET /api/learners/[id] - 获取学习者详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('learners')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`查询学习者失败: ${error.message}`);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Learner not found' },
        { status: 404 }
      );
    }

    // 获取学习记录
    const { data: learning_records } = await client
      .from('learning_records')
      .select('*')
      .eq('learner_id', id)
      .order('completed_at', { ascending: false })
      .limit(10);

    // 获取评估记录
    const { data: assessment_records } = await client
      .from('assessment_records')
      .select('*')
      .eq('learner_id', id)
      .order('assessed_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        learning_records: learning_records || [],
        assessment_records: assessment_records || []
      }
    });
  } catch (error) {
    console.error('Error fetching learner:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/learners/[id] - 更新学习者
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();
    const body = await request.json();

    // 允许更新的字段
    const allowedFields = [
      'native_language',
      'hsk_level',
      'learning_motivation',
      'cultural_anxiety_score',
      'ability_vector'
    ];

    const updates: Record<string, unknown> = {};
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

    updates.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from('learners')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`更新学习者失败: ${error.message}`);

    // 切换母语 → 清除 Neo4j MASTERED 边（不同母语背景，学习画像应有独立起点）
    if (body.native_language !== undefined) {
      try {
        await clearLearnerMastery(id);
        console.log(`[PUT /api/learners] 母语切换 → 已清除MASTERED边 learner=${id.slice(0, 8)}`);
      } catch (neoErr) {
        console.warn(`[PUT /api/learners] 清除MASTERED边失败（不影响主流程）:`, neoErr);
      }
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error updating learner:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/learners/[id] - 删除学习者
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseClient();

    const { error } = await client
      .from('learners')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`删除学习者失败: ${error.message}`);

    return NextResponse.json({
      success: true,
      message: 'Learner deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting learner:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
