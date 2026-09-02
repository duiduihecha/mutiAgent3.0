/**
 * 实验运行器 — 论文实验框架
 *
 * 支持论文的 4 组实验：
 *   RQ1 消融实验:    C1(Full) / C2(Monolith) / C3(NoA3) / C4(NoA5) / C5(NoA2A3)
 *   RQ2 KG增强:      Full+KG / NoKG / RAG_only
 *   RQ3 跨文化适配:   8母语圈 × 固定知识点
 *   RQ4 防幻觉网关:   各防线独立 & 组合效能分析
 *
 * 架构：
 *   1. TestCaseGenerator — 从 Neo4j 图谱加载测试用例
 *   2. ConditionRunner    — 为每个实验条件运行流水线
 *   3. ResultPersister    — 将结果写入 Supabase experiment_results 表
 *
 * 使用方式：
 *   npx tsx scripts/run-experiments.ts --experiment rq1 --samples 10
 *   npx tsx scripts/run-experiments.ts --experiment rq2 --samples 10
 *   npx tsx scripts/run-experiments.ts --experiment all --samples 28
 */

import {
  type LearnerProfile,
  type AgentMessage,
  type GeneratedContent,
  type Exercise,
  LearnerProfilerAgent,
  MotherTongueExplainerAgent,
  CulturalComparatorAgent,
  ContentGeneratorAgent,
  QualityControllerAgent,
  safeJsonParse,
  detectBias,
  calculateNativeLanguageRatio,
  anxietyScoreToLevel,
} from "./multi-agent-system";
import { processLearningRequestWithLangGraph } from "./learning-graph";
import {
  type EvaluationResult,
  type ExperimentCondition,
  type EvaluationMetrics,
  type AggregateStats,
  computeAllMetrics,
  aggregateResults,
  formatAggregateTable,
} from "./evaluation-metrics";
import { neo4jService } from "./neo4j-service";
import { getLanguageCode, getLanguageNaturalName } from "./constants";
import { runWithExperimentContext, hashMessages } from "./experiment-telemetry";
import { getModelRoutingSnapshot } from "./llm-config";
import { isOfflineMockExecution } from "./llm-config";

// ============================================================================
// 类型定义
// ============================================================================

/** 测试用例 */
export interface TestCase {
  id: string;               // 唯一标识
  knowledge_point_id: string;
  domain_id: string;
  scene_id: string;
  domain_name: string;
  scene_name: string;
  pragmatic_intent: string;
  native_language: string;  // "英语" | "日语" ...
  hsk_level: number;        // 1-9
}

/** 实验配置 */
export interface ExperimentConfig {
  experiment_id: "rq1" | "rq2" | "rq3" | "rq4";
  conditions: ExperimentCondition[];
  test_cases: TestCase[];
  output_dir?: string;
  dry_run?: boolean;
}

/** 单次运行摘要（实时日志用） */
export interface RunSummary {
  test_case_id: string;
  condition: ExperimentCondition;
  duration_ms: number;
  json_valid: boolean;
  error?: string;
}

// ============================================================================
// 1. 测试用例生成器
// ============================================================================

/** 默认测试母语配置 */
const DEFAULT_LANGUAGES = [
  { name: "英语", code: "en" },
  { name: "日语", code: "ja" },
  { name: "韩语", code: "ko" },
  { name: "阿拉伯语", code: "ar" },
];

/** 默认测试 HSK 等级 */
const DEFAULT_HSK_LEVELS = [1, 4, 7];

/**
 * 从 Neo4j 加载可用测试用例
 *
 * 策略：每个 Domain 取前 N 个 Scene，每个 Scene 取第1个 KP
 */
export async function generateTestCases(params: {
  domains_per_run?: number;    // 默认全部14个
  scenes_per_domain?: number;  // 默认2个
  languages?: Array<{ name: string; code: string }>;
  hsk_levels?: number[];
}): Promise<TestCase[]> {
  const {
    domains_per_run = 14,
    scenes_per_domain = 2,
    languages = DEFAULT_LANGUAGES,
    hsk_levels = DEFAULT_HSK_LEVELS,
  } = params;

  const testCases: TestCase[] = [];

  try {
    // 从 Neo4j 查询 Domain → Scene → KP 结构
    const domains = await neo4jService.query<{
      domain_id: string; domain_name: string;
      scene_id: string; scene_name: string;
      kp_id: string; pragmatic_intent: string;
    }>(
      `MATCH (d:Domain)-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
       WITH d, s, kp
       ORDER BY d.id, s.id, kp.id
       RETURN d.id AS domain_id, d.name AS domain_name,
              s.id AS scene_id, s.name AS scene_name,
              kp.id AS kp_id, kp.pragmatic_intent AS pragmatic_intent`,
    );

    if (!domains || domains.length === 0) {
      console.warn("[ExperimentRunner] Neo4j 无图谱数据，使用 fallback 测试用例");
      return generateFallbackTestCases(languages, hsk_levels);
    }

    // 按 domain 分组
    const domainGroups = new Map<string, typeof domains>();
    for (const row of domains) {
      if (!domainGroups.has(row.domain_id)) {
        domainGroups.set(row.domain_id, []);
      }
      domainGroups.get(row.domain_id)!.push(row);
    }

    // 取前 N 个 domain，每个取前 M 个 scene 的第1个 KP
    let domainCount = 0;
    for (const [domainId, rows] of domainGroups) {
      if (domainCount >= domains_per_run) break;
      domainCount++;

      // 按 scene 去重，每个 scene 取第1个 KP
      const sceneMap = new Map<string, typeof rows[0]>();
      for (const row of rows) {
        if (!sceneMap.has(row.scene_id)) {
          sceneMap.set(row.scene_id, row);
        }
      }

      const scenes = Array.from(sceneMap.values()).slice(0, scenes_per_domain);

      for (const scene of scenes) {
        for (const lang of languages) {
          for (const level of hsk_levels) {
            testCases.push({
              id: `${scene.kp_id}_${lang.code}_hsk${level}`,
              knowledge_point_id: scene.kp_id,
              domain_id: domainId,
              scene_id: scene.scene_id,
              domain_name: scene.domain_name,
              scene_name: scene.scene_name,
              pragmatic_intent: scene.pragmatic_intent,
              native_language: lang.name,
              hsk_level: level,
            });
          }
        }
      }
    }

    console.log(
      `[ExperimentRunner] 生成 ${testCases.length} 个测试用例 ` +
      `(domain=${domainCount} scene=${scenes_per_domain} lang=${languages.length} hsk=${hsk_levels.length})`
    );
  } catch (err) {
    console.warn("[ExperimentRunner] 图谱查询失败，使用 fallback:", err);
    return generateFallbackTestCases(languages, hsk_levels);
  }

  return testCases;
}

/**
 * Fallback：当 Neo4j 不可用时，使用硬编码的典型测试用例
 */
function generateFallbackTestCases(
  languages: Array<{ name: string; code: string }>,
  hskLevels: number[],
): TestCase[] {
  const fallbackKPs = [
    { kp_id: "food_ordering_basic", domain: "餐饮美食", scene: "点餐" },
    { kp_id: "daily_greeting_formal", domain: "日常社交", scene: "寒暄" },
    { kp_id: "campus_library_borrow", domain: "校园生活", scene: "图书馆" },
    { kp_id: "travel_ask_directions", domain: "旅游出行", scene: "问路" },
    { kp_id: "shopping_bargain_market", domain: "购物消费", scene: "砍价" },
    { kp_id: "workplace_meeting_agree", domain: "职场办公", scene: "会议" },
    { kp_id: "medical_see_doctor", domain: "医疗健康", scene: "看病" },
    { kp_id: "banking_open_account", domain: "银行金融", scene: "开户" },
  ];

  const testCases: TestCase[] = [];
  for (const kp of fallbackKPs) {
    for (const lang of languages) {
      for (const level of hskLevels) {
        testCases.push({
          id: `${kp.kp_id}_${lang.code}_hsk${level}`,
          knowledge_point_id: kp.kp_id,
          domain_id: kp.kp_id.split("_")[0],
          scene_id: kp.kp_id,
          domain_name: kp.domain,
          scene_name: kp.scene,
          pragmatic_intent: kp.scene,
          native_language: lang.name,
          hsk_level: level,
        });
      }
    }
  }
  return testCases;
}

// ============================================================================
// 2. 学习者画像工厂
// ============================================================================

function createLearnerProfile(params: {
  native_language: string;
  hsk_level: number;
  anxiety_override?: number;
}): LearnerProfile {
  return {
    id: `exp_learner_${params.native_language}_hsk${params.hsk_level}`,
    uid: `exp_uid_${Date.now()}`,
    native_language: params.native_language,
    hsk_level: params.hsk_level,
    learning_motivation: "interest",
    cultural_anxiety_score: params.anxiety_override ?? 50,
    ability_vector: [50, 50, 50, 50, 50],
  };
}

// ============================================================================
// 3. 条件运行器
// ============================================================================

/** Agent 计时器 */
interface AgentTiming {
  start: number;
  end: number;
}

class TimingTracker {
  private timings: Map<string, AgentTiming> = new Map();
  private totalStart = 0;

  startTotal() { this.totalStart = Date.now(); }

  startAgent(name: string) {
    this.timings.set(name, { start: Date.now(), end: 0 });
  }

  endAgent(name: string) {
    const t = this.timings.get(name);
    if (t) t.end = Date.now();
  }

  endTotal(): number {
    return Date.now() - this.totalStart;
  }

  getAgentTimings(): Record<string, { start: number; end: number }> {
    return Object.fromEntries(this.timings);
  }
}

/**
 * 条件运行器 — 为每种实验条件运行流水线
 */
export class ExperimentRunner {
  private agents: {
    a1: LearnerProfilerAgent;
    a2: MotherTongueExplainerAgent;
    a3: CulturalComparatorAgent;
    a4: ContentGeneratorAgent;
    a5: QualityControllerAgent;
  };

  constructor() {
    this.agents = {
      a1: new LearnerProfilerAgent(),
      a2: new MotherTongueExplainerAgent(),
      a3: new CulturalComparatorAgent(),
      a4: new ContentGeneratorAgent(),
      a5: new QualityControllerAgent(),
    };
  }

  /**
   * 运行单条测试用例的单个条件
   */
  async runSingle(
    testCase: TestCase,
    condition: ExperimentCondition,
  ): Promise<EvaluationResult> {
    const routing = getModelRoutingSnapshot();
    return runWithExperimentContext({
      run_id: process.env.EXPERIMENT_RUN_ID || "unversioned-experiment-run",
      base_case_id: testCase.id,
      condition,
      category: "generation",
      knowledge_sha256: hashMessages([{ role: "case", content: JSON.stringify(testCase) }]),
      generation_profile: routing.generation_profile as "daily" | "quality",
      model_routing_sha256: routing.routing_sha256 as string,
    }, () => this.runSingleWithinContext(testCase, condition));
  }

  private async runSingleWithinContext(
    testCase: TestCase,
    condition: ExperimentCondition,
  ): Promise<EvaluationResult> {
    const errors: string[] = [];
    const timing = new TimingTracker();
    timing.startTotal();

    const learner = createLearnerProfile({
      native_language: testCase.native_language,
      hsk_level: testCase.hsk_level,
    });

    let cultural_explanation: Record<string, unknown> | null = null;
    let cross_cultural_comparison: Record<string, unknown> | null = null;
    let generated_content: GeneratedContent | null = null;
    let pipeline_metadata: Record<string, unknown> | null = null;

    try {
      switch (condition) {
        case "C1_Full":
          // 使用现有 LangGraph 完整流水线
          timing.startAgent("full_pipeline");
          const fullResult = await processLearningRequestWithLangGraph(
            learner,
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
            undefined,
            { bypassCache: true },
          );
          timing.endAgent("full_pipeline");
          cultural_explanation = fullResult.cultural_explanation;
          cross_cultural_comparison = fullResult.cross_cultural_comparison;
          generated_content = fullResult.learning_content;
          pipeline_metadata = fullResult.pipeline_metadata as Record<string, unknown> || null;
          break;

        case "C2_NoAgent_Monolith":
          // 单体 LLM：一个 Agent 完成 A2+A3+A4 的所有工作
          generated_content = await this.runMonolithAgent(testCase, learner, timing);
          // 单体模式不生成分开的阐释/对比，设为空
          cultural_explanation = { precise_definition: "(monolith mode: embedded in generated_content)" };
          cross_cultural_comparison = { learning_pitfall: "(monolith mode: embedded in generated_content)" };
          break;

        case "C3_NoA3":
          // 统一走 LangGraph，仅跳过 A3（skipAgents 控制，其余编排与 C1 完全一致）
          timing.startAgent("c3_no_a3");
          const c3Result = await processLearningRequestWithLangGraph(
            learner, // 注：此处 learner 类型与函数签名一致（LearnerProfile）
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
            undefined,
            { skipAgents: ['A3'], bypassCache: true },
          );
          timing.endAgent("c3_no_a3");
          cultural_explanation = c3Result.cultural_explanation;
          cross_cultural_comparison = c3Result.cross_cultural_comparison;
          generated_content = c3Result.learning_content;
          pipeline_metadata = c3Result.pipeline_metadata as Record<string, unknown> || null;
          break;

        case "C4_NoA5":
          // 统一走 LangGraph，仅跳过 A5（A5 为质量网关不改内容，故产出应与 C1 一致）
          timing.startAgent("c4_no_a5");
          const c4Result = await processLearningRequestWithLangGraph(
            learner,
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
            undefined,
            { skipAgents: ['A5'], bypassCache: true },
          );
          timing.endAgent("c4_no_a5");
          cultural_explanation = c4Result.cultural_explanation;
          cross_cultural_comparison = c4Result.cross_cultural_comparison;
          generated_content = c4Result.learning_content;
          pipeline_metadata = c4Result.pipeline_metadata as Record<string, unknown> || null;
          break;

        case "C5_NoA2A3":
          // 统一走 LangGraph，跳过 A2+A3（skipAgents 控制，其余编排与 C1 完全一致）
          timing.startAgent("c5_no_a2a3");
          const c5Result = await processLearningRequestWithLangGraph(
            learner,
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
            undefined,
            { skipAgents: ['A2', 'A3'], bypassCache: true },
          );
          timing.endAgent("c5_no_a2a3");
          cultural_explanation = c5Result.cultural_explanation;
          cross_cultural_comparison = c5Result.cross_cultural_comparison;
          generated_content = c5Result.learning_content;
          pipeline_metadata = c5Result.pipeline_metadata as Record<string, unknown> || null;
          break;

        // RQ2 条件
        case "Full+KG":
          // 与 C1_Full 相同
          timing.startAgent("full_pipeline");
          const kgResult = await processLearningRequestWithLangGraph(
            learner,
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
          );
          timing.endAgent("full_pipeline");
          cultural_explanation = kgResult.cultural_explanation;
          cross_cultural_comparison = kgResult.cross_cultural_comparison;
          generated_content = kgResult.learning_content;
          pipeline_metadata = kgResult.pipeline_metadata as Record<string, unknown> || null;
          break;

        case "NoKG":
          // 使用完整流水线但禁用 KG 查询
          // 注：当前实现中 KG 查询是 Agent 内部行为，此条件需要环境变量控制
          process.env.EXP_NO_KG_QUERY = "true";
          timing.startAgent("full_pipeline_no_kg");
          const noKgResult = await processLearningRequestWithLangGraph(
            learner,
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
          );
          timing.endAgent("full_pipeline_no_kg");
          cultural_explanation = noKgResult.cultural_explanation;
          cross_cultural_comparison = noKgResult.cross_cultural_comparison;
          generated_content = noKgResult.learning_content;
          pipeline_metadata = noKgResult.pipeline_metadata as Record<string, unknown> || null;
          delete process.env.EXP_NO_KG_QUERY;
          break;

        case "RAG_only":
          // RAG 替代 KG：使用 Supabase 向量检索替代图谱查询
          process.env.EXP_RAG_ONLY = "true";
          timing.startAgent("full_pipeline_rag");
          const ragResult = await processLearningRequestWithLangGraph(
            learner,
            testCase.knowledge_point_id,
            [testCase.domain_name, testCase.scene_name],
          );
          timing.endAgent("full_pipeline_rag");
          cultural_explanation = ragResult.cultural_explanation;
          cross_cultural_comparison = ragResult.cross_cultural_comparison;
          generated_content = ragResult.learning_content;
          pipeline_metadata = ragResult.pipeline_metadata as Record<string, unknown> || null;
          delete process.env.EXP_RAG_ONLY;
          break;

        default:
          throw new Error(`Unknown condition: ${condition}`);
      }
    } catch (err) {
      errors.push(`Condition ${condition} failed: ${(err as Error).message}`);
      console.error(`[ExperimentRunner] ${condition} error:`, err);
    }

    const totalDuration = timing.endTotal();

    // 计算评估指标
    const metrics = await computeAllMetrics({
      generated_content: generated_content,
      cultural_explanation: cultural_explanation,
      cross_cultural_comparison: cross_cultural_comparison,
      target_hsk_level: testCase.hsk_level,
      knowledge_point_id: testCase.knowledge_point_id,
      agent_timings: timing.getAgentTimings(),
      total_start_time: 0,
      total_end_time: totalDuration,
    });

    return {
      test_case_id: testCase.id,
      condition,
      scenario: testCase.knowledge_point_id,
      native_language: testCase.native_language,
      hsk_level: testCase.hsk_level,
      raw_output: {
        cultural_explanation,
        cross_cultural_comparison,
        generated_content,
        pipeline_metadata,
      },
      metrics,
      timestamp: Date.now(),
      duration_ms: totalDuration,
      errors,
    };
  }

  // ─── Agent 调用封装 ───

  private async runA1(
    tc: TestCase, learner: LearnerProfile, timing: TimingTracker,
  ): Promise<Record<string, unknown>> {
    timing.startAgent("A1");
    const msg: AgentMessage = {
      id: `msg_a1_${tc.id}`,
      event_id: `evt_${tc.id}`,
      sender_agent: "system",
      receiver_agent: "A1_LearnerProfiler",
      learner_id: learner.id,
      message_type: "profile_update",
      payload: {
        action: "calculate_anxiety",
        learner_profile: learner,
        _supabase_client: null,
      },
      status: "pending",
      created_at: new Date(),
    };
    const result = await this.agents.a1.process(msg);
    timing.endAgent("A1");
    return result.payload;
  }

  private async runA2(
    tc: TestCase, learner: LearnerProfile, timing: TimingTracker,
  ): Promise<Record<string, unknown>> {
    timing.startAgent("A2");
    const langCode = getLanguageCode(learner.native_language);
    const msg: AgentMessage = {
      id: `msg_a2_${tc.id}`,
      event_id: `evt_${tc.id}`,
      sender_agent: "A1",
      receiver_agent: "A2",
      learner_id: learner.id,
      message_type: "content_request",
      payload: {
        knowledge_point_id: tc.knowledge_point_id,
        target_language: langCode,
        anxiety_level: anxietyScoreToLevel(learner.cultural_anxiety_score),
        hsk_level: learner.hsk_level,
      },
      status: "pending",
      created_at: new Date(),
    };
    const result = await this.agents.a2.process(msg);
    timing.endAgent("A2");
    return result.payload.cultural_explanation as Record<string, unknown>;
  }

  private async runA3(
    tc: TestCase, learner: LearnerProfile, timing: TimingTracker,
  ): Promise<Record<string, unknown>> {
    timing.startAgent("A3");
    const langCode = getLanguageCode(learner.native_language);
    const msg: AgentMessage = {
      id: `msg_a3_${tc.id}`,
      event_id: `evt_${tc.id}`,
      sender_agent: "A2",
      receiver_agent: "A3",
      learner_id: learner.id,
      message_type: "comparison_result",
      payload: {
        chinese_culture_point: tc.knowledge_point_id,
        target_culture: learner.native_language,
        hsk_level: learner.hsk_level,
        anxiety_level: anxietyScoreToLevel(learner.cultural_anxiety_score),
        native_language_code: langCode,
      },
      status: "pending",
      created_at: new Date(),
    };
    const result = await this.agents.a3.process(msg);
    timing.endAgent("A3");
    const raw = result.payload.cross_cultural_comparison;
    return typeof raw === "string" ? safeJsonParse(raw) : (raw as Record<string, unknown>);
  }

  private async runA4(
    tc: TestCase, learner: LearnerProfile,
    explanation: Record<string, unknown> | null,
    comparison: Record<string, unknown> | null,
    timing: TimingTracker,
  ): Promise<GeneratedContent> {
    timing.startAgent("A4");
    const msg: AgentMessage = {
      id: `msg_a4_${tc.id}`,
      event_id: `evt_${tc.id}`,
      sender_agent: "A3",
      receiver_agent: "A4",
      learner_id: learner.id,
      message_type: "content_request",
      payload: {
        knowledge_point_id: tc.knowledge_point_id,
        cultural_explanation: explanation || {},
        cross_cultural_comparison: comparison || {},
        scene_type: tc.domain_id,
        hsk_level: learner.hsk_level,
        learner_profile: learner,
      },
      status: "pending_review",
      created_at: new Date(),
    };
    const result = await this.agents.a4.process(msg);
    timing.endAgent("A4");
    return result.payload.generated_content as GeneratedContent;
  }

  private async runA5(
    content: GeneratedContent | null,
    timing: TimingTracker,
  ): Promise<void> {
    if (!content) return;
    timing.startAgent("A5");
    const msg: AgentMessage = {
      id: `msg_a5_${Date.now()}`,
      event_id: `evt_${Date.now()}`,
      sender_agent: "A4",
      receiver_agent: "A5",
      message_type: "quality_check",
      payload: {
        generated_content: content,
        content_type: "learning_content",
      },
      status: "pending_review",
      created_at: new Date(),
    };
    try {
      await this.agents.a5.process(msg);
    } catch (e) {
      console.warn("[ExperimentRunner] A5 执行异常:", e);
    }
    timing.endAgent("A5");
  }

  /**
   * 单体 LLM 基线：一个 Agent 做所有事
   */
  private async runMonolithAgent(
    tc: TestCase, learner: LearnerProfile, timing: TimingTracker,
  ): Promise<GeneratedContent> {
    timing.startAgent("Monolith");
    const langCode = getLanguageCode(learner.native_language);
    const langName = getLanguageNaturalName(langCode);

    // 使用 A4 的 generateResponse 方法，但用一个包含所有职责的 prompt
    // 注：由于 BaseAgent 是 abstract class，这里用 A4 agent 的 generateResponse
    const systemPrompt = `<system_prompt>
你是一位全栈对外汉语（TCSL）教学设计师。请一次性完成以下所有任务：

1. **文化阐释**：用${langName}解释中国文化概念"${tc.pragmatic_intent}"（2-4句，含中文关键词）
2. **跨文化对比**：将这一中国文化概念与${learner.native_language}母语文化做对比，说明相同点和不同点
3. **场景化练习**：生成恰好5道练习题（至少2种题型），适合HSK ${learner.hsk_level}水平

<constraints>
- 所有翻译和解释必须使用${langName}
- 不得使用英语
- 严格匹配HSK ${learner.hsk_level}等级
- 输出严格JSON格式，不要markdown包裹
</constraints>

<output_schema>
{
  "cultural_context": {
    "explanation": "${langName}书写的文化背景说明（80-150词）"
  },
  "language_points": [
    {"zh": "中文表达", "en": "${langName}翻译"}
  ],
  "comparison": {
    "cn": "中国文化中的表现",
    "target": "${learner.native_language}文化中的表现",
    "differences": [
      {"cn": "中方", "target": "对方", "description": "差异说明"}
    ]
  },
  "exercises": [
    {
      "type": "multiple_choice",
      "question": "题目",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correct_answer": "A",
      "explanation": "解释",
      "dimension": "cultural_pragmatic"
    }
  ]
}
</output_schema>
</system_prompt>`;

    const userMessage = `<user_input>
<task>为HSK ${learner.hsk_level}的${learner.native_language}母语学习者设计学习内容</task>
<knowledge_point>${tc.knowledge_point_id}</knowledge_point>
<scene>${tc.domain_name} — ${tc.scene_name}</scene>
</user_input>`;

    // 直接通过 A4 agent 的 generateResponse 调用 LLM
    const response = await (this.agents.a4 as any).generateResponse(
      systemPrompt, userMessage, 90000, { type: "json_object" },
    );
    timing.endAgent("Monolith");

    const parsed = safeJsonParse(response) as unknown as GeneratedContent;
    return parsed;
  }

  // ─── 批量运行 ───

  /**
   * 批量运行：test_cases × conditions
   *
   * @param onProgress 每完成一条的回调，用于实时日志
   */
  async runBatch(
    testCases: TestCase[],
    conditions: ExperimentCondition[],
    onProgress?: (summary: RunSummary) => void,
  ): Promise<EvaluationResult[]> {
    if (isOfflineMockExecution()) {
      throw new Error("Offline mock fixtures are prohibited from experiment result runs");
    }
    const results: EvaluationResult[] = [];
    const total = testCases.length * conditions.length;
    let completed = 0;

    console.log(`[ExperimentRunner] 开始批量运行: ${testCases.length} cases × ${conditions.length} conditions = ${total} 次`);

    for (const tc of testCases) {
      for (const cond of conditions) {
        const result = await this.runSingle(tc, cond);
        results.push(result);
        completed++;

        const summary: RunSummary = {
          test_case_id: tc.id,
          condition: cond,
          duration_ms: result.duration_ms,
          json_valid: result.metrics.json_format_valid,
          error: result.errors.length > 0 ? result.errors[0] : undefined,
        };

        if (onProgress) onProgress(summary);

        console.log(
          `[ExperimentRunner] [${completed}/${total}] ${cond} | ${tc.knowledge_point_id} ` +
          `(${tc.native_language} HSK${tc.hsk_level}) | ${result.duration_ms}ms | ` +
          `json=${result.metrics.json_format_valid ? "✓" : "✗"} ` +
          `hsk_over=${(result.metrics.hsk_vocab_overlevel_rate * 100).toFixed(0)}% ` +
          `bias=${result.metrics.bias_score.toFixed(2)}`
        );

        // 速率限制：DeepSeek 免费API慢，每次调用后等待 3s 避免限流 429
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log(`[ExperimentRunner] 批量运行完成: ${completed} 次`);
    return results;
  }

  /**
   * 运行完整实验（RQI + RQ2）
   */
  async runFullExperiment(
    samplesPerDomain: number = 2,
  ): Promise<{
    rq1_results: EvaluationResult[];
    rq2_results: EvaluationResult[];
    rq1_aggregates: AggregateStats[];
    rq2_aggregates: AggregateStats[];
  }> {
    console.log("=".repeat(60));
    console.log("  论文实验全量运行");
    console.log("=".repeat(60));

    // 生成测试用例
    const testCases = await generateTestCases({
      scenes_per_domain: samplesPerDomain,
    });

    // RQ1: 消融实验
    console.log("\n🔬 RQ1: 多智能体架构消融实验");
    const rq1Conditions: ExperimentCondition[] = [
      "C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3",
    ];
    const rq1Results = await this.runBatch(testCases, rq1Conditions);

    // RQ2: KG 增强实验（用 RQ1 的 C1 结果作为 Full+KG）
    console.log("\n🔬 RQ2: 知识图谱增强效果实验");
    const rq2Conditions: ExperimentCondition[] = ["NoKG", "RAG_only"];
    // Full+KG = C1_Full 的结果复制
    const c1Results = rq1Results.filter(r => r.condition === "C1_Full")
      .map(r => ({ ...r, condition: "Full+KG" as ExperimentCondition }));
    const rq2PartialResults = await this.runBatch(testCases, rq2Conditions);
    const rq2Results = [...c1Results, ...rq2PartialResults];

    // 聚合统计
    const rq1Aggregates = groupAndAggregate(rq1Results);
    const rq2Aggregates = groupAndAggregate(rq2Results);

    console.log("\n📊 RQ1 消融实验汇总:");
    console.log(formatAggregateTable(rq1Aggregates));
    console.log("\n📊 RQ2 KG增强实验汇总:");
    console.log(formatAggregateTable(rq2Aggregates));

    return { rq1_results: rq1Results, rq2_results: rq2Results, rq1_aggregates: rq1Aggregates, rq2_aggregates: rq2Aggregates };
  }
}

// ============================================================================
// 4. 辅助函数
// ============================================================================

/**
 * 按实验条件分组并聚合统计
 */
function groupAndAggregate(results: EvaluationResult[]): AggregateStats[] {
  const groups = new Map<ExperimentCondition, EvaluationResult[]>();
  for (const r of results) {
    if (!groups.has(r.condition)) {
      groups.set(r.condition, []);
    }
    groups.get(r.condition)!.push(r);
  }

  const stats: AggregateStats[] = [];
  for (const [condition, group] of groups) {
    stats.push(aggregateResults(group));
  }

  // 按条件排序
  const order: ExperimentCondition[] = [
    "C1_Full", "C2_NoAgent_Monolith", "C3_NoA3", "C4_NoA5", "C5_NoA2A3",
    "Full+KG", "NoKG", "RAG_only",
  ];
  stats.sort((a, b) => order.indexOf(a.condition!) - order.indexOf(b.condition!));

  return stats;
}

/**
 * 将结果导出为 JSON（供论文中的表格使用）
 */
export function exportResultsToJSON(results: EvaluationResult[]): string {
  return JSON.stringify(results, null, 2);
}

/**
 * 单例
 */
let _runner: ExperimentRunner | null = null;

export function getExperimentRunner(): ExperimentRunner {
  if (!_runner) _runner = new ExperimentRunner();
  return _runner;
}
