/**
 * 学习任务查询 API
 * GET /api/learning/jobs/{task_id}
 *
 * 返回任务状态（queued/running/completed/failed）、当前阶段（a1/a2a3/a4/a5/guardrail/saving）、
 * 完成后的完整结果（结构与旧同步 POST /api/learning 的 data 一致）、失败原因。
 */
import { NextRequest, NextResponse } from "next/server";
import { getLearningTask, cleanupLearningTasks } from "@/lib/learning-task-store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  cleanupLearningTasks();
  const { id } = await params;

  const task = getLearningTask(id);
  if (!task) {
    return NextResponse.json({ success: false, error: "任务不存在或已过期" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    task: {
      id: task.id,
      status: task.status,
      stage: task.stage,
      result: task.result ?? null,
      error: task.error ?? null,
      error_detail: task.error_detail ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
  });
}
