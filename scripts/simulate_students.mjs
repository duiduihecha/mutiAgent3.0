/**
 * 模拟留学生 agent —— CEO 用户测试自动化
 *
 * 用 LLM 扮演 N 个不同母语 / HSK 的外国留学生，按任务卡逐个走 /api/learning，
 * 再让同一 LLM 以"该留学生"的口吻写真实体验反馈并落盘 /api/feedback。
 * 用于在没有真实真人招募时，先跑通"产品就绪 → 走流程 → 反馈 → 聚合迭代"闭环。
 *
 * 前置：
 *   1. 在 .env 填好 LLM_TEST_API_KEY（kimi 网关密钥）
 *   2. 启动测试服务：pnpm dev:test   （监听 5000）
 *   3. 运行本脚本：node scripts/simulate_students.mjs
 *
 * 环境变量（均可不传，走默认值）：
 *   APP_BASE_URL      系统地址，默认 http://localhost:5000
 *   LLM_TEST_BASE_URL kimi 端点，默认 http://model.aicc.chinasoftinc.com/v1
 *   LLM_TEST_MODEL    模型，默认 kimi-k2.6
 *   LLM_TEST_API_KEY  密钥（必须填，否则反馈生成会失败）
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { requireApprovedLLMExecution } from './lib/llm-execution-gate.mjs';

// 运行时加载项目根 .env（仅本脚本程序自身读取环境变量，绝不打印密钥明文）。
// 裸 node 不会自动加载 .env，必须手动读；只补充未设置的变量，不覆盖已存在的环境变量。
function loadEnv() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(here, '..', '.env'); // scripts/../.env
    if (!existsSync(envPath)) return;
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* 忽略：没有 .env 就走默认值 */ }
}
loadEnv();

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5000";
const KIMI_URL = (process.env.LLM_TEST_BASE_URL || "http://model.aicc.chinasoftinc.com/v1").replace(/\/v1\/?$/, "") + "/v1/chat/completions";
const KIMI_MODEL = process.env.LLM_TEST_MODEL || "kimi-k2.6";
const KIMI_KEY = process.env.LLM_TEST_API_KEY || "";

// 留学生 persona：覆盖 ≥3 母语 + 不同 HSK，对应任务卡 T1~T5
const PERSONAS = [
  { alias: "Anna_RU",   native_language: "俄语",   hsk_level: 3, scene: "transport", task: "T1 问路：在北京街头问怎么去故宫" },
  { alias: "John_EN",   native_language: "英语",   hsk_level: 2, scene: "medical",   task: "T2 就医：感冒去医院挂号看医生" },
  { alias: "Yuki_JA",   native_language: "日语",   hsk_level: 4, scene: "food",      task: "T3 点餐：在餐厅点菜并用筷子吃饭" },
  { alias: "Minho_KO",  native_language: "韩语",   hsk_level: 1, scene: "festival",  task: "T4 节日：第一次过春节包饺子" },
  { alias: "Lucia_ES",  native_language: "西班牙语", hsk_level: 3, scene: "shopping",  task: "T5 购物：在商场砍价买纪念品" },
  { alias: "Omar_AR",   native_language: "阿拉伯语", hsk_level: 2, scene: "transport", task: "T1 问路：坐地铁去机场" },
];

const RATING_DIMS = [
  "ease_of_use", "native_explanation_clarity", "cultural_comparison_helpful",
  "cultural_comparison_accuracy", "exercise_quality", "content_accuracy", "overall_satisfaction",
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 自写 JSON 请求：绕过 Node 内置 fetch 的默认 300s headersTimeout。
// 系统 /api/learning 单次可能 >5min（多 Agent 串行 + kimi 慢），fetch 会在 300s 断开导致 fetch failed。
// 原生 http/https 默认无超时，避免这个问题。
function requestJson(urlStr, { method = "GET", body, headers = {}, timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? Buffer.from(body) : null;
    const req = lib.request(
      u,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": String(payload.length) } : {}),
          ...headers,
        },
        ...(timeout ? { timeout } : {}),
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (buf += d));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(buf); } catch {}
          resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, json, text: buf });
        });
      }
    );
    if (timeout) {
      req.on("timeout", () => {
        req.destroy(new Error(`请求超时 ${timeout}ms`));
      });
    }
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function callKimi(system, user, { maxTokens = 4096, retries = 4, timeout = 180000 } = {}) {
  requireApprovedLLMExecution('simulate_students');
  let lastRaw = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await requestJson(KIMI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${KIMI_KEY}` },
        timeout,
        body: JSON.stringify({
          model: KIMI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 1,
          // kimi-k2.6 是推理模型：会把 token 预算花在 reasoning_content 上，
          // 若 max_tokens 过小，content 来不及输出会被截断为空。4096 给足余量。
          max_tokens: maxTokens,
        }),
      });
      if (!r.ok) throw new Error(`kimi ${r.status}: ${(r.text || "").slice(0, 200)}`);
      // 推理模型偶尔把答案塞进 reasoning_content 而 content 为空，做兜底抽取
      const msg = r.json?.choices?.[0]?.message || {};
      const raw = (msg.content || msg.reasoning_content || "").trim();
      if (!raw) {
        lastRaw = raw;
        if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue; }
        throw new Error("kimi 返回空响应（网关限流/抖动），重试后仍为空");
      }
      return raw;
    } catch (e) {
      if (attempt < retries) { await sleep(3000); continue; }
      throw e;
    }
  }
  throw new Error("kimi 调用失败");
}

/**
 * 从 LLM 输出中稳健抽取 JSON 对象。
 * kimi 偶发包裹 ```json 围栏、或在末尾出现多余尾逗号，直接 JSON.parse 会失败。
 * 策略：剥离围栏 → 取首个 { 到末个 } → 去尾逗号 → 重试 parse。
 */
function extractJson(text) {
  if (!text) return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) {
    let chunk = s.slice(first, last + 1);
    chunk = chunk.replace(/,(\s*[}\]])/g, "$1"); // 去尾逗号
    try { return JSON.parse(chunk); } catch { /* fall through */ }
  }
  return null;
}

// 走系统：调 /api/learning（用 requestJson 避免 300s 默认超时）
async function runLearning(p) {
  const r = await requestJson(`${APP_BASE_URL}/api/learning`, {
    method: "POST",
    body: JSON.stringify({
      knowledge_point_id: p.scene,
      hsk_level: p.hsk_level,
      native_language: p.native_language,
      scene_keywords: [p.task],
      use_langgraph: true,
    }),
  });
  if (!r.json?.success) throw new Error(`learning 失败: ${r.json?.error || r.status}`);
  return r.json.data;
}

// 让 LLM 扮演该留学生，基于生成内容写反馈
async function genFeedback(p, learningData) {
  const sys = `你是母语为${p.native_language}、HSK${p.hsk_level}级的来华留学生，正在体验一款中文学习APP。请完全用你的留学生口吻（可带一点不熟练的中文或母语思维）写真实体验反馈。不要客套，要具体、有细节、敢批评。只输出严格 JSON，不要 Markdown。`;
  const snippet = JSON.stringify({
    cultural_explanation: (learningData.cultural_explanation || "").slice(0, 600),
    cross_cultural_comparison: (learningData.cross_cultural_comparison || "").slice(0, 600),
    learning_content: {
      cultural_background: learningData.learning_content?.cultural_background || "",
      exercises_count: (learningData.learning_content?.exercises || []).length,
    },
  });
  const user = `我刚才完成的任务：${p.task}
系统给我的内容（节选）：${snippet}

请输出 JSON：
{
  "ratings": {
    "ease_of_use": 1-5整数,
    "native_explanation_clarity": 1-5整数,
    "cultural_comparison_helpful": 1-5整数,
    "cultural_comparison_accuracy": 1-5整数,
    "exercise_quality": 1-5整数,
    "content_accuracy": 1-5整数,
    "overall_satisfaction": 1-5整数
  },
  "free_text": {
    "what_liked": "我喜欢的点（中文，具体）",
    "what_confused": "我困惑/看不懂的地方",
    "felt_offended_or_wrong": "有没有觉得被冒犯、或内容有明显错误/胡说（没有就写无）",
    "suggestions": "改进建议"
  }
}`;
  let parsed = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await callKimi(sys, user);
    parsed = extractJson(raw);
    if (parsed && parsed.ratings) break;
    console.warn(`  [genFeedback] 第 ${attempt + 1} 次解析失败，raw 前 200 字: ${raw.slice(0, 200)}`);
    await sleep(2500);
  }
  if (!parsed || !parsed.ratings) {
    throw new Error("反馈 JSON 解析失败");
  }
  return parsed;
}

async function postFeedback(p, fb) {
  const ratings = {};
  for (const k of RATING_DIMS) {
    const v = Number(fb.ratings?.[k]);
    if (Number.isFinite(v)) ratings[k] = Math.max(1, Math.min(5, Math.round(v)));
  }
  const r = await requestJson(`${APP_BASE_URL}/api/feedback`, {
    method: "POST",
    body: JSON.stringify({
      native_language: p.native_language,
      hsk_level: p.hsk_level,
      alias: p.alias,
      scene: p.scene,
      knowledge_point: p.scene,
      ratings,
      free_text: fb.free_text || {},
      lang: "zh",
    }),
  });
  if (!r.json?.success) throw new Error(`feedback 失败: ${r.json?.error || r.status}`);
  return r.json.id;
}

async function main() {
  if (!KIMI_KEY) {
    console.error("✗ LLM_TEST_API_KEY 未设置，无法生成反馈。请先在 .env 填好密钥。");
    process.exit(1);
  }
  console.log(`▶ 模拟 ${PERSONAS.length} 名留学生走系统（${APP_BASE_URL}）`);
  let ok = 0;
  // 分批并发（每批 3 人），缩短总时长。kimi 慢，单请求 ~5-8min，串行 6 人需 ~48min；
  // 并发 3 后约 ~16min。ok 计数在单线程事件循环内同步自增，无竞态。
  // kimi 网关在并发下易限流→空响应（重试也救不回），故改回串行最稳。
  // 当前 dev 已被首个请求预热（冷启动编译完成），后续单次约 100-300s，串行 6 人约 15-20min。
  const CONCURRENCY = 1;
  const MAX_TRIES = 3; // 单 persona 偶发空响应/超时最多重试 3 次（kimi 网关抖动兜底）

  // 跳过已落盘的 persona（feedback 端点为 append-only，避免重复写入）
  const doneAliases = new Set();
  try {
    const f = readFileSync("data/feedback.jsonl", "utf8");
    for (const line of f.split("\n")) {
      try { const o = JSON.parse(line); if (o?.learner?.alias) doneAliases.add(o.learner.alias); } catch {}
    }
    if (doneAliases.size) console.log(`[skip] 已落盘 ${doneAliases.size} 人，跳过: ${[...doneAliases].join(", ")}`);
  } catch {}

  for (let i = 0; i < PERSONAS.length; i += CONCURRENCY) {
    const batch = PERSONAS.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (p) => {
      if (doneAliases.has(p.alias)) {
        console.log(`[skip] ${p.alias} 已完成，跳过`);
        return;
      }
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        try {
          console.log(`\n[${p.alias}] ${p.native_language} HSK${p.hsk_level} · ${p.task}${attempt > 1 ? ` (重试 ${attempt}/${MAX_TRIES})` : ""}`);
          const learning = await runLearning(p);
          console.log(`  ✓ learning 成功（engine=${learning.engine}, quality_gate=${learning.quality_gate}）`);
          await sleep(500);
          const fb = await genFeedback(p, learning);
          const id = await postFeedback(p, fb);
          const avg = (Object.values(fb.ratings || {}).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(fb.ratings || {}).length)).toFixed(2);
          console.log(`  ✓ feedback 已落盘 id=${id} 均分=${avg}`);
          ok++;
          return;
        } catch (e) {
          lastErr = e;
          console.error(`  ✗ ${p.alias} 第 ${attempt} 次失败: ${e.message}`);
          if (attempt < MAX_TRIES) await sleep(3000);
        }
      }
      console.error(`  ✗✗ ${p.alias} 重试 ${MAX_TRIES} 次仍失败，跳过: ${lastErr?.message}`);
    }));
    await sleep(800);
  }
  console.log(`\n完成：${ok}/${PERSONAS.length} 名留学生反馈已写入 data/feedback.jsonl`);
  console.log("下一步：python3 scripts/aggregate_feedback.py  查看维度均分与高危项");
}

main().catch((e) => { console.error(e); process.exit(1); });
