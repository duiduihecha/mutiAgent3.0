-- ============================================================================
-- 缓存跨语言污染 —— 正式修法迁移（修正 001 的 3 列主键）
-- 001 最初把唯一性定义为 3 列主键 pk_llm_cache(kp, hsk, scene)，
-- 导致「先写入的语言」独占缓存行，其他语言命中错误文化阐释（跨语言污染）。
-- 本迁移把唯一性扩展到 4 列，让每种 target_culture 各占独立缓存行。
--
-- 幂等 & 安全：
--   - 若 llm_content_cache 表不存在（如被 002 清空），直接 RETURN，不报错；
--   - 所有步骤均带存在性判断，可重复执行。
-- 已在线上库执行并通过 verify-cache-pk.mjs 功能验证（同 kp+hsk+scene 可存 日语+英语 两行）。
-- ============================================================================

DO $$
BEGIN
  -- 表不存在则跳过（避免 002 DROP 后误报错）
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'llm_content_cache'
  ) THEN
    RAISE NOTICE 'llm_content_cache 不存在，跳过修正（由 001 的正确定义负责建表）';
    RETURN;
  END IF;

  -- 1) 去掉旧的 3 列主键（若存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'llm_content_cache'::regclass AND conname = 'pk_llm_cache'
  ) THEN
    ALTER TABLE llm_content_cache DROP CONSTRAINT pk_llm_cache;
    RAISE NOTICE 'dropped old 3-col PK pk_llm_cache';
  END IF;

  -- 2) 加列
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_content_cache' AND column_name = 'target_culture'
  ) THEN
    ALTER TABLE llm_content_cache ADD COLUMN target_culture text;
    RAISE NOTICE 'added column target_culture';
  END IF;

  -- 3) 回填：缺失值统一为 'unknown'
  UPDATE llm_content_cache SET target_culture = 'unknown' WHERE target_culture IS NULL;

  -- 4) 硬化：NOT NULL + 默认值，杜绝空语言污染
  ALTER TABLE llm_content_cache ALTER COLUMN target_culture SET DEFAULT 'unknown';
  ALTER TABLE llm_content_cache ALTER COLUMN target_culture SET NOT NULL;
  RAISE NOTICE 'hardened target_culture NOT NULL DEFAULT unknown';

  -- 5) 4 列唯一索引（真正隔离跨语言）
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'llm_content_cache_kp_hsk_scene_culture'
  ) THEN
    CREATE UNIQUE INDEX llm_content_cache_kp_hsk_scene_culture
      ON llm_content_cache (knowledge_point_id, hsk_level, scene_id, target_culture);
    RAISE NOTICE 'created 4-col unique index';
  END IF;
END $$;
