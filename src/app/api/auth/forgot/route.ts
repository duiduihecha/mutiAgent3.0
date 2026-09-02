import { NextRequest, NextResponse } from 'next/server';
import { badRequest, ok, rateLimit } from '../_shared';
import { EMAIL_RE, normalizeEmail } from '@/lib/auth/password';
import { clientIpOf, hit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';

import { setResetCode, getResetCode, TTL_MS } from '@/lib/auth/reset-store';

export async function POST(req: NextRequest) {
  // 限流：同邮箱 1 分钟 ≤ 2；同 IP 10 分钟 ≤ 10
  const ipRate = hit(`forgot:ip:${clientIpOf(req)}`, 10, 10 * 60 * 1000);
  if (!ipRate.allowed) return rateLimit('FORGOT_RATE_LIMIT', '请求过于频繁，请稍后再试', ipRate.retryAfterSec);

  let body: any;
  try { body = await req.json(); } catch { return badRequest('BAD_JSON', '请求体格式错误'); }
  const email = normalizeEmail(body?.email ?? '');
  if (!EMAIL_RE.test(email)) return badRequest('INVALID_EMAIL', '邮箱格式不正确');

  const emailRate = hit(`forgot:email:${email}`, 2, 60 * 1000);
  if (!emailRate.allowed) return rateLimit('FORGOT_RATE_LIMIT', '该邮箱已发送验证码，请稍后再试', emailRate.retryAfterSec);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  setResetCode(email, code);

  // 真生产：调 SMTP / Resend。当前控制台打印（dev 用）+ 返回给前端提示
  const logMsg =
    `[auth/forgot] 📧 验证码（10 分钟有效）→ ${email} : ${code}  ` +
    `(当前环境未配置邮件服务，已打印到控制台。后续接入 Resend/SMTP 即可收到真实邮件。)`;
  console.log(logMsg);

  return NextResponse.json({
    ok: true,
    message: '验证码已发送。若未接收到邮件：开发环境请查看服务端 app.log（验证码已打印）',
    dev_only_hint: process.env.NODE_ENV === 'production' ? null : `验证码：${code}（仅 dev 会返回此字段）`,
    expires_in_sec: Math.ceil(TTL_MS / 1000),
  });
}

export function __peekResetCode(email: string): string | null {
  const e = normalizeEmail(email);
  const row = getResetCode(e);
  return row ? row.code : null;
}
