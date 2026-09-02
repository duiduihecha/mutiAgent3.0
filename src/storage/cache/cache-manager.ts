/**
 * LLM 内容缓存管理器 — 基于 llm_content_cache 表
 *
 * 复合唯一键: (knowledge_point_id, hsk_level, scene_id, target_culture)
 * —— target_culture 用于隔离跨语言污染：每种母语文化各占独立缓存行。
 * 安全策略:
 *   - get(): 只返回 status='ACTIVE' 且 confidence_score >= 0.85
 *   - upsert(): confidence < 0.85 → 标记 REJECTED，禁止进入有效池
 */

import { getSupabaseClient } from "@/storage/database/supabase-client";

// ============================================================================
// 类型
// ============================================================================

export interface CacheEntry {
  knowledge_point_id: string;
  hsk_level: number;
  scene_id: string;
  content_payload: Record<string, unknown>;
  is_llm_generated: boolean;
  confidence_score: number;
  upvotes: number;
  downvotes: number;
  status: "ACTIVE" | "DEGRADED" | "REJECTED";
  model_version: string | null;
  generation_duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface CacheStats {
  total: number;
  active: number;
  degraded: number;
  rejected: number;
  avg_confidence: number;
}

export interface VoteResult {
  success: boolean;
  upvotes?: number;
  downvotes?: number;
  status?: string;
  error?: string;
}

const CONFIDENCE_THRESHOLD = 0.60;
const DEFAULT_SCENE = "general";

// ============================================================================
// CacheManager
// ============================================================================

export class CacheManager {
  private static instance: CacheManager;

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // ==========================================================================
  // get — 精确查询活跃缓存
  // ==========================================================================

  async get(
    kpId: string,
    hskLevel: number,
    sceneId: string = DEFAULT_SCENE,
    targetCulture?: string,
  ): Promise<Record<string, unknown> | null> {
    const logPrefix = `[CacheManager.get] kp=${kpId.slice(0, 12)} hsk=${hskLevel} scene=${sceneId} culture=${targetCulture}`;

    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from("llm_content_cache")
        .select("content_payload, status, confidence_score")
        .eq("knowledge_point_id", kpId)
        .eq("hsk_level", hskLevel)
        .eq("scene_id", sceneId);
      if (targetCulture) query = query.eq("target_culture", targetCulture);
      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error(`${logPrefix} 查询失败:`, error.message);
        return null;
      }

      if (!data) {
        console.log(`${logPrefix} → 未命中 (无记录)`);
        return null;
      }

      // 双重校验：status + confidence
      if (data.status !== "ACTIVE") {
        console.log(`${logPrefix} → 不可用 (status=${data.status})`);
        return null;
      }

      if (typeof data.confidence_score === "number" && data.confidence_score < CONFIDENCE_THRESHOLD) {
        console.log(`${logPrefix} → 置信度不足 (${data.confidence_score.toFixed(3)} < ${CONFIDENCE_THRESHOLD})`);
        return null;
      }

      const payload = data.content_payload as Record<string, unknown>;
      console.log(`${logPrefix} → 命中 ✓ confidence=${data.confidence_score}`);
      return payload;

    } catch (err) {
      console.error(`${logPrefix} 异常:`, err);
      return null;
    }
  }

  // ==========================================================================
  // upsert — 写入/更新缓存
  // ==========================================================================

  async upsert(params: {
    kpId: string;
    hskLevel: number;
    sceneId?: string;
    targetCulture?: string;
    payload: Record<string, unknown>;
    confidence: number;
    isLlmGenerated?: boolean;
    modelVersion?: string;
    generationDurationMs?: number;
  }): Promise<boolean> {
    const {
      kpId,
      hskLevel,
      sceneId = DEFAULT_SCENE,
      targetCulture,
      payload,
      confidence,
      isLlmGenerated = true,
      modelVersion = null,
      generationDurationMs = null,
    } = params;

    const logPrefix = `[CacheManager.upsert] kp=${kpId.slice(0, 12)} hsk=${hskLevel} scene=${sceneId} culture=${targetCulture} conf=${confidence.toFixed(3)}`;

    // 低置信度 → 标记 REJECTED，不污染有效池
    const status = confidence < CONFIDENCE_THRESHOLD ? "REJECTED" : "ACTIVE";

    if (status === "REJECTED") {
      console.warn(`${logPrefix} → 低质量，标记为 REJECTED`);
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("llm_content_cache")
        .upsert(
          {
            knowledge_point_id: kpId,
            hsk_level: hskLevel,
            scene_id: sceneId,
            target_culture: targetCulture ?? "unknown",
            content_payload: payload,
            is_llm_generated: isLlmGenerated,
            confidence_score: Math.round(confidence * 1e4) / 1e4,
            status,
            model_version: modelVersion,
            generation_duration_ms: generationDurationMs,
          },
          {
            onConflict: "knowledge_point_id,hsk_level,scene_id,target_culture",
          },
        );

      if (error) {
        console.error(`${logPrefix} 写入失败:`, error.message);
        return false;
      }

      console.log(`${logPrefix} → 写入成功 (status=${status})`);
      return true;

    } catch (err) {
      console.error(`${logPrefix} 异常:`, err);
      return false;
    }
  }

  // ==========================================================================
  // vote — 用户投票
  // ==========================================================================

  async vote(
    kpId: string,
    hskLevel: number,
    sceneId: string,
    isUpvote: boolean,
  ): Promise<VoteResult> {
    const logPrefix = `[CacheManager.vote] ${isUpvote ? "赞" : "踩"} kp=${kpId.slice(0, 12)} hsk=${hskLevel}`;

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("vote_cache", {
        p_knowledge_point_id: kpId,
        p_hsk_level: hskLevel,
        p_scene_id: sceneId,
        p_is_upvote: isUpvote,
      });

      if (error) {
        console.error(`${logPrefix} RPC 失败:`, error.message);
        return { success: false, error: error.message };
      }

      const result = data as Record<string, unknown>;
      console.log(`${logPrefix} → success=${result?.success} status=${result?.status}`);
      return {
        success: true,
        upvotes: result?.upvotes as number,
        downvotes: result?.downvotes as number,
        status: result?.status as string,
      };

    } catch (err) {
      console.error(`${logPrefix} 异常:`, err);
      return { success: false, error: String(err) };
    }
  }

  // ==========================================================================
  // evaluate — 手动触发质量评估
  // ==========================================================================

  async evaluate(
    kpId: string,
    hskLevel: number,
    sceneId: string = DEFAULT_SCENE,
  ): Promise<Record<string, unknown> | null> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("evaluate_cache_quality", {
        p_knowledge_point_id: kpId,
        p_hsk_level: hskLevel,
        p_scene_id: sceneId,
      });

      if (error) {
        console.error("[CacheManager.evaluate] RPC 失败:", error.message);
        return null;
      }
      return (data as Record<string, unknown>[])?.[0] || null;

    } catch (err) {
      console.error("[CacheManager.evaluate] 异常:", err);
      return null;
    }
  }

  // ==========================================================================
  // getStats — 缓存池健康度
  // ==========================================================================

  async getStats(hskLevel?: number): Promise<CacheStats> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from("llm_content_cache")
        .select("status, confidence_score");

      if (hskLevel !== undefined) {
        query = query.eq("hsk_level", hskLevel);
      }

      const { data, error } = await query;

      if (error || !data) {
        console.error("[CacheManager.getStats] 查询失败:", error?.message);
        return { total: 0, active: 0, degraded: 0, rejected: 0, avg_confidence: 0 };
      }

      const rows = data as Array<{ status: string; confidence_score: number }>;
      const active = rows.filter((r) => r.status === "ACTIVE");

      const stats: CacheStats = {
        total: rows.length,
        active: active.length,
        degraded: rows.filter((r) => r.status === "DEGRADED").length,
        rejected: rows.filter((r) => r.status === "REJECTED").length,
        avg_confidence:
          active.length > 0
            ? Math.round((active.reduce((s, r) => s + (r.confidence_score || 0), 0) / active.length) * 1e4) / 1e4
            : 0,
      };

      console.log(
        `[CacheManager.getStats] total=${stats.total} active=${stats.active} degraded=${stats.degraded} rejected=${stats.rejected} avg_conf=${stats.avg_confidence}`,
      );
      return stats;

    } catch (err) {
      console.error("[CacheManager.getStats] 异常:", err);
      return { total: 0, active: 0, degraded: 0, rejected: 0, avg_confidence: 0 };
    }
  }

  // ==========================================================================
  // bulkGetActive — 批量查询活跃缓存（预热/诊断）
  // ==========================================================================

  async bulkGetActive(hskLevel?: number): Promise<CacheEntry[]> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("get_active_caches", {
        p_hsk_level: hskLevel ?? null,
      });

      if (error) {
        console.error("[CacheManager.bulkGetActive] RPC 失败:", error.message);
        return [];
      }

      return (data as CacheEntry[]) || [];

    } catch (err) {
      console.error("[CacheManager.bulkGetActive] 异常:", err);
      return [];
    }
  }
}
