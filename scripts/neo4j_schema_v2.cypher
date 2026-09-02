// ============================================================================
// Neo4j 知识图谱 v2 Schema — 约束与索引
//
// 四层语义网络：文化语用概念层 + 跨文化维度层 + HSK语言体系层 + 学习者认知层
//
// 执行方式：
//   1. Neo4j Browser: 直接粘贴运行
//   2. cypher-shell: cat neo4j_schema_v2.cypher | cypher-shell -u neo4j -p <password>
//   3. Python driver: 放入 seed 脚本统一执行
//
// 幂等性：所有约束使用 IF NOT EXISTS，可重复执行
// ============================================================================

// ----------------------------------------------------------------------------
// Layer 1: 文化语用概念层 — 保留现有 + 新增
// ----------------------------------------------------------------------------

// 现有约束（兼容旧脚本，使用 IF NOT EXISTS 保证幂等）
CREATE CONSTRAINT domain_id_unique IF NOT EXISTS
FOR (d:Domain) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT scene_id_unique IF NOT EXISTS
FOR (s:Scene) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT kp_id_unique IF NOT EXISTS
FOR (kp:KnowledgePoint) REQUIRE kp.id IS UNIQUE;

// 新增节点类型
CREATE CONSTRAINT lang_point_id_unique IF NOT EXISTS
FOR (lp:LanguagePoint) REQUIRE lp.id IS UNIQUE;

CREATE CONSTRAINT cultural_concept_id_unique IF NOT EXISTS
FOR (cc:CulturalConcept) REQUIRE cc.id IS UNIQUE;

CREATE CONSTRAINT grammar_point_id_unique IF NOT EXISTS
FOR (gp:GrammarPoint) REQUIRE gp.id IS UNIQUE;

// ----------------------------------------------------------------------------
// Layer 2: 跨文化维度层
// ----------------------------------------------------------------------------

CREATE CONSTRAINT dim_id_unique IF NOT EXISTS
FOR (cd:CulturalDimension) REQUIRE cd.id IS UNIQUE;

CREATE CONSTRAINT home_culture_id_unique IF NOT EXISTS
FOR (hc:HomeCulture) REQUIRE hc.id IS UNIQUE;

// ----------------------------------------------------------------------------
// Layer 3: HSK语言体系层
// ----------------------------------------------------------------------------

CREATE CONSTRAINT hsk_word_id_unique IF NOT EXISTS
FOR (hw:HSKWord) REQUIRE hw.id IS UNIQUE;

CREATE INDEX hsk_word_lemma_idx IF NOT EXISTS
FOR (hw:HSKWord) ON (hw.lemma, hw.level);

// ----------------------------------------------------------------------------
// Layer 4: 学习者认知层
// ----------------------------------------------------------------------------

CREATE CONSTRAINT learner_id_unique IF NOT EXISTS
FOR (l:Learner) REQUIRE l.id IS UNIQUE;

CREATE CONSTRAINT error_pattern_id_unique IF NOT EXISTS
FOR (ep:ErrorPattern) REQUIRE ep.id IS UNIQUE;

// ============================================================================
// 执行完成后验证
// ============================================================================
// SHOW CONSTRAINTS;
// SHOW INDEXES;
// CALL db.labels() YIELD label RETURN label ORDER BY label;
