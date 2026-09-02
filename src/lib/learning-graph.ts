/**
 * LangGraph 多智能体编排层
 *
 * 用 @langchain/langgraph 替代手写 MultiAgentCoordinator，
 * 保留所有原有 Agent 的 prompt 和逻辑，只替换编排层。
 *
 * 图结构：
 *   START → checkCache → (条件边)
 *     ├── cache_hit → generateExercises → END
 *     └── cache_miss → a1Profiler → [a2Explainer + a3Comparator 并行] → a4Generator → a5Controller → saveToKB → END
 *
 * 新增能力（相比旧手写版本）：
 * - 条件分支：缓存命中走短路
 * - 并行节点：A2+A3 天然并行
 * - 状态追踪：每个节点的输入/输出自动记录
 * - 可扩展：加节点/边/条件无需改编排代码
 */

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { upsertLearnerNode, recordMastery } from "@/lib/learner-graph";

// 复用旧系统中的类型、算法和 Agent
import {
  type AgentMessage,
  type LearnerProfile,
  type GeneratedContent,
  type Exercise,
  safeJsonParse,
  withRetry,
  anxietyScoreToLevel,
  calculateNativeLanguageRatio,
  detectBias,
  aggregateLearnerMetrics,
  queryKnowledgeBase,
  saveToKnowledgeBase,
  getKnowledgePointByScene,
  BaseAgent,
  LearnerProfilerAgent,
  MotherTongueExplainerAgent,
  CulturalComparatorAgent,
  ContentGeneratorAgent,
  QualityControllerAgent,
} from "./multi-agent-system";
import { isOfflineMockExecution } from "./llm-config";
import {
  getGuardrailService,
  createPipelineContext,
  applyGuardrailResult,
  shouldWriteCache,
  getPipelineMetadata,
  publishGuardrailTelemetry,
  GUARDRAIL_DECAY_WEIGHTS,
  CACHE_WRITE_CONFIDENCE_THRESHOLD,
  type GuardrailVerdict,
  type PipelineContext,
  type PipelineMetadata,
  type ConfidenceDecayEntry,
} from "@/services/guardrail-service";
import { buildHardRuleCharWhitelist } from "./hsk-vocab-graph";
import { SCENE_TO_KP_KEYWORDS, getLanguageCode, getLanguageNaturalName, getSceneType } from "./constants";

// ==================== LangGraph 状态定义 ====================

/**
 * 图的共享状态 —— 所有节点读写这个对象
 *
 * 设计原则：
 * - 输入字段（只写）：learner_profile, knowledge_point_id, scene_keywords
 * - 中间字段（读写）：anxiety_data, cultural_explanation, cross_cultural_comparison 等
 * - 输出字段（只读）：final_result
 * - 控制字段：cache_hit（决定条件分支走向）
 */
const LearningGraphState = Annotation.Root({
  // ---- 输入 ----
  learner_profile: Annotation<LearnerProfile>({ reducer: (_, b) => b, default: () => null! }),
  knowledge_point_id: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  scene_keywords: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),

  // ---- 中间状态 ----
  event_id: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  scene_type: Annotation<string>({ reducer: (_, b) => b, default: () => "daily" }),
  cache_hit: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  cached_explanation: Annotation<Record<string, unknown> | null>({ reducer: (_, b) => b, default: () => null }),
  cached_comparison: Annotation<Record<string, unknown> | null>({ reducer: (_, b) => b, default: () => null }),

  anxiety_data: Annotation<Record<string, unknown>>({ reducer: (_, b) => b, default: () => ({}) }),
  cultural_explanation: Annotation<Record<string, unknown>>({ reducer: (_, b) => b, default: () => ({}) }),
  cross_cultural_comparison: Annotation<Record<string, unknown>>({ reducer: (_, b) => b, default: () => ({}) }),
  bias_detection: Annotation<Record<string, unknown>>({ reducer: (_, b) => b, default: () => ({}) }),
  generated_content: Annotation<GeneratedContent | null>({ reducer: (_, b) => b, default: () => null }),
  quality_review: Annotation<Record<string, unknown>>({ reducer: (_, b) => b, default: () => ({}) }),
  guardrail_results: Annotation<Record<string, GuardrailVerdict>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  // Pipeline 柔性降级状态：置信度只降不升，decay_log 只增不减
  pipeline_confidence: Annotation<number>({
    reducer: (a, b) => Math.min(a, b),
    default: () => 1.0,
  }),
  pipeline_decay_log: Annotation<ConfidenceDecayEntry[]>({
    reducer: (a, b) => [...a, ...(Array.isArray(b) ? b : [])],
    default: () => [],
  }),
  final_status: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  // A5 模型质检结果（第4步优化：A4 生成后与 guardrail 并行执行 A5 质检，结果经此传给 a5Controller 做仲裁）
  a5_quality_review: Annotation<Record<string, unknown> | null>({ reducer: (_, b) => b, default: () => null }),
  a5_final_status: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),

  // ---- 消融实验控制：跳过指定 Agent 节点（默认空数组 = 全跑）----
  // 用于干净消融：所有条件走同一张 LangGraph、同一套节点函数，唯一差异是 skipAgents。
  skipAgents: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  // 消融实验开关：true 时禁用缓存读写（checkCache 强制 miss + saveKB 跳过写缓存），
  // 保证每个条件独立生成、互不污染（缓存 key 不含 skipAgents，否则 C1 写完会污染 C3/C4/C5）
  bypassCache: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),

  // ---- 输出 ----
  final_result: Annotation<{
    cultural_explanation: Record<string, unknown>;
    cross_cultural_comparison: Record<string, unknown>;
    learning_content: GeneratedContent;
    final_status: string;
    from_cache: boolean;
    anxiety_level?: string;
    cultural_anxiety_score?: number;
    pipeline_metadata?: PipelineMetadata;
  } | null>({ reducer: (_, b) => b, default: () => null }),

  // ---- 进度探针（异步任务用，不进 reducer，仅透传）----
  on_stage: Annotation<((stage: string) => void) | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
});

type GraphState = typeof LearningGraphState.State;

// ==================== Pipeline 柔性降级辅助 ====================

/**
 * 计算 guardrail 判定后的 pipeline 状态更新（不可变风格，适配 LangGraph）。
 * 返回 Partial 供节点 return 到图状态。
 */
function computePipelineStateUpdate(
  currentConfidence: number,
  guardrailName: string,
  verdict: GuardrailVerdict,
): { pipeline_confidence: number; pipeline_decay_log: ConfidenceDecayEntry[] } {
  if (verdict.passed || verdict.action === "PASS") {
    return { pipeline_confidence: currentConfidence, pipeline_decay_log: [] };
  }
  const weight = GUARDRAIL_DECAY_WEIGHTS[guardrailName];
  if (weight === undefined) return { pipeline_confidence: currentConfidence, pipeline_decay_log: [] };

  // FLAG_PENDING_REVIEW 是软性标记（待人工复核，按系统设计「不阻断主流程」），
  // 只做轻微衰减；只有 FLAG_REJECT（硬性不通过）才按全权重衰减，避免把优质内容
  // 误杀到缓存线以下导致每次都冷生成（此前 a2 回译等脆性检查 100% 误杀即此问题）。
  const effectiveWeight = verdict.action === "FLAG_PENDING_REVIEW" ? weight * 0.25 : weight;

  const newConfidence = Math.max(0, Math.round((currentConfidence - effectiveWeight) * 1e4) / 1e4);
  const entry: ConfidenceDecayEntry = {
    guardrail: guardrailName,
    weight: effectiveWeight,
    confidenceBefore: currentConfidence,
    confidenceAfter: newConfidence,
    action: verdict.action,
    timestamp: Date.now(),
  };
  console.log(
    `[Pipeline:LangGraph] 衰减 "${guardrailName}" | weight=${effectiveWeight} (${verdict.action}) | ` +
    `${currentConfidence.toFixed(4)} → ${newConfidence.toFixed(4)} | action=${verdict.action}`
  );
  return { pipeline_confidence: newConfidence, pipeline_decay_log: [entry] };
}

/**
 * 从 state 重建 PipelineContext 用于 shouldWriteCache 和 getPipelineMetadata。
 */
function rebuildPipelineContext(state: GraphState): PipelineContext {
  return {
    eventId: state.event_id,
    overallConfidence: state.pipeline_confidence,
    guardrailResults: state.guardrail_results,
    decayLog: state.pipeline_decay_log,
    createdAt: 0, // langgraph 不追踪创建时间
  };
}

/**
 * 从 state 计算流水线元数据，在最后节点调用发布遥测。
 */
function finalizePipelineMetadata(state: GraphState): PipelineMetadata {
  const ctx = rebuildPipelineContext(state);
  publishGuardrailTelemetry(ctx);
  return getPipelineMetadata(ctx);
}

// ==================== Agent 单例 ====================

const agents = {
  a1: new LearnerProfilerAgent(),
  a2: new MotherTongueExplainerAgent(),
  a3: new CulturalComparatorAgent(),
  a4: new ContentGeneratorAgent(),
  a5: new QualityControllerAgent(),
};

// ==================== 节点函数 ====================

/**
 * 节点 0：查知识库缓存
 * - 命中 → 设置 cache_hit=true，走短路
 * - 未命中 → cache_hit=false，走完整链路
 */
async function checkCache(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("checkCache");
  const event_id = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const scene_type = getSceneType(state.knowledge_point_id, state.scene_keywords);

  // 消融模式：禁用缓存读取，强制走完整 LLM 链路，保证各条件独立生成互不污染
  if (state.bypassCache || isOfflineMockExecution()) {
    console.log(`[LangGraph:checkCache] 消融 bypassCache=true，强制 cache_miss`);
    return { event_id, scene_type, cache_hit: false };
  }

  console.log(`[LangGraph:checkCache] 知识点=${state.knowledge_point_id}, 语言=${state.learner_profile.native_language}`);

  const cachedData = await queryKnowledgeBase({
    knowledge_point_id: state.knowledge_point_id,
    target_culture: state.learner_profile.native_language,
    hsk_level: state.learner_profile.hsk_level,
  });

  if (cachedData.found && cachedData.cross_cultural_comparison) {
    console.log(`[LangGraph:checkCache] 命中缓存`);
    return {
      event_id,
      scene_type,
      cache_hit: true,
      cached_explanation: cachedData.cultural_explanation || { precise_definition: "从知识库获取的文化阐释" },
      cached_comparison: cachedData.cross_cultural_comparison,
    };
  }

  console.log(`[LangGraph:checkCache] 未命中，走LLM链路`);
  return {
    event_id,
    scene_type,
    cache_hit: false,
  };
}

/**
 * 缓存命中的短路节点：只生成练习题
 */
async function generateExercises(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("generateExercises");
  console.log(`[LangGraph:generateExercises] 缓存命中，仅生成练习题`);

  const a4Result = await withRetry(
    () => agents.a4.process({
      id: `msg_${Date.now()}_a4_cache`,
      event_id: state.event_id,
      sender_agent: 'checkCache',
      receiver_agent: 'A4_ContentGenerator',
      learner_id: state.learner_profile.id,
      message_type: 'content_request',
      payload: {
        knowledge_point_id: state.knowledge_point_id,  // Phase 3b: 供 A4 查询 Neo4j 词汇约束
        cultural_explanation: state.cached_explanation,
        cross_cultural_comparison: state.cached_comparison,
        scene_type: state.scene_type,
        hsk_level: state.learner_profile.hsk_level,
        learner_profile: state.learner_profile,
      },
      status: 'pending_review',
      created_at: new Date(),
    }),
    2,
  );

  const dbAnxietyScore = typeof state.learner_profile.cultural_anxiety_score === 'number'
    ? state.learner_profile.cultural_anxiety_score : 50;
  // Guardrail: 缓存命中路径也做练习题质量检查（对抗盲测 + 硬规则 + Grounding + A5仲裁）
  const guardrail = getGuardrailService();
  const guardrailResults: Record<string, GuardrailVerdict> = {};
  try {
    const a4Content = a4Result.payload.generated_content as Record<string, unknown> | undefined;
    const exercises = (a4Content?.exercises || a4Content?.exercises_list) as Array<Record<string, unknown>> | undefined;
    if (exercises && exercises.length > 0) {
      // 对抗盲测
      const solverResults = await Promise.all(
        exercises.map(async (ex, idx) => {
          const exType = String(ex.type || "multiple_choice");
          try {
            return await guardrail.verifyA4SolverAdversarial({
              type: exType as "multiple_choice" | "fill_blank" | "true_false",
              question_stem: String(ex.question || ""),
              options: (exType === "true_false" ? ["对", "错"] : Array.isArray(ex.options) ? ex.options as string[] : []) as string[],
              answer_key: String(ex.correct_answer || ""),
            });
          } catch (e) {
            return { passed: false, action: "FLAG_PENDING_REVIEW" as const, confidence: 0, detail: { exception: String(e), exercise_index: idx }, error: String(e) };
          }
        })
      );
      const solverFlags = solverResults.filter(r => !r.passed);
      guardrailResults.a4_solver = {
        passed: solverFlags.length === 0,
        action: solverFlags.length === 0 ? "PASS" : "FLAG_REJECT",
        confidence: solverFlags.length === 0 ? 1 : 0,
        detail: { exercises_checked: exercises.length, flagged: solverFlags.length },
        error: solverFlags.length > 0 ? `${solverFlags.length} 道题 Solver 盲解不一致` : null,
      };

      // 硬规则：拼音 + HSK超纲字
      // 白名单 = HSK等级字表 ∪ 该知识点词表的字（KP词表本就是本课要教的新词，不应判超纲）
      const hardRuleWhitelist = await buildHardRuleCharWhitelist(
        state.knowledge_point_id,
        state.learner_profile.hsk_level ?? 1
      );
      const hardRuleResults = exercises.map(ex =>
        guardrail.preA5HardRulesFilter(
          { question_stem: String(ex.question || ""), pinyin_guide: ex.pinyin_guide as string | undefined },
          hardRuleWhitelist
        )
      );
      const hardFlags = hardRuleResults.filter(r => !r.passed);
      guardrailResults.a4_hard_rules = {
        passed: hardFlags.length === 0,
        action: hardFlags.length === 0 ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: hardFlags.length === 0 ? 1 : 0,
        detail: { checked: hardRuleResults.length, flagged: hardFlags.length },
        error: hardFlags.length > 0 ? `${hardFlags.length} 道题硬规则未通过` : null,
      };

      // Grounding校验：练习题是否忠于缓存中的文化阐释
      const cachedExp = state.cached_explanation || {};
      const groundingResult = await guardrail.verifyA4Grounding(
        cachedExp,
        exercises.map(ex => ({ question_stem: String(ex.question || "") }))
      ).catch(e => ({
        passed: false, action: "FLAG_PENDING_REVIEW" as const,
        confidence: 0, detail: { exception: String(e) }, error: String(e)
      }));
      guardrailResults.a4_grounding = groundingResult;

      console.log(`[Guardrail] A4缓存路径校验(cache): solver=${solverFlags.length} hard=${hardFlags.length} grounding=${groundingResult.passed}`);
    }

    // A5 双模型联席仲裁
    if (exercises && exercises.length > 0) {
      guardrailResults.a5_joint = await guardrail.verifyA5JointArbitration(
        { exercises },
        state.learner_profile.hsk_level ?? 1
      ).catch(e => ({
        passed: false, action: "FLAG_PENDING_REVIEW" as const,
        confidence: 0, detail: { exception: String(e) }, error: String(e)
      }));
      console.log(`[Guardrail] A5缓存路径仲裁(cache): passed=${guardrailResults.a5_joint.passed}`);
    }
  } catch (e) { console.warn("[LangGraph:generateExercises] Guardrail 异常:", e); }

  // 计算 Pipeline 衰减状态
  let pipelineConfidence = 1.0;
  const decayEntries: ConfidenceDecayEntry[] = [];
  for (const [name, verdict] of Object.entries(guardrailResults)) {
    const update = computePipelineStateUpdate(pipelineConfidence, name, verdict);
    pipelineConfidence = update.pipeline_confidence;
    if (update.pipeline_decay_log.length > 0) decayEntries.push(...update.pipeline_decay_log);
  }

  const dbAnxietyLevel = anxietyScoreToLevel(dbAnxietyScore);

  // 构建临时 PipelineContext 用于计算元数据并发布遥测
  const cacheHitCtx: PipelineContext = {
    eventId: state.event_id,
    overallConfidence: pipelineConfidence,
    guardrailResults,
    decayLog: decayEntries,
    createdAt: Date.now(),
  };
  publishGuardrailTelemetry(cacheHitCtx);

  return {
    guardrail_results: guardrailResults,
    pipeline_confidence: pipelineConfidence,
    pipeline_decay_log: decayEntries,
    final_result: {
      cultural_explanation: state.cached_explanation || { precise_definition: "" },
      cross_cultural_comparison: state.cached_comparison!,
      learning_content: a4Result.payload.generated_content as GeneratedContent,
      final_status: 'from_knowledge_base',
      from_cache: true,
      anxiety_level: dbAnxietyLevel,
      cultural_anxiety_score: dbAnxietyScore,
      pipeline_metadata: getPipelineMetadata(cacheHitCtx),
    },
  };
}

/**
 * 节点 A1：学习者画像建模
 * - 读取 DB 焦虑度，映射 anxiety_level，计算 native_ratio
 * - 不独立计算焦虑度（DB 为唯一权威）
 */
async function a1Profiler(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("a1Profiler");
  console.log(`[LangGraph:a1Profiler] 开始学习者画像建模`);

  // 聚合指标（仅日志，不参与焦虑度决策）
  const supabase = isOfflineMockExecution() ? undefined
    : (await import("@/storage/database/supabase-client")).getSupabaseClient();
  const metrics = supabase ? await aggregateLearnerMetrics(supabase, state.learner_profile.id)
    : { cultural_error_rate: 0, record_count: 0 };
  console.log(`[LangGraph:a1Profiler] 聚合指标(仅日志): error_rate=${metrics.cultural_error_rate.toFixed(2)}, records=${metrics.record_count}`);

  const a1Result = await withRetry(
    () => agents.a1.process({
      id: `msg_${Date.now()}`,
      event_id: state.event_id,
      sender_agent: 'system',
      receiver_agent: 'A1_LearnerProfiler',
      learner_id: state.learner_profile.id,
      message_type: 'profile_update',
      payload: {
        action: 'calculate_anxiety',
        learner_profile: state.learner_profile,
        _supabase_client: supabase, // mock 时为 undefined，禁止读取学习记录
      },
      status: 'pending',
      created_at: new Date(),
    }),
    2,
  );

  console.log(`[LangGraph:a1Profiler] anxiety_level=${a1Result.payload.anxiety_level}, score=${a1Result.payload.cultural_anxiety_score}`);
  return { anxiety_data: a1Result.payload };
}

/**
 * 节点 A2：母语阐释
 */
async function a2Explainer(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("a2Explainer");
  if (state.skipAgents?.includes('A2')) {
    console.log(`[LangGraph:a2Explainer] 被 skipAgents 跳过（消融条件未启用 A2）`);
    return {};
  }
  console.log(`[LangGraph:a2Explainer] 生成${state.learner_profile.native_language}母语阐释`);

  const a2Result = await withRetry(
    () => agents.a2.process({
      id: `msg_${Date.now()}_a2`,
      event_id: state.event_id,
      sender_agent: 'A1_LearnerProfiler',
      receiver_agent: 'A2_MotherTongueExplainer',
      learner_id: state.learner_profile.id,
      message_type: 'content_request',
      payload: {
        knowledge_point_id: state.knowledge_point_id,
        target_language: getLanguageCode(state.learner_profile.native_language),
        // 与 A3 payload 对齐，A2 据此查图谱 HomeCulture，避免语言码歧义
        native_language_code: getLanguageCode(state.learner_profile.native_language),
        anxiety_level: state.anxiety_data.anxiety_level,
        hsk_level: state.learner_profile.hsk_level,
      },
      status: 'pending',
      created_at: new Date(),
    }),
    2,
  );

  // Guardrail: 回译校验
  const guardrail = getGuardrailService();
  let a2GuardrailResult: GuardrailVerdict = { passed: true, action: "PASS", confidence: 1, detail: {}, error: null };
  try {
    // 回译校验需要中文原文，依次尝试：DB content_json.zh.topic → getKnowledgePointByScene → 场景关键词 → 知识点ID
    let originalChineseText = "";
    try {
      const { getSupabaseClient } = await import("@/storage/database/supabase-client");
      const supabase = getSupabaseClient();
      const { data: kpRow } = await supabase
        .from("cultural_knowledge_points")
        .select("content_json")
        .eq("id", state.knowledge_point_id)
        .maybeSingle();
      if (kpRow?.content_json) {
        const ct = typeof kpRow.content_json === "string" ? JSON.parse(kpRow.content_json) : kpRow.content_json;
        originalChineseText = ct?.zh?.description || ct?.zh?.content || ct?.zh?.topic || ct?.zh?.title || "";
      }
    } catch {}
    if (!originalChineseText) {
      const kpInfo = await getKnowledgePointByScene(state.knowledge_point_id);
      originalChineseText = kpInfo?.topic || "";
    }
    if (!originalChineseText) {
      const keywords = SCENE_TO_KP_KEYWORDS[state.scene_type] || [];
      originalChineseText = keywords.slice(0, 4).join("、") || "";
    }
    if (!originalChineseText) {
      originalChineseText = state.knowledge_point_id;
    }
    const langCode = getLanguageCode(state.learner_profile.native_language);
    a2GuardrailResult = await guardrail.verifyA2Translation(
      originalChineseText,
      getLanguageNaturalName(langCode),
      JSON.stringify(a2Result.payload.cultural_explanation),
    ).catch((e: unknown) => ({
      passed: false, action: "FLAG_PENDING_REVIEW" as const, confidence: 0,
      detail: { exception: String(e) }, error: String(e)
    }));
  } catch (e) {
    console.warn("[LangGraph:a2Explainer] Guardrail 回译校验异常:", e);
  }
  console.log(`[Guardrail] A2回译校验: passed=${a2GuardrailResult.passed} action=${a2GuardrailResult.action}`);

  const a2Pipeline = computePipelineStateUpdate(state.pipeline_confidence, 'a2_translation', a2GuardrailResult);

  return {
    cultural_explanation: a2Result.payload.cultural_explanation as Record<string, unknown>,
    guardrail_results: { a2_translation: a2GuardrailResult },
    pipeline_confidence: a2Pipeline.pipeline_confidence,
    pipeline_decay_log: a2Pipeline.pipeline_decay_log,
  };
}

/**
 * 节点 A3：跨文化对比
 */
async function a3Comparator(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("a3Comparator");
  if (state.skipAgents?.includes('A3')) {
    console.log(`[LangGraph:a3Comparator] 被 skipAgents 跳过（消融条件未启用 A3）`);
    return {};
  }
  console.log(`[LangGraph:a3Comparator] 生成${state.learner_profile.native_language}跨文化对比`);

  const a3Result = await withRetry(
    () => agents.a3.process({
      id: `msg_${Date.now()}_a3`,
      event_id: state.event_id,
      sender_agent: 'A1_LearnerProfiler',
      receiver_agent: 'A3_CulturalComparator',
      learner_id: state.learner_profile.id,
      message_type: 'comparison_result',
      payload: {
        chinese_culture_point: state.knowledge_point_id,
        target_culture: state.learner_profile.native_language,
        hsk_level: state.learner_profile.hsk_level,
        anxiety_level: state.anxiety_data.anxiety_level,
        native_language_code: getLanguageCode(state.learner_profile.native_language),
      },
      status: 'pending',
      created_at: new Date(),
    }),
    2,
  );

  const a3Parsed = typeof a3Result.payload.cross_cultural_comparison === 'string'
    ? safeJsonParse(a3Result.payload.cross_cultural_comparison as string)
    : a3Result.payload.cross_cultural_comparison as Record<string, unknown>;

  // Guardrail: A3 跨文化对比客观性裁判
  const guardrail = getGuardrailService();
  // 用真实命中的知识点主题锚定，而非映射表首个关键词，避免 food 场景锚到「饮食」丢失「筷子/合餐」下位词
  const chineseConcept = (await getKnowledgePointByScene(state.knowledge_point_id))?.topic
    || SCENE_TO_KP_KEYWORDS[state.scene_type]?.[0]
    || state.knowledge_point_id;
  let a3GuardrailResult: GuardrailVerdict = { passed: true, action: "PASS", confidence: 1, detail: {}, error: null };
  try {
    a3GuardrailResult = await guardrail.verifyA3Comparison(
      chineseConcept,
      state.learner_profile.native_language,
      a3Parsed,
    ).catch((e: unknown) => ({
      passed: false, action: "FLAG_PENDING_REVIEW" as const, confidence: 0,
      detail: { exception: String(e) }, error: String(e)
    }));
  } catch (e) {
    console.warn("[LangGraph:a3Comparator] Guardrail 客观性裁判异常:", e);
  }
  console.log(`[Guardrail] A3客观性裁判: passed=${a3GuardrailResult.passed} action=${a3GuardrailResult.action}`);

  const a3Pipeline = computePipelineStateUpdate(state.pipeline_confidence, 'a3_comparison', a3GuardrailResult);

  return {
    cross_cultural_comparison: a3Parsed,
    bias_detection: a3Result.payload.bias_detection as Record<string, unknown>,
    guardrail_results: { a3_comparison: a3GuardrailResult },
    pipeline_confidence: a3Pipeline.pipeline_confidence,
    pipeline_decay_log: a3Pipeline.pipeline_decay_log,
  };
}

/**
 * 合并节点：等待 A2+A3 并行完成后进入 A4
 * LangGraph 的 fan-in 机制：当 A2 和 A3 都完成后，状态自动合并
 * 这个函数不需要做合并操作，因为 LangGraph 的 reducer 会自动处理
 * 但我们需要一个"汇聚点"节点来确保 A2+A3 都完成后才进入 A4
 */
async function mergeA2A3(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("mergeA2A3");
  console.log(`[LangGraph:mergeA2A3] A2+A3 并行完成，进入A4`);
  return {};
}

/**
 * 节点 A4：内容生成
 */
async function a4Generator(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("a4Generator");
  console.log(`[LangGraph:a4Generator] 生成场景化内容 + 练习题`);

  const a4Result = await withRetry(
    () => agents.a4.process({
      id: `msg_${Date.now()}_a4`,
      event_id: state.event_id,
      sender_agent: 'mergeA2A3',
      receiver_agent: 'A4_ContentGenerator',
      learner_id: state.learner_profile.id,
      message_type: 'content_request',
      payload: {
        knowledge_point_id: state.knowledge_point_id,  // Phase 3b: 供 A4 查询 Neo4j 词汇约束
        cultural_explanation: state.cultural_explanation ?? null,
        cross_cultural_comparison: state.cross_cultural_comparison ?? null,
        bias_detection: state.bias_detection ?? null,
        // T3: 显式标记"是否已提供"，供 A4 决定 prompt 措辞（避免静默 null 导致 LLM 脑补）。
        // 注意 GraphState 该字段 default 是空对象 {}（非 null），故用"有实际 key"判断而非 != null。
        cultural_explanation_provided: !!(state.cultural_explanation && Object.keys(state.cultural_explanation).length > 0),
        cross_cultural_comparison_provided: !!(state.cross_cultural_comparison && Object.keys(state.cross_cultural_comparison).length > 0),
        scene_type: state.scene_type,
        hsk_level: state.learner_profile.hsk_level,
        learner_profile: state.learner_profile,
        // Phase 2: 注入 L2 短期记忆趋势数据，驱动 A4 自适应内容生成
        recent_weak_dimensions: (state.anxiety_data as Record<string, unknown>)?.recent_weak_dimensions || [],
        accuracy_trend: (state.anxiety_data as Record<string, unknown>)?.accuracy_trend || 'stable',
        repeated_error_patterns: (state.anxiety_data as Record<string, unknown>)?.repeated_error_patterns || [],
        repeated_scenes: (state.anxiety_data as Record<string, unknown>)?.repeated_scenes || [],
      },
      status: 'pending_review',
      created_at: new Date(),
    }),
    2,
  );

  // ===== 第4步优化：guardrail（solver+硬规则+grounding）∥ A5 模型质检 并行 =====
  // 两者都只依赖 A4 输出（exercises / generated_content），互不依赖，可并行；
  // A5 质检结果存入 state.a5_quality_review，由 a5Controller 节点做双模型联席仲裁。
  // 消融语义：skipAgents 含 A5（C4_NoA5）时【不】调 A5 LLM，保持"跳过 A5"的条件不变。
  const guardrail = getGuardrailService();
  const a4Content = a4Result.payload.generated_content as Record<string, unknown> | undefined;
  const exercises = (a4Content?.exercises || a4Content?.exercises_list) as Array<Record<string, unknown>> | undefined;
  const runA5 = !state.skipAgents?.includes('A5');

  const [guardrailResults, a5Outcome] = await Promise.all([
    // ---- 分支1：guardrail（solver 对抗盲测 + 硬规则 + grounding）----
    (async (): Promise<Record<string, GuardrailVerdict>> => {
      const gr: Record<string, GuardrailVerdict> = {};
      if (exercises && exercises.length > 0) {
        // 对抗盲测（5 题并行）
        const solverResults = await Promise.all(
          exercises.map(async (ex, idx) => {
            const exType = String(ex.type || "multiple_choice");
            try {
              const item = {
                type: exType as "multiple_choice" | "fill_blank" | "true_false",
                question_stem: String(ex.question || ""),
                options: (exType === "true_false" ? ["对", "错"] : Array.isArray(ex.options) ? ex.options as string[] : []) as string[],
                answer_key: String(ex.correct_answer || ""),
                pinyin_guide: ex.pinyin_guide as string | undefined,
                dimension: ex.dimension as string | undefined,
                explanation: ex.explanation as string | undefined,
              };
              return await guardrail.verifyA4SolverAdversarial(item);
            } catch (e) {
              return { passed: false, action: "FLAG_PENDING_REVIEW" as const, confidence: 0, detail: { exception: String(e), exercise_index: idx }, error: String(e) };
            }
          })
        );
        const solverFlags = solverResults.filter(r => !r.passed);
        gr.a4_solver = {
          passed: solverFlags.length === 0,
          action: solverFlags.length === 0 ? "PASS" : "FLAG_REJECT",
          confidence: solverFlags.length === 0 ? 1 : 0,
          detail: { exercises_checked: exercises.length, flagged: solverFlags.length, results: solverResults.filter(Boolean) },
          error: solverFlags.length > 0 ? `${solverFlags.length} 道题 Solver 盲解不一致` : null,
        };
        console.log(`[Guardrail] A4对抗盲测: exercises=${exercises.length} flagged=${solverFlags.length}`);

        // 硬规则（本地计算，毫秒级）
        const hardRuleWhitelist = await buildHardRuleCharWhitelist(
          state.knowledge_point_id,
          state.learner_profile.hsk_level ?? 1
        );
        const hardRuleResults = exercises.map(ex =>
          guardrail.preA5HardRulesFilter(
            { question_stem: String(ex.question || ""), pinyin_guide: ex.pinyin_guide as string | undefined },
            hardRuleWhitelist
          )
        );
        const hardFlags = hardRuleResults.filter(r => !r.passed);
        gr.a4_hard_rules = {
          passed: hardFlags.length === 0,
          action: hardFlags.length === 0 ? "PASS" : "FLAG_PENDING_REVIEW",
          confidence: hardFlags.length === 0 ? 1 : 0,
          detail: { checked: hardRuleResults.length, flagged: hardFlags.length },
          error: hardFlags.length > 0 ? `${hardFlags.length} 道题硬规则未通过` : null,
        };
        console.log(`[Guardrail] A4硬规则: checked=${hardRuleResults.length} flagged=${hardFlags.length}`);

        // 交叉校验：练习题是否忠于 A2 文化阐释（防凭空生成）
        if (state.cultural_explanation && Object.keys(state.cultural_explanation).length > 0) {
          try {
            const groundingResult = await guardrail.verifyA4Grounding(
              state.cultural_explanation,
              exercises.map(ex => ({ question_stem: String(ex.question || "") }))
            );
            gr.a4_grounding = groundingResult;
            console.log(`[Guardrail] A4交叉校验(grounding): passed=${groundingResult.passed}`);
          } catch (e) {
            console.warn("[LangGraph:a4Generator] Guardrail grounding 异常:", e);
          }
        }
      }
      return gr;
    })(),

    // ---- 分支2：A5 模型质检（与 guardrail 并行；C4_NoA5 时不执行）----
    runA5
      ? withRetry(
          () => agents.a5.process({
            id: `msg_${Date.now()}_a5`,
            event_id: state.event_id,
            sender_agent: 'A4_ContentGenerator',
            receiver_agent: 'A5_QualityController',
            learner_id: state.learner_profile.id,
            message_type: 'quality_check',
            payload: {
              generated_content: a4Result.payload.generated_content,
              content_type: 'learning_content',
            },
            status: 'pending_review',
            created_at: new Date(),
          }),
          2
        )
      : Promise.resolve(null),
  ]);

  // 从 A5 结果提取 quality_review / final_status，传给 a5Controller 仲裁
  const a5Msg = a5Outcome as { payload?: Record<string, unknown>; status?: string } | null;
  const a5Review = a5Msg?.payload?.quality_review ?? a5Msg?.payload?.generated_content ?? null;
  const a5Status = a5Msg?.status ?? 'passed';

  // 计算 Pipeline 衰减
  let a4PipelineConfidence = state.pipeline_confidence;
  const a4DecayEntries: ConfidenceDecayEntry[] = [];
  for (const [name, verdict] of Object.entries(guardrailResults)) {
    const update = computePipelineStateUpdate(a4PipelineConfidence, name, verdict);
    a4PipelineConfidence = update.pipeline_confidence;
    if (update.pipeline_decay_log.length > 0) a4DecayEntries.push(...update.pipeline_decay_log);
  }

  return {
    generated_content: a4Result.payload.generated_content as GeneratedContent,
    guardrail_results: guardrailResults,
    pipeline_confidence: a4PipelineConfidence,
    pipeline_decay_log: a4DecayEntries,
    a5_quality_review: a5Review as Record<string, unknown> | null,
    a5_final_status: a5Status,
  };
}

/**
 * 节点 A5：质量管控
 */
async function a5Controller(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("a5Controller");
  if (state.skipAgents?.includes('A5')) {
    console.log(`[LangGraph:a5Controller] 被 skipAgents 跳过（消融条件未启用 A5，A4 内容直接作为最终产出）`);
    return {};
  }
  console.log(`[LangGraph:a5Controller] A5 质检已在 A4 后并行完成，执行双模型联席仲裁`);

  // A5 模型质检结果由 a4Generator 节点在生成后与 guardrail 并行产出（见 state.a5_quality_review），
  // 本节点只做双模型联席仲裁 + 汇总，不再重复调用 A5 LLM。
  const guardrail = getGuardrailService();
  let a5GuardrailResult: GuardrailVerdict = { passed: true, action: "PASS", confidence: 1, detail: {}, error: null };
  const a5Content = (state.a5_quality_review || state.generated_content) as Record<string, unknown> | null;
  const a5Exercises = (a5Content?.exercises || a5Content?.exercises_list) as Array<Record<string, unknown>> | undefined;
  if (a5Exercises && a5Exercises.length > 0) {
    try {
      a5GuardrailResult = await guardrail.verifyA5JointArbitration(
        { exercises: a5Exercises },
        state.learner_profile.hsk_level ?? 1
      );
    } catch (e) {
      a5GuardrailResult = { passed: false, action: "FLAG_PENDING_REVIEW" as const, confidence: 0, detail: { exception: String(e) }, error: String(e) };
    }
    console.log(`[Guardrail] A5联席仲裁: passed=${a5GuardrailResult.passed} action=${a5GuardrailResult.action}`);
  }

  const a5Pipeline = computePipelineStateUpdate(state.pipeline_confidence, 'a5_joint', a5GuardrailResult);

  return {
    quality_review: (state.a5_quality_review || {}) as Record<string, unknown>,
    final_status: state.a5_final_status || 'passed',
    guardrail_results: { a5_joint: a5GuardrailResult },
    pipeline_confidence: a5Pipeline.pipeline_confidence,
    pipeline_decay_log: a5Pipeline.pipeline_decay_log,
  };
}

/**
 * 节点：异步保存知识库
 */
async function saveKB(state: GraphState): Promise<Partial<GraphState>> {
  state.on_stage?.("saveKB");
  console.log(`[LangGraph:saveKB] 保存到知识库 | pipeline_confidence=${state.pipeline_confidence.toFixed(2)}`);

  const ctx = rebuildPipelineContext(state);

  // 置信度门控：低于阈值禁止写入缓存，防止缓存投毒
  // 消融模式（bypassCache）下完全跳过写缓存，避免污染真实缓存池
  if (!state.bypassCache && !isOfflineMockExecution() && shouldWriteCache(ctx)) {
    // 与置信度门控（shouldWriteCache → pipeline_confidence）保持一致：
    // 写入缓存的置信度直接使用 pipeline_confidence（衰减模型），而非 computeCacheConfidence
    // （加权平均分，量级系统性偏低）。否则即便通过门控（>=0.8）也会在 CacheManager.upsert
    // 被判 REJECTED，导致缓存永不命中、每次都冷生成。
    saveToKnowledgeBase({
      knowledge_point_id: state.knowledge_point_id,
      target_culture: state.learner_profile.native_language,
      hsk_level: state.learner_profile.hsk_level,
      cultural_explanation: state.cultural_explanation,
      cross_cultural_comparison: state.cross_cultural_comparison,
      scene_id: state.scene_type,
      confidence: state.pipeline_confidence,
    }).catch(err => console.error("[LangGraph:saveKB] 保存失败:", err));
  } else {
    console.warn(
      `[LangGraph:saveKB] 置信度过低 (${state.pipeline_confidence.toFixed(2)} < ${CACHE_WRITE_CONFIDENCE_THRESHOLD})，` +
      `跳过缓存写入以防止缓存投毒`
    );
  }

  // 计算最终元数据并通过遥测发布
  const pipelineMetadata = finalizePipelineMetadata(state);

  return {
    final_result: {
      cultural_explanation: state.cultural_explanation,
      cross_cultural_comparison: state.cross_cultural_comparison,
      learning_content: state.generated_content!,
      anxiety_level: String(state.anxiety_data?.anxiety_level ?? ''),
      cultural_anxiety_score: Number(state.anxiety_data?.cultural_anxiety_score ?? 0),
      final_status: state.final_status,
      from_cache: false,
      pipeline_metadata: pipelineMetadata,
    },
  };
}

/**
 * 节点：写入学习者图谱 (Neo4j)
 * 在 saveKB 之后执行，幂等写入 Learner 节点和 MASTERED 边
 */
async function writeLearnerGraph(state: GraphState): Promise<Partial<GraphState>> {
  if (isOfflineMockExecution()) return {};
  const learnerId = state.learner_profile?.id;
  const kpId = state.knowledge_point_id;
  const hskLevel = state.learner_profile?.hsk_level || 1;
  const nativeLang = state.learner_profile?.native_language || "en";
  const homeCultureCode = nativeLang === "zh" ? "zh" : nativeLang;

  if (!learnerId || !kpId) {
    console.warn("[LangGraph:writeLearnerGraph] 缺少 learner_id 或 kp_id，跳过");
    return {};
  }

  try {
    const score = state.pipeline_confidence;

    await upsertLearnerNode({
      id: learnerId,
      hsk_level: hskLevel,
      native_language: nativeLang,
      home_culture_code: homeCultureCode,
    });

    await recordMastery(learnerId, kpId, score);

    console.log(
      `[LangGraph:writeLearnerGraph] learner=${learnerId.slice(0, 8)}... ` +
      `kp=${kpId} score=${score.toFixed(2)}`
    );
  } catch (err) {
    console.warn("[LangGraph:writeLearnerGraph] Neo4j 写入失败（不影响主流程）:", err);
  }

  return {};
}

// ==================== 条件边：缓存命中？ ====================

function routeAfterCache(state: GraphState): "generateExercises" | "a1Profiler" {
  return state.cache_hit ? "generateExercises" : "a1Profiler";
}

// ==================== 构建图 ====================

function buildLearningGraph() {
  const graph = new StateGraph(LearningGraphState)

    // 添加节点
    .addNode("checkCache", checkCache)
    .addNode("generateExercises", generateExercises)
    .addNode("a1Profiler", a1Profiler)
    .addNode("a2Explainer", a2Explainer)
    .addNode("a3Comparator", a3Comparator)
    .addNode("mergeA2A3", mergeA2A3)
    .addNode("a4Generator", a4Generator)
    .addNode("a5Controller", a5Controller)
    .addNode("saveKB", saveKB)
    .addNode("writeLearnerGraph", writeLearnerGraph)

    // 添加边
    .addEdge(START, "checkCache")
    .addConditionalEdges("checkCache", routeAfterCache)
    .addEdge("generateExercises", END)
    .addEdge("a1Profiler", "a2Explainer")
    .addEdge("a1Profiler", "a3Comparator")  // A1 → A2 和 A1 → A3（并行）
    .addEdge("a2Explainer", "mergeA2A3")     // A2 → 汇聚点
    .addEdge("a3Comparator", "mergeA2A3")     // A3 → 汇聚点
    .addEdge("mergeA2A3", "a4Generator")      // 汇聚 → A4
    .addEdge("a4Generator", "a5Controller")    // A4 → A5
    .addEdge("a5Controller", "saveKB")         // A5 → 保存
    .addEdge("saveKB", "writeLearnerGraph")    // 保存 → 学习者图谱
    .addEdge("writeLearnerGraph", END);        // 学习者图谱 → 结束

  return graph.compile();
}

// ==================== 导出 ====================

/**
 * 编译后的 LangGraph 图实例（单例）
 */
let compiledGraph: ReturnType<typeof buildLearningGraph> | null = null;

function getLearningGraph() {
  if (!compiledGraph) {
    compiledGraph = buildLearningGraph();
  }
  return compiledGraph;
}

/**
 * LangGraph 版学习请求入口
 * 与旧版 MultiAgentCoordinator.processLearningRequest() 签名和返回值完全兼容
 */
export async function processLearningRequestWithLangGraph(
  learner_profile: LearnerProfile,
  knowledge_point_id: string,
  scene_keywords?: string[],
  signal?: AbortSignal,
  opts?: { skipAgents?: string[]; bypassCache?: boolean; onStage?: (stage: string) => void },
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
  const graph = getLearningGraph();

  // [P0 修复 P-01] 把路由级 signal 传播给各 Agent（与旧版编排对齐）：
  // LangGraph 的 invoke(signal) 只能终止图的调度，中止不了节点内已在途的 fetch；
  // 由各 Agent 的 generateResponse 链接到该 signal 才能真正中断底层请求。
  const agentList = [agents.a1, agents.a2, agents.a3, agents.a4, agents.a5];
  if (signal) agentList.forEach(a => a.setAbortSignal(signal));

  try {
    const result = await graph.invoke(
      {
        learner_profile,
        knowledge_point_id,
        scene_keywords: scene_keywords || [],
        skipAgents: opts?.skipAgents ?? [],
        bypassCache: opts?.bypassCache ?? false,
        on_stage: opts?.onStage,
      },
      signal ? { signal } : undefined
    );

    return {
      ...result.final_result!,
      guardrail_results: result.guardrail_results || {},
    };
  } finally {
    // 请求结束（含失败/中止）后解除 signal 绑定，避免单例 Agent 持有已废弃的 signal
    agentList.forEach(a => a.setAbortSignal(undefined));
  }
}

/**
 * 获取 LangGraph 图的结构描述（用于调试/可视化）
 */
export function getGraphStructure() {
  return {
    nodes: [
      "checkCache", "generateExercises", "a1Profiler",
      "a2Explainer", "a3Comparator", "mergeA2A3",
      "a4Generator", "a5Controller", "saveKB", "writeLearnerGraph"
    ],
    edges: [
      { from: "START", to: "checkCache" },
      { from: "checkCache", to: "generateExercises", condition: "cache_hit" },
      { from: "checkCache", to: "a1Profiler", condition: "cache_miss" },
      { from: "a1Profiler", to: "a2Explainer" },
      { from: "a1Profiler", to: "a3Comparator" },
      { from: "a2Explainer", to: "mergeA2A3" },
      { from: "a3Comparator", to: "mergeA2A3" },
      { from: "mergeA2A3", to: "a4Generator" },
      { from: "a4Generator", to: "a5Controller" },
      { from: "a5Controller", to: "saveKB" },
      { from: "saveKB", to: "writeLearnerGraph" },
      { from: "writeLearnerGraph", to: "END" },
      { from: "generateExercises", to: "END" },
    ],
  };
}
