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
import { queryVocabularyConstraints, queryLearnerWeakDimensions, getHardRuleCharWhitelist, fetchKnowledgePointSemantics } from '../kp-semantics';
import { buildA4SystemPrompt, buildA4UserPrompt } from '../prompts/a4';
import {
  aggregateLearnerMetrics,
  getRecentLearningTrend,
} from '../trend-io';

export class ContentGeneratorAgent extends BaseAgent {
  constructor() {
    super('A4_ContentGenerator');
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    const {
      cultural_explanation,
      cross_cultural_comparison,
      scene_type,
      hsk_level,
      learner_profile,
      cultural_explanation_provided,
      cross_cultural_comparison_provided,
    } = message.payload as {
      cultural_explanation: Record<string, unknown>;
      cross_cultural_comparison: Record<string, unknown>;
      scene_type: string;
      hsk_level: number;
      learner_profile: LearnerProfile;
      // [T3] 由 a4Generator 注入：标记本条件是否真的提供了文化模块输入。
      // 默认 true（历史调用/非实验路径视为已提供），skip A2/A3 时显式为 false。
      cultural_explanation_provided?: boolean;
      cross_cultural_comparison_provided?: boolean;
      // [Phase 2] L2 短期记忆趋势数据（由 A1 注入）
      recent_weak_dimensions?: string[];
      accuracy_trend?: "improving" | "stable" | "declining";
      repeated_error_patterns?: string[];
      repeated_scenes?: string[];
    };

    // T3: 计算"是否已提供"布尔（未传标记 → 视为已提供，保持历史行为兼容）
    const ceProvided = cultural_explanation_provided ?? true;
    const ccProvided = cross_cultural_comparison_provided ?? true;

    const targetLangCode = getLanguageCodeStrict(learner_profile.native_language);
    const targetLangNaturalName = getLanguageNaturalName(targetLangCode);

    // Phase 3b: 从 Neo4j 图谱查询该 KP 的 HSK 词汇白名单与语法约束
    const knowledgePointId = (message.payload as Record<string, any>)?.knowledge_point_id
      || (message.payload as Record<string, any>)?.chinese_culture_point
      || scene_type;
    const [vocabConstraint, graphWeakDims, hskCharWhitelist] = await Promise.all([
      queryVocabularyConstraints(knowledgePointId, hsk_level),
      queryLearnerWeakDimensions(learner_profile.id),
      getHardRuleCharWhitelist(knowledgePointId, hsk_level),
    ]);

    // 无论 Neo4j 是否返回词表，都强制注入 HSK 字表（并集 KP 词表），作为硬约束
    const hskHanzi = hskCharWhitelist.filter((ch) => /[一-鿿]/.test(ch));
    let vocabConstraintBlock = "";
    {
      const wordListPart = (vocabConstraint && vocabConstraint.total_words > 0)
        ? `- 知识点 KP 词汇示例: ${vocabConstraint.allowed_words.slice(0, 30).join(", ")}${vocabConstraint.total_words > 30 ? ` ...(共${vocabConstraint.total_words}个)` : ""}\n- 关联语法点 (${vocabConstraint.grammar_points.length}个): ${vocabConstraint.grammar_points.map(g => g.name).join(", ") || "无"}`
        : "- 注意：知识图谱未返回该知识点的词汇约束，请完全以下方 HSK 字表为准。";
      vocabConstraintBlock = `
<vocabulary_constraints>
你是给 HSK ${hsk_level} 学习者出题，请严格遵守以下汉字范围约束：
- 题干、选项、答案中出现的每一个汉字，都必须属于下面的「HSK${hsk_level} 允许汉字集合」（已并集本课知识点 KP 词表，与下游硬规则校验使用的白名单一致）。
- 允许汉字集合（共 ${hskHanzi.length} 个汉字）：${hskHanzi.join("")}
${wordListPart}
- 若必须使用集合外的超纲字，必须同时给出拼音注释；但请优先使用集合内的字。
</vocabulary_constraints>`;
      console.log(`[A4] 词汇约束已注入: kp=${knowledgePointId} hskChars=${hskHanzi.length} graphWords=${vocabConstraint?.total_words ?? 0}`);
    }

    // Phase 5: 锚定知识点语义，避免 A4 基于跑题的 A2 输出继续发散。
    // 即使 A2 输出有偏差，也强制要求练习题聚焦该 KP 的真实文化点。
    const kpSemantic = await fetchKnowledgePointSemantics(knowledgePointId);
    const kpGroundingBlock = kpSemantic
      ? `
<knowledge_point_grounding>
本课知识点锚定（练习题必须围绕这些真实文化点展开，不得偏离到无关主题）：
- 主题(topic): ${kpSemantic.topic || "(未知)"}
- 必须覆盖的具体文化点: ${(kpSemantic.cultural_points || []).join("、") || "(无)"}
</knowledge_point_grounding>`
      : "";
    if (kpSemantic) console.log(`[A4] KP语义已注入(grounding): kp=${knowledgePointId} topic=${kpSemantic.topic}`);

    // Phase 4c: Neo4j 图谱弱项维度
    const neoWeakDims = graphWeakDims?.map(d => d.name) ?? [];
    console.log(`[A4] Neo4j弱项维度: [${neoWeakDims.join(",")}]`);

    // 结构化 Prompt — 参考 A3/A5 的 XML 约束风格
    const system_prompt = buildA4SystemPrompt({
      vocabConstraintBlock,
      hsk_level,
      vocabConstraint,
      targetLangNaturalName,
      EXERCISES_PER_SESSION,
    });

    // Phase 2 L2 趋势数据
    const _l2Payload = message.payload as Record<string, unknown>;
    const _l2WeakDims = (_l2Payload.recent_weak_dimensions as string[]) ?? [];
    const _l2Trend = (_l2Payload.accuracy_trend as string) ?? "stable";
    const _l2Errors = (_l2Payload.repeated_error_patterns as string[]) ?? [];
    const _l2Scenes = (_l2Payload.repeated_scenes as string[]) ?? [];
    const user_message = buildA4UserPrompt({
      scene_type,
      hsk_level,
      targetLangNaturalName,
      learner_profile,
      cultural_explanation,
      ceProvided,
      cross_cultural_comparison,
      ccProvided,
      truncateForA4,
      kpGroundingBlock: kpGroundingBlock,
      recentWeakDimensions: _l2WeakDims,
      neoWeakDims,
      accuracyTrend: _l2Trend,
      repeatedErrorPatterns: _l2Errors,
      repeatedScenes: _l2Scenes,
    });

    // A4 是大调用：超时 20 分钟（路由层另有 480s 兜底）；强制 json_object 输出，
    // 否则 flash/pro 推理模型会输出自然语言而非 JSON，safeJsonParse 直接失败。
    const response = await this.generateResponse(system_prompt, user_message, 1200000, { type: "json_object" });
    const generated_content = safeJsonParse(response);

    // 多余截断：LLM 出了超量题 → 保留前 N 道，不因 AI 多出题而拒绝请求
    const rawExercises = generated_content.exercises as Exercise[] | undefined;
    if (Array.isArray(rawExercises) && rawExercises.length > EXERCISES_PER_SESSION) {
      console.warn(`[A4] LLM 生成了 ${rawExercises.length} 道题，截断为前 ${EXERCISES_PER_SESSION} 道`);
      generated_content.exercises = rawExercises.slice(0, EXERCISES_PER_SESSION);
    }

    // 验证生成的 exercises 格式（数量不足仍拒绝，因无法安全补题）
    this.validateExercisesFormat(generated_content.exercises as Exercise[]);

    return {
      ...message,
      sender_agent: this.agent_id,
      receiver_agent: 'A5_QualityController',
      message_type: 'content_request',
      payload: {
        ...message.payload,
        generated_content,
        content_type: 'learning_scene'
      },
      status: 'pending_review',
      created_at: new Date()
    };
  }

  private validateExercisesFormat(exercises: Exercise[]): void {
    if (!Array.isArray(exercises)) {
      throw new ValidationError('exercises must be an array');
    }

    // 硬性数量校验：不足拒绝（超出已在上层截断），防止空数组/单题关卡
    if (exercises.length < EXERCISES_PER_SESSION) {
      throw new ValidationError(
        `exercises must have at least ${EXERCISES_PER_SESSION} items, got ${exercises.length}`
      );
    }

    for (const ex of exercises) {
      // 类型检查
      if (!['multiple_choice', 'fill_blank', 'true_false'].includes(ex.type)) {
        throw new ValidationError(`Invalid exercise type: ${ex.type}`);
      }

      // 选项检查
      if (ex.type === 'multiple_choice' && ex.options.length !== 4) {
        throw new ValidationError('multiple_choice must have exactly 4 options');
      }
      if (ex.type === 'true_false' && JSON.stringify(ex.options) !== JSON.stringify(['对', '错'])) {
        throw new ValidationError('true_false must have options ["对", "错"]');
      }
      if (ex.type === 'fill_blank' && ex.options.length !== 0) {
        throw new ValidationError('fill_blank must have empty options array');
      }

      // ====== 格式规范化（修复 LLM 偶尔输出 "A. A. xxx"、选项本身带字母前缀） ======
      if (ex.type === 'multiple_choice' || ex.type === 'true_false') {
        // 去掉 options[i] 首字母前缀 /^[A-H][．.\s、:]+/ 和 /^[对错][．.\s、:]+/
        ex.options = (ex.options || []).map((opt: string) =>
          String(opt ?? '')
            .replace(/^\s*[A-H][\s]*[．.、:：]\s*/i, '')
            .replace(/^\s*[对错][\s]*[．.、:：]\s*/, '')
            .trim()
        );
        // 选项规范化后，如果 options 是 ['对','错']，不要被去前缀破坏（已是正确格式）
        if (ex.type === 'true_false' && ex.options.length === 2) {
          // LLM 可能输出 ['对. 对','错. 错']，去前缀后会空。此处兜底。
          if (ex.options[0] === '' || ex.options[0].length === 0) ex.options[0] = '对';
          if (ex.options[1] === '' || ex.options[1].length === 0) ex.options[1] = '错';
        }
        // correct_answer 规范化：去掉 'A. xxx' / 'A: xxx' / 'A：xxx' 中的前缀，只保留字母 / 对错
        const ca = String(ex.correct_answer || '').trim();
        const mLetter = ca.match(/^([A-H])[．.\s、:：]/i);
        if (mLetter && ex.type === 'multiple_choice') {
          ex.correct_answer = mLetter[1].toUpperCase();
        } else if (ex.type === 'true_false') {
          // 接受 '对', '错', 'A. 对', 'B. 错', 'true', 'false'
          const c = ca.toLowerCase();
          if (['对', '正确', '是', 'true', 't', 'yes', 'y'].includes(c) || /^\s*A[．.\s、:：]/.test(ca) || ca === 'A') ex.correct_answer = '对';
          else if (['错', '错误', '否', 'false', 'f', 'no', 'n'].includes(c) || /^\s*B[．.\s、:：]/.test(ca) || ca === 'B') ex.correct_answer = '错';
        }
      } else if (ex.type === 'fill_blank') {
        // 填空：先剥引号/首尾空白，再剥字母前缀（避免 "B. xxx" 去前缀失败）
        ex.correct_answer = String(ex.correct_answer || '')
          .replace(/^["'「"『\s]+|["'」"』\s]+$/g, '')
          .replace(/^\s*[A-H][\s]*[．.、:：]\s*/i, '')
          .trim();
      }

      // 答案检查
      if (ex.type === 'multiple_choice' && !/^[A-D]$/.test(ex.correct_answer)) {
        throw new ValidationError('multiple_choice correct_answer must be A/B/C/D');
      }
      if (ex.type === 'true_false' && !['对', '错'].includes(ex.correct_answer)) {
        throw new ValidationError('true_false correct_answer must be 对 or 错');
      }

      // 维度校验：当前系统仅支持文本题型，自动降级听/说维度
      const VALID_DIMS = ['grammar', 'cultural_pragmatic', 'reading'];
      const DIM_FALLBACK: Record<string, Exercise['dimension']> = {
        listening: 'reading',
        speaking: 'grammar',
      };
      const rawDim = ex.dimension || '';
      if (DIM_FALLBACK[rawDim]) {
        console.log(`[A4] 维度降级: ${rawDim} → ${DIM_FALLBACK[rawDim]} (系统暂无音视频题型)`);
        ex.dimension = DIM_FALLBACK[rawDim];
      } else if (!VALID_DIMS.includes(rawDim)) {
        ex.dimension = 'grammar';
      }
    }
  }
}

