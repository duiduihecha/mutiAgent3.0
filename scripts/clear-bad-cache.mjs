// 清理 llm_content_cache 中指定知识点的坏缓存（A2 步骤）
// 用法（在 Mac 本地项目根目录执行）：
//   node scripts/clear-bad-cache.mjs
// 脚本会先打印将要删除的行，再执行删除，最后打印剩余数量。

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

// --- 手动加载 .env（避免依赖 dotenv 包）---
async function loadEnv() {
  const rl = createInterface({ input: createReadStream(".env") });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

await loadEnv();

const url = process.env.COZE_SUPABASE_URL;
const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("缺少 COZE_SUPABASE_URL 或 COZE_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const KP = process.argv[2] || "daily_greet_basic";

// 1) 先列出将删除的行（只读，透明）
const { data: rows, error: selErr } = await supabase
  .from("llm_content_cache")
  .select("knowledge_point_id, hsk_level, scene_id, status, confidence_score")
  .eq("knowledge_point_id", KP);

if (selErr) {
  console.error("查询失败:", selErr.message);
  process.exit(1);
}

console.log(`\n[即将删除] knowledge_point_id=${KP} 的缓存行（共 ${rows.length} 条）:`);
for (const r of rows) {
  console.log(
    `  - kp=${r.knowledge_point_id} hsk=${r.hsk_level} scene=${r.scene_id} status=${r.status} confidence=${r.confidence_score}`
  );
}

if (rows.length === 0) {
  console.log("没有需要删除的坏缓存，退出。");
  process.exit(0);
}

// 2) 执行删除
const { error: delErr } = await supabase
  .from("llm_content_cache")
  .delete()
  .eq("knowledge_point_id", KP);

if (delErr) {
  console.error("删除失败:", delErr.message);
  process.exit(1);
}
console.log(`\n[已删除] ${rows.length} 条坏缓存。下次请求将走冷生成（使用修复后的 A4 prompt）。`);

// 3) 确认剩余
const { count } = await supabase
  .from("llm_content_cache")
  .select("*", { count: "exact", head: true })
  .eq("knowledge_point_id", KP);
console.log(`[剩余] knowledge_point_id=${KP} 的缓存行数: ${count}`);
