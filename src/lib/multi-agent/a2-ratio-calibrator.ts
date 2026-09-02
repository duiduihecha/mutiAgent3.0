// ==============================================================
// 方案三 · A2 母语占比本地校准器（99% 场景 0 次额外 LLM 调用）
//
// 单一真相源：焦虑档 → 字段角色（母语/中文/混合） + 每字段字符预算。
// 此表同时被 Prompt 三钉之「NATIVE_WORD_BUDGET」引用，确保 LLM 生成时的"预算承诺"
// 与校准器后处理的"预算执行"口径完全一致 —— KPI 在消融实验（θ₃ vs 方案三）可比。
// ==============================================================

import { countCjkChars, truncateToSentenceBudget } from "./utils";
import type { AgentError } from "./errors";

export type AnxietyTier = "high" | "medium" | "low";

export interface FieldBudget {
  /** cultural_explanation 的顶级字段名。支持 string / Array / 对象数组。 */
  key: string;
  /** 内容语义角色（决定它计入「母语占比」的哪一边）。 */
  role: "native" | "chinese" | "mixed";
  /** 软预算字符数（UTF-16 长度）。 */
  budget: number;
}

export interface RatioBudget {
  tier: AnxietyTier;
  target_ratio: number;
  fields: FieldBudget[];
}

/** 焦虑档 → 字段预算表（与 θ₃ 的 getSlotStructure.target_ratio 在档位边界点上严格相同：0.75/0.50/0.25）。 */
export const RATIO_BUDGET_BY_TIER: Record<AnxietyTier, RatioBudget> = {
  high: {
    tier: "high",
    target_ratio: 0.75,
    fields: [
      { key: "precise_definition", role: "native", budget: 240 },
      { key: "scene_introduction", role: "native", budget: 260 },
      { key: "pragmatic_rules", role: "native", budget: 260 },
      { key: "taboo_warnings", role: "native", budget: 180 },
      { key: "difficulty_notes", role: "native", budget: 180 },
      { key: "examples", role: "mixed", budget: 360 },
      { key: "key_terms", role: "chinese", budget: 280 },
    ],
  },
  medium: {
    tier: "medium",
    target_ratio: 0.50,
    fields: [
      { key: "precise_definition", role: "native", budget: 200 },
      { key: "scene_introduction", role: "mixed", budget: 280 },
      { key: "pragmatic_rules", role: "native", budget: 220 },
      { key: "taboo_warnings", role: "native", budget: 160 },
      { key: "difficulty_notes", role: "native", budget: 150 },
      { key: "examples", role: "mixed", budget: 420 },
      { key: "key_terms", role: "chinese", budget: 400 },
    ],
  },
  low: {
    tier: "low",
    target_ratio: 0.25,
    fields: [
      { key: "precise_definition", role: "native", budget: 140 },
      { key: "scene_introduction", role: "chinese", budget: 320 },
      { key: "pragmatic_rules", role: "chinese", budget: 260 },
      { key: "taboo_warnings", role: "native", budget: 100 },
      { key: "difficulty_notes", role: "chinese", budget: 200 },
      { key: "examples", role: "chinese", budget: 420 },
      { key: "key_terms", role: "chinese", budget: 420 },
    ],
  },
};

export function anxietyScoreToTier(score: number): AnxietyTier {
  if (score > 80) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * 与 validateSlotRatio 同一口径：
 *   nativeChars ≈ 主要母语字段里「总长度 - 其中 CJK 字符数」（= 拉丁/字母/平假等内容）
 *   chineseChars = 中文相关字段的 CJK 字符数。
 * ratio = nativeChars / (nativeField_total_len + chineseField_total_len)。
 * 两者在 θ₃ 条件与方案三条件下完全一致，保证 KPI 可比。
 */
export function measureNativeRatio(
  cultural_explanation: Record<string, unknown>,
  opts?: { tier?: AnxietyTier | null },
): {
  nativeChars: number;
  chineseChars: number;
  totalChars: number;
  ratio: number;
} {
  const nativeTextPieces: string[] = [];
  const pickText = (v: unknown): void => {
    if (typeof v === "string") {
      nativeTextPieces.push(v);
    } else if (Array.isArray(v)) {
      for (const it of v) pickText(it);
    } else if (v && typeof v === "object") {
      for (const value of Object.values(v as Record<string, unknown>)) pickText(value);
    }
  };
  // A. 母语主字段：计入 nativeTextPieces（后续会扣掉里面的 CJK 字符）
  for (const k of ["precise_definition", "scene_introduction", "difficulty_notes"]) {
    pickText((cultural_explanation as any)[k]);
  }
  for (const k of ["pragmatic_rules", "taboo_warnings"]) {
    const v = (cultural_explanation as any)[k];
    if (Array.isArray(v)) for (const it of v) pickText(it);
    else pickText(v);
  }
  // examples.notes / translation；key_terms.explanation 也算母语
  if (Array.isArray((cultural_explanation as any).examples)) {
    for (const ex of (cultural_explanation as any).examples as Array<Record<string, unknown>>) {
      if (ex) {
        if (typeof ex.notes === "string") nativeTextPieces.push(ex.notes);
        if (typeof ex.translation === "string") nativeTextPieces.push(ex.translation);
      }
    }
  }
  if (Array.isArray((cultural_explanation as any).key_terms)) {
    for (const kt of (cultural_explanation as any).key_terms as Array<Record<string, unknown>>) {
      if (kt && typeof kt.explanation === "string") nativeTextPieces.push(kt.explanation);
    }
  }

  // B. 中文主字段：只取 chinese/pinyin
  const chinesePieces: string[] = [];
  if (Array.isArray((cultural_explanation as any).key_terms)) {
    for (const kt of (cultural_explanation as any).key_terms as Array<Record<string, unknown>>) {
      if (kt) {
        if (typeof kt.chinese === "string") chinesePieces.push(kt.chinese);
        if (typeof kt.pinyin === "string") chinesePieces.push(kt.pinyin);
      }
    }
  }
  if (Array.isArray((cultural_explanation as any).examples)) {
    for (const ex of (cultural_explanation as any).examples as Array<Record<string, unknown>>) {
      if (ex) {
        if (typeof ex.chinese === "string") chinesePieces.push(ex.chinese);
        if (typeof ex.pinyin === "string") chinesePieces.push(ex.pinyin);
      }
    }
  }

  const nativeText = nativeTextPieces.join(" ");
  const chineseText = chinesePieces.join(" ");

  const nativeCJK = countCjkChars(nativeText);
  const nativeChars = Math.max(0, nativeText.length - nativeCJK);
  const chineseChars = countCjkChars(chineseText);

  const total = nativeText.length + chineseText.length;
  const ratio = total > 0 ? nativeChars / total : 0.5;
  return {
    nativeChars,
    chineseChars,
    totalChars: total,
    ratio: Math.round(ratio * 100) / 100,
  };
}

/** 按字段预算做句边界瘦身；支持 string / Array / 对象数组。 */
function trimFieldByBudget(value: unknown, budget: number): unknown {
  if (typeof value === "string") return truncateToSentenceBudget(value, budget);
  if (Array.isArray(value)) {
    const perItem = Math.max(60, Math.round(budget / Math.max(1, value.length)));
    return value.map((it) => {
      if (typeof it === "string") return truncateToSentenceBudget(it, perItem);
      if (it && typeof it === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(it as Record<string, unknown>)) {
          o[k] = typeof v === "string" ? truncateToSentenceBudget(v, perItem) : v;
        }
        return o;
      }
      return it;
    });
  }
  if (value && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      o[k] = typeof v === "string" ? truncateToSentenceBudget(v, budget) : v;
    }
    return o;
  }
  return value;
}

export interface RatioCalibrationReport {
  tier: AnxietyTier;
  target_ratio: number;
  before: number;
  after: number;
  deviation_before: number;
  deviation_after: number;
  trimmed_fields: string[];
  expansion_triggered: boolean;
  expansion_succeeded: boolean;
}

/** 扩写回调（注入式）：仅在母语赤字 > 20% 时由校准器触发一次，失败不可重试。 */
export type A2Expander = (args: {
  tier: AnxietyTier;
  target_lang_name: string;
  target_ratio: number;
  native_side: Record<string, unknown>;
  chinese_side: Record<string, unknown>;
  deficit_chars: number;
  excess_chars: number;
}) => Promise<{ native_side?: Record<string, unknown>; chinese_side?: Record<string, unknown> } | null>;

export async function calibrateA2NativeRatio(args: {
  raw: Record<string, unknown>;
  anxietyScore: number;
  target_lang_name: string;
  expander?: A2Expander;
}): Promise<{ explanation: Record<string, unknown>; report: RatioCalibrationReport }> {
  const { raw, anxietyScore, target_lang_name, expander } = args;
  const tier = anxietyScoreToTier(anxietyScore);
  const budget = RATIO_BUDGET_BY_TIER[tier];
  const before = measureNativeRatio(raw, { tier });
  const deviation_before = Math.abs(before.ratio - budget.target_ratio);

  const out: Record<string, unknown> = { ...raw };
  const trimmed_fields: string[] = [];

  // Step 1: 每字段套 budget 做句边界瘦身
  for (const f of budget.fields) {
    const v = (out as any)[f.key];
    if (v === undefined || v === null) continue;
    const beforeRaw = JSON.stringify(v);
    const trimmed = trimFieldByBudget(v, f.budget);
    (out as any)[f.key] = trimmed;
    const afterRaw = JSON.stringify(trimmed);
    if (afterRaw.length < beforeRaw.length - 6) trimmed_fields.push(f.key);
  }

  let after = measureNativeRatio(out, { tier });
  let expansion_triggered = false;
  let expansion_succeeded = false;
  const deviation_mid = Math.abs(after.ratio - budget.target_ratio);

  // Step 2: 偏差 > 0.10 → 做一次方向修正（母语低才 flash 扩写；母语高收紧 chinese）
  if (deviation_mid > 0.10) {
    if (after.ratio < budget.target_ratio && expander) {
      // 母语赤字大（>0.20）才真正调用 flash。大部分情况只会走到"接受偏差"（仍在 0.05~0.10）。
      const deficitPct = budget.target_ratio - after.ratio;
      if (deficitPct > 0.20) {
        expansion_triggered = true;
        const native_side: Record<string, unknown> = {};
        const chinese_side: Record<string, unknown> = {};
        for (const f of budget.fields) {
          if (f.role === "native") native_side[f.key] = (out as any)[f.key];
          else if (f.role === "chinese") chinese_side[f.key] = (out as any)[f.key];
        }
        const deficitChars = Math.max(80, Math.round(Math.max(1, after.totalChars) * deficitPct));
        try {
          const result = await expander({
            tier,
            target_lang_name,
            target_ratio: budget.target_ratio,
            native_side,
            chinese_side,
            deficit_chars: deficitChars,
            excess_chars: 0,
          });
          if (result) {
            if (result.native_side) Object.assign(out, result.native_side);
            if (result.chinese_side) Object.assign(out, result.chinese_side);
            expansion_succeeded = true;
          }
        } catch (e) {
          // 扩写失败不阻塞：最终由 A5 做质量闸。
          console.warn("[A2校准] 扩写调用失败，沿用本地 trim 结果：", (e as Error).message);
          // 防止未使用 AgentError import 导致死代码告警
          void (null as unknown as AgentError | null);
        }
      }
    } else if (after.ratio > budget.target_ratio) {
      // 母语占比过高：收紧 chinese 角色字段（不删母语，母语多是正向收益）
      for (const f of budget.fields) {
        if (f.role !== "chinese") continue;
        const v = (out as any)[f.key];
        if (!v) continue;
        const tighter = Math.round(f.budget * 0.75);
        const beforeRaw = JSON.stringify(v);
        const t = trimFieldByBudget(v, tighter);
        const afterRaw = JSON.stringify(t);
        if (afterRaw.length < beforeRaw.length - 6) {
          (out as any)[f.key] = t;
          if (!trimmed_fields.includes(f.key)) trimmed_fields.push(f.key);
        }
      }
    }
    after = measureNativeRatio(out, { tier });
  }

  // Step 3: schema 一致性保底（legacy consumer 期望数组字段）
  if (!Array.isArray((out as any).pragmatic_rules)) {
    (out as any).pragmatic_rules =
      typeof (out as any).pragmatic_rules === "string" && (out as any).pragmatic_rules
        ? [(out as any).pragmatic_rules]
        : [];
  }
  if (!Array.isArray((out as any).taboo_warnings)) {
    (out as any).taboo_warnings =
      typeof (out as any).taboo_warnings === "string" && (out as any).taboo_warnings
        ? [(out as any).taboo_warnings]
        : [];
  }
  if (!Array.isArray((out as any).examples)) (out as any).examples = [];
  if (!Array.isArray((out as any).key_terms)) (out as any).key_terms = [];

  const deviation_after = Math.abs(after.ratio - budget.target_ratio);

  const report: RatioCalibrationReport = {
    tier,
    target_ratio: budget.target_ratio,
    before: before.ratio,
    after: after.ratio,
    deviation_before: Math.round(deviation_before * 100) / 100,
    deviation_after: Math.round(deviation_after * 100) / 100,
    trimmed_fields,
    expansion_triggered,
    expansion_succeeded,
  };

  return { explanation: out, report };
}
