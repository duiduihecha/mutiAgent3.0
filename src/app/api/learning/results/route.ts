/**
 * 学习结果 API 路由 - Phase 1 三级存储写入
 *
 * 写入顺序（严格）：
 *   1. 计算：score / anxiety / ability_vector
 *   2. L1 写入：learning_records.practice_result（标准化逐题结构）
 *   3. L2 写入：assessment_records（本轮评估快照）
 *   4. L3 更新：learners current 行（anxiety/vector/total_sessions/last_scene_id）
 *   5. 重读 L3 → 返回 updated_learner（后端权威值）
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { calculateAbilityVector, applyAnxietyDelta, bayesianKnowledgeTracing, computeMemoryStrength, Exercise } from "@/lib/multi-agent-system";
import { detectEmotionState } from "@/lib/emotion-check";
import { recordMastery } from "@/lib/learner-graph";
import { getSceneType } from "@/lib/constants";

// ========== 日志前缀 ==========
const LOG = "[results-API]";

// ========== Phase 3A: 快照触发规则 ==========
interface SnapshotTriggerInput {
  anxietyBefore: number;
  anxietyAfter: number;
  vectorBefore: number[];
  vectorAfter: number[];
  sessionsBefore: number;
  hskLevelBefore?: number | null;
  hskLevelAfter?: number | null;
}

/**
 * 判断本轮是否需要创建画像快照。
 * 规则（传统代码，不依赖 LLM）：
 *   - significant_change: 焦虑度变化 >= 10 或任一维度变化 >= 15
 *   - periodic: 每 10 轮强制存一次
 *   - level_up: HSK 等级变化时存一次
 *   - first_session: 第 1 轮总是存
 */
function shouldCreateSnapshot(input: SnapshotTriggerInput): string | null {
  const {
    anxietyBefore, anxietyAfter,
    vectorBefore, vectorAfter,
    sessionsBefore,
    hskLevelBefore, hskLevelAfter
  } = input;

  // 规则1: 首次学习
  if (sessionsBefore === 0) return "first_session";

  // 规则2: HSK等级变化
  if (
    hskLevelBefore !== undefined && hskLevelBefore !== null &&
    hskLevelAfter !== undefined && hskLevelAfter !== null &&
    hskLevelBefore !== hskLevelAfter
  ) {
    return "level_up";
  }

  // 规则3: 焦虑度显著变化 (>=10)
  const anxietyDelta = Math.abs(anxietyAfter - anxietyBefore);
  if (anxietyDelta >= 10) return "significant_change";

  // 规则4: 能力向量任一维度显著变化 (>=15)
  for (let i = 0; i < Math.min(vectorBefore.length, vectorAfter.length); i++) {
    if (Math.abs(vectorAfter[i] - vectorBefore[i]) >= 15) {
      return "significant_change";
    }
  }

  // 规则5: 周期性快照 (每10轮)
  if ((sessionsBefore + 1) % 10 === 0) return "periodic";

  return null; // 不触发
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let learnerIdLog = "??";

  try {
    const body = await request.json();
    const {
      learner_id,
      knowledge_point_id,
      learning_record_id,
      exercises = [],
      results: rawResults = [],
      score = 0,
      correct_answers = 0,
      wrong_answers = 0,
      ability_vector = [50, 50, 50, 50, 50],
      time_spent = 0,
      hsk_level = null
    } = body;

    learnerIdLog = learner_id?.slice(0, 8) ?? "??";

    // ---- 参数校验 ----
    if (!learner_id) {
      console.warn(`${LOG} [REJECTED] 缺少 learner_id`);
      return NextResponse.json(
        { success: false, error: "缺少学习者ID" },
        { status: 400 }
      );
    }

    console.log(`${LOG} [START] learner=${learnerIdLog} kp=${knowledge_point_id?.slice(0,8)} exercises=${exercises.length} correct=${correct_answers}/${exercises.length}`);

    const supabase = getSupabaseClient();

    // ═══════════════════════════════════════
    // STEP 0: 计算新值
    // ═══════════════════════════════════════
    const currentResults: Array<{ dimension: Dimension; correct: boolean; weight: number }> = exercises.map((ex: Exercise, idx: number) => ({
      dimension: (ex.dimension as "grammar" | "listening" | "speaking" | "cultural_pragmatic" | "reading") || "grammar",
      correct: rawResults[idx] === "correct",
      weight: 1.0
    }));

    const newAbilityVector = calculateAbilityVector(ability_vector, currentResults);
    const correctRate = exercises.length > 0 ? correct_answers / exercises.length : 0.5;

    // 读当前 learner 获取 baseline
    const { data: learnerBaseline } = await supabase
      .from("learners")
      .select("cultural_anxiety_score, ability_vector, total_sessions, native_language")
      .eq("id", learner_id)
      .single();

    const oldAnxiety = (learnerBaseline?.cultural_anxiety_score as number) || 50;
    const anxietyBefore = oldAnxiety;
    const anxietyAfter = applyAnxietyDelta(oldAnxiety, correctRate);
    const prevSessions = (learnerBaseline?.total_sessions as number) || 0;

    // BKT 知识追踪：读取上次该知识点的掌握度，用贝叶斯更新
    let bktMastery = 0.2; // 默认先验概率
    let cumulativeCorrect = 0; // 遗忘曲线：累积正确次数
    let memoryStrength = 30;   // 遗忘曲线：记忆稳定性 S（默认基础值）
    if (knowledge_point_id) {
      const { data: prevAssessment } = await supabase
        .from("assessment_records")
        .select("bkt_mastery_after, cumulative_correct")
        .eq("learner_id", learner_id)
        .eq("knowledge_point_id", knowledge_point_id)
        .order("assessed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const priorMastery = (prevAssessment?.bkt_mastery_after as number) || 0.2;
      const prevCumulativeCorrect = (prevAssessment?.cumulative_correct as number) || 0;
      // 累积正确次数：每次答对至少一题就 +1
      cumulativeCorrect = prevCumulativeCorrect + (correct_answers > 0 ? 1 : 0);
      memoryStrength = computeMemoryStrength(cumulativeCorrect);

      bktMastery = bayesianKnowledgeTracing({
        prior_probability: priorMastery,
        guess_probability: 0.25,
        slip_probability: 0.10, // 修复: 原为 0.9 (bug)，标准 BKT slip 应为 0.10
        observed_correct: correctRate >= 0.6 // 正确率 >= 60% 视为掌握
      });
    }

    console.log(`${LOG} [STEP0-计算完成] anxiety: ${anxietyBefore}→${anxietyAfter} vector: ${JSON.stringify(ability_vector)}→${JSON.stringify(newAbilityVector)} correctRate=${correctRate.toFixed(3)} bktMastery=${bktMastery.toFixed(3)} cumulativeCorrect=${cumulativeCorrect} memoryStrength=${memoryStrength.toFixed(1)}d`);

    // ═══════════════════════════════════════
    // 维度分析（提前计算，供 EmotionCheck 使用）
    // ═══════════════════════════════════════
    const DIMENSIONS = ["grammar", "listening", "speaking", "cultural_pragmatic", "reading"] as const;
    type Dimension = typeof DIMENSIONS[number];

    const dimCounts: Record<Dimension, { correct: number; total: number }> = {
      grammar: { correct: 0, total: 0 },
      listening: { correct: 0, total: 0 },
      speaking: { correct: 0, total: 0 },
      cultural_pragmatic: { correct: 0, total: 0 },
      reading: { correct: 0, total: 0 }
    };

    const errorPatterns: Array<{ dimension: Dimension; question_index: number; pattern: string }> = [];

    currentResults.forEach((r, idx) => {
      const dim = r.dimension as Dimension;
      if (dimCounts[dim]) {
        dimCounts[dim].total++;
        if (r.correct) dimCounts[dim].correct++;
        else {
          errorPatterns.push({
            dimension: dim,
            question_index: idx,
            pattern: rawResults[idx] === "unanswered" ? "unanswered" : "wrong_answer"
          });
        }
      }
    });

    const dimensionScores: Record<string, number> = {};
    for (const d of DIMENSIONS) {
      dimensionScores[d] = dimCounts[d].total > 0
        ? Math.round((dimCounts[d].correct / dimCounts[d].total) * 100)
        : null as unknown as number;
    }

    // 从 knowledge_point_id 推断 scene_type
    const inferredSceneType = getSceneType(knowledge_point_id || '');

    // ═══════════════════════════════════════
    // [NEW] EmotionCheck: 情感检测与干预
    // ═══════════════════════════════════════
    const homeCultureCode = `hc_${(learnerBaseline?.native_language as string || "en").toLowerCase()}`;
    const emotionSnapshot = detectEmotionState({
      correctRate,
      rawResults,
      anxietyBefore,
      anxietyAfter,
      dimensionScores,
      errorPatterns,
      sessionDurationMs: time_spent || 0,
      homeCultureCode,
    });
    // red 状态给 anxiety 加额外偏移
    const emotionAdjustedAnxiety = emotionSnapshot.state === "red"
      ? Math.min(100, anxietyAfter + 10)
      : anxietyAfter;
    console.log(`${LOG} [EmotionCheck] state=${emotionSnapshot.state} signals=${JSON.stringify(emotionSnapshot.signals)} intervention=${emotionSnapshot.intervention?.suggested_action || "none"}`);

    // ═══════════════════════════════════════
    // STEP 1: L1 写入 - learning_records 标准化 practice_result
    // ═══════════════════════════════════════

    // 构建标准化的逐题结果结构
    const standardizedPracticeResult = {
      exercises: exercises.map((ex: Exercise, idx: number) => ({
        question_index: idx,
        user_answer: rawResults[idx] ?? "unanswered",
        correct_answer: ex.correct_answer ?? "",
        is_correct: rawResults[idx] === "correct",
        dimension: ex.dimension || "grammar",
        time_spent_ms: 0  // 前端暂未传逐题耗时，Phase 2 可补充
      })),
      total_correct: correct_answers,
      total_count: exercises.length,
      score_percent: Math.round(correctRate * 100)
    };

    let l1Success = false;
    if (learning_record_id) {
      // 更新已有 learning_record
      const { error: l1Error } = await supabase
        .from("learning_records")
        .update({
          status: "completed",
          practice_result: standardizedPracticeResult,
          comprehension_score: score,
          completed_at: new Date().toISOString(),
          time_spent
        })
        .eq("id", learning_record_id);

      l1Success = !l1Error;
      console.log(`${LOG} [STEP1-L1写入] recordId=${learning_record_id.slice(0,8)} success=${l1Success} ${l1Error?.message ?? ""}`);
    } else {
      // 没有 learning_record_id 时创建一条（兜底）
      const { error: l1InsertError } = await supabase
        .from("learning_records")
        .insert({
          learner_id,
          scene_id: inferredSceneType,
          knowledge_point_id,
          practice_result: standardizedPracticeResult,
          comprehension_score: score,
          time_spent,
          status: "completed",
          completed_at: new Date().toISOString()
        });

      l1Success = !l1InsertError;
      console.log(`${LOG} [STEP1-L1新建] success=${l1Success} ${l1InsertError?.message ?? ""}`);
    }

    // ═══════════════════════════════════════
    // STEP 2: L2 写入 - assessment_records
    // ═══════════════════════════════════════

    console.log(`${LOG} [STEP2] dimensionScores=${JSON.stringify(dimensionScores)} errors=${errorPatterns.length} scene=${inferredSceneType}`);

    let l2Success = false;
    try {
      const { error: l2Error } = await supabase
        .from("assessment_records")
        .insert({
          learner_id,
          assessment_type: 'learning_result',
          overall_score: score,
          knowledge_point_id,
          learning_record_id: learning_record_id || null,
          score,
          correct_answers,
          wrong_answers,
          ability_vector_before: ability_vector,
          ability_vector_after: newAbilityVector,
          anxiety_before: anxietyBefore,
          anxiety_after: anxietyAfter,
          bkt_mastery_after: bktMastery,
          cumulative_correct: cumulativeCorrect,
          memory_strength: memoryStrength,
          // Phase 2 新增字段
          scene_type: inferredSceneType,
          hsk_level_at_time: body.hsk_level ?? null,
          dimension_scores: dimensionScores,
          error_patterns: errorPatterns,
          emotion_state: emotionSnapshot.state,
          emotion_signals: emotionSnapshot.signals
        });

      l2Success = !l2Error;
      console.log(`${LOG} [STEP2-L2写入] success=${l2Success} ${l2Error?.message ?? ""}`);
    } catch (l2Err) {
      console.error(`${LOG} [STEP2-L2写入失败]`, l2Err);
    }

    // ═══════════════════════════════════════
    // STEP 3: L3 更新 - learners current 行
    // ═══════════════════════════════════════
    let l3Success = false;
    let updatedLearner: Record<string, unknown> | null = null;
    try {
      const { error: l3Error } = await supabase
        .from("learners")
        .update({
          cultural_anxiety_score: emotionAdjustedAnxiety,
          ability_vector: newAbilityVector,
          total_sessions: prevSessions + 1,
          last_scene_id: knowledge_point_id || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", learner_id);

      l3Success = !l3Error;
      console.log(`${LOG} [STEP3-L3更新] sessions: ${prevSessions}→${prevSessions+1} scene=${knowledge_point_id?.slice(0,8)} success=${l3Success} ${l3Error?.message ?? ""}`);

      if (l3Success) {
        // 重读完整 learner 作为权威返回值
        const { data: fresh, error: readError } = await supabase
          .from("learners")
          .select("*")
          .eq("id", learner_id)
          .maybeSingle();

        if (!readError && fresh) {
          updatedLearner = fresh as Record<string, unknown>;
          console.log(`${LOG} [STEP3-L3重读] anxiety=${fresh.cultural_anxiety_score} vector=${JSON.stringify(fresh.ability_vector)} sessions=${fresh.total_sessions}`);
        } else {
          console.error(`${LOG} [STEP3-L3重读失败] ${readError?.message}`);
        }
      }
    } catch (l3Err) {
      console.error(`${LOG} [STEP3-L3更新失败]`, l3Err);
    }

    // ═══════════════════════════════════════
    // STEP 3.5: Phase 3A - L3 历史快照（按规则触发）
    // ═══════════════════════════════════════
    let snapshotInfo: { created: boolean; reason?: string; id?: string } = { created: false };
    if (l3Success) {
      try {
        const triggerReason = shouldCreateSnapshot({
          anxietyBefore,
          anxietyAfter,
          vectorBefore: ability_vector,
          vectorAfter: newAbilityVector,
          sessionsBefore: prevSessions,
          hskLevelBefore: null, // 本轮不追踪 HSK 变化（可后续扩展）
          hskLevelAfter: body.hsk_level ?? null
        });

        if (triggerReason) {
          // 使用 RPC 绕过 PostgREST schema 缓存（新建表需要）
          const { error: snapError, data: snapData } = await supabase
            .rpc("insert_learner_snapshot", {
              p_learner_id: learner_id,
              p_reason: triggerReason,
              p_anxiety: anxietyAfter,
              p_vector: newAbilityVector,
              p_hsk: body.hsk_level ?? (typeof updatedLearner?.hsk_level === "number" ? updatedLearner.hsk_level : 1),
              p_native_lang: ((updatedLearner?.native_language as string) || "英语"),
              p_sessions: prevSessions + 1,
              p_scene_id: knowledge_point_id || null
            });

          if (!snapError && snapData) {
            const snapId = typeof snapData === 'string' ? snapData : (snapData as {id?: string}).id;
            snapshotInfo = { created: true, reason: triggerReason, id: snapId?.slice(0,8) ?? snapId?.toString().slice(0,8) ?? 'unknown' };
            console.log(`${LOG} [STEP3.5-快照] 触发=${triggerReason} id=${String(snapId).slice(0,8)} anxiety=${anxietyAfter}`);
          } else {
            console.error(`${LOG} [STEP3.5-快照失败] ${snapError?.message}`);
          }
        } else {
          console.log(`${LOG} [STEP3.5-快照] 不触发 (delta_anxiety=${Math.abs(anxietyAfter-anxietyBefore).toFixed(1)} sessions=${prevSessions+1})`);
        }
      } catch (snapErr) {
        console.error(`${LOG} [STEP3.5-快照异常]`, snapErr);
      }
    }

    // ═══════════════════════════════════════
    // STEP 4: L4 写入 - Neo4j Learner 图谱（不阻塞主流程）
    // ═══════════════════════════════════════
    if (knowledge_point_id) {
      try {
        await recordMastery(learner_id, knowledge_point_id, correctRate, cumulativeCorrect);
        console.log(`${LOG} [STEP4-Neo4j] 写入成功`);
      } catch (err) {
        console.warn(`${LOG} [STEP4-Neo4j] 写入失败（不影响主流程）:`, err);
      }
    }

    // ═══════════════════════════════════════
    // STEP 5: 缓存置信度反馈环路 — 做题正确率回写 llm_content_cache
    // 设计缺口：缓存 confidence_score 原来只由 Guardrail 决定（A4/A5 质检），
    // 用户实际答题结果不反向修正。坏题（LLM 幻觉写了错误答案）会永远留在缓存里。
    //
    // 修复逻辑：
    //   1. 查 llm_content_cache 有没有匹配这条 kp+hsk+scene+target_culture 的 ACTIVE 缓存
    //   2. 查同 kp+hsk 最近 10 条 completed 学习记录，算平均正确率
    //   3. ≥60% → 缓存健康，不动
    //   4. <60% 且数据量 ≥3 次 → confidence_score 降到 0.84（低于 CACHE_WRITE 阈值 0.85），
    //      下次 coordinator 查询自然 miss，触发重新 LLM 生成
    // ═══════════════════════════════════════
    if (knowledge_point_id && hsk_level) {
      try {
        const targetCulture = (learnerBaseline?.native_language as string) || "英语";

        // 5a. 定位这条缓存（和 queryKnowledgeBase 同样的复合 key）
        const { data: cacheRow } = await supabase
          .from("llm_content_cache")
          .select("knowledge_point_id, confidence_score, status")
          .eq("knowledge_point_id", knowledge_point_id)
          .eq("hsk_level", hsk_level)
          .eq("scene_id", inferredSceneType)
          .eq("target_culture", targetCulture)
          .eq("status", "ACTIVE")
          .maybeSingle();

        if (!cacheRow) {
          console.log(`${LOG} [STEP5-CacheLoop] 未找到 ${knowledge_point_id.slice(0,8)}+hsk${hsk_level}+${targetCulture} 的 ACTIVE 缓存，跳过`);
        } else {
          // 5b. 算历史平均正确率
          const { data: recentRecords } = await supabase
            .from("learning_records")
            .select("practice_result")
            .eq("knowledge_point_id", knowledge_point_id)
            .eq("hsk_level", hsk_level)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(10);

          const validRecords = (recentRecords || []).filter(
            (r: { practice_result: unknown }) =>
              r.practice_result &&
              typeof (r.practice_result as { score_percent?: unknown }).score_percent === "number"
          );

          if (validRecords.length < 3) {
            console.log(`${LOG} [STEP5-CacheLoop] 历史数据不足 (${validRecords.length}/3)，跳过衰减`);
          } else {
            const avgRate =
              validRecords.reduce(
                (sum: number, r: { practice_result: { score_percent: number } }) =>
                  sum + (r.practice_result.score_percent || 0),
                0
              ) / validRecords.length;

            console.log(
              `${LOG} [STEP5-CacheLoop] 最近${validRecords.length}次平均正确率=${avgRate.toFixed(1)}% (阈值=60%)`
            );

            if (avgRate < 60) {
              // 5c. 降 confidence，强制低于 CACHE_WRITE 阈值 0.85
              const degradedConfidence = Math.min(
                Math.max(0.5, (cacheRow.confidence_score as number) - 0.15),
                0.84
              );
              const newStatus = degradedConfidence < 0.7 ? "REJECTED" : "ACTIVE";

              const { error: updateErr } = await supabase
                .from("llm_content_cache")
                .update({
                  confidence_score: degradedConfidence,
                  status: newStatus,
                })
                .eq("knowledge_point_id", knowledge_point_id)
                .eq("hsk_level", hsk_level)
                .eq("scene_id", inferredSceneType)
                .eq("target_culture", targetCulture);

              if (!updateErr) {
                console.warn(
                  `${LOG} [STEP5-CacheLoop] ⚠️ 缓存降置信度: ${cacheRow.confidence_score} → ${degradedConfidence} (状态=${newStatus}) | 原因=最近${validRecords.length}次正确率${avgRate.toFixed(0)}% < 60%`
                );
              } else {
                console.error(`${LOG} [STEP5-CacheLoop] 更新缓存失败:`, updateErr.message);
              }
            } else {
              console.log(`${LOG} [STEP5-CacheLoop] ✅ 缓存健康 (平均正确率${avgRate.toFixed(0)}% ≥ 60%)`);
            }
          }
        }
      } catch (err) {
        console.warn(`${LOG} [STEP5-CacheLoop] 异常（不影响主流程）:`, err);
      }
    }

    // ═══════════════════════════════════════
    // 返回
    // ═══════════════════════════════════════
    const elapsed = Date.now() - startTime;
    console.log(`${LOG} [DONE] ${elapsed}ms L1=${l1Success} L2=${l2Success} L3=${l3Success} hasUpdatedLearner=${!!updatedLearner}`);

    return NextResponse.json({
      success: true,
      data: {
        score,
        correct_answers,
        wrong_answers,
        new_ability_vector: newAbilityVector,
        new_cultural_anxiety_score: emotionAdjustedAnxiety,
        emotion: {
          state: emotionSnapshot.state,
          signals: emotionSnapshot.signals,
          intervention: emotionSnapshot.intervention,
        },
        updated_learner: updatedLearner,
        _phase1_debug: {
          l1_written: l1Success,
          l2_written: l2Success,
          l3_updated: l3Success,
          anxiety_delta: +(anxietyAfter - anxietyBefore).toFixed(2),
          sessions_count: prevSessions + 1
        },
        _phase2_debug: {
          dimension_scores: dimensionScores,
          error_patterns_count: errorPatterns.length,
          scene_type: inferredSceneType
        },
        _phase3a_snapshot: {
          created: snapshotInfo.created,
          reason: snapshotInfo.reason ?? null,
          id: snapshotInfo.id ?? null
        }
      }
    });

  } catch (error) {
    console.error(`${LOG} [FATAL] learner=${learnerIdLog}`, error);
    return NextResponse.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 }
    );
  }
}

// GET: 获取学习历史（保持不变）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const learner_id = searchParams.get("learner_id");

    if (!learner_id) {
      return NextResponse.json(
        { success: false, error: "缺少学习者ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { data: records, error } = await supabase
      .from("learning_records")
      .select(`
        *,
        cultural_knowledge_points (
          id,
          content_json
        )
      `)
      .eq("learner_id", learner_id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: records
    });

  } catch (error) {
    console.error("获取学习历史失败:", error);
    return NextResponse.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
