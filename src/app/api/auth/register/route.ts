import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { badRequest, conflict, ok, rateLimit } from '../_shared';
import { normalizeEmail, EMAIL_RE, PASSWORD_MIN, hashPassword } from '@/lib/auth/password';
import { hit, clientIpOf } from '@/lib/auth/rate-limit';
import { signJwt } from '@/lib/auth/jwt';
import { setAuthCookie } from '@/lib/auth/cookie';
import { bindGuestLearner } from '@/lib/auth/migration';
import type { RegisterInput } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = getSupabaseClient();

  // 1. 限流：IP / 30 分钟 ≤ 5 次
  const rate = hit(`reg:ip:${clientIpOf(req)}`, 5, 30 * 60 * 1000);
  if (!rate.allowed) return rateLimit('REGISTER_RATE_LIMIT', '注册过于频繁，请稍后再试', rate.retryAfterSec, rate);

  let body: RegisterInput;
  try { body = await req.json() as RegisterInput; } catch { return badRequest('BAD_JSON', '请求体格式错误'); }

  // 2. 字段校验
  const emailRaw = body?.email ?? '';
  const email = normalizeEmail(emailRaw);
  const password = body?.password ?? '';
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 32) || null : null;
  const remember = !!body.rememberMe;
  const guest_learner_id = typeof body.guest_learner_id === 'string' && body.guest_learner_id.length > 10
    ? body.guest_learner_id : null;

  if (!EMAIL_RE.test(email)) return badRequest('INVALID_EMAIL', '邮箱格式不正确');
  if (password.length < PASSWORD_MIN) return badRequest('WEAK_PASSWORD', `密码至少 ${PASSWORD_MIN} 位`);

  try {
    // 3. 查重（唯一索引是双保险）
    const { count, error: e1 } = await supabase
      .from('auth_users')
      .select('id', { head: true, count: 'exact' })
      .eq('email', email);
    if (e1) throw e1;
    if ((count || 0) > 0) return conflict('EMAIL_TAKEN', '该邮箱已注册，请直接登录');

    // 4. 哈希密码 → 插入 auth_users（learner_id 后续在 bindGuestLearner 里补）
    const password_hash = await hashPassword(password);
    const displayNick = nickname || defaultNicknameFromEmail(email);
    const { data: userRow, error: e2 } = await supabase
      .from('auth_users')
      .insert({ email, nickname: displayNick, password_hash })
      .select('id, email, nickname, learner_id, created_at')
      .maybeSingle();
    if (e2) {
      // 若没建 auth_users 表，抛明确错误（应用启动自检也会打错）
      if (/relation.*does not exist/i.test(String(e2.message))) {
        console.error('[auth/register] ❌ auth_users 表不存在，请按项目 README 创建 schema');
        return badRequest('DB_SCHEMA_MISSING', '认证表未初始化，请先在 Supabase 执行 auth_users.sql');
      }
      // 唯一索引命中，兜底冲突
      if (/unique.*auth_users_email/i.test(String(e2.message)) || /23505/.test(String(e2.code || ''))) {
        return conflict('EMAIL_TAKEN', '该邮箱已注册，请直接登录');
      }
      throw e2;
    }
    if (!userRow) return badRequest('INSERT_FAILED', '账号创建失败');

    // 5. 迁移：把游客 learner 绑定到此新账号（注册新账号直接拿 guest 当自己的 learner）
    const mig = await bindGuestLearner(userRow.id, (userRow as any).learner_id ?? null, guest_learner_id, true);
    // 若迁移失败（比如 guest 不存在）→ 不抛错，注册成功即可，后续会新建 learner
    if (mig.learner_id_after && (mig.learner_id_after !== (userRow as any).learner_id)) {
      (userRow as any).learner_id = mig.learner_id_after;
    }

    // 6. 签 token + cookie + 返回
    const { token, expiresIn } = signJwt(
      { uid: userRow.id, email: (userRow as any).email, lrid: (userRow as any).learner_id ?? null },
      remember,
    );
    const response = NextResponse.json({
      ok: true,
      migrated: mig.reason ?? null,
      user: {
        user_id: userRow.id,
        email: (userRow as any).email,
        nickname: (userRow as any).nickname,
        learner_id: (userRow as any).learner_id ?? mig.learner_id_after ?? null,
        created_at: (userRow as any).created_at,
      },
    }, { status: 200 });
    setAuthCookie(response, token, remember ? expiresIn : undefined);
    return response;
  } catch (err) {
    console.error('[auth/register] unexpected:', err);
    return badRequest('UNEXPECTED', err instanceof Error ? err.message : String(err));
  }
}

function defaultNicknameFromEmail(email: string): string {
  const at = email.indexOf('@');
  const raw = at > 0 ? email.slice(0, at) : email;
  return raw.slice(0, 32) || '学习者';
}
