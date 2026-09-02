/**
 * 学习者图谱服务
 *
 * 提供基于 Neo4j 知识图谱的学习者认知状态追踪能力。
 * 为 A1 LearnerProfiler 和 A4 ContentGenerator 提供：
 * - 学习者掌握度图谱 (MASTERED edges)
 * - 弱项维度检测
 * - 学习路径推荐
 *
 * 使用方式：
 *   import { recordMastery, getLearnerMasteryMap } from "@/lib/learner-graph";
 *   await recordMastery(learnerId, kpId, 0.85);
 */

import { neo4jService } from "./neo4j-service";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { MOTIVATION_DOMAIN_AFFINITY } from "./constants";
import { applyForgettingDecay } from "./multi-agent-system";

// ==================== 类型定义 ====================

export interface LearnerGraphProfile {
  id: string;
  hsk_level: number;
  native_language: string;
  home_culture_code: string;
}

export interface MasteryRecord {
  kp_id: string;
  score: number;
  last_updated_at: string;
  cumulative_correct: number;
}

export interface WeakDimensionReport {
  weak_dimensions: Array<{ name: string; score: number }>;
  accuracy_trend: "improving" | "stable" | "declining";
  recent_average_score: number;
}

// 主页面的5个能力维度与图节点的映射
const DIMENSION_NODE_MAP: Record<string, string> = {
  grammar: "语法",
  listening: "听力",
  speaking: "口语",
  cultural_pragmatic: "文化",
  reading: "阅读",
};

// ==================== 学习者节点管理 ====================

/**
 * 创建或更新 Learner 节点，并关联 HomeCulture
 */
export async function upsertLearnerNode(
  profile: LearnerGraphProfile,
): Promise<void> {
  const cultureCode = profile.home_culture_code || "en";
  const hcId = `hc_${cultureCode}`;

  try {
    // 创建/更新 Learner 节点
    await neo4jService.write(
      `
      MERGE (l:Learner {id: $id})
      SET l.hsk_level = $hsk_level,
          l.native_language = $native_language,
          l.home_culture_code = $culture_code,
          l.updated_at = datetime()
      `,
      {
        id: profile.id,
        hsk_level: profile.hsk_level,
        native_language: profile.native_language,
        culture_code: cultureCode,
      },
    );

    // 关联 HomeCulture
    await neo4jService.write(
      `
      MATCH (l:Learner {id: $learner_id})
      MATCH (hc:HomeCulture {id: $hc_id})
      MERGE (l)-[r:BELONGS_TO]->(hc)
      SET r.updated_at = datetime()
      `,
      { learner_id: profile.id, hc_id: hcId },
    );

    console.log(`[Learner-Graph] upsert learner=${profile.id.slice(0, 8)}...`);
  } catch (err) {
    console.warn("[Learner-Graph] upsertLearnerNode 失败:", err);
  }
}

// ==================== 掌握度管理 ====================

/**
 * 记录学习者对某个 KnowledgePoint 的掌握度
 * MERGE 保证幂等性
 * cumulativeCorrect: 遗忘曲线累积正确次数
 */
export async function recordMastery(
  learnerId: string,
  kpId: string,
  score: number, // 0.0 ~ 1.0
  cumulativeCorrect: number = 0,
): Promise<void> {
  try {
    await neo4jService.write(
      `
      MATCH (l:Learner {id: $learner_id})
      MATCH (kp:KnowledgePoint {id: $kp_id})
      MERGE (l)-[r:MASTERED]->(kp)
      SET r.score = $score,
          r.last_updated_at = datetime(),
          r.cumulative_correct = $cumulative_correct
      `,
      { learner_id: learnerId, kp_id: kpId, score, cumulative_correct: cumulativeCorrect },
    );
  } catch (err) {
    console.warn(`[Learner-Graph] recordMastery 失败 (learner=${learnerId.slice(0, 8)}..., kp=${kpId}):`, err);
  }
}

/**
 * 清除某个 Learner 的所有 MASTERED 边。
 * 切换母语时调用，因为不同母语背景的学习画像应有独立起点。
 */
export async function clearLearnerMastery(learnerId: string): Promise<void> {
  try {
    await neo4jService.write(
      `MATCH (l:Learner {id: $learner_id})-[r:MASTERED]->()
       DELETE r`,
      { learner_id: learnerId },
    );
    console.log(`[Learner-Graph] cleared mastery for learner=${learnerId.slice(0, 8)}...`);
  } catch (err) {
    console.warn(`[Learner-Graph] clearLearnerMastery 失败:`, err);
  }
}

/**
 * 获取学习者的掌握度图谱
 * 返回 Map<kpId, score>
 */
export async function getLearnerMasteryMap(
  learnerId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  try {
    const results = await neo4jService.query<{
      kp_id: string;
      score: number;
    }>(
      `
      MATCH (l:Learner {id: $learner_id})-[r:MASTERED]->(kp:KnowledgePoint)
      RETURN kp.id AS kp_id, r.score AS score
      ORDER BY r.score ASC
      `,
      { learner_id: learnerId },
    );

    for (const r of results) {
      map.set(String(r.kp_id), Number(r.score));
    }
  } catch (err) {
    console.warn(`[Learner-Graph] getLearnerMasteryMap 失败 (learner=${learnerId.slice(0, 8)}...):`, err);
  }

  return map;
}

/**
 * 获取学习者的掌握度图谱（带遗忘曲线元数据）
 * 返回 Map<kpId, {score, last_updated_at, cumulative_correct}>
 * 供推荐引擎应用遗忘衰减
 */
export async function getLearnerMasteryMapWithMeta(
  learnerId: string,
): Promise<Map<string, MasteryRecord>> {
  const map = new Map<string, MasteryRecord>();

  try {
    const results = await neo4jService.query<{
      kp_id: string;
      score: number;
      last_updated_at: string;
      cumulative_correct: number;
    }>(
      `
      MATCH (l:Learner {id: $learner_id})-[r:MASTERED]->(kp:KnowledgePoint)
      RETURN kp.id AS kp_id, r.score AS score,
             toString(r.last_updated_at) AS last_updated_at,
             coalesce(r.cumulative_correct, 0) AS cumulative_correct
      ORDER BY r.score ASC
      `,
      { learner_id: learnerId },
    );

    for (const r of results) {
      map.set(String(r.kp_id), {
        kp_id: String(r.kp_id),
        score: Number(r.score),
        last_updated_at: String(r.last_updated_at || ""),
        cumulative_correct: Number(r.cumulative_correct || 0),
      });
    }
  } catch (err) {
    console.warn(`[Learner-Graph] getLearnerMasteryMapWithMeta 失败 (learner=${learnerId.slice(0, 8)}...):`, err);
  }

  return map;
}

/**
 * 查询学习者薄弱维度
 *
 * 通过聚合 MASTERED edges 的 score，按 KnowledgePoint 的 hsk_level
 * 和关联的 CulturalDimension 加权计算各维度薄弱程度。
 *
 * 返回平均分 < 0.4 的维度列表。
 */
export async function getLearnerWeakDimensions(
  learnerId: string,
): Promise<WeakDimensionReport> {
  const defaultReport: WeakDimensionReport = {
    weak_dimensions: [],
    accuracy_trend: "stable",
    recent_average_score: 0,
  };

  try {
    // 查询学习者所有 mastered 的 KP 及其维度关联
    const results = await neo4jService.query<{
      dim_name: string;
      avg_score: number;
      count: number;
    }>(
      `
      MATCH (l:Learner {id: $learner_id})-[r:MASTERED]->(kp:KnowledgePoint)
      OPTIONAL MATCH (kp)-[:RELATES_TO]->(cc:CulturalConcept)-[hd:HAS_DIMENSION]->(cd:CulturalDimension)
      RETURN cd.name AS dim_name,
             avg(r.score) AS avg_score,
             count(r) AS count
      ORDER BY avg_score ASC
      `,
      { learner_id: learnerId },
    );

    const weakDimensions: Array<{ name: string; score: number }> = [];
    let totalScore = 0;
    let totalCount = 0;

    for (const r of results) {
      const score = Number(r.avg_score);
      const count = Number(r.count);
      totalScore += score * count;
      totalCount += count;

      if (score < 0.4 && r.dim_name) {
        weakDimensions.push({ name: String(r.dim_name), score });
      }
    }

    // 如果没有维度关联数据，回退到基于 raw mastery score 的评估
    if (weakDimensions.length === 0 && totalCount === 0) {
      const masteryMap = await getLearnerMasteryMap(learnerId);
      const scores = Array.from(masteryMap.values());
      const avgScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

      return {
        weak_dimensions: avgScore < 0.4 ? [{ name: "综合能力", score: avgScore }] : [],
        accuracy_trend: "stable",
        recent_average_score: Math.round(avgScore * 100) / 100,
      };
    }

    return {
      weak_dimensions: weakDimensions,
      accuracy_trend: "stable", // 趋势需要更多历史数据，目前使用 stable
      recent_average_score: totalCount > 0
        ? Math.round((totalScore / totalCount) * 100) / 100
        : 0,
    };
  } catch (err) {
    console.warn(`[Learner-Graph] getLearnerWeakDimensions 失败:`, err);
    return defaultReport;
  }
}

/**
 * 构建 KnowledgePoint 之间的 PREREQUISITE 边（规则引擎，幂等）
 *
 * 算法：
 * 1. 每个 Scene 内按 (hsk_level ASC, kp.id ASC) 排序，串链 KP0→KP1→KP2
 * 2. 同一 Domain 内，前一个 Scene 末尾 KP → 下一个 Scene 首个 KP
 *
 * 共约 114 条边（166 KP - 52 scene起点），MERGE 保证幂等可重跑。
 */
export async function buildPrerequisiteEdges(): Promise<{
  created: number;
  errors: string[];
}> {
  let created = 0;
  const errors: string[] = [];

  try {
    const rows = await neo4jService.query<{
      domain_id: string;
      scene_id: string;
      kp_id: string;
      hsk_level: number;
    }>(
      `MATCH (d:Domain)-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
       RETURN d.id AS domain_id, d.name AS domain_name,
              s.id AS scene_id, s.name AS scene_name,
              kp.id AS kp_id, kp.hsk_level AS hsk_level
       ORDER BY d.name, s.name, kp.hsk_level, kp.id`,
    );

    // 按 Domain → Scene → KPs 分组
    const domainScenesMap = new Map<string, Map<string, string[]>>();
    for (const row of rows) {
      const domainId = String(row.domain_id);
      const sceneId = String(row.scene_id);
      const kpId = String(row.kp_id);

      if (!domainScenesMap.has(domainId)) {
        domainScenesMap.set(domainId, new Map());
      }
      const scenesMap = domainScenesMap.get(domainId)!;
      if (!scenesMap.has(sceneId)) {
        scenesMap.set(sceneId, []);
      }
      scenesMap.get(sceneId)!.push(kpId);
    }

    // 构建边
    for (const [domainId, scenesMap] of domainScenesMap) {
      const sceneEntries = Array.from(scenesMap.entries());

      // 同一 Domain 内遍历每个 Scene
      for (let si = 0; si < sceneEntries.length; si++) {
        const [, kpIds] = sceneEntries[si];

        // 同 Scene 内串链
        for (let i = 0; i < kpIds.length - 1; i++) {
          try {
            await neo4jService.write(
              `MATCH (a:KnowledgePoint {id: $from_id})
               MATCH (b:KnowledgePoint {id: $to_id})
               MERGE (a)-[r:PREREQUISITE]->(b)
               SET r.updated_at = datetime()`,
              { from_id: kpIds[i], to_id: kpIds[i + 1] },
            );
            created++;
          } catch (err) {
            errors.push(`Edge ${kpIds[i]} -> ${kpIds[i + 1]}: ${err}`);
          }
        }

        // 跨 Scene 桥接：当前 Scene 的最后一个 KP → 下一个 Scene 的第一个 KP
        if (si < sceneEntries.length - 1) {
          const nextKpIds = sceneEntries[si + 1][1];
          if (kpIds.length > 0 && nextKpIds.length > 0) {
            const lastKp = kpIds[kpIds.length - 1];
            const firstKp = nextKpIds[0];
            try {
              await neo4jService.write(
                `MATCH (a:KnowledgePoint {id: $from_id})
                 MATCH (b:KnowledgePoint {id: $to_id})
                 MERGE (a)-[r:PREREQUISITE]->(b)
                 SET r.updated_at = datetime()`,
                { from_id: lastKp, to_id: firstKp },
              );
              created++;
            } catch (err) {
              errors.push(`Cross-scene ${lastKp} -> ${firstKp}: ${err}`);
            }
          }
        }
      }
    }
  } catch (err) {
    errors.push(`buildPrerequisiteEdges 整体失败: ${err}`);
  }

  return { created, errors };
}

/**
 * 获取推荐的下一步学习知识点
 *
 * 基于图结构查询：找到当前 KP 的后继节点（PREREQUISITE 关系），
 * 排除已掌握（MASTERED score >= 0.8）的节点。
 */
export async function getRecommendedNextKPs(
  learnerId: string,
  currentKpId: string,
  limit: number = 5,
): Promise<string[]> {
  try {
    const results = await neo4jService.query<{ kp_id: string }>(
      `
      MATCH (current:KnowledgePoint {id: $kp_id})-[:PREREQUISITE]->(next:KnowledgePoint)
      WHERE NOT EXISTS {
        MATCH (l:Learner {id: $learner_id})-[r:MASTERED]->(next)
        WHERE r.score >= 0.8
      }
      RETURN next.id AS kp_id
      LIMIT $limit
      `,
      { kp_id: currentKpId, learner_id: learnerId, limit },
    );

    return results.map((r) => String(r.kp_id));
  } catch (err) {
    console.warn("[Learner-Graph] getRecommendedNextKPs 失败:", err);
    return [];
  }
}

// ==================== 推荐引擎 ====================

export interface RecommendationItem {
  kp_id: string;
  kp_name: string;
  scene_id: string;
  scene_name: string;
  domain_id: string;
  domain_name: string;
  domain_icon: string;
  hsk_level: number;
  pragmatic_intent: string;
  score: number;
  reasons: string[];
  is_unlocked: boolean;
  mastery_status: "new" | "in_progress" | "mastered";
}

interface CandidateKp {
  kp_id: string;
  kp_name: string;
  scene_id: string;
  scene_name: string;
  domain_id: string;
  domain_name: string;
  domain_icon: string;
  hsk_level: number;
  pragmatic_intent: string;
  prereq_ids: string[];
  mastery_score: number | null;
  /** 衰减后的 mastery_score (已应用遗忘曲线) */
  mastery_decayed: number | null;
}

/**
 * 为学习者生成个性化推荐
 *
 * 五因子加权评分：
 * - 动机匹配 (0.20): KP domain 在学习者 motivation 亲和列表中
 * - HSK 邻近度 (0.25): KP 级别越接近学习者级别，分越高
 * - 解锁状态 (0.25): 所有前置 KP 已掌握
 * - 弱项维度 (0.15): KP 涉及弱项维度
 * - 新颖度 (0.15): KP 未被掌握
 *
 * 冷启动：无 mastery 数据时，返回 motivation 亲和 domain 下的入门 KP。
 */
export async function getRecommendations(
  learnerId: string,
  limit: number = 5,
): Promise<RecommendationItem[]> {
  try {
    // 1. 获取学习者画像
    const supabase = getSupabaseClient();
    const { data: learnerData } = await supabase
      .from("learners")
      .select("hsk_level, learning_motivation, native_language")
      .eq("id", learnerId)
      .maybeSingle();

    const learnerHsk = learnerData?.hsk_level || 1;
    const motivation = learnerData?.learning_motivation || "interest";
    const affinityDomains = MOTIVATION_DOMAIN_AFFINITY[motivation] || [];

    // 2. 获取掌握度（带遗忘曲线元数据）和弱项
    const [masteryMetaMap, weakReport] = await Promise.all([
      getLearnerMasteryMapWithMeta(learnerId),
      getLearnerWeakDimensions(learnerId),
    ]);

    const isColdStart = masteryMetaMap.size === 0;

    // 构建快速查找的 decayed score map
    const now = new Date();
    const decayedMasteryMap = new Map<string, number>();
    for (const [kpId, meta] of masteryMetaMap) {
      const daysSinceUpdate = meta.last_updated_at
        ? (now.getTime() - new Date(meta.last_updated_at).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      const decayed = applyForgettingDecay(meta.score, daysSinceUpdate, meta.cumulative_correct);
      decayedMasteryMap.set(kpId, decayed);
    }

    // 3. 查询所有 KP 及其 domain/scene/prerequisite 信息
    const candidates: CandidateKp[] = [];
    try {
      const rows = await neo4jService.query<{
        kp_id: string; kp_name: string; hsk_level: number;
        pragmatic_intent: string;
        scene_id: string; scene_name: string;
        domain_id: string; domain_name: string; domain_icon: string;
        prereq_ids: string[] | null;
        mastery_score: number | null;
        mastery_last_updated: string | null;
        mastery_cumulative_correct: number | null;
      }>(
        `MATCH (d:Domain)-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
         OPTIONAL MATCH (pre:KnowledgePoint)-[:PREREQUISITE]->(kp)
         OPTIONAL MATCH (l:Learner {id: $learner_id})-[m:MASTERED]->(kp)
         RETURN kp.id AS kp_id, kp.name AS kp_name,
                kp.hsk_level AS hsk_level, kp.pragmatic_intent AS pragmatic_intent,
                s.id AS scene_id, s.name AS scene_name,
                d.id AS domain_id, d.name AS domain_name, d.icon AS domain_icon,
                collect(DISTINCT pre.id) AS prereq_ids,
                m.score AS mastery_score,
                toString(m.last_updated_at) AS mastery_last_updated,
                coalesce(m.cumulative_correct, 0) AS mastery_cumulative_correct`,
        { learner_id: learnerId },
      );

      for (const r of rows) {
        const prereqIds: string[] = r.prereq_ids
          ? r.prereq_ids.filter((id) => id !== null && id !== r.kp_id)
          : [];
        const rawScore = r.mastery_score !== null ? Number(r.mastery_score) : null;
        // 应用遗忘曲线衰减
        const decayedScore = rawScore !== null
          ? (decayedMasteryMap.get(String(r.kp_id)) ?? rawScore)
          : null;
        candidates.push({
          kp_id: String(r.kp_id),
          kp_name: String(r.kp_name || ""),
          scene_id: String(r.scene_id || ""),
          scene_name: String(r.scene_name || ""),
          domain_id: String(r.domain_id || ""),
          domain_name: String(r.domain_name || ""),
          domain_icon: String(r.domain_icon || ""),
          hsk_level: Number(r.hsk_level),
          pragmatic_intent: String(r.pragmatic_intent || ""),
          prereq_ids: prereqIds,
          mastery_score: rawScore,
          mastery_decayed: decayedScore,
        });
      }
    } catch (neoErr) {
      console.warn("[getRecommendations] Neo4j KP 查询失败:", neoErr);
      return [];
    }

    if (candidates.length === 0) return [];

    // 4. 计算每个候选 KP 的分数
    const weakDimNames = new Set(
      weakReport.weak_dimensions.map((d) => d.name.toLowerCase()),
    );

    const scored = candidates.map((c) => {
      // 动机匹配
      const motivationScore =
        affinityDomains.length === 0 ||
        affinityDomains.includes(c.domain_id)
          ? 1.0
          : 0.3;

      // HSK 邻近度
      const hskProximity = 1 - Math.abs(c.hsk_level - learnerHsk) / 9;

      // 解锁状态：所有前置 KP 已掌握 (decayed >=0.8) 或无前置
      // 使用遗忘衰减后的分数，避免"半年前学过但已遗忘"仍算解锁
      const allPrereqsMastered =
        c.prereq_ids.length === 0 ||
        c.prereq_ids.every((pid) => (decayedMasteryMap.get(pid) || 0) >= 0.8);

      // 弱项维度：KP 的 pragmatic_intent 或 name 涉及弱项
      let weakBoost = 0;
      if (weakDimNames.size > 0) {
        const searchText = (c.kp_name + " " + c.pragmatic_intent).toLowerCase();
        for (const weakDim of weakDimNames) {
          if (searchText.includes(weakDim)) {
            weakBoost = 1.0;
            break;
          }
        }
        // 如果弱项是"综合能力"，给所有 KP 均等 boost
        if (weakBoost === 0 && weakDimNames.has("综合能力")) {
          weakBoost = 0.5;
        }
      }

      // 新颖度：使用衰减后的 mastery 判断是否仍需学习
      const effectiveMastery = c.mastery_decayed ?? 0;
      const isMastered = effectiveMastery >= 0.6;
      const novelty = isMastered ? 0 : 1.0;
      // 遗忘复习：原始分数 ≥0.6 但衰减后 <0.4 → 需要复习
      const needsReview =
        c.mastery_score !== null && c.mastery_score >= 0.6 && effectiveMastery < 0.4;

      // 加权总分
      const score =
        0.20 * motivationScore +
        0.25 * hskProximity +
        0.25 * (allPrereqsMastered ? 1.0 : 0) +
        0.15 * weakBoost +
        0.15 * novelty;

      // 生成 reasons
      const reasons: string[] = [];
      if (motivationScore >= 1.0 && affinityDomains.length > 0) {
        const motivationLabels: Record<string, string> = {
          tourism: "旅游出行", study_abroad: "留学生活", work: "职场工作",
          interest: "兴趣探索", exam: "考试备考",
        };
        reasons.push(`适合${motivationLabels[motivation] || motivation}场景`);
      }
      if (hskProximity > 0.7) {
        reasons.push(`接近你的HSK ${learnerHsk} 水平`);
      }
      if (allPrereqsMastered && c.prereq_ids.length > 0) {
        reasons.push("前置知识点已掌握，可以进阶");
      }
      if (weakBoost > 0) {
        reasons.push("有助于强化薄弱环节");
      }
      if (novelty > 0) {
        reasons.push("新知识点，拓展视野");
      }
      if (needsReview) {
        reasons.push("该知识点已学过但可能遗忘，建议复习巩固");
      }

      // mastery status（使用衰减后的分数判断）
      let masteryStatus: "new" | "in_progress" | "mastered" = "new";
      if (c.mastery_score !== null) {
        masteryStatus =
          effectiveMastery >= 0.8 ? "mastered"
          : effectiveMastery >= 0.4 ? "in_progress"
          : c.mastery_score >= 0.8 ? "in_progress" // 原本 mastered 但衰减严重 → 降为 in_progress
          : "in_progress";
      }

      return {
        kp_id: c.kp_id,
        kp_name: c.kp_name,
        scene_id: c.scene_id,
        scene_name: c.scene_name,
        domain_id: c.domain_id,
        domain_name: c.domain_name,
        domain_icon: c.domain_icon,
        hsk_level: c.hsk_level,
        pragmatic_intent: c.pragmatic_intent,
        score: Math.round(score * 1000) / 1000,
        reasons,
        is_unlocked: allPrereqsMastered,
        mastery_status: masteryStatus,
      };
    });

    // 冷启动：优先低 HSK + motivation 匹配
    if (isColdStart) {
      scored.sort((a, b) => {
        // 动机匹配优先，然后 HSK 低优先
        const aMot = motivationScore(a);
        const bMot = motivationScore(b);
        if (bMot !== aMot) return bMot - aMot;
        return a.hsk_level - b.hsk_level;
      });
    } else {
      // 按 is_unlocked 优先，然后总分降序（锁定 KP 不高于已解锁 KP）
      scored.sort((a, b) => {
        if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? -1 : 1;
        return b.score - a.score;
      });
    }

    return scored.slice(0, limit);

    function motivationScore(item: RecommendationItem): number {
      if (affinityDomains.length === 0) return 1.0;
      return affinityDomains.includes(item.domain_id) ? 1.0 : 0.3;
    }
  } catch (err) {
    console.warn("[getRecommendations] 失败:", err);
    return [];
  }
}
