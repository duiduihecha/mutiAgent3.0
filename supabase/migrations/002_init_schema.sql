-- ============================================================================
-- TCSL AI Platform — 完整初始化 Schema
-- 用于新 Supabase 实例建表
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 0. 清理旧表（按依赖顺序倒序删除）
-- ===========================================================================
DROP TABLE IF EXISTS expert_review_queue CASCADE;
DROP TABLE IF EXISTS agent_messages CASCADE;
DROP TABLE IF EXISTS learner_profile_snapshots CASCADE;
DROP TABLE IF EXISTS assessment_records CASCADE;
DROP TABLE IF EXISTS learning_records CASCADE;
DROP TABLE IF EXISTS cross_cultural_comparisons CASCADE;
DROP TABLE IF EXISTS cultural_explanations CASCADE;
DROP TABLE IF EXISTS knowledge_graph_edges CASCADE;
DROP TABLE IF EXISTS knowledge_graph_nodes CASCADE;
DROP TABLE IF EXISTS bias_keywords CASCADE;
DROP TABLE IF EXISTS system_configs CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS learning_scenes CASCADE;
DROP TABLE IF EXISTS cultural_knowledge_points CASCADE;
DROP TABLE IF EXISTS learners CASCADE;
DROP TABLE IF EXISTS health_check CASCADE;
DROP TABLE IF EXISTS llm_content_cache CASCADE;

DROP FUNCTION IF EXISTS insert_learner_snapshot CASCADE;
DROP FUNCTION IF EXISTS exec_sql CASCADE;

-- ===========================================================================
-- 1. learners — 学习者表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS learners (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    uid                     VARCHAR(50) NOT NULL UNIQUE,
    native_language         VARCHAR(50) NOT NULL,
    hsk_level               INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 9),
    learning_motivation     VARCHAR(50),
    cultural_anxiety_score  DECIMAL(5,2) DEFAULT 50,
    ability_vector          JSONB,
    total_sessions          INTEGER DEFAULT 0,
    last_scene_id           VARCHAR(36),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_learners_uid ON learners (uid);
CREATE INDEX IF NOT EXISTS idx_learners_native_language ON learners (native_language);
CREATE INDEX IF NOT EXISTS idx_learners_hsk_level ON learners (hsk_level);

-- ===========================================================================
-- 2. cultural_knowledge_points — 文化知识点表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS cultural_knowledge_points (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    hsk_level               INTEGER NOT NULL CHECK (hsk_level BETWEEN 1 AND 9),
    layer                   INTEGER NOT NULL CHECK (layer BETWEEN 1 AND 3),
    language_binding_points TEXT[],
    content_json            JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ckp_hsk_level ON cultural_knowledge_points (hsk_level);
CREATE INDEX IF NOT EXISTS idx_ckp_layer ON cultural_knowledge_points (layer);

-- ===========================================================================
-- 3. learning_scenes — 学习场景表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS learning_scenes (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_type              VARCHAR(50) NOT NULL,
    scene_subtype           VARCHAR(100),
    hsk_level_range         INTEGER[],
    cultural_background     JSONB,
    language_points         TEXT[],
    cross_cultural_notes    JSONB,
    scene_content           JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ls_scene_type ON learning_scenes (scene_type);

-- ===========================================================================
-- 4. learning_records — 学习记录表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS learning_records (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id              VARCHAR(36) NOT NULL REFERENCES learners(id),
    scene_id                VARCHAR(36) REFERENCES learning_scenes(id),
    knowledge_point_id      VARCHAR(36) REFERENCES cultural_knowledge_points(id),
    hsk_level               INTEGER,
    practice_result         JSONB,
    comprehension_score     DECIMAL(5,2),
    pragmatic_score         DECIMAL(5,2),
    time_spent              INTEGER,
    status                  VARCHAR(20) DEFAULT 'in_progress',
    native_language_ratio   DECIMAL(3,2),
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lr_learner_id ON learning_records (learner_id);
CREATE INDEX IF NOT EXISTS idx_lr_scene_id ON learning_records (scene_id);
CREATE INDEX IF NOT EXISTS idx_lr_knowledge_point ON learning_records (knowledge_point_id);
CREATE INDEX IF NOT EXISTS idx_lr_completed_at ON learning_records (completed_at);
CREATE INDEX IF NOT EXISTS idx_lr_created_at ON learning_records (created_at);

-- ===========================================================================
-- 5. assessment_records — 评估记录表（合并了 schema 定义和实际代码使用的所有列）
-- ===========================================================================
CREATE TABLE IF NOT EXISTS assessment_records (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id              VARCHAR(36) NOT NULL REFERENCES learners(id),
    assessment_type         VARCHAR(30) DEFAULT 'learning_result',
    knowledge_point_id      VARCHAR(36),
    learning_record_id      VARCHAR(36),

    -- 得分
    overall_score           DECIMAL(5,2),
    score                   DECIMAL(5,2),
    correct_answers         INTEGER DEFAULT 0,
    wrong_answers           INTEGER DEFAULT 0,

    -- 能力向量
    ability_vector_before   JSONB,
    ability_vector_after    JSONB,

    -- 焦虑
    anxiety_before          DECIMAL(5,2),
    anxiety_after           DECIMAL(5,2),

    -- BKT 知识追踪
    bkt_mastery_after       DECIMAL(5,4),

    -- Phase 2 字段
    scene_type              VARCHAR(50),
    hsk_level_at_time       INTEGER,
    dimension_scores        JSONB,
    error_patterns          JSONB,

    -- 情感检测
    emotion_state           VARCHAR(10),
    emotion_signals         JSONB,

    -- 语用失误率
    pragmatic_error_rate    DECIMAL(5,4),

    -- 原始 scores (兼容旧 schema)
    scores                  JSONB,

    -- 时间
    assessed_at             TIMESTAMPTZ DEFAULT NOW(),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_learner_id ON assessment_records (learner_id);
CREATE INDEX IF NOT EXISTS idx_ar_assessment_type ON assessment_records (assessment_type);
CREATE INDEX IF NOT EXISTS idx_ar_assessed_at ON assessment_records (assessed_at);
CREATE INDEX IF NOT EXISTS idx_ar_created_at ON assessment_records (created_at);
CREATE INDEX IF NOT EXISTS idx_ar_learner_kp ON assessment_records (learner_id, knowledge_point_id);

-- ===========================================================================
-- 6. learner_profile_snapshots — 学习者画像快照（Phase 3A）
-- ===========================================================================
CREATE TABLE IF NOT EXISTS learner_profile_snapshots (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id              VARCHAR(36) NOT NULL REFERENCES learners(id),
    snapshot_reason         VARCHAR(50),
    cultural_anxiety_score  DECIMAL(5,2),
    ability_vector          JSONB,
    hsk_level               INTEGER,
    native_language         VARCHAR(50),
    total_sessions_at_time  INTEGER,
    last_scene_id           VARCHAR(36),
    weak_dimensions         JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lps_learner_id ON learner_profile_snapshots (learner_id);
CREATE INDEX IF NOT EXISTS idx_lps_created_at ON learner_profile_snapshots (created_at);

-- ===========================================================================
-- 7. cross_cultural_comparisons — 跨文化对比表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS cross_cultural_comparisons (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    source_culture_id       VARCHAR(36) REFERENCES cultural_knowledge_points(id),
    target_culture          VARCHAR(50) NOT NULL,
    similarities            JSONB,
    differences             JSONB,
    pragmatic_hints         JSONB,
    regional_variants       TEXT[],
    bias_score              DECIMAL(3,2),
    verified                BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccc_source_culture ON cross_cultural_comparisons (source_culture_id);
CREATE INDEX IF NOT EXISTS idx_ccc_target_culture ON cross_cultural_comparisons (target_culture);
CREATE INDEX IF NOT EXISTS idx_ccc_verified ON cross_cultural_comparisons (verified);

-- ===========================================================================
-- 8. cultural_explanations — 文化阐释内容表（多语言）
-- ===========================================================================
CREATE TABLE IF NOT EXISTS cultural_explanations (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_point_id      VARCHAR(36) NOT NULL REFERENCES cultural_knowledge_points(id),
    language_code           VARCHAR(10) NOT NULL,
    precise_definition      TEXT,
    scene_introduction      TEXT,
    pragmatic_rules         JSONB,
    examples                JSONB,
    difficulty_notes        TEXT,
    taboo_warnings          TEXT[],
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ce_knowledge_point ON cultural_explanations (knowledge_point_id);
CREATE INDEX IF NOT EXISTS idx_ce_language_code ON cultural_explanations (language_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_kp_language ON cultural_explanations (knowledge_point_id, language_code);

-- ===========================================================================
-- 9. knowledge_graph_nodes — 知识图谱节点表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    node_type               VARCHAR(20) NOT NULL,
    node_id                 VARCHAR(100) NOT NULL,
    properties              JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kgn_node_type ON knowledge_graph_nodes (node_type);
CREATE INDEX IF NOT EXISTS idx_kgn_node_id ON knowledge_graph_nodes (node_id);

-- ===========================================================================
-- 10. knowledge_graph_edges — 知识图谱边表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id          VARCHAR(36) NOT NULL REFERENCES knowledge_graph_nodes(id),
    target_node_id          VARCHAR(36) NOT NULL REFERENCES knowledge_graph_nodes(id),
    edge_type               VARCHAR(30) NOT NULL,
    properties              JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kge_source_node ON knowledge_graph_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_kge_target_node ON knowledge_graph_edges (target_node_id);
CREATE INDEX IF NOT EXISTS idx_kge_edge_type ON knowledge_graph_edges (edge_type);

-- ===========================================================================
-- 11. agent_messages — 多智能体消息表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS agent_messages (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                VARCHAR(100) NOT NULL,
    sender_agent            VARCHAR(50) NOT NULL,
    receiver_agent          VARCHAR(50),
    learner_id              VARCHAR(36) REFERENCES learners(id),
    message_type            VARCHAR(30),
    payload                 JSONB,
    status                  VARCHAR(20) DEFAULT 'pending',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_am_event_id ON agent_messages (event_id);
CREATE INDEX IF NOT EXISTS idx_am_sender_agent ON agent_messages (sender_agent);
CREATE INDEX IF NOT EXISTS idx_am_learner_id ON agent_messages (learner_id);
CREATE INDEX IF NOT EXISTS idx_am_status ON agent_messages (status);
CREATE INDEX IF NOT EXISTS idx_am_created_at ON agent_messages (created_at);

-- ===========================================================================
-- 12. bias_keywords — 偏见检测关键词库
-- ===========================================================================
CREATE TABLE IF NOT EXISTS bias_keywords (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword                 VARCHAR(100) NOT NULL,
    category                VARCHAR(30) NOT NULL,
    language_code           VARCHAR(10) NOT NULL,
    severity                INTEGER DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bk_keyword ON bias_keywords (keyword);
CREATE INDEX IF NOT EXISTS idx_bk_category ON bias_keywords (category);
CREATE INDEX IF NOT EXISTS idx_bk_language ON bias_keywords (language_code);

-- ===========================================================================
-- 13. expert_review_queue — 专家审核队列
-- ===========================================================================
CREATE TABLE IF NOT EXISTS expert_review_queue (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type            VARCHAR(30) NOT NULL,
    content_id              VARCHAR(36) NOT NULL,
    content_data            JSONB NOT NULL,
    priority                INTEGER DEFAULT 0,
    reviewer_id             VARCHAR(36),
    review_status           VARCHAR(20) DEFAULT 'pending',
    review_comments         TEXT,
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erq_content_type ON expert_review_queue (content_type);
CREATE INDEX IF NOT EXISTS idx_erq_review_status ON expert_review_queue (review_status);
CREATE INDEX IF NOT EXISTS idx_erq_priority ON expert_review_queue (priority);
CREATE INDEX IF NOT EXISTS idx_erq_created_at ON expert_review_queue (created_at);

-- ===========================================================================
-- 14. user_profiles — 用户认证表扩展
-- ===========================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type               VARCHAR(20) NOT NULL,
    email                   VARCHAR(255) UNIQUE,
    display_name            VARCHAR(100),
    avatar_url              VARCHAR(500),
    expertise_cultures      TEXT[],
    expertise_languages     TEXT[],
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_up_user_type ON user_profiles (user_type);
CREATE INDEX IF NOT EXISTS idx_up_email ON user_profiles (email);

-- ===========================================================================
-- 15. system_configs — 系统配置表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS system_configs (
    id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key              VARCHAR(100) NOT NULL UNIQUE,
    config_value            JSONB NOT NULL,
    description             TEXT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_config_key ON system_configs (config_key);

-- ===========================================================================
-- 16. health_check — 健康检查表
-- ===========================================================================
CREATE TABLE IF NOT EXISTS health_check (
    id          INTEGER PRIMARY KEY,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================================================
-- 17. RPC: insert_learner_snapshot — Phase 3A 画像快照
-- ===========================================================================
CREATE OR REPLACE FUNCTION insert_learner_snapshot(
    p_learner_id  VARCHAR,
    p_reason      VARCHAR,
    p_anxiety     DECIMAL,
    p_vector      JSONB,
    p_hsk         INTEGER,
    p_native_lang VARCHAR,
    p_sessions    INTEGER,
    p_scene_id    VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_snapshot_id VARCHAR;
BEGIN
    INSERT INTO learner_profile_snapshots (
        learner_id,
        snapshot_reason,
        cultural_anxiety_score,
        ability_vector,
        hsk_level,
        native_language,
        total_sessions_at_time,
        last_scene_id
    ) VALUES (
        p_learner_id,
        p_reason,
        p_anxiety,
        p_vector,
        p_hsk,
        p_native_lang,
        p_sessions,
        p_scene_id
    )
    RETURNING id INTO v_snapshot_id;

    RETURN jsonb_build_object('id', v_snapshot_id, 'success', true);
END;
$$;

-- ===========================================================================
-- 18. RPC: exec_sql — 管理员执行 SQL（仅限 service_role）
-- ===========================================================================
CREATE OR REPLACE FUNCTION exec_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE query;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
