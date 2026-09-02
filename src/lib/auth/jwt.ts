// JWT 签发/校验 — 用 jsonwebtoken。JWT_SECRET 必须配置。
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from './types';

const DEFAULT_SECRET = '__DO_NOT_USE_IN_PROD__change_me_xyz';
function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  // 开发环境兜底（真生产强制配置）
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET env not set');
  }
  console.warn('[auth/jwt] ⚠ using fallback JWT_SECRET (NOT SAFE for PROD). Please set JWT_SECRET >= 16 chars.');
  return DEFAULT_SECRET;
}

export const SHORT_SESSION_DAYS = 1;   // 默认：浏览器会话级但 cookie=1 天；勾选 rememberMe=7 天
export const LONG_SESSION_DAYS  = 7;

export function signJwt(payload: AuthTokenPayload, rememberMe = false): { token: string; expiresIn: number } {
  const days = rememberMe ? LONG_SESSION_DAYS : SHORT_SESSION_DAYS;
  const expiresIn = days * 24 * 60 * 60; // seconds
  const token = jwt.sign(payload, getSecret(), { algorithm: 'HS256', expiresIn });
  return { token, expiresIn };
}

/** 校验失败返回 null；成功返回 payload */
export function verifyJwt(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as AuthTokenPayload;
    return payload;
  } catch (err) {
    // 过期/签名错一律吞掉返回 null，不要抛到路由层 500
    return null;
  }
}
