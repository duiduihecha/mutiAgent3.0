/**
 * 自动评估 + 人工评估指标模块 — 论文实验框架
 *
 * 第一部分 — 自动评估指标（第5.1节）：
 *   1. 格式规范性     — JSON格式正确率
 *   2. HSK难度匹配    — 词汇超纲率
 *   3. 事实准确性     — 图谱事实一致性
 *   4. 文化偏见度     — 偏见关键词命中率
 *   5. 内容多样性     — 题型分布 / 词汇多样性
 *   6. 生成效率       — 端到端响应时间分解
 *   7. 练习题质量     — 答案可判别性
 *   8. 综合评分       — 加权聚合
 *
 * 第二部分 — 人工评估（第5.2节）：
 *   - 双裁判盲评 + 5维评分量表 + Rubric
 *   - 分层抽样（按条件×母语×HSK均匀采样）
 *   - 评分者间信度 Krippendorff's α
 *   - 人工评分 vs 自动指标的相关性分析
 *   7. 练习题质量     — 答案可判别性
 *   8. 综合评分       — 加权聚合
 *
 * 依赖关系：neo4jService（图谱事实校验）、detectBias（偏见检测）、HSK词汇数据
 */

import { detectBias } from "./multi-agent-system";
import type { GeneratedContent, Exercise, LearnerProfile } from "./multi-agent-system";
import { neo4jService } from "./neo4j-service";

// ============================================================================
// 类型定义
// ============================================================================

/** 评估指标汇总 */
export interface EvaluationMetrics {
  /** 格式规范性 */
  json_format_valid: boolean;
  json_parse_error: string | null;

  /** HSK 难度匹配 */
  hsk_vocab_overlevel_rate: number;   // 超纲词汇占比 (0-1)
  hsk_vocab_total: number;            // 总词汇数
  hsk_vocab_overlevel: number;        // 超纲词汇数
  hsk_vocab_in_level: number;         // 在纲词汇数

  /** 事实准确性（图谱一致性） */
  kg_fact_consistency: number;        // 0-1, 能在图谱中找到支持的断言比例
  kg_total_claims: number;            // 总断言数
  kg_verified_claims: number;         // 能在图谱中匹配到的断言数

  /** 文化偏见度 */
  bias_score: number;                 // 0-1, detectBias() 输出
  bias_has_bias: boolean;
  bias_keywords: string[];
  bias_patterns: string[];

  /** 内容多样性 */
  exercise_type_count: number;        // 题型种类数
  exercise_types: string[];           // 题型列表
  vocabulary_diversity: number;       // type-token ratio (0-1)
  total_tokens: number;

  /** 生成效率 */
  total_duration_ms: number;
  agent_durations_ms: Record<string, number>;

  /** 练习题质量 */
  exercise_answerable_rate: number;   // 答案可判别率 (0-1)
  exercise_total: number;
  exercise_answerable: number;
}

/** 评估结果（一条测试用例的完整评估） */
export interface EvaluationResult {
  test_case_id: string;
  condition: ExperimentCondition;
  scenario: string;        // kp_id
  native_language: string;
  hsk_level: number;

  /** 原始输出 */
  raw_output: {
    cultural_explanation: Record<string, unknown> | null;
    cross_cultural_comparison: Record<string, unknown> | null;
    generated_content: GeneratedContent | null;
    pipeline_metadata: Record<string, unknown> | null;
  };

  /** 评估指标 */
  metrics: EvaluationMetrics;

  /** 元数据 */
  timestamp: number;
  duration_ms: number;
  errors: string[];
}

/** 实验条件标识 */
export type ExperimentCondition =
  // RQ1 消融实验
  | "C1_Full"
  | "C2_NoAgent_Monolith"
  | "C3_NoA3"
  | "C4_NoA5"
  | "C5_NoA2A3"
  // RQ2 KG增强
  | "Full+KG"
  | "NoKG"
  | "RAG_only";

/** 实验条件标签（中文） */
export const CONDITION_LABELS: Record<ExperimentCondition, string> = {
  "C1_Full": "完整系统",
  "C2_NoAgent_Monolith": "单体LLM基线",
  "C3_NoA3": "去掉文化对比",
  "C4_NoA5": "去掉质量管控",
  "C5_NoA2A3": "去掉阐释和对比",
  "Full+KG": "完整系统+KG",
  "NoKG": "纯LLM无KG",
  "RAG_only": "向量检索替代KG",
};

// ============================================================================
// HSK 词汇分级数据（运行时加载）
// ============================================================================

/** HSK 等级 → 该等级允许的字符白名单 */
let _hskCharWhitelistCache: Map<number, Set<string>> | null = null;

async function getHSKCharWhitelist(hskLevel: number): Promise<Set<string>> {
  if (!_hskCharWhitelistCache) {
    _hskCharWhitelistCache = new Map();
    try {
      const { getHSKCharWhitelistArray } = await import("@/data/hsk_vocabulary");
      for (let level = 1; level <= 9; level++) {
        const chars = getHSKCharWhitelistArray(level);
        _hskCharWhitelistCache.set(level, new Set(chars));
      }
    } catch {
      console.warn("[EvaluationMetrics] HSK词汇数据加载失败，超纲检测将跳过");
    }
  }
  return _hskCharWhitelistCache.get(hskLevel) || new Set();
}

// ============================================================================
// 1. 格式规范性
// ============================================================================

/**
 * 校验 JSON 格式正确性
 * 检查 A4 生成的 GeneratedContent 是否完整可解析
 */
export function evaluateJsonFormat(content: GeneratedContent | null): {
  valid: boolean;
  error: string | null;
} {
  if (!content) {
    return { valid: false, error: "GeneratedContent is null" };
  }

  const errors: string[] = [];

  // 检查 cultural_context
  if (!content.cultural_context || typeof content.cultural_context.explanation !== "string") {
    errors.push("cultural_context.explanation 缺失或类型错误");
  }

  // 检查 language_points
  if (!Array.isArray(content.language_points) || content.language_points.length === 0) {
    errors.push("language_points 为空或不是数组");
  } else {
    for (let i = 0; i < content.language_points.length; i++) {
      const lp = content.language_points[i];
      // A4 使用 target_language 字段名（native/en/ja/ko...），兼容所有语种
      const hasTranslation = lp.en || lp.native || lp.translation;
      if (!lp.zh || !hasTranslation) {
        errors.push(`language_points[${i}] 缺少 zh 或翻译字段`);
      }
    }
  }

  // 检查 comparison
  if (!content.comparison) {
    errors.push("comparison 缺失");
  }

  // 检查 exercises
  if (!Array.isArray(content.exercises) || content.exercises.length === 0) {
    errors.push("exercises 为空或不是数组");
  } else {
    for (let i = 0; i < content.exercises.length; i++) {
      const ex = content.exercises[i];
      if (!ex.type || !ex.question || !ex.correct_answer) {
        errors.push(`exercises[${i}] 缺少必需字段 (type/question/correct_answer)`);
      }
      if (ex.type === "multiple_choice" && (!Array.isArray(ex.options) || ex.options.length < 2)) {
        errors.push(`exercises[${i}] 选择题但 options 不足`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join("; ") : null,
  };
}

// ============================================================================
// 2. HSK 词汇覆盖率 — 词级别检查（用 Neo4j HSKWord 节点）
// ============================================================================

/**
 * 从中文文本中提取中文词语（2-4字滑动窗口）
 * 中文分词不像英文有空格，所以用 n-gram 近似
 */
function extractChineseWords(text: string): string[] {
  const chars = text.match(/[一-鿿]/g);
  if (!chars || chars.length < 2) return [];
  const joined = chars.join("");
  const words: string[] = [];
  // 2-3字词
  for (let len = 3; len >= 2; len--) {
    for (let i = 0; i <= joined.length - len; i++) {
      words.push(joined.slice(i, i + len));
    }
  }
  return [...new Set(words)]; // 去重
}

/**
 * 词级别 HSK 覆盖率：用 Neo4j HSKWord 节点验证
 *
 * 从 exercises + language_points 中提取中文词语（2-3字滑动窗口），
 * 逐一查询 Neo4j 确认是否存在于 HSK 词汇表中。
 *
 * 对比旧版"字级别"检查，词级别更准确：
 *   - 字级别： "的"在HSK1、"确"在HSK5 → "的确"被认为是HSK5+1的组合，不算超纲
 *   - 词级别： "的确"作为一个词去查 HSKWord{lemma:"的确", level:6} → 发现是HSK6词，HSK4学习者超纲
 */
export async function evaluateHSKWordCoverage(
  content: GeneratedContent | null,
  targetHskLevel: number,
): Promise<{
  coverage_rate: number;      // 能在HSK词表中找到的词占比 (0-1)
  total_words: number;         // 总词数（去重后）
  in_vocab_words: number;      // 在HSK词表中的词数
  out_of_vocab_words: number;  // 不在HSK词表中的词数
  overlevel_words: number;     // 在词表中但等级超纲的词数
  in_level_words: number;      // 在词表中且等级≤目标的词数
}> {
  if (!content) {
    return { coverage_rate: 0, total_words: 0, in_vocab_words: 0,
             out_of_vocab_words: 0, overlevel_words: 0, in_level_words: 0 };
  }

  // 收集所有中文文本
  const chineseTexts: string[] = [];
  if (content.exercises) {
    for (const ex of content.exercises) {
      chineseTexts.push(ex.question);
      if (ex.options) chineseTexts.push(...ex.options);
      if (ex.explanation) chineseTexts.push(ex.explanation);
    }
  }
  if (content.language_points) {
    for (const lp of content.language_points) {
      chineseTexts.push(lp.zh || "");
    }
  }

  const combinedChinese = chineseTexts.join(" ");
  const words = extractChineseWords(combinedChinese);

  if (words.length === 0) {
    return { coverage_rate: 0, total_words: 0, in_vocab_words: 0,
             out_of_vocab_words: 0, overlevel_words: 0, in_level_words: 0 };
  }

  // 对每个词查 Neo4j HSKWord 节点
  // 为了效率，先批量查前50个词
  const sampleWords = words.slice(0, 50);
  let inVocab = 0;
  let overLevel = 0;
  let inLevel = 0;

  for (const word of sampleWords) {
    try {
      const result = await neo4jService.query<{ level: number }>(
        `MATCH (w:HSKWord {lemma: $word}) RETURN w.level AS level LIMIT 1`,
        { word },
      );
      if (result.length > 0) {
        inVocab++;
        const wordLevel = result[0].level;
        if (wordLevel <= targetHskLevel) {
          inLevel++;
        } else {
          overLevel++;
        }
      }
    } catch {
      // 图谱不可用时跳过
    }
  }

  return {
    coverage_rate: sampleWords.length > 0 ? inVocab / sampleWords.length : 0,
    total_words: sampleWords.length,
    in_vocab_words: inVocab,
    out_of_vocab_words: sampleWords.length - inVocab,
    overlevel_words: overLevel,
    in_level_words: inLevel,
  };
}

/**
 * 兼容旧接口名 — evaluateHSKLevelMatch 现在内部调用 evaluateHSKWordCoverage
 * 返回值仍包含旧字段名，保证 experiment-runner 不报错
 */
export async function evaluateHSKLevelMatch(
  content: GeneratedContent | null,
  targetHskLevel: number,
): Promise<{
  overlevel_rate: number;
  total_chars: number;
  overlevel_chars: number;
  in_level_chars: number;
}> {
  const result = await evaluateHSKWordCoverage(content, targetHskLevel);
  // 映射到旧字段名
  return {
    overlevel_rate: result.total_words > 0
      ? (result.out_of_vocab_words + result.overlevel_words) / result.total_words
      : 0,
    total_chars: result.total_words,
    overlevel_chars: result.out_of_vocab_words + result.overlevel_words,
    in_level_chars: result.in_level_words,
  };
}

// ============================================================================
// 3. KG 事实一致性 — 检查生成内容是否符合图谱中的知识点定义
// ============================================================================

/**
 * 从 Neo4j 查询知识点的 KG 属性（作为 ground truth）
 * 返回该 KP 关联的所有文化概念名和语用意图
 */
async function getKPKnowledgeGroundTruth(kpId: string): Promise<{
  domain_name: string;
  scene_name: string;
  pragmatic_intent: string;
  related_concepts: string[];
  cultural_dimensions: string[];
} | null> {
  try {
    const [kpResult, conceptResult, dimResult] = await Promise.all([
      neo4jService.query<{ domain: string; scene: string; intent: string }>(
        `MATCH (d:Domain)-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint {id: $kpId})
         RETURN d.name AS domain, s.name AS scene, kp.pragmatic_intent AS intent`,
        { kpId },
      ),
      neo4jService.query<{ name: string }>(
        `MATCH (kp:KnowledgePoint {id: $kpId})-[:RELATES_TO]->(cc:CulturalConcept)
         RETURN cc.name AS name`,
        { kpId },
      ),
      neo4jService.query<{ name: string }>(
        `MATCH (kp:KnowledgePoint {id: $kpId})-[:RELATES_TO]->(:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)
         RETURN cd.name AS name`,
        { kpId },
      ),
    ]);

    if (kpResult.length === 0) return null;

    return {
      domain_name: String(kpResult[0].domain || ""),
      scene_name: String(kpResult[0].scene || ""),
      pragmatic_intent: String(kpResult[0].intent || ""),
      related_concepts: conceptResult.map(r => String(r.name)),
      cultural_dimensions: dimResult.map(r => String(r.name)),
    };
  } catch {
    return null;
  }
}

/**
 * 检查生成内容是否与 KG 知识点定义一致
 *
 * 方法：
 *   1. 查 Neo4j 获取该 KP 的 domain/scene/intent/关联概念（ground truth）
 *   2. 检查生成内容的 cultural_context 中是否提到了 KG 中的关键概念
 *   3. 检查 A3 对比中使用的文化维度是否与 KG 标注的维度匹配
 *
 * 这比旧版的"中文关键词 CONTAINS 搜索"更合理——
 * 不要求每个细节都能在 KG 找到（LLM应该有创造性），
 * 而是验证核心概念和维度框架是否与 KG 一致（防止严重跑题）。
 */
export async function evaluateKGFactConsistency(
  cultural_explanation: Record<string, unknown> | null,
  cross_cultural_comparison: Record<string, unknown> | null,
  generated_content: GeneratedContent | null,
  knowledgePointId: string,
): Promise<{
  consistency: number;
  total_checks: number;
  verified_checks: number;
  details: string[];
}> {
  // 获取 ground truth
  const groundTruth = await getKPKnowledgeGroundTruth(knowledgePointId);
  if (!groundTruth) {
    return { consistency: 0, total_checks: 0, verified_checks: 0, details: ["KG不可用，跳过"] };
  }

  let totalChecks = 0;
  let verifiedChecks = 0;
  const details: string[] = [];

  // 收集所有生成文本
  const allText = [
    JSON.stringify(cultural_explanation || {}),
    JSON.stringify(cross_cultural_comparison || {}),
    generated_content?.cultural_context?.explanation || "",
    JSON.stringify(generated_content?.comparison || {}),
  ].join(" ").toLowerCase();

  // 检查1：domain/scene 是否出现在生成内容中
  totalChecks++;
  if (allText.includes(groundTruth.domain_name) ||
      groundTruth.domain_name.split("").some(c => allText.includes(c))) {
    verifiedChecks++;
    details.push(`domain "${groundTruth.domain_name}" 在内容中有体现`);
  } else {
    details.push(`domain "${groundTruth.domain_name}" 未在内容中体现`);
  }

  // 检查2：关联的文化概念是否被提及
  if (groundTruth.related_concepts.length > 0) {
    let conceptHits = 0;
    for (const concept of groundTruth.related_concepts) {
      totalChecks++;
      if (allText.includes(concept.toLowerCase()) ||
          concept.split("").filter(c => /[一-鿿]/.test(c)).some(c => allText.includes(c))) {
        conceptHits++;
      }
    }
    verifiedChecks += conceptHits;
    details.push(`关联概念: ${conceptHits}/${groundTruth.related_concepts.length} 个被提及`);
  }

  // 检查3：A3使用的文化维度框架是否与KG标注一致
  if (cross_cultural_comparison && groundTruth.cultural_dimensions.length > 0) {
    const frameworkUsed = String(
      cross_cultural_comparison.framework_used || ""
    ).toLowerCase();
    totalChecks++;
    const dimMatch = groundTruth.cultural_dimensions.some(
      d => frameworkUsed.includes(d.toLowerCase())
    );
    if (dimMatch) {
      verifiedChecks++;
      details.push(`文化维度框架与KG标注一致: "${frameworkUsed}"`);
    } else {
      details.push(`文化维度框架 "${frameworkUsed}" 与KG标注 [${groundTruth.cultural_dimensions.join(",")}] 不一致`);
    }
  }

  return {
    consistency: totalChecks > 0 ? verifiedChecks / totalChecks : 0,
    total_checks: totalChecks,
    verified_checks: verifiedChecks,
    details,
  };
}

// ============================================================================
// 4. 文化偏见度
// ============================================================================

/**
 * 对生成内容进行偏见检测
 * 复用 multi-agent-system 中的 detectBias()
 */
export function evaluateBias(
  cultural_explanation: Record<string, unknown> | null,
  cross_cultural_comparison: Record<string, unknown> | null,
  generated_content: GeneratedContent | null,
): {
  bias_score: number;
  has_bias: boolean;
  keywords: string[];
  patterns: string[];
} {
  const allTextParts: string[] = [];

  if (cultural_explanation) {
    allTextParts.push(JSON.stringify(cultural_explanation));
  }
  if (cross_cultural_comparison) {
    allTextParts.push(JSON.stringify(cross_cultural_comparison));
  }
  if (generated_content) {
    allTextParts.push(generated_content.cultural_context?.explanation || "");
    allTextParts.push(generated_content.comparison?.cn || "");
    allTextParts.push(generated_content.comparison?.target || "");
    if (generated_content.exercises) {
      for (const ex of generated_content.exercises) {
        allTextParts.push(ex.question);
        allTextParts.push(ex.explanation || "");
      }
    }
  }

  const combinedText = allTextParts.join("\n");
  const result = detectBias(combinedText);

  return {
    bias_score: result.bias_score,
    has_bias: result.has_bias,
    keywords: result.detected_keywords,
    patterns: result.detected_patterns,
  };
}

// ============================================================================
// 5. 内容多样性
// ============================================================================

/** 从文本中提取中文字符 */
function extractChineseChars(text: string): string[] {
  if (!text) return [];
  return (text.match(/[一-鿿]/g) || []);
}

/**
 * 计算内容多样性指标
 */
export function evaluateDiversity(content: GeneratedContent | null): {
  exercise_type_count: number;
  exercise_types: string[];
  vocabulary_diversity: number;
  total_tokens: number;
} {
  if (!content || !content.exercises) {
    return { exercise_type_count: 0, exercise_types: [], vocabulary_diversity: 0, total_tokens: 0 };
  }

  // 题型种类
  const types = new Set(content.exercises.map(ex => ex.type));
  const exerciseTypes = Array.from(types);

  // 词汇多样性 (type-token ratio)
  const allChineseChars: string[] = [];
  for (const ex of content.exercises) {
    allChineseChars.push(...extractChineseChars(ex.question));
    if (ex.options) {
      for (const opt of ex.options) {
        allChineseChars.push(...extractChineseChars(opt));
      }
    }
  }
  const uniqueChars = new Set(allChineseChars);

  return {
    exercise_type_count: types.size,
    exercise_types: exerciseTypes,
    vocabulary_diversity: allChineseChars.length > 0
      ? uniqueChars.size / allChineseChars.length
      : 0,
    total_tokens: allChineseChars.length,
  };
}

// ============================================================================
// 6. 练习题质量 — 答案可判别性
// ============================================================================

/**
 * 检查练习题答案的可判别性
 *
 * 规则：
 * - 选择题：correct_answer 必须是 A/B/C/D 中的一个，且正确答案在 options 中存在
 * - 判断题：correct_answer 必须是 "对" 或 "错"
 * - 答案不能与所有选项相同或相似
 */
export function evaluateExerciseAnswerability(exercises: Exercise[]): {
  answerable_rate: number;
  total: number;
  answerable: number;
} {
  if (!exercises || exercises.length === 0) {
    return { answerable_rate: 0, total: 0, answerable: 0 };
  }

  let answerable = 0;

  for (const ex of exercises) {
    let valid = false;

    if (ex.type === "multiple_choice") {
      // 正确答案必须是单字母且存在于选项中
      const answerIndex = "ABCDEFGH".indexOf(ex.correct_answer?.trim()?.toUpperCase() || "");
      if (answerIndex >= 0 && answerIndex < (ex.options?.length || 0)) {
        // 进一步检查：正确答案的选项不应与其他选项完全相同
        const correctOption = ex.options[answerIndex];
        const otherOptions = ex.options.filter((_, i) => i !== answerIndex);
        const hasDuplicate = otherOptions.some(o => o.trim() === correctOption.trim());
        valid = !hasDuplicate;
      }
    } else if (ex.type === "true_false") {
      valid = ex.correct_answer === "对" || ex.correct_answer === "错";
    } else if (ex.type === "fill_blank") {
      // 填空题：答案非空即可
      valid = !!ex.correct_answer && ex.correct_answer.trim().length > 0;
    }

    if (valid) answerable++;
  }

  return {
    answerable_rate: exercises.length > 0 ? answerable / exercises.length : 0,
    total: exercises.length,
    answerable,
  };
}

// ============================================================================
// 7. 生成效率
// ============================================================================

/**
 * 从 PipelineMetadata 或时间戳推断各 Agent 的耗时
 */
export function extractAgentDurations(
  agentTimings: Record<string, { start: number; end: number }>,
): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const [agent, timing] of Object.entries(agentTimings)) {
    durations[agent] = Math.round(timing.end - timing.start);
  }
  return durations;
}

// ============================================================================
// 8. 综合评估 — 运行所有指标
// ============================================================================

/**
 * 对一次实验运行结果计算全部指标
 */
export async function computeAllMetrics(params: {
  generated_content: GeneratedContent | null;
  cultural_explanation: Record<string, unknown> | null;
  cross_cultural_comparison: Record<string, unknown> | null;
  target_hsk_level: number;
  knowledge_point_id?: string;
  agent_timings: Record<string, { start: number; end: number }>;
  total_start_time: number;
  total_end_time: number;
}): Promise<EvaluationMetrics> {
  const {
    generated_content: content,
    cultural_explanation: explanation,
    cross_cultural_comparison: comparison,
    target_hsk_level: hskLevel,
    knowledge_point_id: kpId,
    agent_timings: timings,
    total_start_time: startTime,
    total_end_time: endTime,
  } = params;

  // 1. JSON 格式校验
  const jsonResult = evaluateJsonFormat(content);

  // 2. HSK 词汇超纲检测
  const hskResult = await evaluateHSKLevelMatch(content, hskLevel);

  // 3. KG 事实一致性（需要KP ID查ground truth）
  const kgResult = await evaluateKGFactConsistency(explanation, comparison, content, kpId || "");

  // 4. 偏见检测
  const biasResult = evaluateBias(explanation, comparison, content);

  // 5. 内容多样性
  const diversityResult = evaluateDiversity(content);

  // 6. 练习题质量
  const exerciseResult = evaluateExerciseAnswerability(content?.exercises || []);

  // 7. 生成效率
  const agentDurations = extractAgentDurations(timings);

  return {
    // 格式
    json_format_valid: jsonResult.valid,
    json_parse_error: jsonResult.error,

    // HSK
    hsk_vocab_overlevel_rate: hskResult.overlevel_rate,
    hsk_vocab_total: hskResult.total_chars,
    hsk_vocab_overlevel: hskResult.overlevel_chars,
    hsk_vocab_in_level: hskResult.in_level_chars,

    // KG
    kg_fact_consistency: kgResult.consistency,
    kg_total_claims: kgResult.total_claims,
    kg_verified_claims: kgResult.verified_claims,

    // Bias
    bias_score: biasResult.bias_score,
    bias_has_bias: biasResult.has_bias,
    bias_keywords: biasResult.keywords,
    bias_patterns: biasResult.patterns,

    // 多样性
    exercise_type_count: diversityResult.exercise_type_count,
    exercise_types: diversityResult.exercise_types,
    vocabulary_diversity: diversityResult.vocabulary_diversity,
    total_tokens: diversityResult.total_tokens,

    // 效率
    total_duration_ms: Math.round(endTime - startTime),
    agent_durations_ms: agentDurations,

    // 练习题
    exercise_answerable_rate: exerciseResult.answerable_rate,
    exercise_total: exerciseResult.total,
    exercise_answerable: exerciseResult.answerable,
  };
}

// ============================================================================
// 9. 聚合统计 — 跨测试用例的汇总分析
// ============================================================================

/**
 * 聚合统计（一组测试用例的平均值）
 */
export interface AggregateStats {
  condition: ExperimentCondition;
  sample_count: number;

  // 各指标均值
  avg_json_valid_rate: number;
  avg_hsk_overlevel_rate: number;
  avg_kg_consistency: number;
  avg_bias_score: number;
  avg_exercise_type_count: number;
  avg_vocab_diversity: number;
  avg_answerable_rate: number;
  avg_total_duration_ms: number;

  // 标准差
  std_hsk_overlevel_rate: number;
  std_kg_consistency: number;
  std_bias_score: number;

  // 汇总
  failed_count: number;  // JSON格式失败的样本数
  biased_count: number;  // 检测到偏见的样本数
}

/**
 * 对一组评估结果做聚合统计
 */
export function aggregateResults(results: EvaluationResult[]): AggregateStats {
  const n = results.length;
  if (n === 0) {
    return {
      condition: results[0]?.condition || "C1_Full",
      sample_count: 0,
      avg_json_valid_rate: 0, avg_hsk_overlevel_rate: 0, avg_kg_consistency: 0,
      avg_bias_score: 0, avg_exercise_type_count: 0, avg_vocab_diversity: 0,
      avg_answerable_rate: 0, avg_total_duration_ms: 0,
      std_hsk_overlevel_rate: 0, std_kg_consistency: 0, std_bias_score: 0,
      failed_count: 0, biased_count: 0,
    };
  }

  const jsonValid = results.filter(r => r.metrics.json_format_valid).length;
  const biased = results.filter(r => r.metrics.bias_has_bias).length;

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const mean = (arr: number[]) => sum(arr) / arr.length;
  const std = (arr: number[], m: number) => {
    const variance = sum(arr.map(x => (x - m) ** 2)) / arr.length;
    return Math.sqrt(variance);
  };

  const hskRates = results.map(r => r.metrics.hsk_vocab_overlevel_rate);
  const kgCons = results.map(r => r.metrics.kg_fact_consistency);
  const biasScores = results.map(r => r.metrics.bias_score);

  const mHsk = mean(hskRates);
  const mKg = mean(kgCons);
  const mBias = mean(biasScores);

  return {
    condition: results[0].condition,
    sample_count: n,

    avg_json_valid_rate: jsonValid / n,
    avg_hsk_overlevel_rate: mHsk,
    avg_kg_consistency: mKg,
    avg_bias_score: mBias,
    avg_exercise_type_count: mean(results.map(r => r.metrics.exercise_type_count)),
    avg_vocab_diversity: mean(results.map(r => r.metrics.vocabulary_diversity)),
    avg_answerable_rate: mean(results.map(r => r.metrics.exercise_answerable_rate)),
    avg_total_duration_ms: mean(results.map(r => r.metrics.total_duration_ms)),

    std_hsk_overlevel_rate: std(hskRates, mHsk),
    std_kg_consistency: std(kgCons, mKg),
    std_bias_score: std(biasScores, mBias),

    failed_count: n - jsonValid,
    biased_count: biased,
  };
}

/**
 * 生成评估汇总表（Markdown 格式，用于论文结果展示）
 */
export function formatAggregateTable(statsList: AggregateStats[]): string {
  if (statsList.length === 0) return "无数据";

  const header = [
    "| 条件 | 样本数 | JSON正确率 | HSK词表覆盖率↑ | KG一致性↑ | 偏见度↓ | 题型种类↑ | 词汇多样性↑ | 答案可判率↑ | 平均耗时(s) |",
    "|------|--------|-----------|-------------|----------|-------|---------|----------|----------|----------|",
  ].join("\n");

  const rows = statsList.map(s => {
    const label = CONDITION_LABELS[s.condition] || s.condition;
    return `| ${label} | ${s.sample_count} | ${(s.avg_json_valid_rate * 100).toFixed(1)}% | ${(s.avg_hsk_overlevel_rate * 100).toFixed(1)}% | ${(s.avg_kg_consistency * 100).toFixed(1)}% | ${(s.avg_bias_score * 100).toFixed(1)}% | ${s.avg_exercise_type_count.toFixed(1)} | ${(s.avg_vocab_diversity * 100).toFixed(1)}% | ${(s.avg_answerable_rate * 100).toFixed(1)}% | ${(s.avg_total_duration_ms / 1000).toFixed(1)} |`;
  }).join("\n");

  return header + "\n" + rows;
}

// ============================================================================
// 第二部分：人工评估（Human Evaluation）
// ============================================================================

/**
 * 人工评估维度
 *
 * 5个维度，各用1-5分量表，附评分Rubric，
 * 由双裁判独立盲评后取平均，计算 Krippendorff's α
 */

export interface HumanRatingDimension {
  /** 维度标识 */
  id: string;
  /** 维度名称（中文） */
  name: string;
  /** 维度描述 */
  description: string;
  /** 1-5分的评分标准 */
  rubric: Record<number, string>;
}

/** 5个人工评估维度 + Rubric */
export const HUMAN_EVAL_DIMENSIONS: HumanRatingDimension[] = [
  {
    id: "accuracy",
    name: "准确性",
    description: "文化描述是否准确，语言点解释是否无误，中文例句是否语法正确",
    rubric: {
      1: "严重错误：文化事实多处错误，或中文例句有明显语法错误",
      2: "较多小错：有2-3处不准确的文化描述或语病",
      3: "基本准确：有1处小错但不影响整体理解",
      4: "准确：文化描述和语言解释均为正确",
      5: "非常准确：所有细节准确，且引用了恰当的文化背景知识",
    },
  },
  {
    id: "cultural_appropriateness",
    name: "文化适切性",
    description: "跨文化对比是否恰当、客观，是否避免了刻板印象和文化优劣评判",
    rubric: {
      1: "严重刻板印象：包含明显的文化偏见或猎奇化表述",
      2: "有刻板倾向：存在过度泛化或隐晦的文化优劣暗示",
      3: "基本客观：对比基本中立，但不够深入",
      4: "客观深入：对比有学术框架支撑，分析有洞察",
      5: "精细且有分寸：准确识别文化差异的细微边界，避免了所有刻板陷阱",
    },
  },
  {
    id: "pedagogical_effectiveness",
    name: "教学有效性",
    description: "练习题设计是否合理，是否能有效检测学习者对文化+语言的理解",
    rubric: {
      1: "无效：题目与学习目标无关，或答案明显有误",
      2: "较弱：题目过于简单/困难，或只测记忆不测理解",
      3: "基本可用：题目能测到基本理解，但缺乏层次",
      4: "良好：题目有梯度，选项有区分度",
      5: "优秀：题目设计精巧，能测到深层文化语用理解，干扰项设计合理",
    },
  },
  {
    id: "personalization",
    name: "个体适配性",
    description: "内容难度是否匹配目标HSK等级，文化解释是否针对学习者母语背景做了适配",
    rubric: {
      1: "完全不匹配：难度远超/远低于目标等级，未体现母语适配",
      2: "匹配较差：有明显超纲内容，或母语适配形同虚设",
      3: "大致匹配：难度基本合适，母语适配有一定体现",
      4: "良好匹配：难度恰当，母语文化对比有针对性",
      5: "精准匹配：难度精确，母语对比高度定制化，学习者能直接关联自身经验",
    },
  },
  {
    id: "overall_quality",
    name: "整体质量",
    description: "综合评价：这份学习内容是否可以直接用于教学",
    rubric: {
      1: "不可用：需要完全重做",
      2: "需大量修改：核心内容有问题但方向对",
      3: "需少量修改：基本可用但有小问题",
      4: "可直接使用：质量良好，无需修改",
      5: "优秀范例：可作为教学模板参考",
    },
  },
];

/**
 * 单条人工评分记录
 */
export interface HumanRating {
  /** 评分者ID（rater_1 / rater_2） */
  rater_id: string;
  /** 被评样本的 test_case_id */
  sample_id: string;
  /** 各维度评分 (1-5) */
  scores: Record<string, number>;
  /** 评分备注（可选） */
  notes?: string;
  /** 评分时间戳 */
  timestamp?: number;
}

/**
 * 人工评估样本（盲评用——隐藏条件标签）
 */
export interface HumanEvalSample {
  /** 样本编号（盲评用，不暴露条件） */
  blind_id: string;
  /** 原始 test_case_id */
  test_case_id: string;
  /** 实际实验条件（评分者不可见） */
  condition: ExperimentCondition;
  /** 学习者母语 */
  native_language: string;
  /** HSK等级 */
  hsk_level: number;
  /** 展示给评分者的内容 */
  content: {
    /** A2母语阐释（可能是null，如C5） */
    cultural_explanation: Record<string, unknown> | null;
    /** A3跨文化对比（可能是null，如C3/C5） */
    cross_cultural_comparison: Record<string, unknown> | null;
    /** A4练习题 + 文化背景 */
    exercises: Array<{
      type: string;
      question: string;
      options?: string[];
      correct_answer: string;
      explanation?: string;
    }>;
    cultural_context_explanation: string;
    language_points: Array<{ zh: string; translation: string }>;
    comparison_summary: string;
  };
}

// ============================================================================
// 抽样策略
// ============================================================================

/**
 * 分层抽样：从实验结果中按条件×母语×HSK均匀抽取人工评估样本
 *
 * @param results 全部实验结果
 * @param samplesPerStratum 每层抽几条（默认2条）
 * @returns 盲评样本列表
 */
export function sampleForHumanEval(
  results: EvaluationResult[],
  samplesPerStratum: number = 2,
): HumanEvalSample[] {
  // 分层：condition × native_language × hsk_level
  const strata = new Map<string, EvaluationResult[]>();
  for (const r of results) {
    // 只取 JSON 有效的样本
    if (!r.metrics.json_format_valid) continue;
    const key = `${r.condition}|${r.native_language}|${r.hsk_level}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key)!.push(r);
  }

  const samples: HumanEvalSample[] = [];
  let blindCounter = 1;

  for (const [, pool] of strata) {
    // 每层随机抽 N 条（如果不够就全取）
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, samplesPerStratum);

    for (const r of selected) {
      const gc = r.raw_output.generated_content;
      samples.push({
        blind_id: `BLIND_${String(blindCounter).padStart(3, "0")}`,
        test_case_id: r.test_case_id,
        condition: r.condition,
        native_language: r.native_language,
        hsk_level: r.hsk_level,
        content: {
          cultural_explanation: r.raw_output.cultural_explanation,
          cross_cultural_comparison: r.raw_output.cross_cultural_comparison,
          exercises: (gc?.exercises || []).map(ex => ({
            type: ex.type,
            question: ex.question,
            options: ex.options,
            correct_answer: ex.correct_answer,
            explanation: ex.explanation,
          })),
          cultural_context_explanation: gc?.cultural_context?.explanation || "",
          language_points: (gc?.language_points || []).map(lp => ({
            zh: lp.zh || "",
            translation: lp.native || lp.en || lp.translation || "",
          })),
          comparison_summary: gc?.comparison
            ? `${gc.comparison.cn || ""}\n--- vs ---\n${gc.comparison.target || ""}`
            : "",
        },
      });
      blindCounter++;
    }
  }

  // 打乱顺序，防止评分者猜到模式
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  return samples;
}

// ============================================================================
// 评分表生成
// ============================================================================

/**
 * 生成人工评估评分表（JSON格式，可直接发给评分者或导入问卷工具）
 *
 * @param samples 盲评样本列表
 * @returns 评分表 JSON 字符串
 */
export function generateRatingSheet(samples: HumanEvalSample[]): string {
  const sheet = {
    title: "论文实验 — 人工评估评分表",
    instructions: {
      overview: `请对以下 ${samples.length} 个学习内容样本进行5维评分（1-5分）。`,
      important: [
        "每个样本的 BLIND_ID 是随机编号，请不要猜测或记录样本对应的实验条件",
        "请按顺序逐条评分，不要回头修改已评的分数",
        "评分前请先通读评分维度说明和 Rubric，确保理解每个分值的含义",
        "预计耗时：约${Math.ceil(samples.length * 3)} 分钟（每条约2-3分钟）",
        "如有疑问，请在评分表末尾的备注区记录",
      ],
      dimensions: HUMAN_EVAL_DIMENSIONS.map(d => ({
        name: d.name,
        description: d.description,
        rubric: d.rubric,
      })),
    },
    samples: samples.map(s => ({
      blind_id: s.blind_id,
      learner_info: `母语: ${s.native_language} | HSK等级: ${s.hsk_level}`,
      content: s.content,
    })),
    rating_form: samples.map(s => ({
      blind_id: s.blind_id,
      scores: Object.fromEntries(
        HUMAN_EVAL_DIMENSIONS.map(d => [d.id, null])
      ),
      notes: "",
    })),
  };

  return JSON.stringify(sheet, null, 2);
}

/**
 * 生成 Markdown 格式的评分表（可直接打印或导入Google Forms）
 */
export function generateRatingSheetMarkdown(samples: HumanEvalSample[]): string {
  const dimHeader = HUMAN_EVAL_DIMENSIONS.map(d => `${d.name}(1-5)`).join(" | ");
  const sep = ":--".repeat(HUMAN_EVAL_DIMENSIONS.length + 2).split(":").join("|:");

  let md = `# 人工评估评分表\n\n`;
  md += `> 共 ${samples.length} 个样本，请逐条评分。\n\n`;
  md += `## 评分维度说明\n\n`;

  for (const d of HUMAN_EVAL_DIMENSIONS) {
    md += `### ${d.name} — ${d.description}\n`;
    for (const [score, desc] of Object.entries(d.rubric)) {
      md += `- **${score}分**: ${desc}\n`;
    }
    md += "\n";
  }

  md += `## 评分表\n\n`;
  md += `| BLIND_ID | 学习者背景 | ${dimHeader} | 备注 |\n`;
  md += `|${sep}|\n`;

  for (const s of samples) {
    const bg = `${s.native_language} HSK${s.hsk_level}`;
    const cells = HUMAN_EVAL_DIMENSIONS.map(() => "  ").join(" | ");
    md += `| ${s.blind_id} | ${bg} | ${cells} |  |\n`;
  }

  return md;
}

// ============================================================================
// 评分汇总
// ============================================================================

/**
 * 汇总双裁判评分
 *
 * @param ratings 两个评分者的评分记录
 * @returns 每个样本的每维度均分 + 评分者间差异
 */
export interface HumanEvalSummary {
  /** 按 blind_id 索引 */
  by_sample: Record<string, {
    blind_id: string;
    test_case_id: string;
    condition: ExperimentCondition;
    /** 维度 → [rater1_score, rater2_score] */
    dimension_scores: Record<string, [number, number]>;
    /** 维度 → 平均分 */
    dimension_avg: Record<string, number>;
    /** 总体平均分 */
    overall_avg: number;
    /** 两裁判在各维度上的绝对差异均值 */
    rater_disagreement: number;
  }>;
  /** 按 condition 聚合 */
  by_condition: Record<ExperimentCondition, {
    sample_count: number;
    dimension_avgs: Record<string, number>;
    overall_avg: number;
    std: number;
  }>;
  /** 评分者间信度 */
  inter_rater_reliability: {
    alpha: number;
    interpretation: string;
    per_dimension_alpha: Record<string, number>;
  };
}

export function summarizeHumanRatings(
  ratings: HumanRating[],
  samples: HumanEvalSample[],
): HumanEvalSummary {
  // 建立 blind_id → sample 映射
  const sampleMap = new Map(samples.map(s => [s.blind_id, s]));

  // 按 sample 分组评分
  const byBlindId = new Map<string, HumanRating[]>();
  for (const r of ratings) {
    if (!byBlindId.has(r.sample_id)) byBlindId.set(r.sample_id, []);
    byBlindId.get(r.sample_id)!.push(r);
  }

  // 逐样本汇总
  const bySample: HumanEvalSummary["by_sample"] = {};
  const byCondition: Map<ExperimentCondition, Array<Record<string, number>>> = new Map();

  for (const [blindId, sampleRatings] of byBlindId) {
    const sample = sampleMap.get(blindId);
    if (!sample || sampleRatings.length < 2) continue;

    const [r1, r2] = sampleRatings;
    const dimensionScores: Record<string, [number, number]> = {};
    const dimensionAvgs: Record<string, number> = {};
    let totalAvg = 0;
    let dimCount = 0;
    let totalDisagreement = 0;

    for (const dim of HUMAN_EVAL_DIMENSIONS) {
      const s1 = r1.scores[dim.id] ?? 0;
      const s2 = r2.scores[dim.id] ?? 0;
      dimensionScores[dim.id] = [s1, s2];
      const avg = (s1 + s2) / 2;
      dimensionAvgs[dim.id] = avg;
      totalAvg += avg;
      totalDisagreement += Math.abs(s1 - s2);
      dimCount++;
    }

    const overallAvg = dimCount > 0 ? totalAvg / dimCount : 0;

    bySample[blindId] = {
      blind_id: blindId,
      test_case_id: sample.test_case_id,
      condition: sample.condition,
      dimension_scores: dimensionScores,
      dimension_avg: dimensionAvgs,
      overall_avg: overallAvg,
      rater_disagreement: dimCount > 0 ? totalDisagreement / dimCount : 0,
    };

    // 按条件聚合
    if (!byCondition.has(sample.condition)) {
      byCondition.set(sample.condition, []);
    }
    byCondition.get(sample.condition)!.push(dimensionAvgs);
  }

  // 按条件聚合统计
  const byConditionSummary: HumanEvalSummary["by_condition"] = {} as any;
  for (const [cond, dims] of byCondition) {
    const n = dims.length;
    const dimAvgs: Record<string, number> = {};
    let overallSum = 0;
    let overallStd = 0;

    for (const dim of HUMAN_EVAL_DIMENSIONS) {
      const sum = dims.reduce((acc, d) => acc + (d[dim.id] || 0), 0);
      dimAvgs[dim.id] = n > 0 ? sum / n : 0;
    }

    const allAvgs = dims.map(d => {
      let sum = 0;
      let count = 0;
      for (const dim of HUMAN_EVAL_DIMENSIONS) {
        sum += d[dim.id] || 0;
        count++;
      }
      return count > 0 ? sum / count : 0;
    });

    overallSum = allAvgs.reduce((a, b) => a + b, 0);
    const mean = n > 0 ? overallSum / n : 0;
    overallStd = n > 1
      ? Math.sqrt(allAvgs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1))
      : 0;

    byConditionSummary[cond] = {
      sample_count: n,
      dimension_avgs: dimAvgs,
      overall_avg: mean,
      std: overallStd,
    };
  }

  // 评分者间信度 Krippendorff's α
  const reliability = calculateKrippendorffAlpha(ratings, samples);

  return {
    by_sample: bySample,
    by_condition: byConditionSummary,
    inter_rater_reliability: reliability,
  };
}

// ============================================================================
// 评分者间信度 Krippendorff's α
// ============================================================================

/**
 * 计算 Krippendorff's α（适用于任意数量评分者、序数/区间数据）
 *
 * α = 1 - Do / De
 * Do: 观测不一致度
 * De: 期望不一致度（随机情况下的不一致度）
 *
 * 参考: Krippendorff (2011)
 */
function calculateKrippendorffAlpha(
  ratings: HumanRating[],
  samples: HumanEvalSample[],
): {
  alpha: number;
  interpretation: string;
  per_dimension_alpha: Record<string, number>;
} {
  const perDim: Record<string, number> = {};

  for (const dim of HUMAN_EVAL_DIMENSIONS) {
    // 构建评分矩阵：行=样本，列=评分者
    const ratingMatrix: Map<string, number[]> = new Map();
    for (const r of ratings) {
      if (!ratingMatrix.has(r.sample_id)) ratingMatrix.set(r.sample_id, []);
      ratingMatrix.get(r.sample_id)!.push(r.scores[dim.id] ?? 0);
    }

    // 过滤：至少要有2个评分者的样本
    const validRatings = Array.from(ratingMatrix.values()).filter(v => v.length >= 2);
    if (validRatings.length < 2) {
      perDim[dim.id] = 0;
      continue;
    }

    const n = validRatings.reduce((sum, v) => sum + v.length, 0); // 总评分数
    const m = validRatings.length; // 样本数

    // 计算 Do (observed disagreement)
    let doSum = 0;
    let pairCount = 0;
    for (const values of validRatings) {
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          // 区间数据的差异度量：(value_i - value_j)²
          doSum += (values[i] - values[j]) ** 2;
          pairCount++;
        }
      }
    }
    const Do = pairCount > 0 ? doSum / pairCount : 0;

    // 计算 De (expected disagreement)
    // 所有评分的均值和方差
    const allValues = validRatings.flat();
    const meanVal = allValues.reduce((a, b) => a + b, 0) / n;
    const variance = allValues.reduce((sum, v) => sum + (v - meanVal) ** 2, 0) / (n - 1);

    // De = (n / (n-1)) * variance * 2 (对于区间数据)
    const De = n > 1 ? (n / (n - 1)) * variance * 2 : 0;

    perDim[dim.id] = De > 0 ? Math.max(0, 1 - Do / De) : 1;
  }

  // 整体 α（各维度平均）
  const dimAlphas = Object.values(perDim).filter(v => v > 0);
  const overallAlpha = dimAlphas.length > 0
    ? dimAlphas.reduce((a, b) => a + b, 0) / dimAlphas.length
    : 0;

  // 解读
  let interpretation: string;
  if (overallAlpha >= 0.8) interpretation = "高一致性（≥0.8）：评分者间信度良好，结果可信";
  else if (overallAlpha >= 0.667) interpretation = "可接受（0.667-0.8）：评分者间有一定一致性，可谨慎使用";
  else if (overallAlpha >= 0.5) interpretation = "偏低（0.5-0.667）：建议检查Rubric清晰度或增加评分者培训";
  else interpretation = "不可接受（<0.5）：评分者间一致性过低，需重新设计评分标准";

  return { alpha: overallAlpha, interpretation, per_dimension_alpha: perDim };
}

// ============================================================================
// 人工 + 自动 指标合并
// ============================================================================

/**
 * 人工评分 vs 自动指标 的 Spearman 相关系数
 *
 * 用于验证自动指标的生态效度（ecological validity）：
 * 即自动指标（如偏见度、超纲率）在多大程度上能预测人工评分
 */
export function correlateHumanAndAuto(
  humanSummary: HumanEvalSummary,
  autoResults: EvaluationResult[],
): Array<{
  human_dim: string;
  auto_metric: string;
  spearman_r: number;
  interpretation: string;
}> {
  const correlations: Array<{
    human_dim: string;
    auto_metric: string;
    spearman_r: number;
    interpretation: string;
  }> = [];

  // 配对：human_dim → auto_metric
  const pairs: Array<[string, string, (r: EvaluationResult) => number]> = [
    ["accuracy", "KG一致性", r => r.metrics.kg_fact_consistency],
    ["cultural_appropriateness", "偏见度", r => 1 - r.metrics.bias_score], // 反转（低偏见=高分数）
    ["pedagogical_effectiveness", "答案可判率", r => r.metrics.exercise_answerable_rate],
    ["personalization", "HSK超纲率", r => 1 - r.metrics.hsk_vocab_overlevel_rate], // 反转
    ["overall_quality", "JSON正确率", r => r.metrics.json_format_valid ? 1 : 0],
  ];

  // 建立 test_case_id → auto metric 值的映射
  const autoMap = new Map<string, EvaluationResult>();
  for (const r of autoResults) {
    autoMap.set(r.test_case_id, r);
  }

  for (const [humanDim, autoName, autoFn] of pairs) {
    // 收集配对数据：同一 test_case_id 的人工评分和自动指标值
    const paired: Array<{ human: number; auto: number }> = [];
    for (const [, sampleData] of Object.entries(humanSummary.by_sample)) {
      const autoR = autoMap.get(sampleData.test_case_id);
      if (autoR) {
        const humanScore = sampleData.dimension_avg[humanDim];
        const autoScore = autoFn(autoR);
        if (humanScore !== undefined && !isNaN(autoScore)) {
          paired.push({ human: humanScore, auto: autoScore });
        }
      }
    }

    if (paired.length < 5) continue;

    // Spearman 秩相关系数
    const rank = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return arr.map(v => sorted.indexOf(v) + 1);
    };
    const humanRanks = rank(paired.map(p => p.human));
    const autoRanks = rank(paired.map(p => p.auto));
    const n = paired.length;
    const d2 = humanRanks.reduce((sum, hr, i) => sum + (hr - autoRanks[i]) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n ** 2 - 1));

    let interp: string;
    if (Math.abs(rho) >= 0.7) interp = "强相关：自动指标可有效预测人工评分";
    else if (Math.abs(rho) >= 0.4) interp = "中等相关：自动指标有一定预测力";
    else interp = "弱相关：自动指标不能替代人工评分";

    correlations.push({
      human_dim: humanDim,
      auto_metric: autoName,
      spearman_r: Math.round(rho * 1000) / 1000,
      interpretation: interp,
    });
  }

  return correlations;
}

/**
 * 生成人工评估汇总表（Markdown格式）
 */
export function formatHumanEvalTable(summary: HumanEvalSummary): string {
  const conditions = Object.keys(summary.by_condition) as ExperimentCondition[];
  if (conditions.length === 0) return "无数据";

  // 表头
  const dimNames = HUMAN_EVAL_DIMENSIONS.map(d => d.name);
  let table = "| 条件 | 样本数 | " + dimNames.join(" | ") + " | 总体均分 | 裁判分歧 |\n";
  table += "|------|--------|" + dimNames.map(() => "------").join("|") + "|--------|--------|\n";

  // 按条件聚合
  // 计算每个条件的裁判分歧均值
  const condDisagreements: Record<string, number[]> = {};
  for (const [, s] of Object.entries(summary.by_sample)) {
    if (!condDisagreements[s.condition]) condDisagreements[s.condition] = [];
    condDisagreements[s.condition].push(s.rater_disagreement);
  }

  for (const cond of conditions) {
    const cs = summary.by_condition[cond];
    const disagreements = condDisagreements[cond] || [];
    const avgDisagreement = disagreements.length > 0
      ? disagreements.reduce((a, b) => a + b, 0) / disagreements.length
      : 0;

    const label = CONDITION_LABELS[cond] || cond;
    const dimCells = HUMAN_EVAL_DIMENSIONS
      .map(d => (cs.dimension_avgs[d.id] || 0).toFixed(2))
      .join(" | ");
    table += `| ${label} | ${cs.sample_count} | ${dimCells} | ${cs.overall_avg.toFixed(2)} | ${avgDisagreement.toFixed(2)} |\n`;
  }

  // 信度
  const irr = summary.inter_rater_reliability;
  table += `\n**评分者间信度**: Krippendorff's α = ${irr.alpha.toFixed(3)} — ${irr.interpretation}\n`;
  table += "\n各维度信度:\n";
  for (const [dim, alpha] of Object.entries(irr.per_dimension_alpha)) {
    const dimName = HUMAN_EVAL_DIMENSIONS.find(d => d.id === dim)?.name || dim;
    table += `- ${dimName}: α = ${alpha.toFixed(3)}\n`;
  }

  return table;
}
