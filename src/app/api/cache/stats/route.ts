/**
 * 缓存池健康度 API
 * GET /api/cache/stats?hsk_level=3
 */

import { NextRequest, NextResponse } from "next/server";
import { CacheManager } from "@/storage/cache/cache-manager";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hskLevelStr = searchParams.get("hsk_level");
    const hskLevel = hskLevelStr ? parseInt(hskLevelStr, 10) : undefined;

    if (hskLevel !== undefined && (isNaN(hskLevel) || hskLevel < 1 || hskLevel > 9)) {
      return NextResponse.json(
        { success: false, error: "hsk_level 必须是 1-9" },
        { status: 400 },
      );
    }

    const cache = CacheManager.getInstance();
    const stats = await cache.getStats(hskLevel);
    const activeList = await cache.bulkGetActive(hskLevel);

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        hsk_level: hskLevel ?? "all",
        active_entries: activeList.slice(0, 20).map((e) => ({
          knowledge_point_id: e.knowledge_point_id,
          hsk_level: e.hsk_level,
          scene_id: e.scene_id,
          confidence_score: e.confidence_score,
          votes: `${e.upvotes}↑/${e.downvotes}↓`,
          created_at: e.created_at,
        })),
      },
    });

  } catch (error) {
    console.error("[cache/stats] 异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 },
    );
  }
}
