/**
 * 学习任务查询 API
 * GET /api/learning/jobs/{task_id}
 *
 * 返回任务状态 + 进度（百分比/阶段标签）+ 已完成模块标记 + 完整结果。
 * 前端可根据 progress 渲染渐进式进度条，根据 modules_done 决定哪些模块先显示。
 */
import { NextRequest, NextResponse } from "next/server";
import { getLearningTask, cleanupLearningTasks, STAGE_PROGRESS } from "@/lib/learning-task-store";

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

  const prog = STAGE_PROGRESS[task.stage] || { pct: 0, label: task.stage };

  // 如果已完成，进度 100
  const progressPct = task.status === "completed" ? 100 : prog.pct;

  // modules_done 从 partial 里取（backend onStage 回调写的）
  const partial = task.partial ?? {};
  const modulesDone = (partial as Record<string, unknown>).modules_done ?? {};

  return NextResponse.json({
    success: true,
    task: {
      id: task.id,
      status: task.status,
      stage: task.stage,
      progress: progressPct,
      stage_label: prog.label,
      modules_done: modulesDone,
      result: task.result ?? null,
      error: task.error ?? null,
      error_detail: task.error_detail ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
  });
}
