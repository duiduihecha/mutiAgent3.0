import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// CEO 用户测试用：留学生体验反馈收集端点。
// 存储：项目根 data/feedback.jsonl（每行一条 JSON，append-only）。
// 不走 Supabase，零外部依赖，方便离线/本机测试直接落盘。

const DATA_DIR = path.join(process.cwd(), "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.jsonl");

// 评分维度（1-5）。与系统组件一一对应，便于定位缺陷。
const RATING_KEYS = [
  "ease_of_use", // 易用性
  "native_explanation_clarity", // A2 母语阐释清楚度
  "cultural_comparison_helpful", // A3 文化对比有用性
  "cultural_comparison_accuracy", // A3 准确性/是否冒犯
  "exercise_quality", // A4 练习题质量/难度合适
  "content_accuracy", // 内容准确性（有无胡说）
  "overall_satisfaction", // 整体满意度
] as const;

type RatingKey = (typeof RATING_KEYS)[number];

function clampRating(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 基础校验
    const native_language = String(body.native_language || "").trim();
    if (!native_language) {
      return NextResponse.json(
        { success: false, error: "native_language 必填（学习者母语）" },
        { status: 400 }
      );
    }

    const ratings: Partial<Record<RatingKey, number>> = {};
    for (const k of RATING_KEYS) {
      const c = clampRating(body.ratings?.[k]);
      if (c !== null) ratings[k] = c;
    }

    const record = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      learner: {
        native_language,
        hsk_level: body.learner?.hsk_level ?? body.hsk_level ?? null,
        alias: body.learner?.alias ?? body.alias ?? null,
      },
      session: {
        knowledge_point:
          body.session?.knowledge_point ?? body.knowledge_point ?? null,
        scene: body.session?.scene ?? body.scene ?? null,
      },
      ratings,
      free_text: {
        what_liked: String(body.free_text?.what_liked ?? body.what_liked ?? "").trim(),
        what_confused: String(body.free_text?.what_confused ?? body.what_confused ?? "").trim(),
        felt_offended_or_wrong: String(
          body.free_text?.felt_offended_or_wrong ?? body.felt_offended_or_wrong ?? ""
        ).trim(),
        suggestions: String(body.free_text?.suggestions ?? body.suggestions ?? "").trim(),
      },
      meta: {
        lang: body.lang ?? "zh",
        user_agent: request.headers.get("user-agent") ?? null,
      },
    };

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(FEEDBACK_FILE, JSON.stringify(record) + "\n", "utf8");

    return NextResponse.json({ success: true, id: record.id });
  } catch (error) {
    console.error("[feedback] 写入失败:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    let raw = "";
    try {
      raw = await fs.readFile(FEEDBACK_FILE, "utf8");
    } catch {
      return NextResponse.json({ success: true, count: 0, items: [] });
    }
    const items = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
