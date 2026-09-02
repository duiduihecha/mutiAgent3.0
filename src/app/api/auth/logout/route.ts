import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth/cookie';

export const runtime = 'nodejs';

/** POST /api/auth/logout — 清除 cookie */
export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true, message: '已退出登录' });
  clearAuthCookie(res);
  return res;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
