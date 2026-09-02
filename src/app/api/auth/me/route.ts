import { NextRequest, NextResponse } from 'next/server';
import { getAuthed } from '@/lib/auth/middleware';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { ok, unauthorized } from '../_shared';

export const runtime = 'nodejs';

/**
 * GET /api/auth/me
 * 登录态校验 + 返回 user（含 learner 快照：最近 5 条 learning records，省前端再调一次 /api/learners/:id）
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthed(req);
  if (!ctx) return NextResponse.json({ ok: false, code: 'NOT_LOGGED_IN', message: '未登录' }, { status: 401 });

  const user = ctx.user;
  let learner: any = null;
  let recent_records: any[] = [];
  let assessments: any[] = [];

  if (user.learner_id) {
    try {
      const s = getSupabaseClient();
      const { data: l } = await s.from('learners').select('*').eq('id', user.learner_id).maybeSingle();
      learner = l || null;
      if (learner) {
        const { data: recs } = await s
          .from('learning_records')
          .select('id, knowledge_point_id, correct_rate, total, score, created_at')
          .eq('learner_id', user.learner_id)
          .order('created_at', { ascending: false })
          .limit(10);
        recent_records = recs || [];
        const { data: asmts } = await s
          .from('assessment_records')
          .select('id, cumulative_correct, bkt_mastery_after, created_at')
          .eq('learner_id', user.learner_id)
          .order('created_at', { ascending: false })
          .limit(5);
        assessments = asmts || [];
      }
    } catch (e) {
      console.error('[auth/me] learner fetch error:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    user,
    learner,
    recent_records,
    assessments,
  });
}
