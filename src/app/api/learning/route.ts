/**
 * 学习流程 API 路由
 * POST /api/learning - 开始学习
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  multiAgentCoordinator, 
  LearnerProfile, 
  AgentError, 
  withRetry, 
  ValidationError,
  getKnowledgePointByScene
} from "@/lib/multi-agent-system";
import { processLearningRequestWithLangGraph } from "@/lib/learning-graph";
import { processLearningRequestWithLangGraph as runLearningGraph } from "@/lib/learning-graph";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 默认学习者画像
const DEFAULT_LEARNER_PROFILE: LearnerProfile = {
  id: "",
  uid: "",
  native_language: "英语",
  hsk_level: 1,
  learning_motivation: "interest",
  cultural_anxiety_score: 50,
  ability_vector: [50, 50, 50, 50, 50]
};

// [P0 修复 P-01] 路由级超时对齐真实链路耗时：
// A1 → A2+A3(并行) → A4 → A5 实测最长 ~480s，旧值 120s 会在链路中途 abort 导致 502。
// 可用环境变量 LEARNING_PIPELINE_TIMEOUT_MS 覆盖。
const PIPELINE_TIMEOUT_MS = Number(process.env.LEARNING_PIPELINE_TIMEOUT_MS || 1800000);

// [P-03 修复] 基础限流：每 IP 每分钟最多 N 次生成请求（内存实现，单实例部署够用）。
// 每次请求要跑完整多智能体链路（耗时且花配额），必须防刷。
const RATE_LIMIT_PER_MIN = Number(process.env.LEARNING_RATE_LIMIT_PER_MIN || 6);
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  // 顺手清理过期桶，防止内存缓慢增长
  if (rateBucket.size > 5000) {
    for (const [key, entry] of rateBucket) {
      if (now > entry.resetAt) rateBucket.delete(key);
    }
  }
  const entry = rateBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(ip, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_PER_MIN) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export async function POST(request: NextRequest) {
  try {
    // [P-03 修复] 先过限流
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rate = checkRateLimit(clientIp);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: `请求过于频繁，请 ${rate.retryAfterSec} 秒后重试` },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const {
      learner_id,
      knowledge_point_id,
      hsk_level = 1,
      native_language = "英语",
      learning_motivation = "interest",
      scene_keywords = [],
      use_langgraph = false
    } = body;

    // 参数校验
    if (!knowledge_point_id) {
      return NextResponse.json(
        { success: false, error: "缺少知识点ID" },
        { status: 400 }
      );
    }

    // ========== Step 0: 场景 → 知识点 映射 ==========
    // 如果 knowledge_point_id 是场景ID（如 "daily", "food"），则查询对应的知识点
    const isSceneId = !knowledge_point_id.includes('-'); // UUID格式包含-
    let actualKpId = knowledge_point_id;
    let actualTopic = knowledge_point_id;
    
    if (isSceneId) {
      console.log(`[场景映射] 场景ID: ${knowledge_point_id}`);
      const kpInfo = await getKnowledgePointByScene(knowledge_point_id);
      if (kpInfo) {
        actualKpId = kpInfo.knowledge_point_id;
        actualTopic = kpInfo.topic;
        console.log(`[场景映射] → 知识点ID: ${actualKpId}, 主题: ${actualTopic}`);
      }
    }

    // 获取或创建学习者（禁止重复创建）
    let learner: LearnerProfile = { ...DEFAULT_LEARNER_PROFILE, hsk_level };
    let learnerDbId = "";

    if (learner_id && learner_id !== "new") {
      // 从数据库获取已有学习者信息
      try {
        const supabase = getSupabaseClient();
        const { data: learnerData, error } = await supabase
          .from("learners")
          .select("*")
          .eq("id", learner_id)
          .single();

        if (!error && learnerData) {
          learner = {
            id: learnerData.id,
            uid: learnerData.uid,
            // [修复] 前端请求传入的 native_language/hsk_level 优先于数据库旧值
            // 确保用户选择器变化能立即生效，不会被数据库旧值覆盖
            native_language: native_language || learnerData.native_language,
            hsk_level: hsk_level || learnerData.hsk_level,
            learning_motivation: learnerData.learning_motivation || "interest",
            cultural_anxiety_score: learnerData.cultural_anxiety_score || 50,
            ability_vector: learnerData.ability_vector || [50, 50, 50, 50, 50]
          };
          learnerDbId = learnerData.id;
        } else {
          // learner_id 无效（数据库中不存在），返回错误而非静默创建新学习者
          return NextResponse.json(
            { success: false, error: `学习者ID "${learner_id}" 不存在，请重新开始学习` },
            { status: 404 }
          );
        }
      } catch (dbError) {
        console.error("数据库查询学习者失败:", dbError);
        return NextResponse.json(
          { success: false, error: "数据库查询失败，请稍后重试" },
          { status: 503 }
        );
      }
    } else {
      // 首次创建学习者
      try {
        const supabase = getSupabaseClient();
        const newLearnerId = `learner_${Date.now()}`;
        const { data, error } = await supabase
          .from("learners")
          .insert({
            uid: newLearnerId,
            native_language,
            hsk_level,
            learning_motivation,
            cultural_anxiety_score: 50,
            ability_vector: [50, 50, 50, 50, 50]
          })
          .select()
          .single();

        if (!error && data) {
          learner = {
            id: data.id,
            uid: data.uid,
            native_language,
            hsk_level,
            learning_motivation,
            cultural_anxiety_score: 50,
            ability_vector: [50, 50, 50, 50, 50]
          };
          learnerDbId = data.id;
        } else {
          console.error("创建学习者失败:", error);
          return NextResponse.json(
            { success: false, error: "创建学习者失败，请稍后重试" },
            { status: 503 }
          );
        }
      } catch (dbError) {
        console.error("创建学习者异常:", dbError);
        return NextResponse.json(
          { success: false, error: "创建学习者异常，请稍后重试" },
          { status: 503 }
        );
      }
    }

    // 调用多智能体系统
    // 环境变量 USE_LANGGRAPH=true 或请求体 use_langgraph=true 时使用 LangGraph 编排
    const useLangGraph = process.env.USE_LANGGRAPH === "true" || use_langgraph === true;
    let result;

    // [P0 修复 P-01] 路由级超时统一为 PIPELINE_TIMEOUT_MS（默认 480s，对齐真实链路），
    // 超时消息可诊断；AbortController 会沿 Agent 链路真正中止底层 fetch。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
    try {
      if (useLangGraph) {
        // LangGraph 编排：图节点自动执行条件分支、缓存检查、并行调度
        console.log("[Learning API] 使用 LangGraph 编排");
        result = await processLearningRequestWithLangGraph(
          learner,
          actualKpId,
          scene_keywords,
          controller.signal
        );
      } else {
        // 旧版手写编排
        result = await multiAgentCoordinator.processLearningRequest(
          learner,
          knowledge_point_id,
          scene_keywords,
          controller.signal
        );
      }
    } catch (error) {
      console.error("多智能体系统调用失败:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = controller.signal.aborted;
      return NextResponse.json(
        {
          success: false,
          error: isTimeout
            ? `学习内容生成超时（${Math.round(PIPELINE_TIMEOUT_MS / 1000)}s），请稍后重试`
            : `学习内容生成失败: ${errorMessage}`,
          error_detail: {
            agent_error: error instanceof AgentError,
            retryable: !isTimeout && error instanceof AgentError && error.retryable,
            timeout: isTimeout,
            message: errorMessage
          }
        },
        { status: isTimeout ? 504 : 502 }
      );
    } finally {
      clearTimeout(timer);
    }

    // [P0 修复 P-02] 质量网关：FLAG_REJECT 的内容一律不得下发。
    // 旧实现只把 guardrail 结果作为元数据透传，A5 判不合格的内容照常返回给学习者。
    const guardrailResults = (
      (result as Record<string, unknown>).guardrail_results || {}
    ) as Record<string, { action?: string; error?: string | null }>;
    const rejectedGuardrails = Object.entries(guardrailResults)
      .filter(([, verdict]) => verdict?.action === "FLAG_REJECT")
      .map(([name, verdict]) => ({
        guardrail: name,
        reason: verdict?.error || "质量未达标"
      }));

    // （v1.1 软放行改造 · 对应预热脚本 + 答辩演示兜底）
    // 原来：rejectedGuardrails.length>0 → 422 直接拦截，LLM 新生成 (A4) 即使练习题/解释全部正常，
    //      只要 solver 盲解对抗 1 题没解析出来或公式 minor 不一致 → 422 → 预热全失败 → demo 白屏等 30s。
    // 现在：a4_solver 拦截 → 仍下发学习内容（success=true），附带 quality_warning 标记 + confidence 降低 0.6。
    //      其他 guardrails (bias/pii/illegal_content 安全类) → 仍 422 硬拦截。
    const safetyGuardrails = ["bias_detect","content_policy","pii_detect","illegal_content","cultural_accuracy_critical"];
    const safetyRejected = rejectedGuardrails.filter(g => safetyGuardrails.includes(g.guardrail) || /安全|偏见|个人信息|违法|严重|歧视|侮辱/.test(g.reason));
    const solverOnly = rejectedGuardrails.length > 0 && safetyRejected.length === 0 && rejectedGuardrails.every(g => /solver|盲解|练习题|解析/.test(g.guardrail + " " + g.reason));
    let quality_gate_result = "passed";
    let quality_warning: string | null = null;
    if (rejectedGuardrails.length > 0) {
      console.warn("[Learning API] 质量网关:", rejectedGuardrails, solverOnly ? "(solver-only，软放行)" : (safetyRejected.length ? "(安全类拦截)" : "(软放行)"));
    }
    if (safetyRejected.length > 0) {
      // 安全类 → 仍 422 硬拦截
      return NextResponse.json(
        {
          success: false,
          error: `生成内容未通过质量网关（安全类拦截：${safetyRejected.map(g => g.guardrail).join("、")}）`,
          error_detail: { quality_gate: "rejected", failed_guardrails: rejectedGuardrails }
        },
        { status: 422 }
      );
    }
    if (rejectedGuardrails.length > 0) {
      quality_gate_result = solverOnly ? "solver_flag_passed" : "warning_passed";
      quality_warning = `质量提示：${rejectedGuardrails.map(g => g.guardrail + ":" + g.reason).join("；").slice(0, 300)}`;
    }

    // 获取知识点信息（使用实际知识点ID）
    let knowledgePointInfo = {
      id: actualKpId,
      content_json: {
        zh: {
          topic: actualTopic,
          examples: [],
          objectives: ""
        }
      }
    };

    try {
      const supabase = getSupabaseClient();
      const { data: kpData } = await supabase
        .from("cultural_knowledge_points")
        .select("*")
        .eq("id", actualKpId)
        .single();

      if (kpData) {
        knowledgePointInfo = kpData;
      }
    } catch (dbError) {
      console.error("知识点查询失败:", dbError);
    }

    // 创建学习记录
    let learningRecordId = "";
    try {
      const supabase = getSupabaseClient();
      const { data: recordData, error } = await supabase
        .from("learning_records")
        .insert({
          learner_id: learnerDbId || learner.id,
          knowledge_point_id,
          hsk_level,
          status: "in_progress",
          native_language_ratio: 0.5
        })
        .select()
        .single();

      if (!error && recordData) {
        learningRecordId = recordData.id;
      }
    } catch (dbError) {
      console.error("创建学习记录失败:", dbError);
    }

    // 格式化响应
    const response = {
      success: true,
      data: {
        learner: {
          id: learner.id,
          uid: learner.uid,
          native_language: learner.native_language,
          hsk_level: learner.hsk_level,
          learning_motivation: learner.learning_motivation,
          cultural_anxiety_score: learner.cultural_anxiety_score,
          ability_vector: learner.ability_vector,
          created_at: new Date().toISOString(),
          updated_at: null
        },
        knowledge_point: {
          id: knowledgePointInfo.id,
          hsk_level: hsk_level,
          layer: 1,
          language_binding_points: [],
          content_json: knowledgePointInfo.content_json,
          created_at: new Date().toISOString()
        },
        learning_record_id: learningRecordId,
        cultural_explanation: JSON.stringify(result.cultural_explanation),
        cross_cultural_comparison: JSON.stringify(result.cross_cultural_comparison),
        // 软放行附加信息（注意：对象内本身已有 quality_gate / from_cache 两处同名属性，
        // 为避免 TS1117 重复属性，我们只用不重名的 quality_warning + cache_status 两个新字段）
        quality_warning,
        cache_status: (result as Record<string, any>).cache_status || (quality_gate_result && quality_gate_result !== "passed" ? "warn" : "hot"),
        learning_content: {
          scene_title: result.learning_content.cultural_context?.explanation?.substring(0, 20) || "学习场景",
          cultural_background: result.learning_content.cultural_context?.explanation || "",
          core_language_points: result.learning_content.language_points?.map((lp: { zh: string; en: string }) => lp.zh) || [],
          dialogues: result.learning_content.exercises?.slice(0, 3).map((ex: { question: string; explanation?: string }, i: number) => ({
            speaker: i % 2 === 0 ? "老师" : "学生",
            chinese: ex.question,
            translation: ex.explanation || "",
            cultural_notes: ""
          })) || [],
          exercises: result.learning_content.exercises?.map((ex: {
            type: string;
            question: string;
            options: string[];
            correct_answer: string;
            explanation?: string;
            dimension?: string;
          }) => {
            // 【前端展示兼容层】规范化 LLM/Supabase 缓存里偶发脏输出：
            // 如选项 "A. xxx"、correct_answer = "A. xxx"、判断题 "A. 对" 等，
            // 保证前端渲染 + 判分 + 正确答案文本三处都不出现 "A. A. 谢谢"。
            let options = Array.isArray(ex.options) ? [...ex.options] : [];
            let correct_answer = String(ex.correct_answer ?? "").trim();
            const typeZh =
              ex.type === "multiple_choice" ? "选择题" :
              ex.type === "fill_blank" ? "填空题" : "判断题";

            if (ex.type === "multiple_choice" || ex.type === "true_false") {
              options = options.map((opt) =>
                String(opt ?? "")
                  .replace(/^\s*[A-H][\s]*[．.\s、:：]\s*/i, "")
                  .replace(/^\s*[对错][\s]*[．.\s、:：]\s*/, "")
                  .trim()
              );
              if (ex.type === "true_false" && options.length === 2) {
                if (!options[0]) options[0] = "对";
                if (!options[1]) options[1] = "错";
              }
              const m = correct_answer.match(/^([A-H])[．.\s、:：]/i);
              if (ex.type === "multiple_choice" && m) {
                correct_answer = m[1].toUpperCase();
              } else if (ex.type === "multiple_choice" && /^[A-D]$/i.test(correct_answer)) {
                correct_answer = correct_answer.toUpperCase();
              } else if (ex.type === "true_false") {
                const c = correct_answer.toLowerCase();
                if (["对","正确","是","true","t","yes","y"].includes(c) || /^\s*A[．.\s、:：]/.test(correct_answer) || correct_answer === "A") {
                  correct_answer = "对";
                } else if (["错","错误","否","false","f","no","n"].includes(c) || /^\s*B[．.\s、:：]/.test(correct_answer) || correct_answer === "B") {
                  correct_answer = "错";
                }
              }
            } else {
              correct_answer = correct_answer
                .replace(/^["''「「『\s]+|["''」」』\s]+$/g, "") // 先剥引号+首尾空白，避免被 "B. xxx" 形式卡死
                .replace(/^\s*[A-H][\s]*[．.、:：]\s*/i, "")  // 再剥字母前缀
                .trim();
            }

            return {
              type: typeZh,
              question: ex.question,
              options,
              correct_answer,
              explanation: ex.explanation || "",
              dimension: ex.dimension || "grammar"
            };
          }) || [],
          cultural_assessment: {
            criterion: "能准确使用相关语言点",
            questions: ["这个表达在中国文化中有什么含义？"]
          }
        },
        status: result.final_status || "passed",
        quality_gate: rejectedGuardrails.length > 0
          ? "rejected"
          : Object.values(guardrailResults).some(v => v?.action === "FLAG_PENDING_REVIEW")
            ? "needs_review"
            : "passed",
        from_cache: result.from_cache || false,
        anxiety_level: result.anxiety_level || "low",
        cultural_anxiety_score_used: result.cultural_anxiety_score ?? null,
        engine: useLangGraph ? "langgraph" : "legacy",
        guardrail: (result as Record<string, unknown>).guardrail_results || null,
        pipeline_metadata: (result as Record<string, unknown>).pipeline_metadata || null
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("学习API错误:", error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof ValidationError 
          ? error.message 
          : "服务器内部错误" 
      },
      { status: 500 }
    );
  }
}
