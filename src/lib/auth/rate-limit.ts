import type { NextRequest } from 'next/server';
// 认证接口专用限流：注册（按 IP 30 分钟 ≤ 5） / 登录（按 IP+email 15 分钟 ≤ 20 放开一点但与 lockout 双层守护）
// 内存实现；真生产建议 Redis。当前 5000 单实例够用。LRU 定期清理。

type Bucket = {
  count: number;
  resetAt: number; // epoch ms
};

const buckets = new Map<string, Bucket>();

function prune() {
  const now = Date.now();
  for (const [k, v] of Array.from(buckets.entries())) {
    if (v.resetAt < now) buckets.delete(k);
  }
}
// 每 60 秒裁剪一次
if (typeof setInterval !== 'undefined') setInterval(prune, 60_000).unref?.();

export interface RateResult {
  allowed: boolean;
  retryAfterSec?: number;
  count: number;
  limit: number;
}

/**
 * @param key 限流 bucket key，比如 `reg:ip:{ip}` / `login:{email}:{ip}`
 * @param limit 时间窗内最大次数
 * @param windowMs 时间窗毫秒
 */
export function hit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  const retryAfter = Math.max(0, Math.ceil((b.resetAt - now) / 1000));
  return {
    allowed: b.count <= limit,
    retryAfterSec: b.count > limit ? retryAfter : undefined,
    count: b.count,
    limit,
  };
}

export function clientIpOf(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}
