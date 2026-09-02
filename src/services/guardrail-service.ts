/**
 * GuardrailService — TCSL 平台防幻觉拦截网关
 *
 * 架构：本地规则优先，e-flowcode 异构模型按需级联。
 *
 * 四道防线：
 *   1. verify_a2_translation       — 异构回译校验
 *   2. verify_a4_solver_adversarial — Generator-Solver 对抗盲测
 *   3. pre_a5_hard_rules_filter     — 拼音/HSK 硬规则（无 LLM 调用）
 *   4. verify_a5_joint_arbitration  — 双模型联席仲裁
 *
 * 设计原则：
 *   - 任何外部 API 异常均不向上传播，统一返回兜底对象
 *   - 每个校验方法自洽、独立，单点故障不波及其他节点
 */

// ============================================================================
// 类型定义
// ============================================================================
import { llmService, type LLMProvider } from "@/lib/unified-llm-service";
import { getLLMConfig } from "@/lib/llm-config";

export interface GuardrailVerdict {
  passed: boolean;
  action: "PASS" | "FLAG_PENDING_REVIEW" | "FLAG_REJECT";
  confidence: number;
  detail: Record<string, unknown>;
  error: string | null;
}

// ============================================================================
// PipelineContext — 可用性优先的柔性降级上下文
// ============================================================================

/** 每次 Guardrail 失败时的置信度衰减权重 */
export const GUARDRAIL_DECAY_WEIGHTS: Record<string, number> = {
  a2_translation: 0.15,   // A2 回译校验 — 内容准确性
  a3_comparison: 0.10,    // A3 跨文化对比客观性
  a4_solver:     0.20,    // Solver 对抗盲测 — 练习题可解性
  a4_hard_rules: 0.20,    // 拼音/HSK 硬规则 — 基础质量
  a4_grounding:  0.15,    // Grounding 忠于阐释
  a5_joint:      0.20,    // 双模型联席仲裁 — 最终质量关
};

/**
 * 置信度 ≥ 阈值才允许写入全局缓存，防止缓存投毒。
 * 取 0.85，与 cache-manager 的设计意图（≥0.85 才视为有效）对齐：
 * - 单处硬失败（FLAG_REJECT，如 a4_solver 盲解不一致 → 0.80）会被拦下，避免缓存投毒；
 * - 仅含软标记（FLAG_PENDING_REVIEW，已改为轻量衰减）的内容仍 ≥0.90，正常写入。
 */
export const CACHE_WRITE_CONFIDENCE_THRESHOLD = 0.85;

/**
 * 日文汉字（新字体）黑名单 —— 跨语言污染硬失败集。
 * 这些字符是日语正交写法（如 検/討 对应中文 检/讨），出现在中文文本里属于
 * 母语污染，不应被「新词预算」豁免。集合聚焦常见日文新字体变体，命中即判违规。
 */
export const JP_KANJI_BLOCKLIST = new Set<string>([
  "検", "討", "変", "図", "収", "気", "対", "実", "訳", "団", "圧", "栄", "挙",
  "験", "予", "両", "歩", "単", "番", "円", "黒", "転", "伝", "働", "姉", "売",
  "買", "読", "書", "話", "込", "辻", "沢", "広", "仏", "仮", "処", "応", "労",
  "県", "総", "弾", "歓", "権", "沖", "況", "雑", "渉",
  "視", "覚", "粋", "枠", "冊", "択", "桜", "嵐",
]);

/** 置信度 < 此阈值时标记 requires_human_review */
export const HUMAN_REVIEW_CONFIDENCE_THRESHOLD = 0.60;

/** 置信度 < 此阈值时附加 confidence_warning */
export const CONFIDENCE_WARNING_THRESHOLD = 0.40;

/** 置信度衰减记录 */
export interface ConfidenceDecayEntry {
  guardrail: string;
  weight: number;
  confidenceBefore: number;
  confidenceAfter: number;
  action: "PASS" | "FLAG_PENDING_REVIEW" | "FLAG_REJECT";
  timestamp: number;
}

/** 柔性降级元数据，附加到最终 Response */
export interface PipelineMetadata {
  requires_human_review: boolean;
  confidence_warning: string | null;
  overall_confidence: number;
  guardrail_count: number;
  guardrail_flagged: number;
  decay_log: ConfidenceDecayEntry[];
}

/** 贯穿整个流水线的上下文对象 */
export interface PipelineContext {
  eventId: string;
  overallConfidence: number;
  guardrailResults: Record<string, GuardrailVerdict>;
  decayLog: ConfidenceDecayEntry[];
  createdAt: number;
}

export interface ExerciseItem {
  type?: 'multiple_choice' | 'fill_blank' | 'true_false';
  question_stem: string;
  options?: string[];  // multiple_choice: 4个选项, true_false: ["对","错"], fill_blank: []
  answer_key?: string; // multiple_choice: A/B/C/D, true_false: "对"/"错", fill_blank: 答案文本
  pinyin_guide?: string | null;
  dimension?: string | null;
  explanation?: string | null;
}

interface A5ReviewScore {
  pinyin_accuracy: number;
  distractor_quality: number;
  cultural_compliance: number;
  level_appropriateness: number;
  overall_score: number;
  is_qualified: boolean;
}

// ============================================================================
// 环境变量读取
// ============================================================================

const SOLVER_CFG = getLLMConfig("guardrail_solver");
const BACKTRANSLATION_CFG = getLLMConfig("guardrail_backtranslation");
const BINARY_CFG = getLLMConfig("guardrail_binary");
const FINAL_CFG = getLLMConfig("guardrail_final");
const SOLVER_API_URL = SOLVER_CFG.baseUrl;
const SOLVER_API_KEY = SOLVER_CFG.apiKey;
const BACKTRANSLATION_API_URL = BACKTRANSLATION_CFG.baseUrl;
const BACKTRANSLATION_API_KEY = BACKTRANSLATION_CFG.apiKey;
const BINARY_API_URL = BINARY_CFG.baseUrl;
const BINARY_API_KEY = BINARY_CFG.apiKey;


// ============================================================================
// 拼音正则 — 宽松字符级校验（不校验音节结构，防止误杀合法拼音句子）
// 覆盖声调字母 āáǎà ēéěè īíǐì ōóǒò ūúǔù ǖǘǚǜ
// ============================================================================

// 拼音行正则：校验每个字符属于拼音合法字符集（数字声调1-5由独立检查验证位置）
const PINYIN_LINE_RE = /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙÜǕǗǙǛ\s,\.\?\!;:'"\-\(\)\[\]\{\}，。！？；：""''（）【】\/]+$/;

// 拼音字母字符集（含声调），用于验证数字声调位置
const PINYIN_LETTER_RE = /[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙÜǕǗǙǛ]/;

const PINYIN_TONE_CHARS = new Set(
  "aāáǎàeēéěèiīíǐìoōóǒòuūúǔùüǖǘǚǜ" +
  "bcdfghjklmnpqrstwxyz" +
  "AĀÁǍÀEĒÉĚÈIĪÍǏÌOŌÓǑÒUŪÚǓÙÜǕǗǙǛ" +
  "BCDFGHJKLMNPQRSTWXYZ 12345" +
  "-',.!?;:'\"()[]{}，。！？；：\"\"''（）【】"
);

const CHINESE_CHAR_RE = /[一-鿿㐀-䶿]/g;

// ============================================================================
// 工具函数
// ============================================================================

function safeFallback(error: unknown, method: string, extra?: Record<string, unknown>): GuardrailVerdict {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[Guardrail][${method}] 异常触发安全兜底 | ${err.name}: ${err.message.slice(0, 200)}`);
  return {
    passed: false,
    action: "FLAG_PENDING_REVIEW",
    confidence: 0,
    detail: { method, exception_type: err.name, ...extra },
    error: `[${err.name}] ${err.message.slice(0, 300)}`,
  };
}

function parseStrictBinaryVerdict(raw: string): boolean | null {
  const normalized = stripThinkTags(raw).trim().toUpperCase();
  if (normalized === "TRUE") return true;
  if (normalized === "FALSE") return false;
  return null;
}

function extractChineseChars(text: string): Set<string> {
  const chars = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CHINESE_CHAR_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    chars.add(m[0]);
  }
  return chars;
}

function stripThinkTags(str: string): string {
  // 去除 MiniMax/M2.7 等模型的 <think>...</think> 思维链输出
  // 处理两种情况：成对标签 和 未闭合标签（响应被截断）
  let cleaned = str.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // 未闭合的 <think>：从 <think> 删到末尾
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");
  return cleaned.trim();
}

/**
 * 清理异构回译输出：模型偶发把回译包成 JSON / Markdown 代码块
 * （如 `{"precise_definition": "..."}` 甚至嵌套 JSON 字符串），直接拿去给裁判会误判 False。
 * 这里尽量还原成干净的中文翻译文本，并容忍嵌套 JSON 包装。
 */
function cleanBackTranslation(raw: string): string {
  if (!raw) return raw;
  let text = raw.trim().replace(/```(?:json)?/gi, "").trim();

  // 反复解开 JSON 包装（可能嵌套）
  for (let i = 0; i < 3; i++) {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) break;
    try {
      const obj = JSON.parse(m[0]) as Record<string, unknown>;
      const val = [
        "precise_definition", "translation", "translated_text", "text",
        "content", "result", "definition", "翻译", "译文", "释义",
      ]
        .map((k) => obj[k])
        .find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
      if (!val) break;
      text = val.trim();
      if (!text.includes("{")) break; // 已无嵌套，结束
    } catch {
      // 不是合法 JSON，去掉外层花括号后退出
      text = text.replace(/^\s*\{/, "").replace(/\}\s*$/, "");
      break;
    }
  }

  // 去首尾引号与多余空白
  text = text.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  return text;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function extractJSON(str: string): Record<string, unknown> | null {
  const trimmed = stripThinkTags(str);
  // 直接解析
  try { return JSON.parse(trimmed); } catch {}
  // 提取 markdown 代码块
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }
  // 提取第一个 {...}
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  return null;
}

// ============================================================================
// LLM 调用辅助 — 经统一边界，保留原有模型/超时语义
// ============================================================================

async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  temperature = 0,
  maxTokens = 2048,
  timeoutMs = 120000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const role = model === BACKTRANSLATION_CFG.model ? "guardrail_backtranslation"
    : model === BINARY_CFG.model ? "guardrail_binary"
    : model === SOLVER_CFG.model ? "guardrail_solver"
    : model === FINAL_CFG.model ? "guardrail_final" : null;
  if (!role) throw new Error(`No guardrail preset for model=${model}`);
  const provider: LLMProvider = "openai";

  try {
    const response = await llmService.chat([{ role: "user", content: prompt }], {
      preset: role, provider, model, baseUrl, apiKey,
      temperature, max_tokens: maxTokens, signal: controller.signal,
      telemetry_label: `guardrail:${model}`,
    });
    return response.content || "";
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// GuardrailService
// ============================================================================

export class GuardrailService {
  // 阈值常量
  private readonly JOINT_ARBITRATION_MAX_DELTA = 0.15;

  constructor() {
    console.log(
      `[Guardrail] 本地规则优先 | backtranslation=${BACKTRANSLATION_CFG.model} | ` +
      `binary=${BINARY_CFG.model} | solver=${SOLVER_CFG.model} | final=${FINAL_CFG.model}`
    );
  }

  /**
   * Legacy explicit connectivity probe. It is never called at startup and remains
   * behind the global real-call and budget gates. Do not use it in offline tests.
   */
  static async runHealthCheck(): Promise<{ solver: boolean; backtranslation: boolean }> {
    const testPrompt = "回复'OK'，不要输出任何其他内容。";
    const results = { solver: false, backtranslation: false };

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Guardrail HealthCheck] 开始显式路由连通性检测...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // --- Solver ---
    if (!SOLVER_API_KEY) {
      console.log("[HealthCheck] Solver ⚠ SKIP (e-flowcode key 未配置)");
    } else {
      try {
        const t0 = Date.now();
        const resp = await callLLM(SOLVER_API_URL, SOLVER_API_KEY, SOLVER_CFG.model, testPrompt, 0, 16, 10000);
        const ms = Date.now() - t0;
        const ok = resp.trim().toUpperCase().includes("OK");
        results.solver = ok;
        if (ok) {
          console.log(`[HealthCheck] Solver ✓ 连通 (${ms}ms)`);
        } else {
          console.log(`[HealthCheck] Solver ⚠ 返回异常 (${ms}ms)`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[HealthCheck] Solver ✗ 失败 → ${msg.slice(0, 120)}`);
      }
    }

    // --- Back-translation (legacy variable names map to Kimi) ---
    if (!BACKTRANSLATION_API_KEY) {
      console.log("[HealthCheck] Backtranslation ⚠ SKIP (e-flowcode key 未配置)");
    } else {
      try {
        const t0 = Date.now();
        const resp = await callLLM(BACKTRANSLATION_API_URL, BACKTRANSLATION_API_KEY, BACKTRANSLATION_CFG.model, testPrompt, 0, 16, 10000);
        const ms = Date.now() - t0;
        const ok = resp.trim().toUpperCase().includes("OK");
        results.backtranslation = ok;
        if (ok) {
          console.log(`[HealthCheck] Backtranslation ✓ 连通 (${ms}ms)`);
        } else {
          console.log(`[HealthCheck] Backtranslation ⚠ 返回异常 (${ms}ms)`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[HealthCheck] Backtranslation ✗ 失败 → ${msg.slice(0, 120)}`);
      }
    }

    // --- 结论 ---
    const okCount = (results.solver ? 1 : 0) + (results.backtranslation ? 1 : 0);
    console.log(
      `[HealthCheck] 结论: solver=${results.solver ? "✓" : "✗"} backtranslation=${results.backtranslation ? "✓" : "✗"} (${okCount}/2 可用)`
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return results;
  }

  // ==========================================================================
  // 1. 异构模型回译校验 (A2 母语阐释)
  // ==========================================================================

  async verifyA2Translation(
    originalChinese: string,
    targetLang: string,
    dsGeneratedText: string,
  ): Promise<GuardrailVerdict> {
    const method = "verify_a2_translation";
    const t0 = Date.now();
    console.log(`[Guardrail][${method}] 开始 | targetLang=${targetLang} | originalLen=${originalChinese.length}`);

    try {
      // Step 1: 使用异于生成与裁判家族的 Kimi 反向回译。
      const backPrompt =
        `你是一个专业的中文翻译。请将以下${targetLang}文本严格、精确地翻译成中文。\n` +
        `要求：\n` +
        `1. 只输出翻译后的中文，不要添加任何解释、注释、JSON 或额外内容。\n` +
        `2. 输出控制在 80 字以内。\n` +
        `3. 不要使用代码块或引号包裹。\n\n` +
        `原文:\n${dsGeneratedText}\n\n翻译:`;

      const backTranslation = cleanBackTranslation(
        stripThinkTags(
          await callLLM(BACKTRANSLATION_API_URL, BACKTRANSLATION_API_KEY, BACKTRANSLATION_CFG.model, backPrompt, 0, 1024, 30000),
        ),
      );

      if (!backTranslation) {
        console.warn(`[Guardrail][${method}] kimi-k2.6 回译无效，标记 uncertain，不切换模型`);
        return {
          passed: false,
          action: "FLAG_PENDING_REVIEW",
          confidence: 0,
          detail: { step: "back_translation", status: "uncertain", reason: "invalid_or_empty_response", model: BACKTRANSLATION_CFG.model },
          error: null,
        };
      }

      // Step 2: 使用冻结的 qwen3.6-flash 二元路由做 NLI 判断。
      const judgePrompt =
        `请判断以下【回译文本】是否准确、客观地解释了【核心概念】。\n` +
        `只允许回复 "True" 或 "False"，不要输出任何其他内容。\n\n` +
        `【核心概念】：${originalChinese}\n\n` +
        `【回译文本】：${backTranslation}`;

      const judgeRaw = await callLLM(BINARY_API_URL, BINARY_API_KEY, BINARY_CFG.model, judgePrompt, 0, 16, 30000);
      const binaryVerdict = parseStrictBinaryVerdict(judgeRaw);
      if (binaryVerdict === null) return {
        passed: false, action: "FLAG_PENDING_REVIEW", confidence: 0,
        detail: { status: "uncertain", reason: "invalid_binary_response", model: BINARY_CFG.model },
        error: "Binary judge returned neither True nor False",
      };
      const passed = binaryVerdict;
      const similarity = passed ? 1.0 : 0.0;

      const elapsed = Date.now() - t0;
      console.log(
        `[Guardrail][${method}] 完成 | judge=${judgeRaw.trim()} | passed=${passed} | originalLen=${originalChinese.length} | backLen=${backTranslation.length} | elapsed=${elapsed}ms`
      );

      return {
        passed,
        action: passed ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: similarity,
        detail: {
          judge_result: judgeRaw.trim(),
          back_translation: backTranslation.slice(0, 500),
          elapsed_ms: elapsed,
        },
        error: passed ? null : "LLM 裁判判定回译未能准确解释核心概念",
      };
    } catch (err) {
      return safeFallback(err, method);
    }
  }

  // ==========================================================================
  // 1.5 跨文化对比客观性裁判 (A3 文化对比)
  // ==========================================================================

  /**
   * 验证 A3 生成的跨文化对比分析是否客观、无偏见、基于学术框架
   * 使用 LLM 裁判法（与 A2 回译校验同模式），替代仅做关键词匹配的 detectBias
   */
  async verifyA3Comparison(
    chineseConcept: string,
    targetCulture: string,
    a3ComparisonJson: Record<string, unknown>,
  ): Promise<GuardrailVerdict> {
    const method = "verify_a3_comparison";
    const t0 = Date.now();
    console.log(`[Guardrail][${method}] 开始 | concept=${chineseConcept.slice(0, 30)} | target=${targetCulture}`);

    try {
      const comparisonText = JSON.stringify(a3ComparisonJson, null, 2);
      const judgePrompt =
        `你是一位跨文化交际学（Cross-Cultural Communication）学术审稿人。请判断以下跨文化对比分析是否满足三条标准：\n` +
        `1. 客观性：基于学术框架（如 Hofstede 或 Hall 理论），而非个人主观臆断\n` +
        `2. 无偏见：不包含对任何文化的刻板印象、优劣评判或猎奇化表述\n` +
        `3. 事实基础：分析内容有据可查，不是凭空捏造\n\n` +
        `【中国文化概念】：${chineseConcept}\n` +
        `【对比目标文化】：${targetCulture}\n` +
        `【待审分析】：\n${comparisonText}\n\n` +
        `只允许回复 "True" 或 "False"。True 表示分析通过三条标准，False 表示不通过。`;

      const judgeRaw = await callLLM(BINARY_API_URL, BINARY_API_KEY, BINARY_CFG.model, judgePrompt, 0, 16, 30000);
      const binaryVerdict = parseStrictBinaryVerdict(judgeRaw);
      if (binaryVerdict === null) {
        console.warn(`[Guardrail][${method}] LLM 返回无效二元结果，标记 uncertain`);
        return {
          passed: false, action: "FLAG_PENDING_REVIEW", confidence: 0,
          detail: { status: "uncertain", reason: "invalid_binary_response", model: BINARY_CFG.model }, error: "LLM binary response invalid",
        };
      }
      const passed = binaryVerdict;

      const elapsed = Date.now() - t0;
      console.log(
        `[Guardrail][${method}] 完成 | judge=${judgeRaw.trim()} | passed=${passed} | elapsed=${elapsed}ms`
      );

      return {
        passed,
        action: passed ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: passed ? 1.0 : 0.0,
        detail: {
          judge_result: judgeRaw.trim(),
          concept: chineseConcept.slice(0, 100),
          target_culture: targetCulture,
          elapsed_ms: elapsed,
        },
        error: passed ? null : "LLM 裁判判定跨文化对比存在偏见或捏造",
      };
    } catch (err) {
      return safeFallback(err, method);
    }
  }

  // ==========================================================================
  // 1.8 A4 练习题与 A2 文化阐释交叉校验 — 防止练习题脱离阐释凭空生成
  // ==========================================================================

  /**
   * 验证 A4 生成的练习题是否确实基于 A2 的文化阐释内容
   * 防止 A4 忽略上游输入、凭空编造与文化阐释无关的练习题
   */
  async verifyA4Grounding(
    culturalExplanation: Record<string, unknown>,
    exercises: Array<{ question_stem: string }>,
  ): Promise<GuardrailVerdict> {
    const method = "verify_a4_grounding";
    const t0 = Date.now();
    console.log(`[Guardrail][${method}] 开始 | exercises=${exercises.length}`);

    try {
      // 提取 A2 文化阐释的关键中文摘要（尽量覆盖更多字段，避免只取前 800 字漏掉主题）
      const explanationText =
        [
          culturalExplanation?.precise_definition,
          culturalExplanation?.scene_introduction,
          culturalExplanation?.background,
          culturalExplanation?.explanation,
          culturalExplanation?.cultural_notes,
          culturalExplanation?.cross_cultural_comparison,
        ]
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .join("\n")
          .slice(0, 1500) || JSON.stringify(culturalExplanation);

      // 提取练习题题干
      const questionStems = exercises.map((ex, i) => `${i + 1}. ${ex.question_stem}`).join("\n");

      const judgePrompt =
        `你是一位对外汉语（TCSL）教案审核员。请判断以下练习题是否与本课主题/场景相关。\n` +
        `标准：只要练习题考查的知识点、场景或文化内涵能在上方的文化阐释/场景介绍中找到对应依据，` +
        `或属于同一主题（例如同为「购物」场景），即判定为 True。\n` +
        `只有当练习题与本课主题完全无关（例如突然讨论数学、烹饪等不相关话题）时，才判定为 False。\n\n` +
        `【文化阐释/场景介绍】：${explanationText}\n\n` +
        `【练习题】：\n${questionStems}\n\n` +
        `只允许回复 "True" 或 "False"。True 表示练习题忠于本课主题，False 表示完全无关。`;

      const judgeRaw = await callLLM(BINARY_API_URL, BINARY_API_KEY, BINARY_CFG.model, judgePrompt, 0, 16, 30000);
      const binaryVerdict = parseStrictBinaryVerdict(judgeRaw);
      if (binaryVerdict === null) {
        console.warn(`[Guardrail][${method}] LLM 返回无效二元结果，标记 uncertain`);
        return {
          passed: false, action: "FLAG_PENDING_REVIEW", confidence: 0,
          detail: { status: "uncertain", reason: "invalid_binary_response", model: BINARY_CFG.model, exercises_checked: exercises.length }, error: "LLM binary response invalid",
        };
      }
      const passed = binaryVerdict;

      const elapsed = Date.now() - t0;
      console.log(
        `[Guardrail][${method}] 完成 | judge=${judgeRaw.trim()} | passed=${passed} | elapsed=${elapsed}ms`
      );

      return {
        passed,
        action: passed ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: passed ? 1.0 : 0.0,
        detail: {
          judge_result: judgeRaw.trim(),
          exercises_checked: exercises.length,
          elapsed_ms: elapsed,
        },
        error: passed ? null : "LLM 裁判判定练习题脱离文化阐释内容",
      };
    } catch (err) {
      return safeFallback(err, method);
    }
  }

  // ==========================================================================
  // 2. Generator-Solver 对抗盲测 (A4 练习题)
  // ==========================================================================

  async verifyA4SolverAdversarial(generatedJson: ExerciseItem): Promise<GuardrailVerdict> {
    const method = "verify_a4_solver_adversarial";
    const t0 = Date.now();
    console.log(`[Guardrail][${method}] 开始`);

    try {
      // Step 1: 校验输入
      const errors = validateExerciseItem(generatedJson);
      if (errors.length > 0) {
        console.warn(`[Guardrail][${method}] 输入校验失败 | errors=${errors.length}`);
        return {
          passed: false,
          action: "FLAG_REJECT",
          confidence: 0,
          detail: { validation_errors: errors },
          error: `输入校验失败: ${errors.length} 个字段不合法`,
        };
      }

      const exercise = generatedJson;
      const exType = exercise.type || 'multiple_choice';

      // Step 2: 根据题型构建不同的 Solver Prompt
      let solverPrompt: string;
      let expectedAnswer: string;

      if (exType === 'multiple_choice') {
        const answerKey = (exercise.answer_key || '').toUpperCase();
        expectedAnswer = answerKey;
        const optionsText = (exercise.options || [])
          .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
          .join("\n");

        solverPrompt =
          "你是一个对外汉语考试答题助手。请仔细阅读题目和选项，选出唯一正确的答案。\n" +
          "只输出正确选项的字母（A/B/C/D），不要输出任何其他内容。\n\n" +
          `题目：${exercise.question_stem}\n\n` +
          `选项：\n${optionsText}\n\n` +
          "正确答案：";
      } else if (exType === 'true_false') {
        expectedAnswer = exercise.answer_key || '';
        solverPrompt =
          "你是一个对外汉语考试答题助手。请判断以下陈述的对错。\n" +
          "只输出一个字：如果陈述正确输出“对”，如果陈述错误输出“错”。不要输出任何其他内容。\n\n" +
          `题目：${exercise.question_stem}\n\n` +
          "对还是错：";
      } else {
        // fill_blank
        expectedAnswer = (exercise.answer_key || '').trim();
        solverPrompt =
          "你是一个对外汉语考试答题助手。请根据题目填空，写出最合适的答案。\n" +
          "只输出答案内容，不要输出任何解释或其他文字。\n\n" +
          `题目：${exercise.question_stem}\n\n` +
          "答案：";
      }

      // Step 3: Solver 盲解（超时 45s：qwen3.7-max 推理模型 30s 解不完会误判盲解不一致，已换 qwen3.6-flash）
      const solverRaw = await callLLM(SOLVER_API_URL, SOLVER_API_KEY, SOLVER_CFG.model, solverPrompt, 0, exType === 'fill_blank' ? 64 : 4, 45000);

      let solverAnswer: string;
      let passed: boolean;

      if (exType === 'multiple_choice') {
        solverAnswer = solverRaw.trim().toUpperCase();
        let solverLetter = "";
        for (const ch of solverAnswer) {
          if ("ABCD".includes(ch)) { solverLetter = ch; break; }
        }
        if (!solverLetter) {
          console.warn(`[Guardrail][${method}] Solver 未返回有效字母 | raw=${solverRaw.slice(0, 50)}`);
          return {
            passed: false,
            action: "FLAG_PENDING_REVIEW",
            confidence: 0,
            detail: { solver_raw_output: solverRaw.slice(0, 100), exercise_type: exType },
            error: "Solver 盲解未返回有效选项字母",
          };
        }
        passed = solverLetter === expectedAnswer;
        solverAnswer = solverLetter;
      } else if (exType === 'true_false') {
        solverAnswer = solverRaw.trim();
        passed = solverAnswer === expectedAnswer;
      } else {
        // fill_blank: 模糊匹配（去除标点空格后比对）
        // 三级策略：精确匹配 → 子串包含 → Levenshtein 距离 → LLM 语义等价
        // 填空题答案是开放短句，换种说法（如「我通常说…意思是」vs「我问…」）属语义正确，
        // 纯字符串比对会误杀，故末级用冻结的 binary 路由判语义等价。
        solverAnswer = solverRaw.trim();
        const normalize = (s: string) => s.replace(/[，。！？、\s]/g, '');
        const normSolver = normalize(solverAnswer);
        const normExpected = normalize(expectedAnswer);

        if (normSolver === normExpected) {
          passed = true;
        } else if (normSolver.includes(normExpected) || normExpected.includes(normSolver)) {
          passed = true;
        } else {
          const dist = levenshteinDistance(normSolver, normExpected);
          const maxLen = Math.max(normSolver.length, normExpected.length);
          if (maxLen > 0 && (dist / maxLen) <= 0.3) {
            passed = true;
          } else {
            // 末级兜底：LLM 语义等价判定
            const semantic = await this.llmSemanticEquivalent(solverAnswer, expectedAnswer, exercise.question_stem || "");
            if (semantic === null) return {
              passed: false, action: "FLAG_PENDING_REVIEW", confidence: 0,
              detail: { status: "uncertain", reason: "invalid_semantic_binary_response", model: BINARY_CFG.model },
              error: "Semantic judge failed or returned invalid output",
            };
            passed = semantic;
          }
        }
      }

      const elapsed = Date.now() - t0;
      console.log(
        `[Guardrail][${method}] 完成 | type=${exType} | solver=${solverAnswer.slice(0, 20)} | expected=${expectedAnswer.slice(0, 20)} | passed=${passed} | elapsed=${elapsed}ms`
      );

      return {
        passed,
        action: passed ? "PASS" : "FLAG_REJECT",
        confidence: passed ? 1 : 0,
        detail: {
          exercise_type: exType,
          solver_answer: solverAnswer,
          expected_answer: expectedAnswer,
          solver_raw: solverRaw.slice(0, 100),
          elapsed_ms: elapsed,
        },
        error: passed ? null : `Solver 盲解得 ${solverAnswer}, 期望 ${expectedAnswer}`,
      };
    } catch (err) {
      return safeFallback(err, method);
    }
  }

  // ==========================================================================
  // 3. 硬规则过滤器 (A5 前置，无 LLM 调用)
  // ==========================================================================

  /**
   * 语义等价判定（填空题盲测末级兜底）
   * Solver 给出的答案与标准答案字符串不一致时，调用冻结的 binary 路由判断语义等价。
   * 用于避免「换种说法即误杀」的 FLAG_REJECT。
   */
  private async llmSemanticEquivalent(solverAnswer: string, expectedAnswer: string, stem: string): Promise<boolean | null> {
    try {
      const judgePrompt =
        "你是汉语填空题的答案校验员。请判断下面两个答案是否表达相同的含义（允许句式、用词不同，只要核心意思一致即视为正确）。\n" +
        `题目：${stem}\n` +
        `标准答案：${expectedAnswer}\n` +
        `模型作答：${solverAnswer}\n\n` +
        "只回复 \"True\" 或 \"False\"。True 表示语义一致，False 表示语义不同。";
      const raw = await callLLM(BINARY_API_URL, BINARY_API_KEY, BINARY_CFG.model, judgePrompt, 0, 8, 20000);
      const isTrue = parseStrictBinaryVerdict(raw);
      if (isTrue === null) return null;
      console.log(`[Guardrail][semantic] solver="${solverAnswer.slice(0, 20)}" expected="${expectedAnswer.slice(0, 20)}" → ${isTrue ? "等价" : "不等价"}`);
      return isTrue;
    } catch (err) {
      console.warn(`[Guardrail][semantic] LLM 判定失败，标记 uncertain:`, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  preA5HardRulesFilter(
    generatedJson: { question_stem?: string; pinyin_guide?: string | null },
    hskWhitelist: string[],
  ): GuardrailVerdict {
    const method = "pre_a5_hard_rules_filter";
    const t0 = Date.now();
    console.log(`[Guardrail][${method}] 开始 | whitelistSize=${hskWhitelist.length}`);
    const violations: Array<Record<string, unknown>> = [];

    try {
      const questionStem = generatedJson.question_stem || "";
      const pinyinGuide = generatedJson.pinyin_guide || "";

      // 规则 1: 拼音格式校验
      if (pinyinGuide) {
        const pinyinOk = this.validatePinyin(pinyinGuide);
        if (!pinyinOk.passed) {
          violations.push({ rule: "PINYIN_FORMAT", detail: pinyinOk.reason });
          console.warn(`[Guardrail][${method}] 拼音格式校验失败 | ${pinyinOk.reason}`);
        }
      }

      // 规则 2: HSK 超纲字校验
      if (questionStem) {
        const chineseChars = extractChineseChars(questionStem);
        // 将词汇白名单打碎为单字集合，再与题干的单字做比对
        const hskCharSet = new Set(hskWhitelist.join(""));
        const outOfScope = Array.from(chineseChars).filter((c) => !hskCharSet.has(c));
        if (outOfScope.length > 0) {
          // 2a: 日文汉字变体（新字体）硬失败 —— 这类字符是日语正交写法（如 検/討），
          // 出现在中文文本里属于跨语言污染，绝不可豁免（不受下方新词预算保护）。
          const jpKanji = outOfScope.filter((c) => JP_KANJI_BLOCKLIST.has(c));
          if (jpKanji.length > 0) {
            violations.push({
              rule: "JP_KANJI_CONTAMINATION",
              chars: jpKanji.slice(0, 30),
            });
            console.warn(`[Guardrail][${method}] 日文汉字污染 | chars=${jpKanji.slice(0, 10).join(", ")}`);
          }

          // 2b: 其余超纲字（正常的高等级汉字）容忍策略
          const normalOutOfScope = outOfScope.filter((c) => !JP_KANJI_BLOCKLIST.has(c));
          if (normalOutOfScope.length > 0) {
            // 提供了拼音注释的超纲字视为「本课新词」引入，允许在预算内通过；
            // 仅当超纲字超出预算（或完全无拼音注释）时才判违规。与 A4 prompt 中
            // 「超纲字可附拼音当新词教」的约定一致，避免把合理的新词引入误杀成缓存写不进。
            const hasPinyin = !!(pinyinGuide && pinyinGuide.trim());
            const NEW_WORD_BUDGET = 8;
            const tolerated = hasPinyin ? Math.min(normalOutOfScope.length, NEW_WORD_BUDGET) : 0;
            const remaining = normalOutOfScope.length - tolerated;
            if (remaining > 0) {
              violations.push({
                rule: "HSK_LEVEL_MISMATCH",
                out_of_scope_chars: normalOutOfScope.slice(0, 30),
                total_out_of_scope: normalOutOfScope.length,
              });
              console.warn(
                `[Guardrail][${method}] HSK超纲 | 超纲字数=${normalOutOfScope.length} | 已容忍新词=${tolerated} | samples=${normalOutOfScope.slice(0, 10).join(", ")}`
              );
            } else {
              console.log(
                `[Guardrail][${method}] HSK超纲字 ${normalOutOfScope.length} 个均在「新词预算」内且已附拼音，视为可接受的新词引入，放行`
              );
            }
          }
        }
      }

      const passed = violations.length === 0;
      const elapsed = Date.now() - t0;
      console.log(`[Guardrail][${method}] 完成 | passed=${passed} | violations=${violations.length} | elapsed=${elapsed}ms`);

      return {
        passed,
        action: passed ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: passed ? 1 : 0,
        detail: { violations, elapsed_ms: elapsed },
        error: passed ? null : `硬规则校验失败: ${violations.length} 项违规`,
      };
    } catch (err) {
      return safeFallback(err, method, { violations });
    }
  }

  private validatePinyin(pinyinText: string): { passed: boolean; reason: string } {
    if (!pinyinText || !pinyinText.trim()) {
      return { passed: false, reason: "拼音字段为空" };
    }

    const lines = pinyinText.trim().split("\n");
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // 预处理：洗掉括号内的英文注释 (meeting), (face), 等等
      line = line.replace(/\([^)]*[a-zA-Z][^)]*\)/g, " ").replace(/\(\)/g, "");
      // 预处理：v → ü（常见拼音输入替代）
      line = line.replace(/v(?=[1-5]?\b)/g, "ü");

      // 移除中文/中文标点后再检查
      const pinyinOnly = line.replace(/[一-鿿　-〿＀-￯]/g, " ").trim();
      if (!pinyinOnly) continue; // 纯中文行跳过

      for (const ch of pinyinOnly) {
        if (!PINYIN_TONE_CHARS.has(ch)) {
          return { passed: false, reason: `第${i + 1}行含非法字符: U+${ch.codePointAt(0)!.toString(16).toUpperCase()} '${ch}'` };
        }
      }

      // 正则匹配音节结构（仅对拼音部分）
      if (!PINYIN_LINE_RE.test(pinyinOnly)) {
        return { passed: false, reason: `第${i + 1}行拼音音节格式异常: '${pinyinOnly.slice(0, 60)}'` };
      }

      // 数字声调 1-5 必须紧跟在拼音字母之后（如 ni3 hao3），不能独立出现
      for (let j = 0; j < pinyinOnly.length; j++) {
        const ch = pinyinOnly[j];
        if (ch >= '1' && ch <= '5') {
          if (j === 0 || !PINYIN_LETTER_RE.test(pinyinOnly[j - 1])) {
            return { passed: false, reason: `第${i + 1}行声调数字位置异常: '${pinyinOnly.slice(Math.max(0, j - 1), j + 2)}'` };
          }
        }
      }
    }

    return { passed: true, reason: "ok" };
  }

  // ==========================================================================
  // 4. 双模型联席仲裁 (A5 质量审核)
  // ==========================================================================

  async verifyA5JointArbitration(
    exerciseJson: Record<string, unknown>,
    targetLevel: number,
  ): Promise<GuardrailVerdict> {
    const method = "verify_a5_joint_arbitration";
    const t0 = Date.now();
    console.log(`[Guardrail][${method}] 开始 | targetLevel=${targetLevel}`);

    try {
      const type = String(exerciseJson.type || "");
      const options = Array.isArray(exerciseJson.options) ? exerciseJson.options : [];
      const localIssues = ["question", "correct_answer", "explanation", "dimension"]
        .filter((key) => !String(exerciseJson[key] || "").trim());
      if (type === "multiple_choice" && options.length !== 4) localIssues.push("multiple_choice_options");
      if (type === "true_false" && options.length !== 2) localIssues.push("true_false_options");
      if (!localIssues.length) {
        return { passed: true, action: "PASS", confidence: 1,
          detail: { stage: "local_rules", llm_called: false, elapsed_ms: Date.now() - t0 }, error: null };
      }

      const reviewPrompt = this.buildA5ReviewPrompt(targetLevel, exerciseJson);
      // [2026-08-27 修复] max_tokens 512→2048：glm-5.2 等推理模型会把 512 token 全花在思考上、
      // 还没输出 JSON 就被截断（日志：JSON 解析失败 cleaned_len=928 纯论述）。2048 保证思考+JSON 都能装下。
      const raw = await callLLM(FINAL_CFG.baseUrl, FINAL_CFG.apiKey, FINAL_CFG.model, reviewPrompt, 0, 2048, 45000);
      const score = this.parseA5Response(raw, FINAL_CFG.model);
      if (!score) return { passed: false, action: "FLAG_PENDING_REVIEW", confidence: 0,
        detail: { stage: "final_adjudication", status: "uncertain", local_issues: localIssues, model: FINAL_CFG.model },
        error: "final adjudication returned invalid JSON" };
      return { passed: score.is_qualified, action: score.is_qualified ? "PASS" : "FLAG_PENDING_REVIEW",
        confidence: score.overall_score,
        detail: { stage: "final_adjudication", local_issues: localIssues, model: FINAL_CFG.model, scores: score, elapsed_ms: Date.now() - t0 },
        error: score.is_qualified ? null : "final adjudication marked item unqualified" };
    } catch (err) {
      return safeFallback(err, method);
    }
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  private buildA5ReviewPrompt(targetLevel: number, exerciseJson: Record<string, unknown>): string {
    const jsonStr = JSON.stringify(exerciseJson, null, 2);
    return (
      "你是对外汉语（TCSL）教学内容质量评审专家。请对以下练习题进行原子维度评分。\n\n" +
      `目标 HSK 等级: ${targetLevel}\n\n` +
      "题目内容:\n" +
      `\`\`\`json\n${jsonStr}\n\`\`\`\n\n` +
      "请从以下维度打分（0.0-1.0）：\n" +
      "1. pinyin_accuracy: 拼音标注的准确性\n" +
      "2. distractor_quality: 干扰项（错误选项）的迷惑性和合理性\n" +
      "3. cultural_compliance: 文化内容的合规性（无偏见、无敏感内容）\n" +
      "4. level_appropriateness: 与目标 HSK 等级的匹配度\n" +
      "5. overall_score: 综合质量评分\n" +
      "6. is_qualified: 是否合格（true/false）\n\n" +
      "只输出以下 JSON 格式，不要输出任何其他内容：\n" +
      '{"pinyin_accuracy":0.0,"distractor_quality":0.0,' +
      '"cultural_compliance":0.0,"level_appropriateness":0.0,' +
      '"overall_score":0.0,"is_qualified":true}'
    );
  }

  private parseA5Response(result: string | Error, modelName: string): A5ReviewScore | null {
    if (result instanceof Error) {
      console.error(`[Guardrail][A5] ${modelName} 返回异常:`, result.message);
      return null;
    }

    try {
      const raw = result.trim();
      if (!raw) {
        console.warn(`[Guardrail][A5] ${modelName} 返回空响应`);
        return null;
      }

      // 防御：洗掉 <think> 后若为空，标记 uncertain，不换模型。
      const cleaned = stripThinkTags(raw);
      if (!cleaned) {
        console.warn(`[Guardrail][A5] ${modelName} 清洗 <think> 后为空（max_tokens 截断或纯思考输出），降级处理`);
        return null;
      }

      const data = extractJSON(cleaned);
      if (!data) {
        console.warn(`[Guardrail][A5] ${modelName} JSON 解析失败 | cleaned_len=${cleaned.length} | preview=${cleaned.slice(0, 200)}`);
        return null;
      }

    // 校验必填字段
    const requiredFields = ["pinyin_accuracy", "distractor_quality", "cultural_compliance", "level_appropriateness", "overall_score"];
    for (const f of requiredFields) {
      if (typeof data[f] !== "number" || data[f] < 0 || (data[f] as number) > 1) {
        console.warn(`[Guardrail][A5] ${modelName} 字段 ${f} 不合法 | value=${data[f]}`);
        return null;
      }
    }

    if (typeof data.is_qualified !== "boolean") {
      console.warn(`[Guardrail][A5] ${modelName} is_qualified 不是 boolean`);
      return null;
    }

    return {
      pinyin_accuracy: data.pinyin_accuracy as number,
      distractor_quality: data.distractor_quality as number,
      cultural_compliance: data.cultural_compliance as number,
      level_appropriateness: data.level_appropriateness as number,
      overall_score: data.overall_score as number,
      is_qualified: data.is_qualified as boolean,
    };
    } catch (err) {
      console.error(`[Guardrail][A5] ${modelName} 解析异常 | ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private singleModelVerdict(
    score: A5ReviewScore,
    method: string,
    t0: number,
    mode: string,
  ): GuardrailVerdict {
    const elapsed = Date.now() - t0;
    return {
      passed: score.is_qualified,
      action: score.is_qualified ? "PASS" : "FLAG_PENDING_REVIEW",
      confidence: score.overall_score,
      detail: {
        mode,
        scores: score,
        elapsed_ms: elapsed,
      },
      error: score.is_qualified ? null : `单模型(${mode})投了反对票`,
    };
  }
}

// ============================================================================
// 输入校验
// ============================================================================

function validateExerciseItem(item: ExerciseItem): string[] {
  const errors: string[] = [];
  const exType = item.type || 'multiple_choice';

  if (!item.question_stem || typeof item.question_stem !== "string") {
    errors.push("question_stem 缺失或非字符串");
  }

  if (exType === 'multiple_choice') {
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push("multiple_choice 的 options 必须是长度恰好为 4 的数组");
    } else {
      item.options.forEach((opt, i) => {
        if (typeof opt !== "string" || !opt.trim()) {
          errors.push(`options[${i}] 为空或非字符串`);
        }
      });
    }
    if (typeof item.answer_key !== "string" || !/^[A-D]$/i.test(item.answer_key)) {
      errors.push("multiple_choice 的 answer_key 必须是 A/B/C/D");
    }
  } else if (exType === 'true_false') {
    const opts = item.options;
    if (!Array.isArray(opts) || opts.length !== 2 ||
        opts[0] !== '对' || opts[1] !== '错') {
      errors.push("true_false 的 options 必须是 [\"对\", \"错\"]");
    }
    if (typeof item.answer_key !== "string" || !['对', '错'].includes(item.answer_key)) {
      errors.push("true_false 的 answer_key 必须是 对 或 错");
    }
  } else if (exType === 'fill_blank') {
    if (!Array.isArray(item.options) || item.options.length !== 0) {
      errors.push("fill_blank 的 options 必须为空数组 []");
    }
    if (typeof item.answer_key !== "string" || !item.answer_key.trim()) {
      errors.push("fill_blank 的 answer_key 缺失或非字符串");
    }
  }

  return errors;
}

// ============================================================================
// ============================================================================
// 缓存置信度计算 — 加权聚合所有 guardrail 结果
// ============================================================================

/**
 * 从 guardrail 结果计算缓存写入置信度。
 * 加权方案：A5 双模型仲裁权重最高(0.4)，A2/A3 裁判次之，硬规则和 solver 较轻。
 * 未出现的 guardrail 不参与计算；全部缺失返回保守值 0.5。
 */
export function computeCacheConfidence(gr: Record<string, GuardrailVerdict>): number {
  const weights: Record<string, number> = {
    a5_joint: 0.40,        // 双模型联席仲裁 — 最高权重
    a2_translation: 0.25,   // A2 回译 LLM 裁判
    a3_comparison: 0.15,    // A3 跨文化对比客观性裁判
    a4_hard_rules: 0.05,    // 拼音/HSK 硬规则
    a4_grounding: 0.10,     // A4 交叉校验（练习题忠于阐释）
    a4_solver: 0.05,        // Solver 对抗盲测
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const verdict = gr[key];
    if (verdict !== undefined) {
      weightedSum += (verdict.confidence ?? 0) * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 0.5;
  return Math.round((weightedSum / totalWeight) * 1e4) / 1e4;
}

// ============================================================================
// PipelineContext 工厂与辅助函数 — 柔性降级核心
// ============================================================================

/**
 * 创建一个全新的 PipelineContext，初始置信度 1.0。
 */
export function createPipelineContext(eventId?: string): PipelineContext {
  return {
    eventId: eventId || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    overallConfidence: 1.0,
    guardrailResults: {},
    decayLog: [],
    createdAt: Date.now(),
  };
}

/**
 * 将单个 Guardrail 的判定结果应用到 PipelineContext：
 * - 失败 (FLAG_PENDING_REVIEW / FLAG_REJECT) → 按权重衰减 overallConfidence
 * - 通过 (PASS) → 置信度不变
 * - 同时记录 guardrailResults 和 decayLog
 *
 * @returns 更新后的 overallConfidence
 */
export function applyGuardrailResult(
  ctx: PipelineContext,
  guardrailName: string,
  verdict: GuardrailVerdict,
): number {
  ctx.guardrailResults[guardrailName] = verdict;

  // PASS 不衰减
  if (verdict.action === "PASS" || verdict.passed) {
    return ctx.overallConfidence;
  }

  const weight = GUARDRAIL_DECAY_WEIGHTS[guardrailName];
  if (weight === undefined) {
    console.warn(`[PipelineContext] 未知 guardrail "${guardrailName}"，跳过衰减`);
    return ctx.overallConfidence;
  }

  const before = ctx.overallConfidence;
  ctx.overallConfidence = Math.max(0, Math.round((ctx.overallConfidence - weight) * 1e4) / 1e4);

  ctx.decayLog.push({
    guardrail: guardrailName,
    weight,
    confidenceBefore: before,
    confidenceAfter: ctx.overallConfidence,
    action: verdict.action,
    timestamp: Date.now(),
  });

  console.log(
    `[PipelineContext] 衰减 "${guardrailName}" | weight=${weight} | ` +
    `${before.toFixed(4)} → ${ctx.overallConfidence.toFixed(4)} | action=${verdict.action}`
  );

  return ctx.overallConfidence;
}

/**
 * 判断当前置信度是否允许写入全局缓存。
 * 低于 CACHE_WRITE_CONFIDENCE_THRESHOLD 时禁止写入，防止缓存投毒。
 */
export function shouldWriteCache(ctx: PipelineContext): boolean {
  return ctx.overallConfidence >= CACHE_WRITE_CONFIDENCE_THRESHOLD;
}

/**
 * 从 PipelineContext 提取附加到最终响应的元数据。
 */
export function getPipelineMetadata(ctx: PipelineContext): PipelineMetadata {
  const flagged = Object.values(ctx.guardrailResults).filter(r => !r.passed).length;
  const total = Object.keys(ctx.guardrailResults).length;

  let confidence_warning: string | null = null;
  if (ctx.overallConfidence < CONFIDENCE_WARNING_THRESHOLD) {
    confidence_warning = "低置信度内容，建议人工复核";
  } else if (ctx.overallConfidence < HUMAN_REVIEW_CONFIDENCE_THRESHOLD) {
    confidence_warning = "部分质量检查未通过，内容仅供参考";
  }

  return {
    requires_human_review: ctx.overallConfidence < HUMAN_REVIEW_CONFIDENCE_THRESHOLD,
    confidence_warning,
    overall_confidence: ctx.overallConfidence,
    guardrail_count: total,
    guardrail_flagged: flagged,
    decay_log: ctx.decayLog,
  };
}

/**
 * 异步推送 Guardrail 失败记录到遥测/审计队列（Shadow Mode）。
 * 不阻塞主流程，失败静默。
 */
export function publishGuardrailTelemetry(ctx: PipelineContext): void {
  const failures = Object.entries(ctx.guardrailResults)
    .filter(([, v]) => !v.passed);

  if (failures.length === 0) return;

  // 异步执行，绝对不能阻塞主流程
  Promise.resolve().then(() => {
    for (const [name, verdict] of failures) {
      console.warn(
        `[GuardrailTelemetry] event=${ctx.eventId} | guardrail=${name} | ` +
        `action=${verdict.action} | confidence=${verdict.confidence} | ` +
        `error=${verdict.error || "N/A"} | detail=${JSON.stringify(verdict.detail).slice(0, 200)}`
      );
    }

    // 汇总到审计日志
    const summary = {
      event_id: ctx.eventId,
      timestamp: new Date().toISOString(),
      overall_confidence: ctx.overallConfidence,
      total_guardrails: Object.keys(ctx.guardrailResults).length,
      failures: failures.map(([name, verdict]) => ({
        guardrail: name,
        action: verdict.action,
        confidence: verdict.confidence,
        error: verdict.error,
      })),
      decay_log: ctx.decayLog,
    };

    console.log(`[GuardrailAudit] ${JSON.stringify(summary)}`);
  }).catch(() => {
    // 遥测失败不影响业务
  });
}

// ============================================================================
// 单例导出
// ============================================================================

let _instance: GuardrailService | null = null;

export function getGuardrailService(): GuardrailService {
  if (!_instance) {
    _instance = new GuardrailService();
    // 不在业务启动时自动发起模型调用。健康检查只能由获批 smoke 显式调用。
  }
  return _instance;
}
