// ==============================================================
// 本文件由 src/lib/multi-agent-system.ts 拆分而来（方案一 · 横向切分）
// 拆分策略：零逻辑改动，纯代码搬移；兼容 barrel 保留于 src/lib/multi-agent-system.ts
// ==============================================================

/**
 * 多智能体系统框架 v2.0
 * Multi-Agent System Framework for Cross-Cultural Chinese Learning
 * 
 * 重构要点：
 * 1. 强约束 Prompt 设计 - JSON Schema 输出
 * 2. 容错机制 - 超时重试
 * 3. 场景动态映射
 * 4. 能力向量闭环计算
 */

import { UnifiedLLMService, type LLMMessage, type LLMResponse, type LLMProvider } from '../unified-llm-service';
import { getLLMConfig, isOfflineMockExecution, type LLMPreset } from '../llm-config';
import {
  getGuardrailService,
  createPipelineContext,
  applyGuardrailResult,
  shouldWriteCache,
  getPipelineMetadata,
  publishGuardrailTelemetry,
  CACHE_WRITE_CONFIDENCE_THRESHOLD,
  type GuardrailVerdict,
  type ExerciseItem,
  type PipelineContext,
  type PipelineMetadata,
} from "@/services/guardrail-service";
import { CacheManager } from "@/storage/cache/cache-manager";
import { buildHardRuleCharWhitelist as buildHardRuleCharWhitelistFromGraph } from "../hsk-vocab-graph";
import { neo4jService } from "../neo4j-service";
import type { VocabularyConstraint } from "../hsk-vocab-graph";
import {
  AGENT_CONFIGS,
  SCENE_TO_KP_KEYWORDS,
  BIAS_KEYWORDS,
  BIAS_PATTERNS,
  BIAS_KEYWORDS_TEMPORAL,
  BIAS_PATTERNS_TEMPORAL,
  EXERCISES_PER_SESSION,
  getLanguageCode,
  getLanguageCodeStrict,
  getLanguageNaturalName,
  getSceneType as resolveSceneType,
} from '../constants';

// ==================== 错误类型定义 ====================


import type {
  Exercise,
  SlotDef,
  SlotTemplate,
  SlotResult,
} from './types';

export function calculateCulturalAnxiety(params: {
  cultural_error_rate: number;
  time_ratio: number;
  abandonment_rate: number;
  negative_feedback: number;
}): number {
  const { cultural_error_rate, time_ratio, abandonment_rate, negative_feedback } = params;
  return Math.min(100, Math.max(0,
    0.4 * cultural_error_rate * 100 +
    0.3 * time_ratio * 100 +
    0.2 * abandonment_rate * 100 +
    0.1 * negative_feedback * 100
  ));
}

/**
 * 统一焦虑度增量计算（用于做题后更新）
 * 
 * 这是系统中唯一的焦虑度增量公式。
 * results API 和 A1 都使用这套逻辑，保证数据库值与生成链路一致。
 * 
 * 逻辑：正确率高 → 焦虑度下降；正确率低 → 焦虑度上升
 * - 全对(1.0): anxiety_change = -10, 焦虑下降
 * - 50%对(0.5): anxiety_change = 0, 不变
 * - 全错(0.0): anxiety_change = +10, 焦虑上升
 */
export function calculateAnxietyDelta(correctnessRate: number): number {
  return (0.5 - correctnessRate) * 20;
}

/**
 * 从数据库焦虑度 + 增量计算新焦虑度
 * 统一入口：results API 写回数据库时用这个，保证数值一致
 */
export function applyAnxietyDelta(currentAnxiety: number, correctnessRate: number): number {
  const delta = calculateAnxietyDelta(correctnessRate);
  return Math.min(100, Math.max(0, currentAnxiety + delta));
}

/**
 * 焦虑度分数 → 焦虑等级映射
 * 用于 A2/A3/A4 的 prompt 参数
 */
export function anxietyScoreToLevel(score: number): 'low' | 'medium' | 'high' {
  if (score > 80) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * 动态母语占比
 */
export function calculateNativeLanguageRatio(anxiety_score: number): {
  native_ratio: number;
  chinese_ratio: number;
} {
  let native_ratio: number;

  if (anxiety_score > 80) {
    native_ratio = 0.75;
  } else if (anxiety_score >= 40) {
    native_ratio = 0.5;
  } else {
    native_ratio = 0.25;
  }

  return {
    native_ratio: Math.round(native_ratio * 100) / 100,
    chinese_ratio: Math.round((1 - native_ratio) * 100) / 100
  };
}

// ==================== θ₃ 空间中介：6槽位分段生成 ====================

/**
 * 单个槽位
 */

export function validateSlotRatio(
  cultural_explanation: Record<string, unknown>,
  slotStructure: SlotTemplate,
): { actual_native_ratio: number; passed: boolean; deviation: number } {
  // 近似计算：统计precise_definition等母语字段 vs 中文exercises部分
  const nativeText = [
    cultural_explanation.precise_definition,
    cultural_explanation.scene_introduction,
    ...(Array.isArray(cultural_explanation.pragmatic_rules) ? cultural_explanation.pragmatic_rules : []),
    ...(Array.isArray(cultural_explanation.taboo_warnings) ? cultural_explanation.taboo_warnings : []),
    cultural_explanation.difficulty_notes,
  ].filter(Boolean).join(" ");

  // 中文部分从key_terms等提取
  const chineseText = Array.isArray(cultural_explanation.key_terms)
    ? cultural_explanation.key_terms.map((t: any) => `${t.chinese || ''} ${t.pinyin || ''}`).join(" ")
    : "";

  const total = nativeText.length + chineseText.length;
  const actualRatio = total > 0 ? nativeText.length / total : slotStructure.target_ratio;
  const deviation = Math.abs(actualRatio - slotStructure.target_ratio);

  return {
    actual_native_ratio: Math.round(actualRatio * 100) / 100,
    passed: deviation <= 0.15,
    deviation,
  };
}

// ============================================================================

/**
 * 偏见度检测（强化版）
 */

export function detectBias(text: string): {
  has_bias: boolean;
  bias_score: number;
  detected_keywords: string[];
  detected_patterns: string[];
  /** θ₂ 时间中止 — 进化论语汇命中 */
  has_temporal_bias: boolean;
  temporal_score: number;
  temporal_keywords: string[];
  temporal_patterns: string[];
} {
  const detected_keywords: string[] = [];
  const detected_patterns: string[] = [];
  const temporal_keywords: string[] = [];
  const temporal_patterns: string[] = [];

  // ── θ₁ 价值中立：关键词检测 ──
  for (const keyword of BIAS_KEYWORDS) {
    if (text.includes(keyword)) {
      detected_keywords.push(keyword);
    }
  }

  // ── θ₁ 价值中立：句式模式检测 ──
  for (const pattern of BIAS_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      detected_patterns.push(...matches);
    }
  }

  // ── θ₂ 时间中止：进化论语汇关键词 ──
  for (const keyword of BIAS_KEYWORDS_TEMPORAL) {
    if (text.includes(keyword)) {
      temporal_keywords.push(keyword);
    }
  }

  // ── θ₂ 时间中止：进化论语汇/救世主话术模式 ──
  for (const pattern of BIAS_PATTERNS_TEMPORAL) {
    const matches = text.match(pattern);
    if (matches) {
      temporal_patterns.push(...matches);
    }
  }

  const bias_score = Math.min(1,
    detected_keywords.length * 0.1 +
    detected_patterns.length * 0.2
  );

  // θ₂ 时间偏移分数：独立于 θ₁，单独追踪
  const temporal_score = Math.min(1,
    temporal_keywords.length * 0.15 +
    temporal_patterns.length * 0.25
  );

  return {
    has_bias: bias_score > 0.2,
    bias_score,
    detected_keywords,
    detected_patterns,
    has_temporal_bias: temporal_score > 0.1,
    temporal_score,
    temporal_keywords,
    temporal_patterns,
  };
}

/**
 * 贝叶斯知识追踪
 */
export function bayesianKnowledgeTracing(params: {
  prior_probability: number;
  guess_probability: number;
  slip_probability: number;
  observed_correct: boolean;
}): number {
  const { prior_probability, guess_probability, slip_probability, observed_correct } = params;

  if (observed_correct) {
    const numerator = (1 - slip_probability) * prior_probability;
    const denominator = (1 - slip_probability) * prior_probability + guess_probability * (1 - prior_probability);
    return numerator / denominator;
  } else {
    const numerator = slip_probability * prior_probability;
    const denominator = slip_probability * prior_probability + (1 - guess_probability) * (1 - prior_probability);
    return numerator / denominator;
  }
}

/**
 * 计算艾宾浩斯记忆稳定性 S
 * S = 30 + 5 * ln(1 + cumulative_correct)
 * 基础半衰期 30 天，累积正确次数越多稳定性越高
 */
export function computeMemoryStrength(cumulativeCorrect: number): number {
  return 30 + 5 * Math.log(1 + cumulativeCorrect);
}

/**
 * 应用艾宾浩斯遗忘曲线衰减
 * R(t) = masteryScore * e^(-t/S)
 * t: 距上次更新的天数, S: 记忆稳定性
 * 返回衰减后的掌握度分数 (0~1)
 */
export function applyForgettingDecay(
  masteryScore: number,
  daysSinceLastUpdate: number,
  cumulativeCorrect: number,
): number {
  if (daysSinceLastUpdate <= 0) return masteryScore;
  const S = computeMemoryStrength(cumulativeCorrect);
  const retention = Math.exp(-daysSinceLastUpdate / S);
  return Math.round(masteryScore * retention * 1000) / 1000;
}

/**
 * 能力向量计算（加权移动平均）
 */

export function calculateAbilityVector(
  oldVector: number[],
  currentResults: Array<{
    dimension: 'grammar' | 'listening' | 'speaking' | 'cultural_pragmatic' | 'reading';
    correct: boolean;
    weight?: number;
  }>
): number[] {
  // 维度索引映射
  const dimensionMap = {
    'grammar': 0,
    'listening': 1,
    'speaking': 2,
    'cultural_pragmatic': 3,
    'reading': 4
  };

  // 初始化新向量
  const newVector = [...oldVector];
  const counts = [0, 0, 0, 0, 0];
  const weightedSum = [0, 0, 0, 0, 0];
  const weights = [0, 0, 0, 0, 0];

  // 收集统计数据
  for (const result of currentResults) {
    const dimIndex = dimensionMap[result.dimension];
    const w = result.weight || 1;
    counts[dimIndex]++;
    weightedSum[dimIndex] += (result.correct ? 100 : 0) * w;
    weights[dimIndex] += w;
  }

  // 计算加权平均并与旧值融合（α=0.7 新数据权重）
  const alpha = 0.7;
  for (let i = 0; i < 5; i++) {
    if (counts[i] > 0) {
      const newScore = weightedSum[i] / weights[i];
      // 加权移动平均
      newVector[i] = Math.round(alpha * newScore + (1 - alpha) * oldVector[i]);
    }
  }

  // 确保值在0-100范围内
  return newVector.map(v => Math.min(100, Math.max(0, v)));
}

// getSceneType 已迁移至 ./constants.ts，通过 import 以 resolveSceneType 别名引入

// ==================== 智能体基类 ====================

/**
 * 语言代码 → HomeCulture 节点 ID 映射
 * 用于 Neo4j 图查询时定位学习者的母语文化圈
 */
