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

import { UnifiedLLMService, type LLMMessage, type LLMResponse, type LLMProvider } from '../unified-llm-service';
import { getLLMConfig, isOfflineMockExecution, type LLMPreset } from '../llm-config';
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
import { buildHardRuleCharWhitelist as buildHardRuleCharWhitelistFromGraph } from "../hsk-vocab-graph";
import { neo4jService } from "../neo4j-service";
import type { VocabularyConstraint } from "../hsk-vocab-graph";
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
} from '../constants';

// ==================== 错误类型定义 ====================


import { AgentError, ValidationError } from './errors';
import type {
  AgentMessage,
  LearnerProfile,
  Exercise,
  GeneratedContent,
  SlotDef,
  SlotTemplate,
  SlotResult,
  RecentLearningTrend,
} from './types';
import {
  safeJsonParse,
  withTimeout,
  withRetry,
  truncateForA4,
} from './utils';
import {
  calculateCulturalAnxiety,
  calculateAnxietyDelta,
  applyAnxietyDelta,
  anxietyScoreToLevel,
  calculateNativeLanguageRatio,
  validateSlotRatio,
  detectBias,
  bayesianKnowledgeTracing,
  computeMemoryStrength,
  applyForgettingDecay,
  calculateAbilityVector,
} from './algorithms';
import { BaseAgent } from './base-agent';
import {
  getSlotStructure,
  generateSlots,
  assembleSlots,
} from './a2-slots';
import {
  langCodeToHomeCultureId,
  queryCulturalGraphData,
  queryVocabularyConstraints,
  queryLearnerWeakDimensions,
  getHardRuleCharWhitelist,
  fetchKnowledgePointSemantics,
} from './kp-semantics';
import { getKnowledgePointByScene } from './scene-mapper';
import { queryKnowledgeBase, saveToKnowledgeBase } from './cache-io';
import { aggregateLearnerMetrics, getRecentLearningTrend } from './trend-io';
import { LearnerProfilerAgent } from './agents/learner-profiler.agent';
import { MotherTongueExplainerAgent } from './agents/mother-tongue-explainer.agent';
import { CulturalComparatorAgent } from './agents/cultural-comparator.agent';
import { ContentGeneratorAgent } from './agents/content-generator.agent';
import { QualityControllerAgent } from './agents/quality-controller.agent';

export class MultiAgentCoordinator {
  private agents: Map<string, BaseAgent>;

  constructor() {
    this.agents = new Map();
    this.agents.set('A1_LearnerProfiler', new LearnerProfilerAgent());
    this.agents.set('A2_MotherTongueExplainer', new MotherTongueExplainerAgent());
    this.agents.set('A3_CulturalComparator', new CulturalComparatorAgent());
    this.agents.set('A4_ContentGenerator', new ContentGeneratorAgent());
    this.agents.set('A5_QualityController', new QualityControllerAgent());
  }

  /**
   * 事件驱动的异步网状协同流程（知识库优先）
   * 
   * 流程：
   * 1. 查知识库 → 有数据 → 直接返回（跳过LLM）
   * 2. 查知识库 → 无数据 → LLM生成 → 保存知识库 → 返回
   */
  async processLearningRequest(
    learner_profile: LearnerProfile,
    knowledge_point_id: string,
    scene_keywords?: string[],
    signal?: AbortSignal
  ): Promise<{
    cultural_explanation: Record<string, unknown>;
    cross_cultural_comparison: Record<string, unknown>;
    learning_content: GeneratedContent;
    final_status: string;
    from_cache: boolean;
    anxiety_level?: string;
    cultural_anxiety_score?: number;
    guardrail_results?: Record<string, GuardrailVerdict>;
    pipeline_metadata?: PipelineMetadata;
  }> {
    const event_id = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pipelineCtx = createPipelineContext(event_id);

    // [P0 修复] 将上游取消信号透传到所有 Agent，超时即可真正中断底层 LLM 调用
    if (signal) {
      for (const agent of this.agents.values()) {
        agent.setAbortSignal(signal);
      }
    }

    // 动态获取场景类型
    const scene_type = resolveSceneType(knowledge_point_id, scene_keywords);

    // ========== Step 0: 知识库查询（优先） ==========
    console.log(`[知识库] 查询知识点: ${knowledge_point_id}, 语言: ${learner_profile.native_language}`);
    const skipCache = isOfflineMockExecution() || process.env.BYPASS_KNOWLEDGE_CACHE === "true";
    const cachedData = skipCache ? { found: false } : await queryKnowledgeBase({
      knowledge_point_id,
      target_culture: learner_profile.native_language,
      hsk_level: learner_profile.hsk_level
    });

    if (cachedData.found && cachedData.cross_cultural_comparison) {
      console.log(`[知识库] 命中缓存，直接返回已有数据`);

      const explanation = cachedData.cultural_explanation || { precise_definition: "从知识库获取的文化阐释" };
      const comparison = cachedData.cross_cultural_comparison;

      // 知识库有数据，跳过LLM调用，直接生成练习题
      const exercises = await this.generateExercisesOnly(
        event_id,
        learner_profile,
        knowledge_point_id,
        scene_type,
        explanation,
        comparison
      );

      // [重构] 缓存路径 Guardrail 通过 PipelineContext 驱动，失败不阻断，仅衰减置信度
      const guardrail = getGuardrailService();

      const exerciseList = (exercises?.exercises as unknown) as Array<Record<string, unknown>> | undefined;
      if (exerciseList && exerciseList.length > 0) {
        // Solver 对抗盲测
        const solverResults = await Promise.all(
          exerciseList.map(async (ex, idx) => {
            const exType = String(ex.type || "multiple_choice");
            try {
              const item: ExerciseItem = {
                type: exType as ExerciseItem['type'],
                question_stem: String(ex.question || ""),
                pinyin_guide: ex.pinyin_guide as string | undefined,
                dimension: ex.dimension as string | undefined,
                explanation: ex.explanation as string | undefined,
              };
              if (exType === "multiple_choice") {
                item.options = Array.isArray(ex.options) ? ex.options as string[] : [];
                item.answer_key = String(ex.correct_answer || "");
              } else if (exType === "true_false") {
                item.options = ["对", "错"];
                item.answer_key = String(ex.correct_answer || "");
              } else {
                item.options = [];
                item.answer_key = String(ex.correct_answer || "");
              }
              return await guardrail.verifyA4SolverAdversarial(item);
            } catch (e) {
              return { passed: false, action: "FLAG_PENDING_REVIEW" as const, confidence: 0, detail: { exception: String(e), exercise_index: idx }, error: String(e) };
            }
          })
        );
        const solverFlags = solverResults.filter(r => !r.passed);
        applyGuardrailResult(pipelineCtx, 'a4_solver', {
          passed: solverFlags.length === 0,
          action: solverFlags.length === 0 ? "PASS" : "FLAG_REJECT",
          confidence: solverFlags.length === 0 ? 1 : 0,
          detail: { exercises_checked: exerciseList.length, flagged: solverFlags.length },
          error: solverFlags.length > 0 ? `${solverFlags.length} 道题 Solver 盲解不一致` : null,
        });

        // 硬规则：拼音 + HSK超纲字
        // 白名单 = HSK等级字表 ∪ 该知识点词表的字（KP词表本就是本课要教的新词，不应判超纲）
        const hardRuleWhitelist = await getHardRuleCharWhitelist(
          knowledge_point_id,
          learner_profile.hsk_level ?? 1
        );
        const hardRuleResults = exerciseList.map(ex =>
          guardrail.preA5HardRulesFilter(
            { question_stem: String(ex.question || ""), pinyin_guide: ex.pinyin_guide as string | undefined },
            hardRuleWhitelist
          )
        );
        const hardFlags = hardRuleResults.filter(r => !r.passed);
        applyGuardrailResult(pipelineCtx, 'a4_hard_rules', {
          passed: hardFlags.length === 0,
          action: hardFlags.length === 0 ? "PASS" : "FLAG_PENDING_REVIEW",
          confidence: hardFlags.length === 0 ? 1 : 0,
          detail: { checked: hardRuleResults.length, flagged: hardFlags.length },
          error: hardFlags.length > 0 ? `${hardFlags.length} 道题硬规则未通过` : null,
        });

        // Grounding校验
        const groundingResult = await guardrail.verifyA4Grounding(
          explanation,
          exerciseList.map(ex => ({ question_stem: String(ex.question || "") }))
        ).catch(e => ({
          passed: false, action: "FLAG_PENDING_REVIEW" as const,
          confidence: 0, detail: { exception: String(e) }, error: String(e)
        }));
        applyGuardrailResult(pipelineCtx, 'a4_grounding', groundingResult);

        console.log(`[Guardrail] 缓存路径校验: solver_flagged=${solverFlags.length} hard_flagged=${hardFlags.length} grounding=${groundingResult.passed} | ctx_confidence=${pipelineCtx.overallConfidence.toFixed(2)}`);
      }

      // A5 双模型联席仲裁
      if (exerciseList && exerciseList.length > 0) {
        const a5Verdict = await guardrail.verifyA5JointArbitration(
          { exercises: exerciseList },
          learner_profile.hsk_level ?? 1
        ).catch(e => ({
          passed: false, action: "FLAG_PENDING_REVIEW" as const,
          confidence: 0, detail: { exception: String(e) }, error: String(e)
        }));
        applyGuardrailResult(pipelineCtx, 'a5_joint', a5Verdict);
        console.log(`[Guardrail] 缓存路径A5仲裁: passed=${a5Verdict.passed} | ctx_confidence=${pipelineCtx.overallConfidence.toFixed(2)}`);
      }

      const dbAnxietyScore = typeof learner_profile.cultural_anxiety_score === 'number'
        ? learner_profile.cultural_anxiety_score
        : 50;
      const dbAnxietyLevel = anxietyScoreToLevel(dbAnxietyScore);

      publishGuardrailTelemetry(pipelineCtx);

      return {
        cultural_explanation: explanation,
        cross_cultural_comparison: comparison,
        learning_content: exercises,
        final_status: 'from_knowledge_base',
        from_cache: true,
        anxiety_level: dbAnxietyLevel,
        cultural_anxiety_score: dbAnxietyScore,
        guardrail_results: pipelineCtx.guardrailResults,
        pipeline_metadata: getPipelineMetadata(pipelineCtx),
      };
    }

    console.log(`[知识库] 未命中，开始LLM生成`);

    // ========== Step 1: A1 学习者建模 ==========
    // [修复] 焦虑度唯一权威来源是数据库 learners.cultural_anxiety_score
    // A1 只读取 DB 值做映射，不再从 metrics 独立计算焦虑度
    // aggregateLearnerMetrics 仅用于日志诊断，不参与焦虑度决策
    const supabaseForMetrics = isOfflineMockExecution() ? undefined
      : (await import("@/storage/database/supabase-client")).getSupabaseClient();
    const metrics = supabaseForMetrics ? await aggregateLearnerMetrics(supabaseForMetrics, learner_profile.id)
      : { cultural_error_rate: 0, time_ratio: 0, abandonment_rate: 0, negative_feedback: 0, record_count: 0 };
    // 日志保留：便于后续诊断和扩展，但不传入 A1 的决策链路
    console.log(`[A1] 聚合指标(仅日志): error_rate=${metrics.cultural_error_rate.toFixed(2)}, time_ratio=${metrics.time_ratio}, abandonment=${metrics.abandonment_rate}, negative_feedback=${metrics.negative_feedback.toFixed(2)}, records=${metrics.record_count}`);

    const profileMsg: AgentMessage = {
      id: `msg_${Date.now()}`,
      event_id,
      sender_agent: 'system',
      receiver_agent: 'A1_LearnerProfiler',
      learner_id: learner_profile.id,
      message_type: 'profile_update',
      payload: {
        action: 'calculate_anxiety',
        learner_profile,
        // [Phase 2] 注入 supabaseClient 供 A1 查询 L2 趋势
        _supabase_client: supabaseForMetrics
      },
      status: 'pending',
      created_at: new Date()
    };

    const a1Result = await withRetry(
      () => this.agents.get('A1_LearnerProfiler')!.process(profileMsg),
      2
    );
    const anxiety_data = a1Result.payload;

    // ========== Step 2: 并行执行 A2 和 A3 ==========
    const [a2Result, a3Result] = await Promise.all([
      withRetry(
        () => this.agents.get('A2_MotherTongueExplainer')!.process({
          id: `msg_${Date.now()}_a2`,
          event_id,
          sender_agent: 'A1_LearnerProfiler',
          receiver_agent: 'A3_CulturalComparator',
          learner_id: learner_profile.id,
          message_type: 'content_request',
          payload: {
            knowledge_point_id,
            target_language: getLanguageCode(learner_profile.native_language),
            // 与 A3 payload 对齐，A2 据此查图谱 HomeCulture，避免语言码歧义
            native_language_code: getLanguageCode(learner_profile.native_language),
            anxiety_level: anxiety_data.anxiety_level,
            hsk_level: learner_profile.hsk_level
          },
          status: 'pending',
          created_at: new Date()
        }),
        2
      ),
      withRetry(
        () => this.agents.get('A3_CulturalComparator')!.process({
          id: `msg_${Date.now()}_a3`,
          event_id,
          sender_agent: 'A1_LearnerProfiler',
          receiver_agent: 'A4_ContentGenerator',
          learner_id: learner_profile.id,
          message_type: 'comparison_result',
          payload: {
            chinese_culture_point: knowledge_point_id,
            target_culture: learner_profile.native_language,
            hsk_level: learner_profile.hsk_level,
            anxiety_level: anxiety_data.anxiety_level,
            native_language_code: getLanguageCode(learner_profile.native_language)
          },
          status: 'pending',
          created_at: new Date()
        }),
        2
      )
    ]);

    // ========== Guardrail: A2 回译校验 ==========
    const guardrail = getGuardrailService();

    // 获取 A2 所解释的真实中文原文（用于回译语义比对）
    let originalChineseText = "";
    if (isOfflineMockExecution()) {
      originalChineseText = `[MOCK] ${(SCENE_TO_KP_KEYWORDS[scene_type] || []).slice(0, 4).join("、") || scene_type}`;
    } else try {
      const { getSupabaseClient: getSupabaseForKp } = await import("@/storage/database/supabase-client");
      const supabaseForKp = getSupabaseForKp();
      const { data: kpRow } = await supabaseForKp
        .from("cultural_knowledge_points")
        .select("content_json")
        .eq("id", knowledge_point_id)
        .maybeSingle();
      if (kpRow?.content_json) {
        const ct = typeof kpRow.content_json === "string" ? JSON.parse(kpRow.content_json) : kpRow.content_json;
        originalChineseText = ct?.zh?.description || ct?.zh?.content || ct?.zh?.topic || ct?.zh?.title || "";
      }
      if (!originalChineseText) {
        const kpInfo = await getKnowledgePointByScene(knowledge_point_id);
        originalChineseText = kpInfo?.topic || "";
        if (!originalChineseText) {
          originalChineseText = (SCENE_TO_KP_KEYWORDS[scene_type] || []).slice(0, 4).join("、");
        }
      }
    } catch {
      originalChineseText = (SCENE_TO_KP_KEYWORDS[scene_type] || []).slice(0, 4).join("、") || scene_type;
    }
    console.log(`[Guardrail] A2回译原文: "${originalChineseText.slice(0, 40)}"`);

    const a2Explanation = a2Result.payload.cultural_explanation as Record<string, unknown> | undefined;
    const a2ExplanationText = typeof a2Explanation?.precise_definition === 'string'
      ? a2Explanation.precise_definition
      : typeof a2Explanation?.explanation === 'string'
        ? a2Explanation.explanation
        : JSON.stringify(a2Explanation || {});
    const targetLangName = learner_profile.native_language || "英语";

    const a2Verdict = await guardrail.verifyA2Translation(
      originalChineseText,
      targetLangName,
      a2ExplanationText
    ).catch((e) => ({
      passed: false, action: "FLAG_PENDING_REVIEW" as const,
      confidence: 0, detail: { exception: String(e) }, error: String(e)
    }));
    applyGuardrailResult(pipelineCtx, 'a2_translation', a2Verdict);
    console.log(`[Guardrail] A2回译校验: passed=${a2Verdict.passed} action=${a2Verdict.action} | ctx_confidence=${pipelineCtx.overallConfidence.toFixed(2)}`);

    // ========== Guardrail: A3 跨文化对比客观性裁判 ==========
    const a3Comparison = a3Result.payload.cross_cultural_comparison;
    const parsedComparison = typeof a3Comparison === 'string'
      ? safeJsonParse(a3Comparison)
      : a3Comparison;

    const a3Verdict = await guardrail.verifyA3Comparison(
      originalChineseText || knowledge_point_id,
      learner_profile.native_language,
      parsedComparison as Record<string, unknown>,
    ).catch((e) => ({
      passed: false, action: "FLAG_PENDING_REVIEW" as const,
      confidence: 0, detail: { exception: String(e) }, error: String(e)
    }));
    applyGuardrailResult(pipelineCtx, 'a3_comparison', a3Verdict);
    console.log(`[Guardrail] A3客观性裁判: passed=${a3Verdict.passed} action=${a3Verdict.action} | ctx_confidence=${pipelineCtx.overallConfidence.toFixed(2)}`);

    // ========== Step 3: A4 内容生成 ==========

    const a4Result = await withRetry(
      () => this.agents.get('A4_ContentGenerator')!.process({
        id: `msg_${Date.now()}_a4`,
        event_id,
        sender_agent: 'A3_CulturalComparator',
        receiver_agent: 'A5_QualityController',
        learner_id: learner_profile.id,
        message_type: 'content_request',
        payload: {
          knowledge_point_id,  // Phase 3b: 供 A4 查询 Neo4j 词汇/语法约束
          cultural_explanation: a2Result.payload.cultural_explanation,
          cross_cultural_comparison: parsedComparison,
          bias_detection: a3Result.payload.bias_detection,
          scene_type,
          hsk_level: learner_profile.hsk_level,
          learner_profile,
          // [Phase 2] 从 A1 注入的 L2 短期记忆趋势数据
          recent_weak_dimensions: anxiety_data?.recent_weak_dimensions || [],
          accuracy_trend: anxiety_data?.accuracy_trend || "stable",
          repeated_error_patterns: anxiety_data?.repeated_error_patterns || [],
          repeated_scenes: anxiety_data?.repeated_scenes || []
        },
        status: 'pending_review',
        created_at: new Date()
      }),
      2
    );

    // ========== Guardrail: A4 练习题对抗盲测 + 硬规则 ==========
    const a4Content = a4Result.payload.generated_content as Record<string, unknown> | undefined;
    const exercises = (a4Content?.exercises || a4Content?.exercises_list) as Array<Record<string, unknown>> | undefined;

    if (exercises && exercises.length > 0) {
      // 对抗盲测：对所有练习题跑 Solver（支持多种题型）
      const solverResults = await Promise.all(
        exercises.map(async (ex, idx) => {
          const exType = String(ex.type || "multiple_choice");
          try {
            const item: ExerciseItem = {
              type: exType as ExerciseItem['type'],
              question_stem: String(ex.question || ""),
              pinyin_guide: ex.pinyin_guide as string | undefined,
              dimension: ex.dimension as string | undefined,
              explanation: ex.explanation as string | undefined,
            };

            if (exType === "multiple_choice") {
              item.options = Array.isArray(ex.options) ? ex.options as string[] : [];
              item.answer_key = String(ex.correct_answer || "");
            } else if (exType === "true_false") {
              item.options = ["对", "错"];
              item.answer_key = String(ex.correct_answer || "");
            } else if (exType === "fill_blank") {
              item.options = [];
              item.answer_key = String(ex.correct_answer || "");
            }

            return await guardrail.verifyA4SolverAdversarial(item);
          } catch (e) {
            return {
              passed: false, action: "FLAG_PENDING_REVIEW" as const,
              confidence: 0, detail: { exception: String(e), exercise_index: idx }, error: String(e)
            };
          }
        })
      );

      const solverFlags = solverResults.filter((r) => r && !r.passed);
      applyGuardrailResult(pipelineCtx, 'a4_solver', {
        passed: solverFlags.length === 0,
        action: solverFlags.length === 0 ? "PASS" : "FLAG_REJECT",
        confidence: solverFlags.length === 0 ? 1 : 0,
        detail: { exercises_checked: exercises.length, flagged: solverFlags.length, results: solverResults.filter(Boolean) },
        error: solverFlags.length > 0 ? `${solverFlags.length} 道题 Solver 盲解不一致` : null,
      });
      console.log(`[Guardrail] A4对抗盲测: exercises=${exercises.length} flagged=${solverFlags.length}`);

      // 硬规则：拼音 + HSK 超纲字
      // 白名单 = HSK等级字表 ∪ 该知识点词表的字（KP词表本就是本课要教的新词，不应判超纲）
      const hardRuleWhitelist = await getHardRuleCharWhitelist(
        knowledge_point_id,
        learner_profile.hsk_level ?? 1
      );
      const hardRuleResults = exercises.map((ex) =>
        guardrail.preA5HardRulesFilter(
          {
            question_stem: String(ex.question || ""),
            pinyin_guide: ex.pinyin_guide as string | undefined,
          },
          hardRuleWhitelist
        )
      );
      const hardFlags = hardRuleResults.filter((r) => !r.passed);
      applyGuardrailResult(pipelineCtx, 'a4_hard_rules', {
        passed: hardFlags.length === 0,
        action: hardFlags.length === 0 ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: hardFlags.length === 0 ? 1 : 0,
        detail: { checked: hardRuleResults.length, flagged: hardFlags.length },
        error: hardFlags.length > 0 ? `${hardFlags.length} 道题硬规则未通过` : null,
      });
      console.log(`[Guardrail] A4硬规则: checked=${hardRuleResults.length} flagged=${hardFlags.length}`);

      // 交叉校验：练习题是否忠于 A2 文化阐释
      const a2ExplanationForGrounding = a2Result.payload.cultural_explanation as Record<string, unknown> | undefined;
      if (a2ExplanationForGrounding && Object.keys(a2ExplanationForGrounding).length > 0) {
        const groundingResult = await guardrail.verifyA4Grounding(
          a2ExplanationForGrounding,
          exercises.map(ex => ({ question_stem: String(ex.question || "") }))
        ).catch((e) => ({
          passed: false, action: "FLAG_PENDING_REVIEW" as const,
          confidence: 0, detail: { exception: String(e) }, error: String(e)
        }));
        applyGuardrailResult(pipelineCtx, 'a4_grounding', groundingResult);
        console.log(`[Guardrail] A4交叉校验(grounding): passed=${groundingResult.passed}`);
      }
    }

    // ========== Step 4: A5 质量管控 ==========
    const a5Result = await withRetry(
      () => this.agents.get('A5_QualityController')!.process(a4Result),
      2
    );

    // ========== Guardrail: A5 双模型联席仲裁 ==========
    const a5Content = a5Result.payload.generated_content as Record<string, unknown> | undefined;
    const a5Exercises = (a5Content?.exercises || a5Content?.exercises_list) as Array<Record<string, unknown>> | undefined;

    if (a5Exercises && a5Exercises.length > 0) {
      const a5Verdict = await guardrail.verifyA5JointArbitration(
        { exercises: a5Exercises },
        learner_profile.hsk_level ?? 1
      ).catch((e) => ({
        passed: false, action: "FLAG_PENDING_REVIEW" as const,
        confidence: 0, detail: { exception: String(e) }, error: String(e)
      }));
      applyGuardrailResult(pipelineCtx, 'a5_joint', a5Verdict);
      console.log(`[Guardrail] A5联席仲裁: passed=${a5Verdict.passed} action=${a5Verdict.action} | ctx_confidence=${pipelineCtx.overallConfidence.toFixed(2)}`);
    }

    // ========== Step 5: 保存到知识库 — 置信度门控，防止缓存投毒 ==========
    if (!isOfflineMockExecution() && shouldWriteCache(pipelineCtx) && !signal?.aborted) {
      // 与置信度门控（shouldWriteCache → overallConfidence 衰减模型）保持一致：
      // 写入缓存的置信度使用 overallConfidence，而非 computeCacheConfidence（加权平均分，量级偏低），
      // 否则通过门控的内容仍会在 CacheManager.upsert 被判 REJECTED，缓存永不命中。
      const cacheConfidence = pipelineCtx.overallConfidence;
      saveToKnowledgeBase({
        knowledge_point_id,
        target_culture: learner_profile.native_language,
        hsk_level: learner_profile.hsk_level,
        cultural_explanation: a2Result.payload.cultural_explanation as Record<string, unknown>,
        cross_cultural_comparison: parsedComparison as Record<string, unknown>,
        scene_id: scene_type,
        confidence: cacheConfidence,
      }).catch(err => console.error("[知识库] 保存失败:", err));
    } else {
      console.warn(
        `[知识库] 置信度过低 (${pipelineCtx.overallConfidence.toFixed(2)} < ${CACHE_WRITE_CONFIDENCE_THRESHOLD})，` +
        `跳过缓存写入以防止缓存投毒`
      );
    }

    publishGuardrailTelemetry(pipelineCtx);

    return {
      cultural_explanation: a2Result.payload.cultural_explanation as Record<string, unknown>,
      cross_cultural_comparison: parsedComparison as Record<string, unknown>,
      learning_content: a5Result.payload.generated_content as GeneratedContent,
      anxiety_level: String(anxiety_data?.anxiety_level ?? ''),
      cultural_anxiety_score: Number(anxiety_data?.cultural_anxiety_score ?? 0),
      final_status: a5Result.status,
      from_cache: false,
      guardrail_results: pipelineCtx.guardrailResults,
      pipeline_metadata: getPipelineMetadata(pipelineCtx),
    };
  }

  /**
   * 仅生成练习题（知识库命中时使用）
   */
  private async generateExercisesOnly(
    event_id: string,
    learner_profile: LearnerProfile,
    knowledge_point_id: string,
    scene_type: string,
    cultural_explanation: Record<string, unknown>,
    cross_cultural_comparison: Record<string, unknown>
  ): Promise<GeneratedContent> {
    // 使用 A4 生成练习题（复用练习题生成逻辑）
    const a4Result = await withRetry(
      () => this.agents.get('A4_ContentGenerator')!.process({
        id: `msg_${Date.now()}_a4_cache`,
        event_id,
        sender_agent: 'A3_CulturalComparator',
        receiver_agent: 'A5_QualityController',
        learner_id: learner_profile.id,
        message_type: 'content_request',
        payload: {
          knowledge_point_id,  // Phase 3b: 供 A4 查询 Neo4j 词汇约束
          cultural_explanation,
          cross_cultural_comparison,
          scene_type,
          hsk_level: learner_profile.hsk_level,
          learner_profile
        },
        status: 'pending_review',
        created_at: new Date()
      }),
      2
    );

    return a4Result.payload.generated_content as GeneratedContent;
  }

}

// 导出单例
export const multiAgentCoordinator = new MultiAgentCoordinator();
