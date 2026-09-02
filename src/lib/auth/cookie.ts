// HTTP Cookie 读写（Route Handler 场景下的 NextRequest / NextResponse 辅助）
import { serialize, parse } from 'cookie';
import { NextRequest, NextResponse } from 'next/server';

export const AUTH_COOKIE = 'ccal_session_v1'; // 跨文化中文学习系统 session

type CookieAttrs = {
  /** 单位秒；不传就是会话 Cookie（浏览器关闭即失效） */
  maxAgeSec?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
};

export function setAuthCookie(res: NextResponse, token: string, maxAgeSec?: number): void {
  const isProd = process.env.NODE_ENV === 'production';
  const attrs: CookieAttrs = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
  };
  if (maxAgeSec !== undefined) attrs.maxAgeSec = maxAgeSec;
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: attrs.httpOnly,
    secure: attrs.secure,
    sameSite: attrs.sameSite,
    path: attrs.path,
    ...(attrs.maxAgeSec !== undefined
      ? { maxAge: attrs.maxAgeSec, expires: new Date(Date.now() + attrs.maxAgeSec * 1000) }
      : {}),
  });
}

export function clearAuthCookie(res: NextResponse): void {
  res.cookies.set({
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export function readAuthCookie(req: NextRequest): string | null {
  // NextRequest.cookies
  const v = req.cookies.get(AUTH_COOKIE)?.value;
  return v || null;
}

/** 兼容非 NextRequest 的场景（比如纯 headers），从 cookie header 字符串里解析 */
export function readFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  try {
    const obj = parse(header);
    return obj[AUTH_COOKIE] || null;
  } catch {
    return null;
  }
}
