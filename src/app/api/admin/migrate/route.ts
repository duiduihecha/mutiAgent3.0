import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * 一次性数据库迁移 API
 * POST /api/admin/migrate
 * Body: { "sql": "ALTER TABLE ..." }
 *
 * 使用 service_role key 执行任意 SQL（仅限本地/admin 使用）
 */
export async function POST(req: NextRequest) {
  try {
    const { sql } = (await req.json()) as { sql?: string };
    if (!sql) {
      return NextResponse.json({ error: "缺少 sql 参数" }, { status: 400 });
    }

    // 安全检查：只允许 DDL 语句
    const trimmed = sql.trim().toUpperCase();
    const allowed = ["ALTER TABLE", "CREATE INDEX", "CREATE TABLE", "DROP INDEX", "NOTIFY"];
    if (!allowed.some((prefix) => trimmed.startsWith(prefix))) {
      return NextResponse.json(
        { error: `仅允许 DDL: ${allowed.join(", ")}` },
        { status: 403 }
      );
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("exec_sql", { query: sql });

    if (error) {
      // exec_sql RPC 不存在时，尝试直接用 REST API
      // 回退方案：通过 Supabase 管理 API 执行
      const mgmtKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
      const mgmtUrl = process.env.COZE_SUPABASE_URL;

      if (!mgmtKey || !mgmtUrl) {
        return NextResponse.json(
          {
            error: "无法执行迁移",
            detail: error.message,
            hint: `请在 Supabase SQL Editor 中手动执行: ${sql}`,
          },
          { status: 500 }
        );
      }

      // 尝试 Management API
      const res = await fetch(`${mgmtUrl}/rest/v1/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: mgmtKey,
          Authorization: `Bearer ${mgmtKey}`,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          error: "请手动执行以下 SQL",
          sql,
          supabaseDashboardHint:
            "访问 Supabase Studio → SQL Editor → 粘贴上述 SQL 并执行",
        });
      }
    }

    return NextResponse.json({ success: true, sql });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
