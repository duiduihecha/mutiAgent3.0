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


import type { RecentLearningTrend } from './types';

export async function aggregateLearnerMetrics(supabaseClient: any, learnerId: string): Promise<{
  cultural_error_rate: number;
  time_ratio: number;
  abandonment_rate: number;
  negative_feedback: number;
  record_count: number;
}> {
  // 查最近 10 条评估记录
  const { data: records, error } = await supabaseClient
    .from('assessment_records')
    .select('correct_answers, wrong_answers, anxiety_before, anxiety_after, score')
    .eq('learner_id', learnerId)
    .order('assessed_at', { ascending: false })
    .limit(10);

  if (error || !records || records.length === 0) {
    // 没有历史记录，使用默认值（新用户焦虑度中等偏高）
    return {
      cultural_error_rate: 0.3,
      time_ratio: 0.5,
      abandonment_rate: 0.1,
      negative_feedback: 0.1,
      record_count: 0
    };
  }

  // 聚合错误率
  let totalCorrect = 0;
  let totalWrong = 0;
  for (const r of records) {
    totalCorrect += (r.correct_answers || 0);
    totalWrong += (r.wrong_answers || 0);
  }
  const totalAnswers = totalCorrect + totalWrong;
  const cultural_error_rate = totalAnswers > 0 ? totalWrong / totalAnswers : 0.3;

  // 从焦虑度变化趋势推断 negative_feedback：
  // 如果焦虑度持续上升，说明存在负面反馈
  let anxietyIncreaseCount = 0;
  for (const r of records) {
    if (r.anxiety_after != null && r.anxiety_before != null && r.anxiety_after > r.anxiety_before) {
      anxietyIncreaseCount++;
    }
  }
  const negative_feedback = records.length > 0 ? anxietyIncreaseCount / records.length : 0.1;

  return {
    cultural_error_rate,
    time_ratio: 0.5,     // fallback: 暂无时间数据
    abandonment_rate: 0.1, // fallback: 暂无放弃数据
    negative_feedback,
    record_count: records.length
  };
}

// ==================== Phase 2: L2 短期记忆趋势聚合 ====================


export async function getRecentLearningTrend(
  supabaseClient: any,
  learnerId: string,
  windowSize = 5
): Promise<RecentLearningTrend> {
  const { data: records, error } = await supabaseClient
    .from("assessment_records")
    .select("score, dimension_scores, error_patterns, scene_type, assessed_at")
    .eq("learner_id", learnerId)
    .order("assessed_at", { ascending: false })
    .limit(windowSize);

  // 无记录 → 返回空趋势（新用户）
  if (error || !records || records.length === 0) {
    console.log(`[L2-趋势] learner=${learnerId.slice(0,8)}... 无历史评估记录`);
    return {
      recent_average_score: 0,
      weak_dimensions: [],
      dimension_accuracy: {},
      repeated_error_patterns: [],
      repeated_scenes: [],
      accuracy_trend: "stable",
      window_size: windowSize,
      actual_records: 0,
    };
  }

  console.log(
    `[L2-趋势] learner=${learnerId.slice(0,8)}... 找到 ${records.length} 条近期记录`
  );

  // ---- 1. 平均分 ----
  const totalScore = records.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0);
  const recent_average_score = Math.round((totalScore / records.length) * 10) / 10;

  // ---- 2. 维度正确率聚合 ----
  const dimensionTotals: Record<string, { correct: number; total: number }> = {};
  for (const r of records) {
    if (!r.dimension_scores) continue;
    for (const [dim, score] of Object.entries(r.dimension_scores as Record<string, number>)) {
      if (!dimensionTotals[dim]) dimensionTotals[dim] = { correct: 0, total: 0 };
      dimensionTotals[dim].total += 1;
      dimensionTotals[dim].correct += score; // score 就是该维度本轮的答对题数
    }
  }
  const dimension_accuracy: Record<string, number> = {};
  for (const [dim, stats] of Object.entries(dimensionTotals)) {
    dimension_accuracy[dim] =
      stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  }

  // 正确率 < 40% 的维度标记为弱维度
  const weak_dimensions = Object.entries(dimension_accuracy)
    .filter(([, acc]) => acc < 40 && acc > 0) // 排除从未出现过的维度
    .map(([dim]) => dim);

  // ---- 3. 反复错误模式 ----
  // error_patterns 存的是对象 { dimension, question_index, pattern }（见 results/route.ts:188）。
  // 曾直接拿对象当 map key，被隐式 toString 成 "[object Object]" —— 所有错误塌进同一个桶，
  // 既让日志变成 errors=[[object Object]]，也把这个无意义字符串喂进了 A4 的 prompt。
  // 这里按「维度:模式」归一化成可读 key（question_index 是题序、不参与聚合）。
  const patternFreq: Record<string, number> = {};
  for (const r of records) {
    if (!Array.isArray(r.error_patterns)) continue;
    for (const p of r.error_patterns) {
      let key: string;
      if (typeof p === 'string') {
        key = p;
      } else if (p && typeof p === 'object') {
        const dim = (p as Record<string, unknown>).dimension;
        const pat = (p as Record<string, unknown>).pattern;
        key = [dim, pat].filter(Boolean).join(':') || JSON.stringify(p);
      } else {
        continue;
      }
      patternFreq[key] = (patternFreq[key] || 0) + 1;
    }
  }
  const repeated_error_patterns = Object.entries(patternFreq)
    .filter(([, count]) => count >= 2)
    .map(([pattern]) => pattern);

  // ---- 4. 反复学习的场景 ----
  const sceneFreq: Record<string, number> = {};
  for (const r of records) {
    if (!r.scene_type) continue;
    sceneFreq[r.scene_type] = (sceneFreq[r.scene_type] || 0) + 1;
  }
  const repeated_scenes = Object.entries(sceneFreq)
    .filter(([, count]) => count >= 2)
    .map(([scene]) => scene);

  // ---- 5. 准确率趋势判断 ----
  let accuracy_trend: "improving" | "stable" | "declining" = "stable";
  if (records.length >= 3) {
    // 取前半和后半的平均分比较
    const half = Math.floor(records.length / 2);
    const recentHalf = records.slice(0, half);
    const olderHalf = records.slice(half, half + half);
    const recentAvg =
      recentHalf.reduce((s: number, r: any) => s + (r.score ?? 0), 0) /
      (recentHalf.length || 1);
    const olderAvg =
      olderHalf.reduce((s: number, r: any) => s + (r.score ?? 0), 0) /
      (olderHalf.length || 1);
    const diff = recentAvg - olderAvg;
    if (diff > 5) accuracy_trend = "improving";
    else if (diff < -5) accuracy_trend = "declining";
  }

  const result: RecentLearningTrend = {
    recent_average_score,
    weak_dimensions,
    dimension_accuracy,
    repeated_error_patterns,
    repeated_scenes,
    accuracy_trend,
    window_size: windowSize,
    actual_records: records.length,
  };

  console.log(
    `[L2-趋势] avgScore=${recent_average_score} weakDims=[${weak_dimensions.join(",")}] trend=${accuracy_trend} errors=[${repeated_error_patterns.join(",")}]`
  );

  return result;
}

// ==================== 多智能体协调器 v2.0 ====================

