// ==============================================================
// 方案三 · A2 Prompt 三钉构造器 + Few-shot 召回入口
// 本文件只负责「字符串块」拼装，不 new LLM，不 new Service，保证 Prompt 层纯函数可离线测。
// ==============================================================

import type { FieldBudget } from "../a2-ratio-calibrator";
import type { AnxietyTier } from "../a2-ratio-calibrator";
import {
  getA2GoldenExamplesBlock as _internal_getGolden,
  type GoldenQuery,
} from "../a2-fewshot-retriever";

export interface NativeBudgetBlockArgs {
  tier: AnxietyTier;
  target_ratio: number;
  targetLangNaturalName: string;
  fields: FieldBudget[];
}

/**
 * 钉-1：焦虑档母语预算。
 * 把「目标比例 + 每字段预算 + 字段母语/中文角色」一次性说清，
 * 让单次 json_object 模式的 LLM 不用猜"要写多长"。
 */
export function buildNativeBudgetBlock(p: NativeBudgetBlockArgs): string {
  const lines: string[] = [];
  const pct = Math.round(p.target_ratio * 100);
  lines.push(`<NATIVE_WORD_BUDGET>`);
  lines.push(`焦虑档位 = ${p.tier.toUpperCase()}；本课母语（${p.targetLangNaturalName}）占比硬目标 = ${pct}%。`);
  lines.push(`你必须严格按下表的"字段 / 角色 / 字符预算"三栏控制各字段长度（字符预算包含标点和空格，是软上限允许+10%溢出，超出必须在 20% 以内）：`);
  lines.push("| 字段 | 内容必须使用的语言角色 | 字符预算（软） |");
  lines.push("| ---  | ---                  | ---          |");
  for (const f of p.fields) {
    const roleTxt =
      f.role === "native"
        ? `母语（${p.targetLangNaturalName}）`
        : f.role === "chinese"
          ? "中文为主（附拼音时拼音计入体量）"
          : "混合（中文例句配母语翻译/注释）";
    lines.push(`| ${f.key} | ${roleTxt} | ≤${f.budget} 字符 |`);
  }
  lines.push(`输出的整体母语字符占比 = （所有母语角色 + 混合角色翻译/注释的非中文字符）/ 总长度，必须落在 [${Math.max(0, pct - 5)}%, ${Math.min(100, pct + 5)}%] 区间内。`);
  lines.push(`</NATIVE_WORD_BUDGET>`);
  return lines.join("\n");
}

export interface HskHardBlockArgs {
  hsk_level: number;
  targetLangNaturalName: string;
}

/**
 * 钉-2：HSK 硬约束（超纲字/新词预算 + 拼音强制规则）。
 * 对应方案二的 HSK_HARD 档级分级；与 A4 的 hard-rule-char-whitelist 概念一致，
 * 但作用在"阐释生成之前的生成行为约束"而不是事后过滤。
 */
export function buildHskHardBlock(p: HskHardBlockArgs): string {
  const lvl = p.hsk_level;
  let tier = "";
  let idiomCap = 0;
  let newWordCap = 0;
  if (lvl <= 3) {
    tier = "基础层 HSK 1–3";
    idiomCap = 3;
    newWordCap = 5;
  } else if (lvl <= 6) {
    tier = "进阶层 HSK 4–6";
    idiomCap = 6;
    newWordCap = 8;
  } else {
    tier = "高阶层 HSK 7–9";
    idiomCap = 12;
    newWordCap = 15;
  }
  const lines: string[] = [];
  lines.push(`<HSK_HARD_CONSTRAINTS target="${tier}">`);
  lines.push(`1. 词汇量：本课所有中文正文（scene_introduction / key_terms / examples.chinese / pragmatic_rules / difficulty_notes 中若出现中文）里，四字及以上成语/熟语数量不得超过 ${idiomCap} 个。`);
  lines.push(`2. 超纲字预算：超出 HSK ${p.hsk_level} 的汉字，累计不得超过 ${newWordCap} 个；每一个超纲字必须在紧邻出现位置附拼音 + ${p.targetLangNaturalName} 简短注释，否则算违反本约束。`);
  lines.push("3. 长难句预算：中文句子平均长度不超过 20 字；超过 40 字的一句话必须拆分。");
  lines.push("4. 反模式禁止：不要在任何字段里用\"以上内容均为 HSK n 级词汇\"之类的自证句，也不要写\"该词属于超纲字\"——直接把拼音和注释写在词旁边即可。");
  lines.push(`</HSK_HARD_CONSTRAINTS>`);
  return lines.join("\n");
}

export interface GraphMandatoryBlockArgs {
  /** 若图谱数据不存在则传 undefined，函数会自动返回空字符串块降级。 */
  graphCulturalData?: null | {
    dimensions?: unknown;
    manifestation?: null | {
      dimension_name?: unknown;
      dimension_name_en?: unknown;
      framework?: unknown;
      weight?: unknown;
      manifestation?: unknown;
      conflict_with_chinese?: unknown;
      pragmatic_tip?: unknown;
      example_scenario?: unknown;
    };
  };
  targetLangNaturalName: string;
}

/**
 * 钉-3：图谱接地硬约束。
 * 把「conflict_with_chinese 必须原文片段出现在 taboo_warnings[0]」「pragmatic_tip 必须原文片段出现在 pragmatic_rules[0]」
 * 这种"原文引用级"要求钉死，避免模型看了图谱也当泛泛参考。
 */
export function buildGraphMandatoryBlock(p: GraphMandatoryBlockArgs): string {
  const m = p.graphCulturalData?.manifestation;
  if (!m) return ""; // 没取到图谱，不钉
  const conflict = safeStr(m.conflict_with_chinese);
  const tip = safeStr(m.pragmatic_tip);
  const example = safeStr(m.example_scenario);
  const dim = safeStr(m.dimension_name);
  const manifest = safeStr(m.manifestation);
  if (!conflict && !tip) return "";

  const lines: string[] = [];
  lines.push(`<GRAPH_MANDATORY>`);
  lines.push(`以下为本课知识库中检索到的「${p.targetLangNaturalName}文化-中国文化」冲突与实用沟通提示，你必须按 1:1 原文片段级引用，不允许转述或改写：`);
  if (dim) lines.push(`- 文化维度（仅用于你内部理解，不要直接输出字段名）：${dim}`);
  if (manifest) lines.push(`- 该文化在${p.targetLangNaturalName}文化圈中的表现（原文片段级融入 scene_introduction 或 difficulty_notes）：\n  > ${manifest}`);
  if (conflict) {
    lines.push(
      `- 与中国文化的冲突（【必须】作为 taboo_warnings 数组的第一个条目，整体出现，至少保留 60% 的原文措辞）：\n  > ${conflict}`,
    );
  }
  if (tip) {
    lines.push(
      `- 跨文化沟通实用提示（【必须】作为 pragmatic_rules 数组的第一个条目，整体出现，至少保留 60% 原文措辞）：\n  > ${tip}`,
    );
  }
  if (example) {
    lines.push(
      `- 真实场景示例（融入 examples 中的一个条目，保持中文部分不重写、只按 HSK ${p.targetLangNaturalName} 追加翻译/拼音/notes）：\n  > ${example}`,
    );
  }
  lines.push(`反模式禁止：不要输出"根据知识库数据：…"、"据 Neo4j 记录：…"这类来源声明——直接把内容写进去就行。`);
  lines.push(`</GRAPH_MANDATORY>`);
  return lines.join("\n");
}

function safeStr(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (!s) return "";
  // 不允许换行（把换行折叠成空格，避免破坏 Prompt XML-like 块结构）
  return s.replace(/\s+/g, " ").slice(0, 600);
}

/**
 * Few-shot 黄金样本块入口。
 * 实际召回逻辑封装在 a2-fewshot-retriever.ts；这里只做一层薄 re-export 以避免
 * prompts/ 目录直接依赖数据文件。
 */
export function getA2GoldenExamplesBlock(q: GoldenQuery): string | undefined {
  if (process.env.A2_USE_FEWSHOT === "false") return undefined;
  return _internal_getGolden(q);
}

export type { GoldenQuery };
