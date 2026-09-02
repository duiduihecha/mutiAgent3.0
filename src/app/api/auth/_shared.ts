// 供 6 条路由共享的 error/成功响应函数
import { NextResponse } from 'next/server';
import type { LockoutInfo } from '@/lib/auth/types';

export const HEADER_JSON = { 'Content-Type': 'application/json; charset=utf-8' };

export function ok(data: any, status = 200, extraHeaders?: Record<string, string>) {
  return new NextResponse(JSON.stringify(data), { status, headers: { ...HEADER_JSON, ...(extraHeaders || {}) } });
}

export function fail(code: string, message: string, status: number, extras?: any) {
  const payload: any = { ok: false, code, message };
  if (extras) payload.details = extras;
  return new NextResponse(JSON.stringify(payload), { status, headers: HEADER_JSON });
}

export function badRequest(code: string, message: string, extras?: any) {
  return fail(code, message, 400, extras);
}
export function unauthorized(code: string, message: string, extras?: any) {
  return fail(code, message, 401, extras);
}
export function conflict(code: string, message: string, extras?: any) {
  return fail(code, message, 409, extras);
}
export function rateLimit(code: string, message: string, retryAfterSec?: number, extras?: any) {
  return new NextResponse(
    JSON.stringify({ ok: false, code, message, details: extras }),
    {
      status: 429,
      headers: {
        ...HEADER_JSON,
        ...(retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : {}),
      },
    },
  );
}
export function locked(info: LockoutInfo, message = '登录失败次数过多，账号已临时锁定') {
  return new NextResponse(
    JSON.stringify({ ok: false, code: 'LOCKED', message, details: { lockout: info } }),
    {
      status: 423,
      headers: {
        ...HEADER_JSON,
        ...(info.retryAfterSec ? { 'Retry-After': String(info.retryAfterSec) } : {}),
      },
    },
  );
}
