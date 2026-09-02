/**
 * 缓存投票 API
 * POST /api/cache/vote — 用户对缓存内容点赞/踩
 */

import { NextRequest, NextResponse } from "next/server";
import { CacheManager } from "@/storage/cache/cache-manager";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      knowledge_point_id,
      hsk_level,
      scene_id = "general",
      is_upvote,
    } = body;

    if (!knowledge_point_id) {
      return NextResponse.json(
        { success: false, error: "缺少 knowledge_point_id" },
        { status: 400 },
      );
    }

    if (typeof hsk_level !== "number" || hsk_level < 1 || hsk_level > 9) {
      return NextResponse.json(
        { success: false, error: "hsk_level 必须是 1-9 的整数" },
        { status: 400 },
      );
    }

    if (typeof is_upvote !== "boolean") {
      return NextResponse.json(
        { success: false, error: "is_upvote 必须是 boolean" },
        { status: 400 },
      );
    }

    const cache = CacheManager.getInstance();
    const result = await cache.vote(knowledge_point_id, hsk_level, scene_id, is_upvote);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("[cache/vote] 异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 },
    );
  }
}
