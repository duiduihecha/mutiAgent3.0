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


// 跨模块：需要类型但不依赖具体 Agent

function hskLevelMatches(cachedLevel: unknown, requestedLevel: number): boolean {
  if (cachedLevel == null) return true; // 旧数据没有 hsk_level，兼容
  const cached = Number(cachedLevel);
  if (isNaN(cached)) return true;
  return Math.abs(cached - requestedLevel) <= 1;
}

/**
 * 从 llm_content_cache 查询缓存
 * 复合主键精确命中: knowledge_point_id + hsk_level + scene_id
 * 只返回 status='ACTIVE' 且 confidence>=0.85 的数据
 */
export async function queryKnowledgeBase(params: {
  knowledge_point_id: string;
  target_culture: string;
  hsk_level?: number;
  scene_id?: string;
}): Promise<{
  cultural_explanation?: Record<string, unknown>;
  cross_cultural_comparison?: Record<string, unknown>;
  found: boolean;
}> {
  const requestHskLevel = params.hsk_level || 2;
  const sceneId = params.scene_id || resolveSceneType(params.knowledge_point_id, []) || "general";

  try {
    const cache = CacheManager.getInstance();
    const payload = await cache.get(params.knowledge_point_id, requestHskLevel, sceneId, params.target_culture);

    if (!payload) {
      return { found: false };
    }

    // 跨语言隔离（双保险）：
    // 1. 正式修法 — 已把 target_culture 纳入复合主键（DDL 加列 + onConflict 含 target_culture），
    //    cache.get 已按 target_culture 精确过滤，同 kp+hsk+scene 不同语言返回各自独立行。
    // 2. stopgap 兜底 — 对迁移前回填为 'unknown' 的脏行再加一道语言校验，
    //    避免 'unknown' 行被任何真实语言请求误命中。
    const cachedCulture = (payload as Record<string, unknown>)?.target_culture as string | undefined;
    if (cachedCulture && cachedCulture !== params.target_culture) {
      console.log(`[知识库] 缓存语言不匹配，视为未命中: 请求=${params.target_culture} 缓存=${cachedCulture}`);
      return { found: false };
    }

    return {
      cultural_explanation: (payload.cultural_explanation || payload.explanation) as Record<string, unknown> | undefined,
      cross_cultural_comparison: (payload.cross_cultural_comparison || payload.comparison) as Record<string, unknown> | undefined,
      found: true,
    };
  } catch (error) {
    console.error("[知识库] 查询失败:", error);
    return { found: false };
  }
}

/**
 * 保存生成内容到 llm_content_cache
 * 复合主键: knowledge_point_id + hsk_level + scene_id
 * confidence < 0.85 → 自动标记 REJECTED，不污染有效池
 */
export async function saveToKnowledgeBase(params: {
  knowledge_point_id: string;
  target_culture: string;
  hsk_level: number;
  cultural_explanation: Record<string, unknown>;
  cross_cultural_comparison: Record<string, unknown>;
  scene_id?: string;
  confidence?: number;
}): Promise<void> {
  const sceneId = params.scene_id || resolveSceneType(params.knowledge_point_id, []) || "general";

  try {
    const cache = CacheManager.getInstance();
    const guardrail = getGuardrailService();

    const confidence = params.confidence ?? 0.50;

    const payload: Record<string, unknown> = {
      cultural_explanation: params.cultural_explanation,
      cross_cultural_comparison: params.cross_cultural_comparison,
      target_culture: params.target_culture,
      hsk_level: params.hsk_level,
    };

    await cache.upsert({
      kpId: params.knowledge_point_id,
      hskLevel: params.hsk_level,
      sceneId,
      targetCulture: params.target_culture,
      payload,
      confidence,
      isLlmGenerated: true,
    });
  } catch (error) {
    console.error("[知识库] 保存失败:", error);
  }
}

// ==================== 学习者画像指标聚合 ====================

/**
 * 从 Supabase assessment_records 聚合学习者行为指标
 * 
 * 这是 A1 获取真实行为数据的唯一入口。
 * 聚合最近 N 次评估记录，计算4个焦虑度因子：
 * - cultural_error_rate: 文化相关题目错误率（用总错误率近似，fallback=0.3）
 * - time_ratio: 答题时间比（暂无数据源，fallback=0.5 表示正常）
 * - abandonment_rate: 放弃率（暂无数据源，fallback=0.1）
 * - negative_feedback: 负面反馈率（暂无数据源，fallback=0.1）
 * 
 * 注意：time_ratio/abandonment/negative_feedback 当前没有数据源，
 * 使用保守 fallback 值。未来接入前端埋点后可替换为真实值。
 */
