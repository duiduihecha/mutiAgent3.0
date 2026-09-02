// ==============================================================
// 方案三 · A2 Few-shot 召回器
//
// 召回三档瀑布：
//   Tier-A（精确命中）：同语言 + 同焦虑档 + 同场景 → 全拿，取 topN。
//   Tier-B（文化圈近似）：同焦虑档 + 同场景，语言文化圈近邻集合里挑 topN。
//        近邻关系：{en,es,fr} 拉丁文化圈近邻；{ja,ko,th} 东亚/东南亚近邻；
//                 {ar,ru} 独立文化圈（无近邻，直接降级到全局）。
//   Tier-C（焦虑档全局兜底）：同焦虑档，任何语言、任何场景，取关键词交集 topN。
//
// 所有层最终再做一轮「coverage_tags ∩ scene_keywords」交集打分（越匹配该 KP 的关键词，
// 权重越高），并过滤掉 HSK 范围不兼容的样本。
// ==============================================================

import type { GoldenExample } from "./a2-fewshot-bank";
import {
  A2_FEWSHOT_BANK,
  A2_FEWSHOT_SUPPORTED_LANGS,
  A2_FEWSHOT_SCENE_TAGS,
} from "./a2-fewshot-bank";
import type { AnxietyTier } from "./a2-ratio-calibrator";
import { getSceneType } from "../constants";

export interface GoldenQuery {
  langCode: string;
  hsk_level: number;
  anxietyTier: AnxietyTier;
  /** 当前场景关键词（由 KP topic / cultural_points 展开），至少带 kp_id 一个。 */
  scene_keywords: string[];
  targetLangNaturalName: string;
  /** fallback topic（没 cultural_points 时用）。 */
  kpTopic: string;
  /** 图谱母语文化圈 home culture id（预留，现在只做"是否匹配 bank 样本 id 含 -X-"的轻过滤）。 */
  graphHomeCultureId?: string;
  /** 返回条数，默认 3。 */
  topN?: number;
}

const CULTURAL_CIRCLE: Record<string, string[]> = {
  en: ["en", "es", "fr"],
  es: ["es", "en", "fr", "pt"],
  fr: ["fr", "en", "es"],
  pt: ["pt", "es", "en"],
  ja: ["ja", "ko", "th", "zh"],
  ko: ["ko", "ja", "zh", "th"],
  th: ["th", "ja", "ko", "vi", "id"],
  vi: ["vi", "th", "id", "ja"],
  id: ["id", "vi", "th", "ms"],
  ms: ["ms", "id"],
  ar: ["ar"],
  ru: ["ru"],
  zh: ["zh"],
};

function hskRangeCompatible(range: string, lvl: number): boolean {
  // range: "1-3"/"4-6"/"7-9"
  const m = range.match(/^(\d+)-(\d+)$/);
  if (!m) return true;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  return lvl >= lo && lvl <= hi;
}

function overlapScore(tags: readonly string[], keywords: readonly string[]): number {
  const kwn = keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  if (kwn.length === 0) return 0;
  let s = 0;
  for (const t of tags) {
    const tt = String(t).toLowerCase();
    for (const k of kwn) {
      if (!k) continue;
      if (tt === k) s += 3;
      else if (tt.includes(k) || k.includes(tt)) s += 1;
    }
  }
  return s;
}

/** 把输入的 scene_keywords + kpTopic 映射到一个"场景 id 近似值"，用于 Tier-A/B 匹配。 */
function detectSceneFromQuery(q: GoldenQuery): string {
  const union = [q.kpTopic, ...(q.scene_keywords || [])].filter(Boolean);
  // 尝试走已有的 constants getSceneType（允许直接输入 scene_id 本身）
  if (q.scene_keywords && q.scene_keywords[0]) {
    try {
      const by = getSceneType(q.scene_keywords[0], q.scene_keywords);
      if (by) return by;
    } catch {
      /* ignore */
    }
  }
  // 扫一遍 scene_tags 找最大交集
  let bestScene = "daily";
  let bestScore = 0;
  for (const [scene, tags] of Object.entries(A2_FEWSHOT_SCENE_TAGS) as Array<[string, string[]]>) {
    const s = overlapScore(tags, union);
    if (s > bestScore) {
      bestScore = s;
      bestScene = scene;
    }
  }
  return bestScene;
}

export function retrieveGoldenExamples(q: GoldenQuery): GoldenExample[] {
  const topN = q.topN ?? 3;
  if (!q.langCode) return [];
  const scene = detectSceneFromQuery(q);
  const allPool = A2_FEWSHOT_BANK.filter((s) => hskRangeCompatible(s.hsk_range, q.hsk_level));

  // Tier-A: exact（同语言 + 同焦虑 + 同场景）
  let pool = allPool.filter(
    (s) => s.lang_code === q.langCode && s.anxiety_level === q.anxietyTier && s.scene_type === scene,
  );
  if (pool.length === 0) {
    // Tier-B: 近邻语言 + 同焦虑 + 同场景
    const neighbors = CULTURAL_CIRCLE[q.langCode] || [];
    if (neighbors.length > 1) {
      pool = allPool.filter(
        (s) =>
          s.anxiety_level === q.anxietyTier &&
          s.scene_type === scene &&
          neighbors.includes(s.lang_code),
      );
    }
  }
  if (pool.length === 0) {
    // Tier-C: 同焦虑档（任何语言/场景）—— 兜底
    pool = allPool.filter((s) => s.anxiety_level === q.anxietyTier);
  }
  if (pool.length === 0) {
    // 最终兜底：全库 topN 关键词交集
    pool = allPool.slice();
  }

  const union = [q.kpTopic, ...(q.scene_keywords || [])].filter(Boolean);
  const scored = pool
    .map((s) => {
      let score = overlapScore(s.coverage_tags, union);
      // exact language 加 4 分，exact scene 再加 4 分（避免 Tier-C 时被不相关样本反超）
      if (s.lang_code === q.langCode) score += 4;
      if (s.scene_type === scene) score += 4;
      // graphHomeCultureId 命中时加 2 分
      if (q.graphHomeCultureId && s.id.includes(q.graphHomeCultureId)) score += 2;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.s);

  return scored;
}

/**
 * 把 retrieveGoldenExamples 的结果拼成 Prompt XML 块（可直接塞进 buildA2SystemPrompt.golden_examples_block）。
 * 每条样本以 <golden_example_N> <input_quadrant>…</input_quadrant> <output_json>…</output_json> 包裹。
 * 返回 undefined 当且仅当：召回 0 条 或 配置 A2_USE_FEWSHOT=false。
 */
export function getA2GoldenExamplesBlock(q: GoldenQuery): string | undefined {
  if (process.env.A2_USE_FEWSHOT === "false") return undefined;
  const list = retrieveGoldenExamples(q);
  if (!list || list.length === 0) return undefined;
  const blocks: string[] = [];
  list.forEach((s, i) => {
    const quadrant = [
      `language = ${s.lang_code}`,
      `anxiety_level = ${s.anxiety_level}`,
      `scene_type = ${s.scene_type}`,
      `hsk_range = ${s.hsk_range}`,
      `coverage_tags = ${s.coverage_tags.join(", ") || "(none)"}`,
      `target_ratio_expect = ${(RATIO_TARGET_DISPLAY[s.anxiety_level] || s.golden_ratio)}`,
    ].join(" | ");
    const out = JSON.stringify(s.golden_explanation, null, 2);
    blocks.push(
      `<golden_example_${i + 1}>\n` +
        `<input_quadrant>${quadrant}</input_quadrant>\n` +
        `<output_json>\n${out}\n</output_json>\n` +
        `</golden_example_${i + 1}>`,
    );
  });
  return blocks.join("\n\n");
}

const RATIO_TARGET_DISPLAY: Record<AnxietyTier, number> = {
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

// Avoid TS "unused" lint for import side-effects: export the supported langs/tags for tests.
export const __TEST_HELPERS = {
  detectSceneFromQuery,
  overlapScore,
  hskRangeCompatible,
  SUPPORTED_LANGS: A2_FEWSHOT_SUPPORTED_LANGS,
};
