import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { badRequest, unauthorized } from '../_shared';
import { normalizeEmail, EMAIL_RE, verifyPassword } from '@/lib/auth/password';
import { hit, clientIpOf } from '@/lib/auth/rate-limit';
import { getLockoutInfo, recordLoginAttempt } from '@/lib/auth/lockout';
import { signJwt } from '@/lib/auth/jwt';
import { setAuthCookie } from '@/lib/auth/cookie';
import { bindGuestLearner } from '@/lib/auth/migration';
import { locked } from '../_shared';
import type { LoginInput } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // 登录接口限流（比注册松一点：按 email+IP 10 分钟 ≤ 20，另外 lockout 守护 5 次）
  // 放在取 body 之前
  let body: LoginInput;
  try { body = await req.json() as LoginInput; } catch { return badRequest('BAD_JSON', '请求体格式错误'); }
  const email = normalizeEmail(body?.email ?? '');
  const password = body?.password ?? '';
  const remember = !!body.rememberMe;
  const guest_learner_id = typeof body.guest_learner_id === 'string' && body.guest_learner_id.length > 10
    ? body.guest_learner_id : null;

  if (!EMAIL_RE.test(email) || !password) return badRequest('INVALID_CREDENTIALS', '邮箱或密码不能为空');

  // lockout 前置：窗口内失败 ≥5 → 直接拦
  const lock = getLockoutInfo(email);
  if (lock.locked) return locked(lock);

  hit(`login:${email}:${clientIpOf(req)}`, 30, 10 * 60 * 1000); // 只计数，不做 429（lockout 做）

  const supabase = getSupabaseClient();
  try {
    const { data: user, error } = await supabase
      .from('auth_users')
      .select('id, email, nickname, password_hash, learner_id, created_at')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;

    const ok = user && await verifyPassword(password, (user as any).password_hash ?? null);
    if (!ok) {
      recordLoginAttempt(req, email, false);
      const l2 = getLockoutInfo(email);
      if (l2.locked) return locked(l2);
      return unauthorized('WRONG_CREDENTIALS', `邮箱或密码错误（连续失败 5 次会被锁定 15 分钟，当前失败 ${l2.failedCount ?? 1}/5）`);
    }

    recordLoginAttempt(req, email, true);
    // 登录成功时清空失败历史（防止"攒了4次失败"下次一输错就锁）
    (await import('@/lib/auth/lockout')).resetLoginAttempts(email);

    // 迁移游客 learner
    let learner_id = (user as any).learner_id ?? null;
    const mig = await bindGuestLearner(user!.id, learner_id, guest_learner_id, false);
    if (mig.learner_id_after) learner_id = mig.learner_id_after;

    const { token, expiresIn } = signJwt(
      { uid: user!.id, email: (user as any).email, lrid: learner_id },
      remember,
    );

    const response = NextResponse.json({
      ok: true,
      migrated: mig.reason ?? null,
      user: {
        user_id: user!.id,
        email: (user as any).email,
        nickname: (user as any).nickname,
        learner_id,
        created_at: (user as any).created_at,
      },
    });
    setAuthCookie(response, token, remember ? expiresIn : undefined);
    return response;
  } catch (err) {
    if (/relation.*does not exist/i.test(String(err))) {
      return badRequest('DB_SCHEMA_MISSING', '认证表未初始化，请先在 Supabase 执行 auth_users.sql');
    }
    console.error('[auth/login] unexpected:', err);
    return badRequest('UNEXPECTED', err instanceof Error ? err.message : String(err));
  }
}
