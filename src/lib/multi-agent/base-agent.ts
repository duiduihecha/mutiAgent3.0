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


import type { AgentMessage } from './types';
import { AgentError, ValidationError } from './errors';
import { safeJsonParse, withTimeout, withRetry } from './utils';

function resolveAgentPreset(agentId: string): LLMPreset {
  switch (agentId) {
    case "A2_MotherTongueExplainer": return "generation_a2";
    case "A3_CulturalComparator": return "generation_a3";
    case "A4_ContentGenerator": return "generation_a4";
    case "A5_QualityController": return "generation_a5";
    default: return "generation";
  }
}

export abstract class BaseAgent {
  protected agent_id: string;
  protected model: string | null;
  protected temperature: number | null;
  private unified_llm: UnifiedLLMService;
  protected abortSignal?: AbortSignal;
  /** 本 agent 的 LLM preset（per-agent 模型路由，见 llm-config generation_a2~a5） */
  protected preset: LLMPreset;

  constructor(agent_id: string) {
    const config = AGENT_CONFIGS[agent_id as keyof typeof AGENT_CONFIGS];
    if (!config) {
      throw new AgentError(`Unknown agent: ${agent_id}`, agent_id);
    }

    this.agent_id = agent_id;
    this.model = config.model;
    this.temperature = config.temperature;
    this.preset = resolveAgentPreset(agent_id);
    this.unified_llm = new UnifiedLLMService(this.preset);
  }

  setAbortSignal(signal?: AbortSignal): void {
    this.abortSignal = signal;
  }

  abstract process(message: AgentMessage): Promise<AgentMessage>;

  protected async generateResponse(
    system_prompt: string,
    user_message: string,
    timeoutMs: number = 300000,
    responseFormat?: { type: "json_object" },
  ): Promise<string> {
    const messages: LLMMessage[] = [
      { role: 'system', content: system_prompt },
      { role: 'user', content: user_message }
    ];

    const provider = getLLMConfig(this.preset).provider;
    const genConfig = getLLMConfig(this.preset);

    // [P0 修复 P-01] 超时必须真正中止底层 fetch：
    // 旧实现用 Promise.race，超时只让本层 reject，底层请求仍在途（继续烧钱），
    // 且 withRetry 会立刻发起重试，造成同一时刻双份请求。
    // 现改为：per-call AbortController，超时/上游取消都触发 abort，
    // 由 UnifiedLLMService 内部链路真正中断 fetch。
    const callController = new AbortController();
    let timedOut = false;
    // Agent 级超时由调用方传入（A4 大调用 20min、其余 60s），路由层 480s 兜底；
    // 慢模型（kimi 族推理模型）的偶发 5-8min 由上方更长的 timeoutMs 覆盖，这里不过度等待。
    const effTimeout = timeoutMs;
    const timer = setTimeout(() => {
      timedOut = true;
      callController.abort();
    }, effTimeout);
    const onParentAbort = () => callController.abort();
    if (this.abortSignal) {
      if (this.abortSignal.aborted) callController.abort();
      else this.abortSignal.addEventListener('abort', onParentAbort, { once: true });
    }

    try {
      // 温度：优先 Agent 自身配置（A2-A5 消融固定 0.0，见 AGENT_CONFIGS），缺省回落 preset 配置。
      const effectiveTemperature = this.temperature ?? genConfig.temperature;
      // kimi 族推理模型偶发返回空 content（限流/网络抖动）：内部退避重试，不依赖外层 withRetry 也能自愈。
      // 复用 callController（空响应时请求已完成、未 abort，重试安全）；其他异常仍走下方 catch。
      const MAX_EMPTY_RETRIES = 8;
      const _t0 = Date.now();
      let content = '';
      for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
        if (attempt === 0) {
          console.log(`[TIMING] ${this.agent_id} 调用开始 | system=${system_prompt.length} user=${user_message.length} baseUrl=${genConfig.baseUrl?.slice(0,40)}`);
        }
        const response: LLMResponse = await this.unified_llm.chat(messages, {
          provider: provider as LLMProvider,
          model: this.model ?? undefined,
          temperature: effectiveTemperature,
          // 硬传 max_tokens：彻底规避各 provider client 默认值过小（2048/4096）导致的内容截断。
          // 中文教案长任务（A4 约5000汉字）需要 8192 output tokens；DeepSeek 官方上限就是 8192。
          max_tokens: 8192,
          response_format: responseFormat,
          signal: callController.signal,
          baseUrl: genConfig.baseUrl,
          apiKey: genConfig.apiKey,
          telemetry_label: this.agent_id,
        });
        content = (response.content || '').trim();
        console.log(`[TIMING] ${this.agent_id} attempt=${attempt} 耗时=${Date.now()-_t0}ms contentLen=${content.length}`);
        if (content) break;
        if (attempt < MAX_EMPTY_RETRIES) {
          await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        }
      }
      if (!content) {
        // 多次空响应仍失败：抛可重试错误，交给外层 withRetry 兜底（或最终失败）。
        throw new AgentError(
          `Agent ${this.agent_id} 收到空响应（LLM 网关未返回内容）`,
          this.agent_id,
          true
        );
      }
      return content;
    } catch (error) {
      const err = error as Error;
      // 区分超时 / 上游取消 / 业务失败，给出可诊断的错误信息
      const reason = timedOut
        ? `timeout after ${effTimeout}ms（底层请求已中止，不会继续消耗配额）`
        : this.abortSignal?.aborted
          ? '上游请求已取消（用户断开或路由级超时）'
          : err.message;
      // 超时/取消类错误不可重试：重试只会再烧一次钱
      const retryable = !timedOut && !this.abortSignal?.aborted;
      throw new AgentError(
        `Agent ${this.agent_id} failed (provider=${provider}): ${reason}`,
        this.agent_id,
        retryable
      );
    } finally {
      clearTimeout(timer);
      if (this.abortSignal) {
        this.abortSignal.removeEventListener('abort', onParentAbort);
      }
    }
  }
}

// ==================== 智能体实现 ====================

