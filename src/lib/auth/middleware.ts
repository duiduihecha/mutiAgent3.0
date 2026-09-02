// 认证服务：从请求里取 token → 校验 JWT → 查 DB 回最新 user+learner
// 用 getAuthed() 替代「每个路由写一遍读 cookie+verifyJwt」
import type { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { readAuthCookie } from './cookie';
import { verifyJwt } from './jwt';
import type { AuthenticatedUser } from './types';

export interface AuthedContext {
  user: AuthenticatedUser;
  tokenUid: string;
}

/** 未登录返回 null。只抛 DB 真正的异常（网络层），jwt 过期只算未登录。 */
export async function getAuthed(req: NextRequest): Promise<AuthedContext | null> {
  const token = readAuthCookie(req);
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  // 从 auth_users 表回查最新 user（比如 nickname 改了、password 改了需要失效）
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('auth_users')
      .select('*')
      .eq('id', payload.uid)
      .maybeSingle();
    if (error) {
      console.error('[auth/middleware] DB error:', error);
      return null;
    }
    if (!data) return null;
    // 密码修改后会改 password_changed_at，token 发行之前的 → 失效
    if (data.password_changed_at && payload.iat) {
      const iatMs = payload.iat * 1000;
      const pcaMs = new Date(data.password_changed_at).getTime();
      if (!Number.isNaN(pcaMs) && pcaMs > iatMs) return null;
    }
    return {
      user: {
        user_id: data.id,
        email: data.email,
        nickname: data.nickname,
        learner_id: data.learner_id,
        created_at: data.created_at,
      },
      tokenUid: payload.uid,
    };
  } catch (e) {
    console.error('[auth/middleware] unexpected:', e);
    return null;
  }
}
