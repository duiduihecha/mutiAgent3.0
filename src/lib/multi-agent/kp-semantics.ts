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


// 需要 BaseAgent 统一的 preset 吗？不，这里都是 DB/Graph 查询。
// 需要算法？不。直接依赖 constants 提供的关键词即可。

export function langCodeToHomeCultureId(langCode: string): string {
  return `hc_${langCode}`;
}

/**
 * Phase 2c/2d: 从 Neo4j 查询 KnowledgePoint 的跨文化维度与母语表现数据
 * 失败时返回 null，调用方应优雅降级到 LLM-only 行为
 */
export async function queryCulturalGraphData(kpId: string, homeCultureCode: string): Promise<{
  dimensions: Array<{ name: string; name_en: string; framework: string; weight: number }>;
  manifestation: { dimension_name: string; manifestation: string; conflict_with_chinese: string; pragmatic_tip: string; example_scenario: string; weight: number } | null;
} | null> {
  if (isOfflineMockExecution()) return null;
  try {
    const [dimResults, manifestResults] = await Promise.all([
      neo4jService.query<{ name: string; name_en: string; framework: string; weight: number }>(
        `MATCH (kp:KnowledgePoint {id: $kpId})-[:RELATES_TO]->(cc:CulturalConcept)-[r:HAS_DIMENSION]->(cd:CulturalDimension)
         RETURN cd.name AS name, cd.name_en AS name_en, cd.framework AS framework, r.weight AS weight
         ORDER BY r.weight DESC`,
        { kpId },
      ),
      neo4jService.query<{ dimension_name: string; manifestation: string; conflict_with_chinese: string; pragmatic_tip: string; example_scenario: string; weight: number }>(
        `MATCH (kp:KnowledgePoint {id: $kpId})-[:RELATES_TO]->(cc:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)-[r:MANIFESTED_IN]->(hc:HomeCulture {id: $hcId})
         RETURN cd.name AS dimension_name, r.manifestation AS manifestation, r.conflict_with_chinese AS conflict_with_chinese, r.pragmatic_tip AS pragmatic_tip, r.example_scenario AS example_scenario, r.weight AS weight
         LIMIT 1`,
        { kpId, hcId: homeCultureCode },
      ),
    ]);

    // 主路径未命中时，兜底直接查 MANIFESTED_IN（跳过 HAS_DIMENSION 链路）
    let finalManifestResults = manifestResults;
    if (manifestResults.length === 0) {
      finalManifestResults = await neo4jService.query<{ dimension_name: string; manifestation: string; conflict_with_chinese: string; pragmatic_tip: string; example_scenario: string; weight: number }>(
        `MATCH (cd:CulturalDimension)-[r:MANIFESTED_IN]->(hc:HomeCulture {id: $hcId})
         RETURN cd.name AS dimension_name, r.manifestation AS manifestation, r.conflict_with_chinese AS conflict_with_chinese, r.pragmatic_tip AS pragmatic_tip, r.example_scenario AS example_scenario, r.weight AS weight
         ORDER BY r.weight DESC
         LIMIT 3`,
        { hcId: homeCultureCode },
      );
      if (finalManifestResults.length > 0) {
        console.log(`[MultiAgent] MANIFESTED_IN 兜底命中: hc=${homeCultureCode} count=${finalManifestResults.length}`);
      }
    }

    if (dimResults.length === 0 && finalManifestResults.length === 0) return null;

    return {
      dimensions: dimResults.map(d => ({
        name: String(d.name),
        name_en: String(d.name_en),
        framework: String(d.framework),
        weight: Number(d.weight),
      })),
      manifestation: finalManifestResults.length > 0 ? {
        dimension_name: String(finalManifestResults[0].dimension_name || ""),
        manifestation: String(finalManifestResults[0].manifestation || ""),
        conflict_with_chinese: String(finalManifestResults[0].conflict_with_chinese || ""),
        pragmatic_tip: String(finalManifestResults[0].pragmatic_tip || ""),
        example_scenario: String(finalManifestResults[0].example_scenario || ""),
        weight: Number(finalManifestResults[0].weight),
      } : null,
    };
  } catch (err) {
    console.warn("[MultiAgent] 跨文化图谱查询失败，使用 LLM-only 模式:", err);
    return null;
  }
}

/**
 * Phase 3b: 从 Neo4j 查询 KnowledgePoint 的 HSK 词汇与语法约束
 * 失败时返回 null
 */
export async function queryVocabularyConstraints(
  kpId: string,
  hskLevel: number,
): Promise<VocabularyConstraint | null> {
  if (isOfflineMockExecution()) return null;
  try {
    const { getVocabularyConstraint } = await import("../hsk-vocab-graph");
    return await getVocabularyConstraint(kpId, hskLevel);
  } catch (err) {
    console.warn("[MultiAgent] 词汇约束查询失败:", err);
    return null;
  }
}

/**
 * Phase 4c: 从 Neo4j 查询学习者的薄弱维度
 */
export async function queryLearnerWeakDimensions(
  learnerId: string,
): Promise<Array<{ name: string; score: number }> | null> {
  if (isOfflineMockExecution()) return null;
  try {
    const { getLearnerWeakDimensions } = await import("../learner-graph");
    const report = await getLearnerWeakDimensions(learnerId);
    return report.weak_dimensions.length > 0 ? report.weak_dimensions : null;
  } catch (err) {
    console.warn("[MultiAgent] 学习者薄弱维度查询失败:", err);
    return null;
  }
}

export async function getHardRuleCharWhitelist(kpId: string, hskLevel: number): Promise<string[]> {
  if (isOfflineMockExecution()) return [];
  return buildHardRuleCharWhitelistFromGraph(kpId, hskLevel);
}

/** agent_id → per-agent LLM preset（generation_a2~a5），使 A2/A3/A4/A5 可独立配置模型。 */

export async function fetchKnowledgePointSemantics(kpId: string): Promise<{
  topic: string;
  description: string;
  cultural_points: string[];
  language_binding_points: string[];
} | null> {
  if (isOfflineMockExecution()) return null;
  try {
    const { getSupabaseClient } = await import("@/storage/database/supabase-client");
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("cultural_knowledge_points")
      .select("content_json, language_binding_points")
      .eq("id", kpId)
      .maybeSingle();
    if (error || !data) return null;
    const cj = typeof data.content_json === "string" ? JSON.parse(data.content_json) : data.content_json;
    const zh = cj?.zh || {};
    return {
      topic: zh.topic || "",
      description: zh.description || zh.content || "",
      cultural_points: Array.isArray(zh.cultural_points)
        ? zh.cultural_points
        : Array.isArray(cj?.cultural_points) ? cj.cultural_points : [],
      language_binding_points: Array.isArray(data.language_binding_points) ? data.language_binding_points : [],
    };
  } catch (e) {
    console.warn("[fetchKnowledgePointSemantics] 读取KP语义失败:", e);
    return null;
  }
}

// getLanguageCode 已迁移至 ./constants.ts

// ==================== 知识库查询函数 ====================

/**
 * 检查缓存的 HSK 等级是否匹配请求等级
 * 容忍 ±1 级偏差（HSK 3 的内容可以复用给 HSK 2 和 4）
 */
