import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * GET /api/learners/[id]/trends
 * Phase 3A: 最小趋势查询接口
 * 返回 learner 的历史快照 + 当前值，支持后续趋势图和分析
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();

    // 1. 获取当前 learner 值（L3）
    const { data: learner, error: learnerError } = await supabase
      .from("learners")
      .select("*")
      .eq("id", id)
      .single();

    if (learnerError || !learner) {
      return NextResponse.json({
        success: false,
        error: `Learner not found: ${id}`,
        code: "LEARNER_NOT_FOUND",
      }, { status: 404 });
    }

    // 2. 获取历史快照（直接查询表，不用 RPC）
    const { data: snapshots, error: snapError } = await supabase
      .from("learner_profile_snapshots")
      .select("*")
      .eq("learner_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (snapError) {
      console.error(`[Trends API] 查询快照失败: ${snapError.message} (code=${snapError.code})`);
      // 不阻断返回，快照为空也行
    }

    // 3. 获取最近 L2 记录摘要（最近 10 轮的 score）
    const { data: recentAssessments } = await supabase
      .from("assessment_records")
      .select("score, correct_answers, wrong_answers, created_at, scene_type")
      .eq("learner_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    console.log(`[Trends API] learner=${id.slice(0,8)}... snapshots=${snapshots?.length ?? 0} recent_assessments=${recentAssessments?.length ?? 0}`);

    return NextResponse.json({
      success: true,
      data: {
        // 当前画像（L3 最新值）
        current: {
          cultural_anxiety_score: learner.cultural_anxiety_score,
          ability_vector: learner.ability_vector,
          hsk_level: learner.hsk_level,
          native_language: learner.native_language,
          total_sessions: learner.total_sessions,
          last_scene_id: learner.last_scene_id,
          updated_at: learner.updated_at,
        },
        // 历史快照列表（L3 历史）
        snapshots: (snapshots ?? []).map((s: Record<string, unknown>) => ({
          id: s.id,
          snapshot_reason: s.snapshot_reason,
          cultural_anxiety_score: s.cultural_anxiety_score,
          ability_vector: s.ability_vector,
          hsk_level: s.hsk_level,
          total_sessions_at_time: s.total_sessions_at_time,
          last_scene_id: s.last_scene_id,
          weak_dimensions: s.weak_dimensions,
          created_at: s.created_at,
        })),
        // 最近评估记录摘要（L2）
        recent_assessments: (recentAssessments ?? []).map((a: Record<string, unknown>) => ({
          score: a.score,
          correct_answers: a.correct_answers,
          wrong_answers: a.wrong_answers,
          scene_type: a.scene_type,
          created_at: a.created_at,
        })),
        // 统计元信息
        meta: {
          total_snapshots: snapshots?.length ?? 0,
          total_recent_assessments: recentAssessments?.length ?? 0,
        },
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[Trends API] 异常: ${err.message}`);
    return NextResponse.json({
      success: false,
      error: err.message,
      code: "INTERNAL_ERROR",
    }, { status: 500 });
  }
}
