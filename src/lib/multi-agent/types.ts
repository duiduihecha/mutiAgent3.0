// ==============================================================
// 本文件由 src/lib/multi-agent-system.ts 拆分而来（方案一 · 横向切分）
// 拆分策略：零逻辑改动，纯代码搬移；兼容 barrel 保留于 src/lib/multi-agent-system.ts
// ==============================================================

// 纯类型定义，不 import 任何实现，避免循环依赖

export interface AgentMessage {
  id: string;
  event_id: string;
  sender_agent: string;
  receiver_agent?: string;
  learner_id?: string;
  message_type: 'profile_update' | 'content_request' | 'comparison_result' | 'quality_check' | 'approval';
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'passed' | 'pending_review' | 'rejected';
  created_at: Date;
}

export interface LearnerProfile {
  id: string;
  uid: string;
  native_language: string;
  hsk_level: number;
  learning_motivation: 'tourism' | 'study_abroad' | 'work' | 'interest' | 'exam';
  cultural_anxiety_score: number;
  ability_vector: number[]; // [语法,听力,口语,文化语用,阅读]
}

export interface Exercise {
  type: 'multiple_choice' | 'fill_blank' | 'true_false';
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  dimension?: 'grammar' | 'listening' | 'speaking' | 'cultural_pragmatic' | 'reading';
}

export interface GeneratedContent {
  cultural_context: {
    explanation: string;
    native_ratio: number;
  };
  language_points: Array<{ zh: string; en: string }>;
  comparison: {
    cn: string;
    target: string;
    differences: Array<{ cn: string; target: string; description: string }>;
  };
  exercises: Exercise[];
}

// ==================== 配置常量 ====================

// AGENT_CONFIGS 已迁移至 ./constants.ts，通过 import 引入


// ==================== 核心算法 ====================

/**
 * 文化焦虑度计算（4因子加权公式，用于有完整行为指标时）
 */

export interface SlotDef {
  index: number;
  lang: 'native' | 'chinese';
  label: string;
  description: string;
}

/**
 * 槽位模板
 */
export interface SlotTemplate {
  slots: SlotDef[];
  native_count: number;
  chinese_count: number;
  target_ratio: number;
  anxiety_level: 'high' | 'medium' | 'low';
}

/**
 * 单个槽位的生成结果
 */
export interface SlotResult {
  index: number;
  lang: 'native' | 'chinese';
  content: string;
}

/**
 * 焦虑度 → 6槽位模板
 */

export interface RecentLearningTrend {
  /** 最近 N 轮平均分 */
  recent_average_score: number;
  /** 弱维度列表（正确率 < 40% 的维度） */
  weak_dimensions: string[];
  /** 各维度平均正确率 */
  dimension_accuracy: Record<string, number>;
  /** 反复出现的错误模式（最近 N 轮中 ≥2 次出现的） */
  repeated_error_patterns: string[];
  /** 反复学习的场景类型（最近 N 轮中 ≥2 次的） */
  repeated_scenes: string[];
  /** 准确率趋势：improving / stable / declining */
  accuracy_trend: "improving" | "stable" | "declining";
  /** 用于日志的原始记录数 */
  window_size: number;
  actual_records: number;
}

/**
 * 从 assessment_records 聚合最近 N 轮学习趋势
 * 纯传统代码，不调 LLM
 *
 * @param supabaseClient - Supabase 客户端
 * @param learnerId - 学习者 ID
 * @param windowSize - 回看窗口大小，默认 5 轮
 */
