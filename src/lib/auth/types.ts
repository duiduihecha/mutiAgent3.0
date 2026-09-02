// 共享认证类型（API / middleware / 前端三者用同一份）

export interface AuthenticatedUser {
  /** auth_users.id (UUID，独立于 learner.id) */
  user_id: string;
  /** 邮箱（全局唯一，归一化为小写） */
  email: string;
  /** 学习者昵称，可空，默认邮箱前缀 */
  nickname: string | null;
  /** 关联的 learner（学习画像）ID；可能为 null 但实际总是绑一个 */
  learner_id: string | null;
  /** 账号创建时间 */
  created_at: string;
}

/**
 * 注册请求体（POST /api/auth/register）
 * email 全局唯一；password 至少 8 位；nickname 可选；rememberMe 仅决定 cookie maxAge；
 * guest_learner_id 可选——若浏览器当前有匿名 learner_id 就顺手上送做立即绑定迁移
 */
export interface RegisterInput {
  email: string;
  password: string;
  nickname?: string;
  rememberMe?: boolean;
  /** 匿名 learner id（迁移绑定用） */
  guest_learner_id?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
  /** 登录时如果没账号，可直接把当前 guest learner 迁移绑定到此账号 */
  guest_learner_id?: string;
}

export interface ForgotInput {
  email: string;
}

export interface ResetInput {
  email: string;
  code: string;
  new_password: string;
}

/** JWT 内的载荷 */
export interface AuthTokenPayload {
  uid: string; // user_id
  email: string;
  /** token 发行时的 learner_id（可能后来有绑定/迁移，但 token 内存发行时快照） */
  lrid?: string | null;
  /** 签发 at (unix s) */
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  user: AuthenticatedUser;
  token: string;
}

/** 登录失败锁定返回 */
export interface LockoutInfo {
  locked: boolean;
  retryAfterSec?: number;
  failedCount?: number;
}
