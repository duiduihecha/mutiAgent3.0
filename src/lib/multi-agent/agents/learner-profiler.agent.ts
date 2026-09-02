// ==============================================================
// 本文件由 src/lib/multi-agent-system.ts 拆分而来（方案一 · 横向切分）
// 拆分策略：零逻辑改动，纯代码搬移；兼容 barrel 保留于 src/lib/multi-agent-system.ts
// ==============================================================

/**
 * 多智能体系统框架 v2.0
 * Multi-Agent System Framework for Cross-Cultural Chinese Learning
 * 
 * 重构要点：
 * 1. 强约束 Prompt 设计 - JSON Schema 输出
 * 2. 容错机制 - 超时重试
 * 3. 场景动态映射
 * 4. 能力向量闭环计算
 */

import { UnifiedLLMService, type LLMMessage, type LLMResponse, type LLMProvider } from '../../unified-llm-service';
import { getLLMConfig, isOfflineMockExecution, type LLMPreset } from '../../llm-config';
import {
  getGuardrailService,
  createPipelineContext,
  applyGuardrailResult,
  shouldWriteCache,
  getPipelineMetadata,
  publishGuardrailTelemetry,
  CACHE_WRITE_CONFIDENCE_THRESHOLD,
  type GuardrailVerdict,
  type ExerciseItem,
  type PipelineContext,
  type PipelineMetadata,
} from "@/services/guardrail-service";
import { CacheManager } from "@/storage/cache/cache-manager";
import { buildHardRuleCharWhitelist as buildHardRuleCharWhitelistFromGraph } from "../../hsk-vocab-graph";
import { neo4jService } from "../../neo4j-service";
import type { VocabularyConstraint } from "../../hsk-vocab-graph";
import {
  AGENT_CONFIGS,
  SCENE_TO_KP_KEYWORDS,
  BIAS_KEYWORDS,
  BIAS_PATTERNS,
  BIAS_KEYWORDS_TEMPORAL,
  BIAS_PATTERNS_TEMPORAL,
  EXERCISES_PER_SESSION,
  getLanguageCode,
  getLanguageCodeStrict,
  getLanguageNaturalName,
  getSceneType as resolveSceneType,
} from '../../constants';

// ==================== 错误类型定义 ====================


import { BaseAgent } from '../base-agent';
import { AgentError, ValidationError } from '../errors';
import type { AgentMessage, LearnerProfile, Exercise, GeneratedContent, RecentLearningTrend } from '../types';
import {
  safeJsonParse,
  withTimeout,
  withRetry,
  truncateForA4,
} from '../utils';
import {
  calculateCulturalAnxiety,
  calculateAnxietyDelta,
  applyAnxietyDelta,
  anxietyScoreToLevel,
  calculateNativeLanguageRatio,
  detectBias,
  bayesianKnowledgeTracing,
  computeMemoryStrength,
  applyForgettingDecay,
  calculateAbilityVector,
} from '../algorithms';
import {
  aggregateLearnerMetrics,
  getRecentLearningTrend,
} from '../trend-io';

export class LearnerProfilerAgent extends BaseAgent {
  constructor() {
    super('A1_LearnerProfiler');
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    const { payload } = message;
    const action = payload.action as string;

    switch (action) {
      case 'calculate_anxiety':
        return await this.calculateAnxiety(message);
      case 'track_progress':
        return await this.trackProgress(message);
      default:
        throw new AgentError(`Unknown action: ${action}`, this.agent_id);
    }
  }

  private async calculateAnxiety(message: AgentMessage): Promise<AgentMessage> {
    const payload = message.payload as Record<string, any>;

    // [修复] 焦虑度唯一权威来源：数据库 learners.cultural_anxiety_score
    // A1 不再独立计算焦虑度数值，只做三件事：
    //   1. 读取 learner_profile.cultural_anxiety_score（由 results API 的 applyAnxietyDelta 写回）
    //   2. 映射 anxiety_level（high / medium / low）
    //   3. 计算 native_language_ratio
    // 焦虑度的唯一更新入口是 results API 的 applyAnxietyDelta()
    const dbAnxiety = payload.learner_profile?.cultural_anxiety_score;
    const anxiety_score = (typeof dbAnxiety === 'number' && dbAnxiety >= 0) ? dbAnxiety : 50;

    const anxiety_level = anxietyScoreToLevel(anxiety_score);
    const ratio = calculateNativeLanguageRatio(anxiety_score);

    // [Phase 2] 查询 L2 短期记忆趋势数据
    let recent_trend: RecentLearningTrend | null = null;
    const supabaseClient = payload._supabase_client; // Coordinator 注入
    if (supabaseClient && payload.learner_profile?.id) {
      try {
        recent_trend = await getRecentLearningTrend(
          supabaseClient,
          payload.learner_profile.id,
          5 // 回看最近 5 轮
        );
        console.log(
          `[A1] L2趋势已接入: weak=[${(recent_trend.weak_dimensions || []).join(",")}] trend=${recent_trend.accuracy_trend} avgScore=${recent_trend.recent_average_score}`
        );
      } catch (err) {
        console.warn(`[A1] L2趋势查询失败，使用空趋势:`, err);
        recent_trend = null;
      }
    }

    return {
      ...message,
      sender_agent: this.agent_id,
      message_type: 'profile_update',
      payload: {
        ...message.payload,
        cultural_anxiety_score: anxiety_score,
        anxiety_level,
        native_language_ratio: ratio,
        // [Phase 2] L2 趋势数据，供 A4 消费
        recent_weak_dimensions: recent_trend?.weak_dimensions || [],
        accuracy_trend: recent_trend?.accuracy_trend || "stable",
        repeated_error_patterns: recent_trend?.repeated_error_patterns || [],
        repeated_scenes: recent_trend?.repeated_scenes || [],
        recent_average_score: recent_trend?.recent_average_score || 0,
        dimension_accuracy: recent_trend?.dimension_accuracy || {},
      },
      status: 'passed',
      created_at: new Date()
    };
  }

  private async trackProgress(message: AgentMessage): Promise<AgentMessage> {
    const { knowledge_point_id, answered_correctly, current_mastery } = message.payload as {
      knowledge_point_id: string;
      answered_correctly: boolean;
      current_mastery: number;
    };

    const new_mastery = bayesianKnowledgeTracing({
      prior_probability: current_mastery || 0.2,
      guess_probability: 0.25,
      slip_probability: 0.10,
      observed_correct: answered_correctly
    });

    return {
      ...message,
      sender_agent: this.agent_id,
      message_type: 'profile_update',
      payload: {
        ...message.payload,
        knowledge_point_id,
        previous_mastery: current_mastery,
        new_mastery,
        mastery_change: new_mastery - (current_mastery || 0)
      },
      status: 'passed',
      created_at: new Date()
    };
  }
}

