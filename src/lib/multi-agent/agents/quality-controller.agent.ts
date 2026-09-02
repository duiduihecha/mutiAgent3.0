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
import type { AgentMessage, LearnerProfile, Exercise, GeneratedContent } from '../types';
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
import { buildA5SystemPrompt, buildA5UserPrompt } from '../prompts/a5';
import {
  aggregateLearnerMetrics,
  getRecentLearningTrend,
} from '../trend-io';

export class QualityControllerAgent extends BaseAgent {
  constructor() {
    super('A5_QualityController');
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    const { generated_content, content_type } = message.payload as {
      generated_content: Record<string, unknown>;
      content_type: string;
    };

    const content_text = JSON.stringify(generated_content);
    const auto_bias_check = detectBias(content_text);

    // 提取 HSK 等级（从 payload 或 learner_profile 中获取）
    const learnerProfile = (message.payload as Record<string, any>)?.learner_profile;
    const hskLevel = (message.payload as Record<string, any>)?.hsk_level
      ?? learnerProfile?.hsk_level
      ?? 1;

    // 只提取练习题数据用于审核
    const exercises = generated_content?.exercises
      || generated_content?.exercises_list
      || [];

    const exercisePayload = JSON.stringify(
      { exercises, hsk_level: hskLevel },
      null,
      2,
    );
    const system_prompt = buildA5SystemPrompt();
    const user_message = buildA5UserPrompt({ hskLevel, exercisePayload });

    let review_response: string;
    try {
      // A5 是最后一道质检门：qwen3.6-flash 对 A5 大 prompt 需 60-120s，60s 会误超时 → 120s
      review_response = await this.generateResponse(
        system_prompt,
        user_message,
        300000,
        { type: "json_object" },
      );
    } catch (e) {
      // 质检是最后一道门，LLM 异常一律严格抛错（质检不可跳过），交由上层 withRetry/超时策略处理。
      throw e;
    }
    const review_result = safeJsonParse(review_response) as Record<string, unknown>;

    // 提取 is_qualified 决定 LangGraph 状态机下一步走向
    const isQualified = review_result?.is_qualified === true
      || review_result?.is_qualified === "true";

    // 提取分项评分
    const scores = (review_result?.scores || {}) as Record<string, number>;

    return {
      ...message,
      sender_agent: this.agent_id,
      receiver_agent: undefined,
      message_type: 'approval',
      payload: {
        ...message.payload,
        quality_review: {
          ...review_result,
          is_qualified: isQualified,
          scores,
        },
        auto_bias_check,
        is_qualified: isQualified,
        final_status: isQualified ? 'passed' : 'pending_review',
        requires_expert_review: !isQualified,
      },
      status: isQualified ? 'passed' : 'pending_review',
      created_at: new Date()
    };
  }

  private calculateQualityScore(content: Record<string, unknown>): number {
    let score = 1.0;

    const required_fields = ['cultural_context', 'language_points', 'exercises'];
    for (const field of required_fields) {
      if (!content[field]) score -= 0.2;
    }

    const exercises = content.exercises as Array<Record<string, unknown>> | undefined;
    if (exercises && exercises.length > 0) {
      for (const ex of exercises) {
        if (!ex.type || !ex.question || !ex.correct_answer) {
          score -= 0.1;
        }
      }
    } else {
      score -= 0.3;
    }

    const bias = detectBias(JSON.stringify(content));
    if (bias.has_bias) score -= 0.3;

    return Math.max(0, score);
  }
}

// SCENE_TO_KP_KEYWORDS 已迁移至 ./constants.ts

/**
 * 根据场景ID获取知识点
 */
