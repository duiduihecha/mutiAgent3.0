// 登录失败锁定：15 分钟 × 同一 email（或 email+ip 更严格）失败 ≥5 次 → 再尝试一律 423
// 内存实现（login_attempts 表也留一份，便于管理脚本解锁）
import type { NextRequest } from 'next/server';
import type { LockoutInfo } from './types';
import { clientIpOf } from './rate-limit';

type Attempt = { ts: number; success: boolean; ip: string };
// key: normalized email
const attemptsByEmail = new Map<string, Attempt[]>();

const WINDOW_MS = 15 * 60 * 1000; // 15min
const LOCK_THRESHOLD = 5;

export function recordLoginAttempt(req: NextRequest, email: string, success: boolean): void {
  const key = email.trim().toLowerCase();
  const arr = attemptsByEmail.get(key) || [];
  arr.push({ ts: Date.now(), success, ip: clientIpOf(req) });
  // 只保留窗口内
  const cutoff = Date.now() - WINDOW_MS;
  const filtered = arr.filter(a => a.ts >= cutoff);
  attemptsByEmail.set(key, filtered.slice(-100)); // 上限 100 条
}

export function getLockoutInfo(email: string): LockoutInfo {
  const key = email.trim().toLowerCase();
  const arr = attemptsByEmail.get(key) || [];
  const cutoff = Date.now() - WINDOW_MS;
  const recent = arr.filter(a => a.ts >= cutoff && !a.success);
  const locked = recent.length >= LOCK_THRESHOLD;
  let retryAfterSec: number | undefined = undefined;
  if (locked) {
    // 找到最早一条失败，等它出窗口即可解锁
    const oldest = recent[0];
    retryAfterSec = Math.max(1, Math.ceil((oldest.ts + WINDOW_MS - Date.now()) / 1000));
  }
  return { locked, retryAfterSec, failedCount: recent.length };
}

/** 解锁：管理员或忘记密码成功时调用 */
export function resetLoginAttempts(email: string): void {
  attemptsByEmail.delete(email.trim().toLowerCase());
}
