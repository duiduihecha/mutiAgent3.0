-- 方案 C：自建认证（邮箱+密码）所需的 DDL
-- （请在 Supabase SQL Editor 里执行；或者本地 pgsql）
-- 依赖：learners 表已存在（系统本身就有）；会给 learners 加 user_id 列（FK 到 auth_users.id）

-- 1) 账号主表
CREATE TABLE IF NOT EXISTS public.auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  nickname text,
  password_hash text NOT NULL,
  learner_id text REFERENCES public.learners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  password_changed_at timestamptz,
  -- 兼容：可扩展 phone / avatar / role
  phone text
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON public.auth_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_auth_users_learner_id ON public.auth_users (learner_id);

-- 2) learners 加 FK（可能已经执行过，重复执行 IF NOT EXISTS 风格）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='learners' AND column_name='user_id'
  ) THEN
    ALTER TABLE public.learners
      ADD COLUMN user_id uuid REFERENCES public.auth_users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_learners_user_id ON public.learners (user_id);

-- 3) 登录失败审计（管理侧解锁参考）
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  ip inet,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON public.login_attempts (lower(email), created_at DESC);

-- 4) RLS 建议（默认：应用侧用 SERVICE_ROLE 的 supabase-js，可选在 Supabase dashboard 给 anon 禁用这两张表）
-- ALTER TABLE public.auth_users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
