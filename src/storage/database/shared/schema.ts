import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, boolean, integer, jsonb, text, decimal, index } from "drizzle-orm/pg-core";

// ==================== 核心业务表 ====================

// 学习者表
export const learners = pgTable(
  "learners",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    uid: varchar("uid", { length: 50 }).notNull().unique(),
    native_language: varchar("native_language", { length: 50 }).notNull(),  // 母语文化圈
    hsk_level: integer("hsk_level").notNull(),  // 当前HSK等级 1-9
    learning_motivation: varchar("learning_motivation", { length: 50 }),  // 旅游/留学/工作/兴趣/考试
    cultural_anxiety_score: decimal("cultural_anxiety_score", { precision: 5, scale: 2 }).default("50"),  // 文化焦虑度 0-100
    ability_vector: jsonb("ability_vector"),  // 能力短板向量 [语法,听力,口语,文化语用,阅读]
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("learners_uid_idx").on(table.uid),
    index("learners_native_language_idx").on(table.native_language),
    index("learners_hsk_level_idx").on(table.hsk_level),
  ]
);

// 文化知识点表
export const cultural_knowledge_points = pgTable(
  "cultural_knowledge_points",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    hsk_level: integer("hsk_level").notNull(),  // 对应HSK等级 1-9
    layer: integer("layer").notNull(),  // 层级 1-3 (基础/进阶/高阶)
    language_binding_points: text("language_binding_points").array(),  // 绑定的语言点集合
    content_json: jsonb("content_json").notNull(),  // 多语言内容
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cKP_hsk_level_idx").on(table.hsk_level),
    index("cKP_layer_idx").on(table.layer),
  ]
);

// 跨文化对比表
export const cross_cultural_comparisons = pgTable(
  "cross_cultural_comparisons",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    source_culture_id: varchar("source_culture_id", { length: 36 }).references(() => cultural_knowledge_points.id),
    target_culture: varchar("target_culture", { length: 50 }).notNull(),  // 目标文化圈
    similarities: jsonb("similarities"),  // 相同点集合
    differences: jsonb("differences"),  // 不同点集合
    pragmatic_hints: jsonb("pragmatic_hints"),  // 语言应用提示
    regional_variants: text("regional_variants").array(),  // 地域/代际差异
    bias_score: decimal("bias_score", { precision: 3, scale: 2 }),  // 偏见度评分 0-1
    verified: boolean("verified").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ccc_source_culture_idx").on(table.source_culture_id),
    index("ccc_target_culture_idx").on(table.target_culture),
    index("ccc_verified_idx").on(table.verified),
  ]
);

// 知识图谱节点表
export const knowledge_graph_nodes = pgTable(
  "knowledge_graph_nodes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    node_type: varchar("node_type", { length: 20 }).notNull(),  // culture/language/level/dimension/pragmatic/region
    node_id: varchar("node_id", { length: 100 }).notNull(),
    properties: jsonb("properties"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("kgn_node_type_idx").on(table.node_type),
    index("kgn_node_id_idx").on(table.node_id),
  ]
);

// 知识图谱边表
export const knowledge_graph_edges = pgTable(
  "knowledge_graph_edges",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    source_node_id: varchar("source_node_id", { length: 36 }).notNull().references(() => knowledge_graph_nodes.id),
    target_node_id: varchar("target_node_id", { length: 36 }).notNull().references(() => knowledge_graph_nodes.id),
    edge_type: varchar("edge_type", { length: 30 }).notNull(),  // correspond/contain/match/taboo/homology/difference
    properties: jsonb("properties"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("kge_source_node_idx").on(table.source_node_id),
    index("kge_target_node_idx").on(table.target_node_id),
    index("kge_edge_type_idx").on(table.edge_type),
  ]
);

// 学习场景表
export const learning_scenes = pgTable(
  "learning_scenes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    scene_type: varchar("scene_type", { length: 50 }).notNull(),  // 12类核心场景
    scene_subtype: varchar("scene_subtype", { length: 100 }),
    hsk_level_range: integer("hsk_level_range").array(),  // 适用的HSK等级范围
    cultural_background: jsonb("cultural_background"),  // 文化背景说明
    language_points: text("language_points").array(),  // 核心语言点
    cross_cultural_notes: jsonb("cross_cultural_notes"),  // 跨文化注意事项
    scene_content: jsonb("scene_content"),  // 场景完整内容
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ls_scene_type_idx").on(table.scene_type),
    index("ls_hsk_level_range_idx").on(table.hsk_level_range),
  ]
);

// 学习记录表
export const learning_records = pgTable(
  "learning_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    learner_id: varchar("learner_id", { length: 36 }).notNull().references(() => learners.id),
    scene_id: varchar("scene_id", { length: 36 }).references(() => learning_scenes.id),
    knowledge_point_id: varchar("knowledge_point_id", { length: 36 }).references(() => cultural_knowledge_points.id),
    practice_result: jsonb("practice_result"),  // 练习结果
    comprehension_score: decimal("comprehension_score", { precision: 5, scale: 2 }),  // 理解得分
    pragmatic_score: decimal("pragmatic_score", { precision: 5, scale: 2 }),  // 语用得分
    time_spent: integer("time_spent"),  // 学习时长(秒)
    completed_at: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("lr_learner_id_idx").on(table.learner_id),
    index("lr_scene_id_idx").on(table.scene_id),
    index("lr_knowledge_point_idx").on(table.knowledge_point_id),
    index("lr_completed_at_idx").on(table.completed_at),
  ]
);

// 评估记录表
export const assessment_records = pgTable(
  "assessment_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    learner_id: varchar("learner_id", { length: 36 }).notNull().references(() => learners.id),
    assessment_type: varchar("assessment_type", { length: 30 }),  // language/cultural/pragmatic/comprehensive
    scores: jsonb("scores"),  // 各维度得分
    overall_score: decimal("overall_score", { precision: 5, scale: 2 }),  // 综合得分
    pragmatic_error_rate: decimal("pragmatic_error_rate", { precision: 5, scale: 4 }),  // 跨文化语用失误率
    assessed_at: timestamp("assessed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ar_learner_id_idx").on(table.learner_id),
    index("ar_assessment_type_idx").on(table.assessment_type),
    index("ar_assessed_at_idx").on(table.assessed_at),
  ]
);

// 多智能体消息表
export const agent_messages = pgTable(
  "agent_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    event_id: varchar("event_id", { length: 100 }).notNull(),  // 事件ID
    sender_agent: varchar("sender_agent", { length: 50 }).notNull(),  // 发送方智能体
    receiver_agent: varchar("receiver_agent", { length: 50 }),  // 接收方智能体 (可为null表示广播)
    learner_id: varchar("learner_id", { length: 36 }).references(() => learners.id),
    message_type: varchar("message_type", { length: 30 }),  // profile_update/content_request/comparison_result
    payload: jsonb("payload"),
    status: varchar("status", { length: 20 }).default("pending"),  // pending/processing/passed/pending_review/rejected
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("am_event_id_idx").on(table.event_id),
    index("am_sender_agent_idx").on(table.sender_agent),
    index("am_receiver_agent_idx").on(table.receiver_agent),
    index("am_learner_id_idx").on(table.learner_id),
    index("am_status_idx").on(table.status),
    index("am_created_at_idx").on(table.created_at),
  ]
);

// 文化阐释内容表 (多语言版本)
export const cultural_explanations = pgTable(
  "cultural_explanations",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    knowledge_point_id: varchar("knowledge_point_id", { length: 36 }).notNull().references(() => cultural_knowledge_points.id),
    language_code: varchar("language_code", { length: 10 }).notNull(),  // en/ja/ko/es/ar/ru/fr/other
    precise_definition: text("precise_definition"),  // 文化概念精准定义
    scene_introduction: text("scene_introduction"),  // 典型文化场景介绍
    pragmatic_rules: jsonb("pragmatic_rules"),  // 核心语言应用规则
    examples: jsonb("examples"),  // 例句集合
    difficulty_notes: text("difficulty_notes"),  // 难度说明
    taboo_warnings: text("taboo_warnings").array(),  // 禁忌提醒
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("ce_knowledge_point_idx").on(table.knowledge_point_id),
    index("ce_language_code_idx").on(table.language_code),
    index("ce_kp_language_idx").on(table.knowledge_point_id, table.language_code),
  ]
);

// 偏见检测关键词库
export const bias_keywords = pgTable(
  "bias_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    keyword: varchar("keyword", { length: 100 }).notNull(),
    category: varchar("category", { length: 30 }).notNull(),  // stereotype/prejudice/sensitive
    language_code: varchar("language_code", { length: 10 }).notNull(),
    severity: integer("severity").default(1),  // 严重程度 1-5
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bk_keyword_idx").on(table.keyword),
    index("bk_category_idx").on(table.category),
    index("bk_language_idx").on(table.language_code),
  ]
);

// 专家审核队列
export const expert_review_queue = pgTable(
  "expert_review_queue",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    content_type: varchar("content_type", { length: 30 }).notNull(),  // explanation/comparison/scene
    content_id: varchar("content_id", { length: 36 }).notNull(),  // 关联内容的ID
    content_data: jsonb("content_data").notNull(),  // 待审核内容
    priority: integer("priority").default(0),  // 优先级 0-5
    reviewer_id: varchar("reviewer_id", { length: 36 }),  // 指定审核人
    review_status: varchar("review_status", { length: 20 }).default("pending"),  // pending/in_review/approved/rejected
    review_comments: text("review_comments"),  // 审核意见
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("erq_content_type_idx").on(table.content_type),
    index("erq_review_status_idx").on(table.review_status),
    index("erq_priority_idx").on(table.priority),
    index("erq_created_at_idx").on(table.created_at),
  ]
);

// 用户认证表扩展 (用于区分学习者和专家)
export const user_profiles = pgTable(
  "user_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_type: varchar("user_type", { length: 20 }).notNull(),  // learner/expert/admin
    email: varchar("email", { length: 255 }).unique(),
    display_name: varchar("display_name", { length: 100 }),
    avatar_url: varchar("avatar_url", { length: 500 }),
    expertise_cultures: text("expertise_cultures").array(),  // 专家擅长的文化圈
    expertise_languages: text("expertise_languages").array(),  // 专家擅长的语言
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("up_user_type_idx").on(table.user_type),
    index("up_email_idx").on(table.email),
  ]
);

// 系统配置表
export const system_configs = pgTable(
  "system_configs",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    config_key: varchar("config_key", { length: 100 }).notNull().unique(),
    config_value: jsonb("config_value").notNull(),
    description: text("description"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sc_config_key_idx").on(table.config_key),
  ]
);

// ==================== 健康检查表 (必须保留) ====================
export const healthCheck = pgTable("health_check", {
  id: integer("id").primaryKey(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});
