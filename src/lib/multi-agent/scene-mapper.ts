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


// 直接依赖 Supabase client + SCENE_TO_KP_KEYWORDS from constants

export async function getKnowledgePointByScene(
  sceneId: string
): Promise<{
  knowledge_point_id: string;
  topic: string;
  hsk_level: number;
} | null> {
  try {
    const { getSupabaseClient } = await import("@/storage/database/supabase-client");
    const supabase = getSupabaseClient();

    const keywords = SCENE_TO_KP_KEYWORDS[sceneId] || [sceneId];

    // [2026-08-27 修复] 旧实现用 PostgREST 的 or(content_json->zh->>topic.ilike.%kw%) 组合，
    // 实测系统性不返回（68 条 topic 里有"儿童游戏"也匹配不到 %游戏%），导致所有场景走兜底、
    // A2/A4 拿不到语义锚定——"答非所问"系统性根因。
    // 改为：全表拉取（数据量小）+ JS 内存匹配，绕开 JSONB 过滤语法坑，评分逻辑原样保留。
    const { data: all } = await supabase
      .from("cultural_knowledge_points")
      .select("id, content_json, hsk_level")
      .limit(500);

    if (all && all.length > 0) {
      const parsed = all.map(kp => {
        const cj = typeof kp.content_json === "string" ? JSON.parse(kp.content_json) : kp.content_json;
        return { kp, topic: String(cj?.zh?.topic || "") };
      });

      // 按「命中关键词数 + 完整匹配」打分，取最相关而非数据库默认首条
      const candidates = parsed.filter(p => keywords.some(kw => p.topic.includes(kw)));
      if (candidates.length > 0) {
        const scored = candidates
          .map(p => {
            const hit = keywords.filter(kw => p.topic.includes(kw)).length;
            const exact = keywords.includes(p.topic) ? 5 : 0;
            return { ...p, score: hit + exact };
          })
          .sort((a, b) => b.score - a.score);
        const top = scored[0];
        console.log(`[场景映射] ${sceneId} → ${top.topic} (${top.kp.id}) score=${top.score}`);
        return {
          knowledge_point_id: top.kp.id,
          topic: top.topic || sceneId,
          hsk_level: top.kp.hsk_level || 2
        };
      }
      console.warn(`[场景映射] ${sceneId} 无关键词命中（keywords=${keywords.join("/")}），走兜底`);
    }

    // 兜底：直接用场景ID作为topic（保留，但上面已有 warn 不再静默）
    return {
      knowledge_point_id: sceneId,
      topic: sceneId,
      hsk_level: 2
    };
  } catch (error) {
    console.error("获取知识点失败:", error);
    return null;
  }
}

/**
 * 从 Supabase 读取知识点的语义内容，供 A2/A4 生成时锚定主题，
 * 避免 LLM 只拿到一个 UUID 而盲生成（campus 场景曾因此跑题成"好"字完成体）。
 */
