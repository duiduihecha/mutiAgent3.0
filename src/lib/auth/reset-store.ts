// 忘记密码 -> 验证码内存 store；真生产替换为 Redis / DB
// （放在独立模块是因为 App Router 下每个 route 文件独立实例化，跨模块共享 Map 必须统一 import 同一文件。）

export interface ResetCodeRow {
  code: string;
  expiresAt: number;
}

const CODES = new Map<string, ResetCodeRow>();
export const TTL_MS = 10 * 60 * 1000; // 10 分钟

export function setResetCode(emailLower: string, code: string): void {
  CODES.set(emailLower, { code, expiresAt: Date.now() + TTL_MS });
}

export function getResetCode(emailLower: string): ResetCodeRow | null {
  const row = CODES.get(emailLower);
  if (!row) return null;
  if (row.expiresAt < Date.now()) { CODES.delete(emailLower); return null; }
  return row;
}

export function deleteResetCode(emailLower: string): void {
  CODES.delete(emailLower);
}
