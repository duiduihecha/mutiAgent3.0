// 密码哈希与校验 — bcryptjs 12 轮
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
// 密码强度：8 位+，至少字母+数字（用户显式勾选了哈希安全，密码强度未选就放低要求但至少 8 位）
export const PASSWORD_MIN = 8;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < PASSWORD_MIN) {
    throw new Error(`PASSWORD_TOO_SHORT (min ${PASSWORD_MIN})`);
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch (e) {
    console.error('[auth/password] verify exception:', e);
    return false;
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
