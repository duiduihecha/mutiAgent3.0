/**
 * 学习路径推荐 API
 * GET /api/learners/[id]/recommendations?limit=5
 */

import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/learner-graph";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "5"), 10);

    const recommendations = await getRecommendations(id, limit);

    return NextResponse.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error("[API] 推荐查询失败:", error);
    return NextResponse.json(
      { success: false, error: "推荐查询失败" },
      { status: 500 },
    );
  }
}
