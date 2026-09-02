-- ============================================================================
-- TCSL AI Platform — LLM 内容缓存表 v2.0
-- 目标：复合主键杜绝等级/场景错配，内置质量风控字段
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1. 主表定义
-- ===========================================================================

CREATE TABLE IF NOT EXISTS llm_content_cache (
    -- 复合主键四要素：知识点 + 等级 + 场景 + 目标母语文化，物理层面杜绝错配与跨语言污染
    knowledge_point_id  VARCHAR(128)    NOT NULL,
    hsk_level           SMALLINT        NOT NULL CHECK (hsk_level BETWEEN 1 AND 9),
    scene_id            VARCHAR(64)     NOT NULL DEFAULT 'general',
    -- 目标母语文化（如 英语/日语/韩语）。每种语言各占独立缓存行，避免非该语言用户命中他人文化的阐释。
    target_culture      TEXT            NOT NULL DEFAULT 'unknown',

    -- 业务载荷
    content_payload     JSONB           NOT NULL,

    -- 元数据与风控
    is_llm_generated    BOOLEAN         NOT NULL DEFAULT TRUE,
    confidence_score    REAL            NOT NULL DEFAULT 0.0
                        CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    upvotes             INTEGER         NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
    downvotes           INTEGER         NOT NULL DEFAULT 0 CHECK (downvotes >= 0),
    status              VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'DEGRADED', 'REJECTED')),

    -- 生成来源追踪
    model_version       VARCHAR(64),
    generation_duration_ms INTEGER,

    -- 时间戳
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- 复合主键（含 target_culture，跨语言隔离）
    CONSTRAINT pk_llm_cache PRIMARY KEY (knowledge_point_id, hsk_level, scene_id, target_culture)
);

-- ===========================================================================
-- 2. 索引
-- ===========================================================================

-- 按状态筛选活跃缓存（最常见查询路径）
CREATE INDEX IF NOT EXISTS idx_cache_status
    ON llm_content_cache (status)
    WHERE status = 'ACTIVE';

-- 按知识点查询所有等级缓存（用于批量预热/诊断）
CREATE INDEX IF NOT EXISTS idx_cache_kp
    ON llm_content_cache (knowledge_point_id, hsk_level);

-- 按置信度排序（用于质量审计）
CREATE INDEX IF NOT EXISTS idx_cache_confidence
    ON llm_content_cache (confidence_score DESC)
    WHERE status = 'ACTIVE';

-- 按时间筛选（用于 TTL 淘汰）
CREATE INDEX IF NOT EXISTS idx_cache_created
    ON llm_content_cache (created_at DESC);

-- ===========================================================================
-- 3. updated_at 自动更新触发器
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_update_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cache_updated_at ON llm_content_cache;
CREATE TRIGGER trg_cache_updated_at
    BEFORE UPDATE ON llm_content_cache
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_cache_timestamp();

-- ===========================================================================
-- 4. 缓存质量评估存储过程
-- ===========================================================================

CREATE OR REPLACE FUNCTION evaluate_cache_quality(
    p_knowledge_point_id VARCHAR,
    p_hsk_level          SMALLINT,
    p_scene_id           VARCHAR
)
RETURNS TABLE (
    action_taken    VARCHAR(16),
    old_status      VARCHAR(16),
    new_status      VARCHAR(16),
    downvote_ratio  REAL,
    total_votes     INTEGER,
    detail          JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cache          RECORD;
    v_total_votes    INTEGER;
    v_down_ratio     REAL;
    v_new_status     VARCHAR(16);
    v_action         VARCHAR(16);
BEGIN
    -- 1. 定位缓存行（复合键精确命中）
    SELECT *
    INTO v_cache
    FROM llm_content_cache
    WHERE knowledge_point_id = p_knowledge_point_id
      AND hsk_level          = p_hsk_level
      AND scene_id           = p_scene_id;

    -- 缓存不存在 → 无需操作
    IF NOT FOUND THEN
        RETURN QUERY SELECT
            'NOOP'::VARCHAR,
            NULL::VARCHAR,
            NULL::VARCHAR,
            0.0::REAL,
            0::INTEGER,
            jsonb_build_object('reason', 'cache_not_found');
        RETURN;
    END IF;

    -- 2. 计算踩赞比
    v_total_votes := v_cache.upvotes + v_cache.downvotes;
    v_down_ratio  := CASE
        WHEN v_total_votes = 0 THEN 0.0
        ELSE v_cache.downvotes::REAL / v_total_votes::REAL
    END;

    v_new_status := v_cache.status;
    v_action     := 'NOOP';

    -- 3. 决策逻辑

    -- 规则 A: 低置信度直接拒绝
    IF v_cache.confidence_score < 0.85 THEN
        v_new_status := 'REJECTED';
        v_action     := 'REJECTED';

    -- 规则 B: 投票充分且踩赞比过高 → 降级
    ELSIF v_total_votes > 5 AND v_down_ratio > 0.4 THEN
        v_new_status := 'DEGRADED';
        v_action     := 'DEGRADED';

    -- 规则 C: 投票充分且质量良好 → 维持/恢复活跃
    ELSIF v_total_votes > 5 AND v_down_ratio <= 0.2 AND v_cache.confidence_score >= 0.85 THEN
        IF v_cache.status = 'DEGRADED' THEN
            v_new_status := 'ACTIVE';
            v_action     := 'RESTORED';
        END IF;
    END IF;

    -- 4. 执行状态更新
    IF v_new_status != v_cache.status THEN
        UPDATE llm_content_cache
        SET status      = v_new_status,
            updated_at  = NOW()
        WHERE knowledge_point_id = p_knowledge_point_id
          AND hsk_level          = p_hsk_level
          AND scene_id           = p_scene_id;
    END IF;

    -- 5. 返回审计结果
    RETURN QUERY SELECT
        v_action,
        v_cache.status,
        v_new_status,
        ROUND(v_down_ratio::NUMERIC, 4)::REAL,
        v_total_votes,
        jsonb_build_object(
            'confidence_score', v_cache.confidence_score,
            'upvotes',          v_cache.upvotes,
            'downvotes',        v_cache.downvotes,
            'evaluated_at',     NOW()
        );
END;
$$;

-- ===========================================================================
-- 5. RPC: 用户投票（供前端直接调用）
-- ===========================================================================

CREATE OR REPLACE FUNCTION vote_cache(
    p_knowledge_point_id VARCHAR,
    p_hsk_level          SMALLINT,
    p_scene_id           VARCHAR,
    p_is_upvote          BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cache RECORD;
BEGIN
    IF p_is_upvote THEN
        UPDATE llm_content_cache
        SET upvotes    = upvotes + 1,
            updated_at = NOW()
        WHERE knowledge_point_id = p_knowledge_point_id
          AND hsk_level          = p_hsk_level
          AND scene_id           = p_scene_id
        RETURNING * INTO v_cache;
    ELSE
        UPDATE llm_content_cache
        SET downvotes  = downvotes + 1,
            updated_at = NOW()
        WHERE knowledge_point_id = p_knowledge_point_id
          AND hsk_level          = p_hsk_level
          AND scene_id           = p_scene_id
        RETURNING * INTO v_cache;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'cache_not_found');
    END IF;

    -- 投票后自动触发质量评估
    PERFORM evaluate_cache_quality(p_knowledge_point_id, p_hsk_level, p_scene_id);

    RETURN jsonb_build_object(
        'success',    TRUE,
        'upvotes',    v_cache.upvotes,
        'downvotes',  v_cache.downvotes,
        'status',     v_cache.status
    );
END;
$$;

-- ===========================================================================
-- 6. RPC: 批量查询活跃缓存（供预热/诊断）
-- ===========================================================================

CREATE OR REPLACE FUNCTION get_active_caches(
    p_hsk_level SMALLINT DEFAULT NULL
)
RETURNS TABLE (
    knowledge_point_id VARCHAR,
    hsk_level          SMALLINT,
    scene_id           VARCHAR,
    confidence_score   REAL,
    upvotes            INTEGER,
    downvotes          INTEGER,
    created_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
    SELECT knowledge_point_id, hsk_level, scene_id,
           confidence_score, upvotes, downvotes, created_at
    FROM llm_content_cache
    WHERE status = 'ACTIVE'
      AND confidence_score >= 0.85
      AND (p_hsk_level IS NULL OR hsk_level = p_hsk_level)
    ORDER BY confidence_score DESC, created_at DESC;
$$;

COMMIT;
