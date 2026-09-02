import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const sb = createClient(
  process.env.COZE_SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

(async () => {
  const { data, error } = await sb
    .from("cultural_knowledge_points")
    .select("id, hsk_level, language_binding_points, content_json")
    .or("content_json->zh->>topic.ilike.%校园%,content_json->zh->>topic.ilike.%campus%")
    .limit(20);

  if (error) {
    console.error("ERR", error.message);
    return;
  }
  console.log("匹配行数:", (data || []).length);
  for (const r of data || []) {
    const cj = typeof r.content_json === "string" ? JSON.parse(r.content_json) : r.content_json;
    const zh = cj?.zh || {};
    console.log("ID:", r.id);
    console.log("  topic:", zh.topic);
    console.log("  description:", String(zh.description || "").slice(0, 140));
    console.log("  cultural_points:", JSON.stringify(zh.cultural_points || cj?.cultural_points || "NONE"));
    console.log("  language_binding_points:", JSON.stringify(r.language_binding_points));
    console.log("---");
  }
})();
