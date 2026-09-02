/**
 * 学习任务提交 API（异步模式）
 * POST /api/learning/jobs
 *
 * 秒级返回 task_id，实际学习流程由后台任务执行（见 learning-task-store.runLearningJob），
 * 前端通过 GET /api/learning/jobs/{task_id} 轮询进度/结果。
 * 解决 Cloudflare 隧道/代理对同步长请求（3-8 分钟）的 ~100s 响应超时限制。
 */
import { NextRequest, NextResponse } from "next/server";
import { LearnerProfile, getKnowledgePointByScene } from "@/lib/multi-agent-system";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import {
  createLearningTask,
  hasRunningTaskForLearner,
  runLearningJob,
  cleanupLearningTasks,
} from "@/lib/learning-task-store";

export const runtime = "nodejs";
export const maxDuration = 60; // 提交本身秒级，给足余量即可

// 基础限流：每 IP 每分钟最多 N 次提交（内存实现，单实例够用）
const RATE_LIMIT_PER_MIN = Number(process.env.LEARNING_RATE_LIMIT_PER_MIN || 6);
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
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

const DEFAULT_LEARNER_PROFILE: LearnerProfile = {
  id: "",
  uid: "",
  native_language: "英语",
  hsk_level: 1,
  learning_motivation: "interest",
  cultural_anxiety_score: 50,
  ability_vector: [50, 50, 50, 50, 50],
};

export async function POST(request: NextRequest) {
  // 顺手清理过期任务
  cleanupLearningTasks();

  // 限流
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const {
    learner_id,
    knowledge_point_id,
    hsk_level = 1,
    native_language = "英语",
    learning_motivation = "interest",
    scene_keywords = [],
  } = body as {
    learner_id?: string;
    knowledge_point_id?: string;
    hsk_level?: number;
    native_language?: string;
    learning_motivation?: string;
    scene_keywords?: string[];
  };

  if (!knowledge_point_id) {
    return NextResponse.json({ success: false, error: "缺少知识点ID" }, { status: 400 });
  }

  // learning_motivation 在 LearnerProfile 中是受限联合类型，这里安全收窄
  const motivation = (learning_motivation ?? "interest") as LearnerProfile["learning_motivation"];

  try {
    // ===== 场景 → 知识点映射（秒级） =====
    const isSceneId = !knowledge_point_id.includes("-");
    let actualKpId = knowledge_point_id;
    let actualTopic = knowledge_point_id;
    if (isSceneId) {
      const kpInfo = await getKnowledgePointByScene(knowledge_point_id);
      if (kpInfo) {
        actualKpId = kpInfo.knowledge_point_id;
        actualTopic = kpInfo.topic;
        console.log(`[LearningJob] 场景映射 → ${actualKpId} (${actualTopic})`);
      }
    }

    // ===== 获取或创建学习者（秒级） =====
    let learner: LearnerProfile = { ...DEFAULT_LEARNER_PROFILE, hsk_level };
    let learnerDbId = "";

    if (learner_id && learner_id !== "new") {
      const supabase = getSupabaseClient();
      const { data: learnerData, error } = await supabase
        .from("learners")
        .select("*")
        .eq("id", learner_id)
        .single();

      if (error || !learnerData) {
        return NextResponse.json(
          { success: false, error: `学习者ID "${learner_id}" 不存在，请重新开始学习` },
          { status: 404 }
        );
      }
      learner = {
        id: learnerData.id,
        uid: learnerData.uid,
        native_language: native_language || learnerData.native_language,
        hsk_level: hsk_level || learnerData.hsk_level,
        learning_motivation: learnerData.learning_motivation || "interest",
        cultural_anxiety_score: learnerData.cultural_anxiety_score || 50,
        ability_vector: learnerData.ability_vector || [50, 50, 50, 50, 50],
      };
      learnerDbId = learnerData.id;
    } else {
      const supabase = getSupabaseClient();
      const newLearnerUid = `learner_${Date.now()}`;
      const { data, error } = await supabase
        .from("learners")
        .insert({
          uid: newLearnerUid,
          native_language,
          hsk_level,
          learning_motivation: motivation,
          cultural_anxiety_score: 50,
          ability_vector: [50, 50, 50, 50, 50],
        })
        .select()
        .single();
      if (error || !data) {
        console.error("创建学习者失败:", error);
        return NextResponse.json({ success: false, error: "创建学习者失败，请稍后重试" }, { status: 503 });
      }
      learner = {
        id: data.id,
        uid: data.uid,
        native_language,
        hsk_level,
        learning_motivation: motivation,
        cultural_anxiety_score: 50,
        ability_vector: [50, 50, 50, 50, 50],
      };
      learnerDbId = data.id;
    }

    // ===== 并发限制：同一 learner 同时最多 1 个进行中的任务 =====
    if (hasRunningTaskForLearner(learner.id)) {
      return NextResponse.json(
        { success: false, error: "您有一个学习任务正在进行中，请等待完成后再试" },
        { status: 429 }
      );
    }

    // ===== 创建任务（幂等：同参数窗口内复用） =====
    const { task, reused } = createLearningTask({
      learner,
      learnerDbId,
      knowledge_point_id,
      actual_kp_id: actualKpId,
      actual_topic: actualTopic,
      scene_keywords,
      hsk_level,
      native_language,
    });

    if (!reused) {
      // 后台启动执行器（fire-and-forget，next start 单进程常驻可跑完）
      runLearningJob(task.id);
      console.log(`[LearningJob] 任务已提交: ${task.id} kp=${actualKpId} lang=${native_language}`);
    }

    return NextResponse.json({
      success: true,
      task_id: task.id,
      status: task.status,
      reused,
    });
  } catch (error) {
    console.error("[LearningJob] 提交失败:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
