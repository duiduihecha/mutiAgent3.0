import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthed } from '@/lib/auth/middleware';
import { bindGuestLearner } from '@/lib/auth/migration';

export const runtime = 'nodejs';

/**
 * POST /api/auth/link-learner
 * 已登录用户（账号还没绑 learner_id）→ 把新创建的 learner 关联到账号
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthed(req);
  if (!ctx) return NextResponse.json({ ok: false, code: 'NOT_LOGGED_IN', message: '未登录' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, code: 'BAD_JSON', message: '请求体格式错误' }, { status: 400 });
  }
  const learner_id = typeof body?.learner_id === 'string' ? body.learner_id : '';
  if (!learner_id) {
    return NextResponse.json({ ok: false, code: 'MISSING_LEARNER_ID', message: '缺少 learner_id' }, { status: 400 });
  }

  if (ctx.user.learner_id) {
    return NextResponse.json({
      ok: false,
      code: 'ALREADY_HAS_LEARNER',
      message: '该账号已经绑定过 learner，如需合并请先联系管理员',
    }, { status: 409 });
  }

  const supabase = getSupabaseClient();
  const { data: learner, error } = await supabase
    .from('learners')
    .select('id, user_id')
    .eq('id', learner_id)
    .maybeSingle();
  if (error || !learner) {
    return NextResponse.json({ ok: false, code: 'LEARNER_NOT_FOUND', message: 'learner 不存在' }, { status: 404 });
  }
  if ((learner as any).user_id && (learner as any).user_id !== ctx.user.user_id) {
    return NextResponse.json({ ok: false, code: 'LEARNER_OWNED_BY_OTHER', message: '该 learner 已被其他账号绑定' }, { status: 409 });
  }

  const mig = await bindGuestLearner(ctx.user.user_id, null, learner_id, false);
  return NextResponse.json({
    ok: mig.ok,
    migrated: mig.reason,
    learner_id: mig.learner_id_after,
    details: mig.details ?? null,
  }, { status: mig.ok ? 200 : 400 });
}
