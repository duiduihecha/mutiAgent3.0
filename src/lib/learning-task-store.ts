/**
 * 学习任务存储（进程内内存实现，单实例 next start 适用）
 *
 * 背景：Cloudflare 隧道/代理对同步长请求有 ~100s 响应超时，而学习链路
 * 首次 3-8 分钟、缓存命中 1-2 分钟，必须改为「提交任务 + 轮询」模式。
 *
 * 设计：
 * - 幂等：同 (learner_id, 实际KP, hsk, lang) 窗口内已有 queued/running 任务 → 复用同一 task_id
 * - 并发：同一 learner 同时最多 1 个 running 任务（提交侧检查，超了返回 429）
 * - 清理：completed/failed 30 分钟后惰性删除，防止内存增长
 * - 进度：runLearningJob 通过 onStage 回调更新 stage（a1/a2a3/a4/a5/guardrail/saving）
 * - 正式远程版应替换为 Supabase 任务表实现（本文件对外接口不变）
 */
import { randomUUID } from "node:crypto";
import { processLearningRequestWithLangGraph } from "./learning-graph";
import { multiAgentCoordinator, AgentError, ValidationError, LearnerProfile } from "./multi-agent-system";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export type LearningTaskStatus = "queued" | "running" | "completed" | "failed";
export type LearningTaskStage =
  | "queued"
  | "cache_check"
  | "a1"
  | "a2a3"
  | "a4"
  | "a5"
  | "guardrail"
  | "saving";

export interface LearningTask {
  id: string;
  status: LearningTaskStatus;
  stage: LearningTaskStage;
  learner_id: string;
  knowledge_point_id: string;
  actual_kp_id: string;
  actual_topic: string;
  hsk_level: number;
  native_language: string;
  scene_keywords: string[];
  learner_profile: LearnerProfile;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  result?: Record<string, unknown>;
  error?: string;
  error_detail?: Record<string, unknown>;
}

const tasks = new Map<string, LearningTask>();
const RUNNING_TTL_MS = 20 * 60_000;       // 任务最长执行时间（对齐路由超时上限）
const FINGERPRINT_TTL_MS = 60_000;        // 幂等窗口：窗口内同指纹复用
const CLEANUP_TTL_MS = 30 * 60_000;       // 终态保留时长

function nowMs(): number {
  return Date.now();
}

export function createLearningTask(input: {
  learner: LearnerProfile;
  learnerDbId: string;
  knowledge_point_id: string;
  actual_kp_id: string;
  actual_topic: string;
  scene_keywords: string[];
  hsk_level: number;
  native_language: string;
}): { task: LearningTask; reused: boolean } {
  const fingerprint = [input.learner.id, input.actual_kp_id, input.hsk_level, input.native_language].join("|");
  const now = nowMs();

  // 幂等：窗口内同指纹已有 queued/running → 复用
  for (const t of tasks.values()) {
    if (
      t.fingerprint === fingerprint &&
      (t.status === "queued" || t.status === "running") &&
      now - t.createdAt < RUNNING_TTL_MS
    ) {
      return { task: t, reused: true };
    }
  }

  const task: LearningTask = {
    id: `tk_${randomUUID().slice(0, 8)}`,
    status: "queued",
    stage: "queued",
    learner_id: input.learner.id,
    knowledge_point_id: input.knowledge_point_id,
    actual_kp_id: input.actual_kp_id,
    actual_topic: input.actual_topic,
    hsk_level: input.hsk_level,
    native_language: input.native_language,
    scene_keywords: input.scene_keywords,
    learner_profile: input.learner,
    fingerprint,
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(task.id, task);
  return { task, reused: false };
}

export function getLearningTask(id: string): LearningTask | undefined {
  return tasks.get(id);
}

export function updateLearningTask(id: string, patch: Partial<LearningTask>): void {
  const t = tasks.get(id);
  if (!t) return;
  Object.assign(t, patch, { updatedAt: nowMs() });
}

/** 同一 learner 是否已有进行中的任务（并发限制用） */
export function hasRunningTaskForLearner(learnerId: string): boolean {
  const now = nowMs();
  for (const t of tasks.values()) {
    if (t.learner_id === learnerId && t.status !== "completed" && t.status !== "failed" && now - t.createdAt < RUNNING_TTL_MS) {
      return true;
    }
  }
  return false;
}

/** 惰性清理终态任务，防止内存缓慢增长 */
export function cleanupLearningTasks(): void {
  const now = nowMs();
  if (tasks.size > 500) {
    for (const [key, t] of tasks) {
      if (t.status === "completed" || t.status === "failed") {
        if (now - t.updatedAt > CLEANUP_TTL_MS) tasks.delete(key);
      } else if (now - t.createdAt > RUNNING_TTL_MS) {
        // 卡死超过上限的任务强制置 failed
        t.status = "failed";
        t.error = "任务执行超时（超过上限）";
        t.updatedAt = now;
      }
    }
  }
}

// ==================== 任务执行器 ====================

const PIPELINE_TIMEOUT_MS = Number(process.env.LEARNING_PIPELINE_TIMEOUT_MS || 900000);

/**
 * 在后台执行学习任务（fire-and-forget）。
 * next start 单进程常驻，setImmediate 闭包可完整跑完；进程重启则任务丢失（可接受，重试即可）。
 */
export function runLearningJob(taskId: string): void {
  setImmediate(() => void executeLearningJob(taskId));
}

async function executeLearningJob(taskId: string): Promise<void> {
  const task = tasks.get(taskId);
  if (!task) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
  const onStage = (stage: LearningTaskStage) => updateLearningTask(taskId, { stage });

  try {
    updateLearningTask(taskId, { status: "running", stage: "cache_check" });
    const useLangGraph = process.env.USE_LANGGRAPH === "true";

    type LearningResult = Awaited<ReturnType<typeof processLearningRequestWithLangGraph>>;
    let result: LearningResult;

    if (useLangGraph) {
      // LangGraph 编排：图节点自动执行条件分支、缓存检查、并行调度；onStage 探针回报进度
      result = await processLearningRequestWithLangGraph(
        task.learner_profile,
        task.actual_kp_id,
        task.scene_keywords,
        controller.signal,
        { onStage: (s) => onStage(mapGraphStage(s)) }
      );
    } else {
      // 旧版手写编排（兼容）
      onStage("a2a3");
      result = await multiAgentCoordinator.processLearningRequest(
        task.learner_profile,
        task.actual_kp_id,
        task.scene_keywords,
        controller.signal
      );
    }

    onStage("guardrail");

    // 质量网关硬拦截：FLAG_REJECT 的内容一律不得下发
    const guardrailResults = (result.guardrail_results || {}) as Record<string, { action?: string; error?: string | null }>;
    const rejectedGuardrails = Object.entries(guardrailResults)
      .filter(([, verdict]) => verdict?.action === "FLAG_REJECT")
      .map(([name, verdict]) => ({ guardrail: name, reason: verdict?.error || "质量未达标" }));

    if (rejectedGuardrails.length > 0) {
      console.warn("[LearningJob] 质量网关拦截:", rejectedGuardrails);
      updateLearningTask(taskId, {
        status: "failed",
        stage: "guardrail",
        error: `生成内容未通过质量网关（${rejectedGuardrails.map((g) => g.guardrail).join("、")}），已拦截，请重试`,
        error_detail: { quality_gate: "rejected", failed_guardrails: rejectedGuardrails },
      });
      return;
    }

    // 获取知识点信息（使用实际知识点ID）
    let knowledgePointInfo: Record<string, unknown> = {
      id: task.actual_kp_id,
      content_json: { zh: { topic: task.actual_topic, examples: [], objectives: "" } },
    };
    try {
      const supabase = getSupabaseClient();
      const { data: kpData } = await supabase
        .from("cultural_knowledge_points")
        .select("*")
        .eq("id", task.actual_kp_id)
        .single();
      if (kpData) knowledgePointInfo = kpData;
    } catch (dbError) {
      console.error("知识点查询失败:", dbError);
    }

    // 创建学习记录（不阻塞主流程，失败仅告警）
    let learningRecordId = "";
    try {
      const supabase = getSupabaseClient();
      const { data: recordData } = await supabase
        .from("learning_records")
        .insert({
          learner_id: task.learner_id,
          knowledge_point_id: task.knowledge_point_id,
          hsk_level: task.hsk_level,
          status: "in_progress",
          native_language_ratio: 0.5,
        })
        .select()
        .single();
      if (recordData) learningRecordId = recordData.id;
    } catch (dbError) {
      console.error("创建学习记录失败:", dbError);
    }

    // 格式化响应（与旧同步 POST 的 data 结构完全一致，前端零适配）
    const content = result.learning_content || ({} as { cultural_context?: { explanation?: string }; language_points?: { zh: string }[]; exercises?: unknown[] });
    const exercises = (content.exercises || []) as {
      type: string;
      question: string;
      options?: string[];
      correct_answer: string;
      explanation?: string;
      dimension?: string;
    }[];
    const data: Record<string, unknown> = {
      learner: {
        id: task.learner_profile.id,
        uid: task.learner_profile.uid,
        native_language: task.learner_profile.native_language,
        hsk_level: task.learner_profile.hsk_level,
        learning_motivation: task.learner_profile.learning_motivation,
        cultural_anxiety_score: task.learner_profile.cultural_anxiety_score,
        ability_vector: task.learner_profile.ability_vector,
        created_at: new Date().toISOString(),
        updated_at: null,
      },
      knowledge_point: {
        id: knowledgePointInfo.id,
        hsk_level: task.hsk_level,
        layer: 1,
        language_binding_points: [],
        content_json: (knowledgePointInfo as { content_json?: unknown }).content_json,
        created_at: new Date().toISOString(),
      },
      learning_record_id: learningRecordId,
      cultural_explanation: JSON.stringify(result.cultural_explanation),
      cross_cultural_comparison: JSON.stringify(result.cross_cultural_comparison),
      learning_content: {
        scene_title: content.cultural_context?.explanation?.substring(0, 20) || "学习场景",
        cultural_background: content.cultural_context?.explanation || "",
        core_language_points: content.language_points?.map((lp) => lp.zh) || [],
        dialogues:
          exercises.slice(0, 3).map((ex, i) => ({
            speaker: i % 2 === 0 ? "老师" : "学生",
            chinese: ex.question,
            translation: ex.explanation || "",
            cultural_notes: "",
          })) || [],
        exercises: exercises.map((ex) => ({
          type: ex.type === "multiple_choice" ? "选择题" : ex.type === "fill_blank" ? "填空题" : "判断题",
          question: ex.question,
          options: ex.options,
          correct_answer: ex.correct_answer,
          explanation: ex.explanation || "",
          dimension: ex.dimension || "grammar",
        })),
        cultural_assessment: {
          criterion: "能准确使用相关语言点",
          questions: ["这个表达在中国文化中有什么含义？"],
        },
      },
      status: result.final_status || "passed",
      quality_gate: Object.values(guardrailResults).some((v) => v?.action === "FLAG_PENDING_REVIEW")
        ? "needs_review"
        : "passed",
      from_cache: result.from_cache || false,
      anxiety_level: result.anxiety_level || "low",
      cultural_anxiety_score_used: result.cultural_anxiety_score ?? null,
      engine: useLangGraph ? "langgraph" : "legacy",
      guardrail: guardrailResults,
      pipeline_metadata: result.pipeline_metadata || null,
    };

    onStage("saving");
    updateLearningTask(taskId, { status: "completed", stage: "saving", result: data });
  } catch (error) {
    console.error("[LearningJob] 任务失败:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = controller.signal.aborted;
    updateLearningTask(taskId, {
      status: "failed",
      stage: "guardrail",
      error: isTimeout
        ? `学习内容生成超时（${Math.round(PIPELINE_TIMEOUT_MS / 1000)}s），请稍后重试`
        : `学习内容生成失败: ${errorMessage}`,
      error_detail: {
        agent_error: error instanceof AgentError,
        retryable: !isTimeout && error instanceof AgentError && (error as { retryable?: boolean }).retryable,
        timeout: isTimeout,
        message: errorMessage,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 把 LangGraph 节点的 onStage 回调名映射到任务阶段 */
function mapGraphStage(s: string): LearningTaskStage {
  switch (s) {
    case "checkCache":
      return "cache_check";
    case "a1Profiler":
      return "a1";
    case "a2Explainer":
    case "a3Comparator":
    case "mergeA2A3":
      return "a2a3";
    case "a4Generator":
      return "a4";
    case "a5Controller":
      return "a5";
    case "saveKB":
    case "writeLearnerGraph":
      return "saving";
    case "generateExercises":
      return "a4";
    default:
      return "a2a3";
  }
}

void ValidationError;
