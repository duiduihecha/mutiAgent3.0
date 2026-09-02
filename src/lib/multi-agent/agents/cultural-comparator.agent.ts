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
import { langCodeToHomeCultureId, queryCulturalGraphData } from '../kp-semantics';
import { buildA3SystemPrompt, buildA3UserPrompt } from '../prompts/a3';
import {
  aggregateLearnerMetrics,
  getRecentLearningTrend,
} from '../trend-io';

export class CulturalComparatorAgent extends BaseAgent {
  constructor() {
    super('A3_CulturalComparator');
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    const { chinese_culture_point, target_culture, hsk_level } = message.payload as {
      chinese_culture_point: string;
      target_culture: string;
      hsk_level: number;
    };

    const nativeLangCode = (message.payload as Record<string, any>)?.native_language_code || 'en';
    const targetLangNaturalName = getLanguageNaturalName(nativeLangCode);
    const targetCultureDisplay = getLanguageNaturalName(nativeLangCode);

    // Phase 2c: 从 Neo4j 图谱查询该 KP 的跨文化维度与母语表现数据
    const hcId = langCodeToHomeCultureId(nativeLangCode);
    const graphCulturalData = await queryCulturalGraphData(chinese_culture_point, hcId);

    let graphComparisonBlock = "";
    if (graphCulturalData && graphCulturalData.dimensions.length > 0) {
      const dimsFormatted = graphCulturalData.dimensions
        .map(d => `  - ${d.name} (${d.name_en}) [框架: ${d.framework}, 权重: ${d.weight}]`)
        .join("\n");
      graphComparisonBlock = `
<graph_dimension_data>
知识图谱中已标注该文化概念涉及以下学术维度（请优先使用这些维度进行分析）：
${dimsFormatted}
</graph_dimension_data>`;
      console.log(`[A3] 图谱维度数据已注入: kp=${chinese_culture_point} dims=${graphCulturalData.dimensions.length}`);
    } else {
      console.log(`[A3] 无图谱维度数据，使用 LLM-only 模式: kp=${chinese_culture_point}`);
    }

    let graphManifestBlock = "";
    if (graphCulturalData?.manifestation) {
      const m = graphCulturalData.manifestation;
      graphManifestBlock = `
<graph_manifestation_data>
知识图谱中记录的该文化维度在学习者母语文化圈中的具体表现（${m.dimension_name}）：
- 具体表现: ${m.manifestation}
- 与中国文化冲突: ${m.conflict_with_chinese}
- 实用跨文化建议: ${m.pragmatic_tip}
- 真实场景示例: ${m.example_scenario}
请在 target_culture_perspective 和 learning_pitfall 中参考以上信息。
</graph_manifestation_data>`;
    }
    const system_prompt = buildA3SystemPrompt({ targetLangNaturalName, graphCulturalData });
    const user_message = buildA3UserPrompt({
      chinese_culture_point,
      targetCultureDisplay,
      graphComparisonBlock,
      graphManifestBlock,
    });

    const response = await this.generateResponse(system_prompt, user_message, 300000);  // 120s

    // XML 解析辅助
    const extractXml = (tag: string, text: string): string => {
      const re = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">", "i");
      const m = text.match(re);
      return m?.[1]?.trim() || "";
    };

    const framework = extractXml("framework_used", response);
    const cnPerspective = extractXml("chinese_perspective", response);
    const targetPerspective = extractXml("target_culture_perspective", response);
    const pitfall = extractXml("learning_pitfall", response);

    // 解析 key_terms
    const keyTermsXml = extractXml("key_terms", response);
    const keyTerms: Array<{chinese: string; pinyin: string; explanation: string}> = [];
    if (keyTermsXml) {
      const termRe = /<term\s+chinese="([^"]*)"\s+pinyin="([^"]*)"\s+explanation="([^"]*)"/g;
      let match;
      while ((match = termRe.exec(keyTermsXml)) !== null) {
        keyTerms.push({ chinese: match[1], pinyin: match[2], explanation: match[3] });
      }
    }

    const parsedResponse: Record<string, unknown> = {
      _mock_fixture: isOfflineMockExecution(),
      framework_used: framework,
      chinese_perspective: cnPerspective,
      target_culture_perspective: targetPerspective,
      learning_pitfall: pitfall,
      key_terms: keyTerms,
      // 兼容旧输出格式
      cultural_dimension: framework,
      similarities: [],
      differences: [
        { chinese_practice: cnPerspective, target_practice: targetPerspective, description: pitfall },
      ],
      pragmatic_hints: [pitfall],
    };

    // 偏见检测
    const bias_result = detectBias(response);

    return {
      ...message,
      sender_agent: this.agent_id,
      receiver_agent: 'A4_ContentGenerator',
      message_type: 'comparison_result',
      payload: {
        ...message.payload,
        cross_cultural_comparison: parsedResponse,
        bias_detection: bias_result,
        requires_review: bias_result.has_bias,
        a3_raw_response: response,
      },
      status: bias_result.has_bias ? 'pending_review' : 'passed',
      created_at: new Date()
    };
  }
}

