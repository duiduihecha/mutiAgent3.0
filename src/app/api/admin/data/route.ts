import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ORDER_COLUMN: Record<string, string> = {
  learners: "created_at",
  learning_records: "completed_at",
  assessment_records: "assessed_at",
  cultural_explanations: "created_at",
  cross_cultural_comparisons: "created_at",
  cultural_knowledge_points: "created_at",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table") || "learners";

  const allowedTables = Object.keys(ORDER_COLUMN);

  if (!allowedTables.includes(table)) {
    return NextResponse.json({ error: `不允许的表: ${table}。允许: ${allowedTables.join(", ")}` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    const orderCol = ORDER_COLUMN[table] || "created_at";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderCol, { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ table, count: data?.length || 0, rows: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
