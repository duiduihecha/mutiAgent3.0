import { NextRequest } from 'next/server';
import { badRequest, ok } from '../_shared';
import { EMAIL_RE, normalizeEmail, PASSWORD_MIN, hashPassword } from '@/lib/auth/password';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resetLoginAttempts } from '@/lib/auth/lockout';
import { getResetCode, deleteResetCode } from '@/lib/auth/reset-store';
import type { ResetInput } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {

  let body: ResetInput;
  try { body = await req.json() as ResetInput; } catch { return badRequest('BAD_JSON', '请求体格式错误'); }

  const email = normalizeEmail(body?.email ?? '');
  const code  = (body?.code ?? '').trim();
  const newPw = body?.new_password ?? '';

  if (!EMAIL_RE.test(email)) return badRequest('INVALID_EMAIL', '邮箱格式不正确');
  if (!/^\d{6}$/.test(code)) return badRequest('INVALID_CODE', '请输入 6 位数字验证码');
  if (newPw.length < PASSWORD_MIN) return badRequest('WEAK_PASSWORD', `新密码至少 ${PASSWORD_MIN} 位`);

  const entry = getResetCode(email);
  if (!entry) return badRequest('CODE_NOT_FOUND', '未请求验证码或验证码已过期');
  if (entry.code !== code) return badRequest('WRONG_CODE', '验证码不正确');

  try {
    const password_hash = await hashPassword(newPw);
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('auth_users')
      .update({ password_hash, password_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('email', email);
    if (error) throw error;
    // 消耗掉 code
    deleteResetCode(email);
    // 顺带解锁（防止用户之前输错太多被锁）
    resetLoginAttempts(email);
    return ok({ ok: true, message: '密码已重置，请重新登录' });
  } catch (err) {
    console.error('[auth/reset] error:', err);
    return badRequest('UNEXPECTED', err instanceof Error ? err.message : String(err));
  }
}
