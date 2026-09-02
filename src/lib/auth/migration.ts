// 方案 C：把「匿名 learner」迁移归到「注册/登录成功」的账号下。
// 核心规则：
//   1. guest_learner_id 必须真实存在于 learners 表
//   2. 该 learner 必须还没有关联任何 auth_users（即 user_id IS NULL）
//   3. 如果账号已经绑定过 learner 了 → 不动账号的 learner（登录回来的老用户）
//   4. 如果是注册(新账号) 且账号还没 learner_id → 直接绑定 guest
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface MigrateResult {
  ok: boolean;
  reason?: 'NO_GUEST' | 'GUEST_NOT_FOUND' | 'ALREADY_BOUND_USER' | 'HAS_OWN_LEARNER' | 'BOUND' | 'REGISTER_BIND' | 'ERROR';
  learner_id_after: string | null;
  details?: string;
}

/**
 * 绑定匿名 learner 到账号。
 * @param user_id 账号 auth_users.id
 * @param existing_account_learner_id 该账号当前已绑定的 learner_id（注册= null；登录=有值/null）
 * @param guest_learner_id 浏览器送来的匿名 learner_id（可能空）
 * @param isNewUser true=注册（此时直接拿 guest 当账号的 learner）；false=登录
 */
export async function bindGuestLearner(
  user_id: string,
  existing_account_learner_id: string | null,
  guest_learner_id: string | undefined | null,
  isNewUser: boolean,
): Promise<MigrateResult> {
  if (!guest_learner_id) return { ok: true, reason: 'NO_GUEST', learner_id_after: existing_account_learner_id };

  const supabase = getSupabaseClient();

  // 1. 查 guest learner
  const { data: guest, error: e1 } = await supabase
    .from('learners')
    .select('id, user_id, uid')
    .eq('id', guest_learner_id)
    .maybeSingle();
  if (e1 || !guest) return { ok: false, reason: 'GUEST_NOT_FOUND', learner_id_after: existing_account_learner_id, details: e1?.message };

  // 2. guest 必须是真·匿名（user_id 没绑过）
  if ((guest as any).user_id) {
    return { ok: false, reason: 'ALREADY_BOUND_USER', learner_id_after: existing_account_learner_id, details: 'guest already has user_id' };
  }

  // 3. 登录场景：若账号已有 learner → 不替换（下次再考虑高级「合并」弹窗）
  if (!isNewUser && existing_account_learner_id) {
    return { ok: true, reason: 'HAS_OWN_LEARNER', learner_id_after: existing_account_learner_id, details: 'kept account-owned learner' };
  }

  // 4. 否则：bind
  try {
    // a. learners 表写入 user_id
    const { error: e2 } = await supabase.from('learners').update({ user_id, updated_at: new Date().toISOString() }).eq('id', guest.id);
    if (e2) throw e2;
    // b. auth_users 表回写 learner_id（如果还没）
    if (!existing_account_learner_id) {
      const { error: e3 } = await supabase.from('auth_users').update({ learner_id: guest.id, updated_at: new Date().toISOString() }).eq('id', user_id);
      if (e3) throw e3;
    }
    console.log(`[auth/migration] bound guest learner=${guest.id.slice(0, 8)} → user=${user_id.slice(0, 8)} (isNew=${isNewUser})`);
    return { ok: true, reason: isNewUser ? 'REGISTER_BIND' : 'BOUND', learner_id_after: guest.id };
  } catch (err) {
    console.error('[auth/migration] bind error:', err);
    return { ok: false, reason: 'ERROR', learner_id_after: existing_account_learner_id, details: err instanceof Error ? err.message : String(err) };
  }
}
