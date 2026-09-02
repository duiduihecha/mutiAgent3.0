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

import { UnifiedLLMService, type LLMMessage, type LLMResponse, type LLMProvider } from '../../unified-llm-service';
import { getLLMConfig, isOfflineMockExecution, type LLMPreset } from '../../llm-config';
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
import { buildHardRuleCharWhitelist as buildHardRuleCharWhitelistFromGraph } from "../../hsk-vocab-graph";
import { neo4jService } from "../../neo4j-service";
import type { VocabularyConstraint } from "../../hsk-vocab-graph";
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
} from '../../constants';

// ==================== 错误类型定义 ====================

import { BaseAgent } from '../base-agent';
import { AgentError, ValidationError } from '../errors';
import type { AgentMessage, LearnerProfile, Exercise, GeneratedContent } from '../types';
import {
  safeJsonParse,
  withTimeout,
  withRetry,
  truncateForA4,
} from '../utils';
import {
  calculateCulturalAnxiety,
  calculateAnxietyDelta,
  applyAnxietyDelta,
  anxietyScoreToLevel,
  calculateNativeLanguageRatio,
  detectBias,
  bayesianKnowledgeTracing,
  computeMemoryStrength,
  applyForgettingDecay,
  calculateAbilityVector,
} from '../algorithms';
import {
  aggregateLearnerMetrics,
  getRecentLearningTrend,

} from '../trend-io';
import { buildA2SystemPrompt, buildA2UserPrompt } from '../prompts/a2';
import type {
  SlotDef,
  SlotTemplate,
  SlotResult,
} from '../types';
import { getSlotStructure, generateSlots, assembleSlots, } from '../a2-slots';
import {
  calibrateA2NativeRatio,
  anxietyScoreToTier,
  RATIO_BUDGET_BY_TIER,
  type A2Expander,
} from '../a2-ratio-calibrator';
import {
  buildNativeBudgetBlock,
  buildHskHardBlock,
  buildGraphMandatoryBlock,
  getA2GoldenExamplesBlock,
} from '../prompts/a2-helpers';
import { validateSlotRatio } from '../algorithms';

// kp 语义锚定 + 文化图谱数据
import {
  langCodeToHomeCultureId,
  queryCulturalGraphData,
  queryVocabularyConstraints,
  queryLearnerWeakDimensions,
  getHardRuleCharWhitelist,
  fetchKnowledgePointSemantics,
} from '../kp-semantics';

export class MotherTongueExplainerAgent extends BaseAgent {
  constructor() {
    super('A2_MotherTongueExplainer');
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    const { knowledge_point_id, target_language, anxiety_level, hsk_level } = message.payload as {
      knowledge_point_id: string;
      target_language: string;
      anxiety_level?: 'high' | 'medium' | 'low';
      hsk_level: number;
    };

    // θ₃: 从anxiety_level推导焦虑分值，生成slot结构
    const anxietyScore = anxiety_level === 'high' ? 85 : anxiety_level === 'low' ? 30 : 60;
    const slotStructure = getSlotStructure(anxietyScore);
    const native_ratio = slotStructure.target_ratio;

    // 语言码来源与 A3 对齐：优先取 payload 里显式的 native_language_code，
    // 缺失时才回退到 target_language（getLanguageCode 已做幂等，可安全接受码或中文名）
    const langCode = getLanguageCode(
      (message.payload as Record<string, unknown>)?.native_language_code as string || target_language
    );
    const targetLangNaturalName = getLanguageNaturalName(langCode);

    // Phase 2d: 从 Neo4j 图谱查询该 KP 的母语文化表现数据
    const hcId = langCodeToHomeCultureId(langCode);
    const graphCulturalData = await queryCulturalGraphData(knowledge_point_id, hcId);

    let graphContextBlock = "";
    if (graphCulturalData?.manifestation) {
      const m = graphCulturalData.manifestation;
      graphContextBlock = `
<graph_cultural_context>
以下是知识图谱中记录的该文化维度在${targetLangNaturalName}母语文化圈中的具体表现数据，请参考这些信息来增强阐释的准确性和针对性：
- 文化维度: ${m.dimension_name}
- 在该文化圈的具体表现: ${m.manifestation}
- 与中国文化的冲突: ${m.conflict_with_chinese}
- 实用跨文化沟通建议: ${m.pragmatic_tip}
- 真实场景示例: ${m.example_scenario}
请在 pragmatic_rules 和 taboo_warnings 中融入这些图谱数据。
</graph_cultural_context>`;
      console.log(`[A2] 图谱文化数据已注入: kp=${knowledge_point_id} hc=${hcId}`);
    } else {
      console.log(`[A2] 无图谱文化数据，使用 LLM-only 模式: kp=${knowledge_point_id} hc=${hcId}`);
    }

    // 锚定知识点语义：从 Supabase 读取该 KP 的 topic / description / cultural_points。
    // 否则 LLM 只拿到一个 UUID，会盲生成（campus 场景曾因此跑题成"好"字完成体"）。
    const kpSemantic = await fetchKnowledgePointSemantics(knowledge_point_id);
    let kpSemanticBlock = "";
    if (kpSemantic) {
      const points = (kpSemantic.cultural_points || []).join("、");
      const bindings = (kpSemantic.language_binding_points || []).join("、");
      kpSemanticBlock = `
<knowledge_point_context>
这是本次要讲解的知识点，请务必围绕其具体内容生成，不要泛泛而谈通用中文语法：
- 知识点主题(topic): ${kpSemantic.topic || "(未知)"}
- 知识点描述: ${kpSemantic.description || "(无)"}
- 必须覆盖的具体文化点(cultural_points): ${points || "(无，请基于 topic 自由展开)"}
- 与语言绑定的要点(language_binding_points): ${bindings || "(无)"}
</knowledge_point_context>`;
      console.log(`[A2] KP语义已注入: kp=${knowledge_point_id} topic=${kpSemantic.topic} points=${points}`);
    } else {
      console.log(`[A2] 未取到KP语义，使用 LLM-only 模式: kp=${knowledge_point_id}`);
    }
    // θ₃ 槽位分段生成 vs 方案三「单调用 + 三钉 Prompt + 本地比例校准 + Few-shot」。
    // 方案三默认走单调用路径（Prompt 本身承载全部结构约束 + 比例预算），本地校准器做 0~1 次
    // 低成本扩写兜底，不再依赖多槽串行/批量的重试瀑布。
    // 回滚方式：env USE_SLOT_GENERATION=true 即可回到 θ₃ 双批并行 + 补生成/退化的旧链路。
    const useSlotMode = process.env.USE_SLOT_GENERATION === 'true';

    // ---- 方案三：Prompt 三钉（预算/HSK/图谱接地）+ Few-shot block 注入 ----
    const tier = anxietyScoreToTier(anxietyScore);
    const budget = RATIO_BUDGET_BY_TIER[tier];
    const nativeBudgetBlock = buildNativeBudgetBlock({
      tier,
      target_ratio: budget.target_ratio,
      targetLangNaturalName,
      fields: budget.fields,
    });
    const hskHardBlock = buildHskHardBlock({ hsk_level, targetLangNaturalName });
    const graphMandatoryBlock = buildGraphMandatoryBlock({
      graphCulturalData,
      targetLangNaturalName,
    });
    const scene_keywords = (() => {
      const known: string[] = [];
      if (kpSemantic?.topic) known.push(String(kpSemantic.topic));
      for (const c of (kpSemantic?.cultural_points || []).slice(0, 5)) if (c) known.push(String(c));
      return known;
    })();
    let goldenExamplesBlock: string | undefined;
    if (process.env.A2_USE_FEWSHOT !== "false") {
      try {
        goldenExamplesBlock = getA2GoldenExamplesBlock({
          langCode,
          hsk_level,
          anxietyTier: tier,
          scene_keywords,
          targetLangNaturalName,
          kpTopic: kpSemantic?.topic || knowledge_point_id,
          graphHomeCultureId: hcId,
        });
      } catch (err) {
        console.warn("[A2] Few-shot 召回失败，降级为无黄金样本：", (err as Error).message);
        goldenExamplesBlock = undefined;
      }
    }
    const system_prompt = buildA2SystemPrompt({
      targetLangNaturalName,
      hsk_level,
      native_budget_block: nativeBudgetBlock,
      hsk_hard_block: hskHardBlock,
      graph_mandatory_block: graphMandatoryBlock,
      golden_examples_block: goldenExamplesBlock,
    });

    const user_message = buildA2UserPrompt({
      knowledge_point_id,
      targetLangNaturalName,
      target_language,
      hsk_level,
      anxiety_level: anxiety_level || 'medium',
      anxietyScore,
      // θ₃ 模式才把 slotStructure 全传；方案三模式下只传 target_ratio（Ratio Guidance 分支）
      slotStructure: useSlotMode
        ? slotStructure
        : { slots: [], native_count: slotStructure.native_count, chinese_count: slotStructure.chinese_count, target_ratio: slotStructure.target_ratio },
      kpSemanticBlock,
      graphContextBlock,
    });

    let cultural_explanation: Record<string, unknown>;

    if (useSlotMode) {
      // ── 槽位分段生成路径 ──
      console.log(`[θ₃] A2使用槽位分段生成 mode, anxiety=${anxietyScore}, template=${slotStructure.native_count}母+${slotStructure.chinese_count}中`);

      const slotResults = await generateSlots(
        slotStructure,
        system_prompt,
        knowledge_point_id,
        targetLangNaturalName,
        hsk_level,
        graphContextBlock,
        kpSemanticBlock,
        (sysPrompt, userMsg, timeout) => this.generateResponse(sysPrompt, userMsg, timeout),
      );

      // 拼装 + 过渡锚句
      const assembledText = assembleSlots(slotResults, slotStructure, targetLangNaturalName);

      // 组装为兼容旧格式的 JSON
      cultural_explanation = {
        precise_definition: slotResults[0]?.content || '',
        scene_introduction: slotResults[1]?.content || '',
        pragmatic_rules: [slotResults[2]?.content || ''],
        taboo_warnings: slotResults[3]?.content ? [slotResults[3].content] : [],
        difficulty_notes: slotResults[4]?.content || '',
        key_terms: [],
        _slot_mode: true,
        _slot_template: `${slotStructure.native_count}母+${slotStructure.chinese_count}中`,
        _assembled_text: assembledText,
      };
    } else {
      // ── 方案三：单模型单次调用路径 ──
      // 三钉 Prompt（预算 / HSK / 图谱接地）+ Few-shot + response_format=json_object 四层约束叠加，
      // 输出格式靠 API 层保障、比例靠本地校准器兜底。
      const response = await this.generateResponse(
        system_prompt,
        user_message,
        300000,
        { type: "json_object" },
      );
      const rawExplanation = safeJsonParse(response) as Record<string, unknown>;

      // ── 方案三：本地比例校准（99% 情况纯本地；仅赤字 > 20% 时 1 次 flash 扩写兜底） ──
      const expander: A2Expander = async (expandArgs) => {
        const flashLlm = new UnifiedLLMService("guardrail_binary");
        const payload = {
          role: "expand_or_trim_native_ratio",
          tier: expandArgs.tier,
          target_ratio: expandArgs.target_ratio,
          target_lang: expandArgs.target_lang_name,
          deficit_chars: expandArgs.deficit_chars,
          excess_chars: expandArgs.excess_chars,
          native_side: expandArgs.native_side,
          chinese_side: expandArgs.chinese_side,
        };
        const result = await flashLlm.chat(
          [
            {
              role: "system",
              content:
                "你是 A2 校准扩写辅助。输入：现有的 native_side / chinese_side 字段和缺失字符数 deficit_chars / excess_chars。" +
                " 输出必须是严格 JSON，仅允许两个键：{ native_side?, chinese_side? }，其下的字段名必须与输入完全一致（precise_definition / scene_introduction 等）。" +
                " 只允许在已有的字符串末尾追加或精简，禁止改写已有的中文例句内容、禁止新增字段、禁止重写 key_terms / examples 的数组元素。",
            },
            { role: "user", content: JSON.stringify(payload, null, 2) },
          ],
          { temperature: 0, max_tokens: 260, response_format: { type: "json_object" } },
        );
        try {
          const parsed = JSON.parse(result.content || "{}");
          return {
            native_side: parsed.native_side,
            chinese_side: parsed.chinese_side,
          } as Record<string, unknown>;
        } catch {
          return null;
        }
      };
      const calib = await calibrateA2NativeRatio({
        raw: rawExplanation,
        anxietyScore,
        target_lang_name: targetLangNaturalName,
        expander:
          process.env.A2_CALIBRATOR_EXPANDER === "false"
            ? undefined
            : expander,
      });
      cultural_explanation = calib.explanation;
      (cultural_explanation as any)._ratio_calibration = {
        enabled: true,
        ...calib.report,
      };
      console.log(
        `[A2比例校准] anxiety=${anxietyScore} tier=${calib.report.tier} ` +
          `target=${calib.report.target_ratio} before=${calib.report.before} after=${calib.report.after} ` +
          `dev_before=${calib.report.deviation_before} dev_after=${calib.report.deviation_after} ` +
          `trimmed=${calib.report.trimmed_fields.join(",") || "(none)"} ` +
          `expander=${calib.report.expansion_triggered ? (calib.report.expansion_succeeded ? "ok" : "failed") : "n/a"}`,
      );
    }

    return {
      ...message,
      sender_agent: this.agent_id,
      receiver_agent: 'A3_CulturalComparator',
      message_type: 'content_request',
      payload: {
        ...message.payload,
        cultural_explanation,
        native_ratio,
        language: target_language,
        slot_structure: useSlotMode ? slotStructure : null,
        ratio_tier: useSlotMode ? null : tier,
      },
      status: 'passed',
      created_at: new Date()
    };
  }
}

