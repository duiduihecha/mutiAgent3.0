/**
 * 统一LLM服务
 * 活跃调用必须由 llm-config preset 解析。旧 provider clients 仅作 legacy 兼容实现，
 * 不得由 LLM_PROVIDER 或缺省 options 隐式选中。
 */

// 从推理文本中稳健抽取 JSON：优先 ```json 围栏，其次从最后一个 { 起向后逐个匹配 } 尝试解析。
// 推理模型（kimi-k2.6 等）常在 content 为空时把最终答案塞进 reasoning_content，需从中抽取结构化结果。
function extractJsonFromReasoning(text: string): string | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { JSON.parse(fence[1].trim()); return fence[1].trim(); } catch { /* ignore */ }
  }
  for (let i = text.lastIndexOf('{'); i >= 0; i = text.lastIndexOf('{', i - 1)) {
    for (let j = text.indexOf('}', i); j !== -1; j = text.indexOf('}', j + 1)) {
      const slice = text.slice(i, j + 1);
      try { JSON.parse(slice); return slice; } catch { /* ignore */ }
    }
  }
  return null;
}

// ==================== 类型定义 ====================
import { getLLMConfig, isOfflineMockExecution, type LLMPreset } from './llm-config';
import { emitExperimentCall, hashMessages } from './experiment-telemetry';
import {
  assertLLMCallAllowed, estimateCostCny, resolveLLMProvider,
  safeLLMConfigSnapshot, type KnownLLMProvider, LLMProviderError,
} from './llm-runtime-policy';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  /** Optional explicit role; defaults to the service's constructor-bound preset. */
  preset?: LLMPreset;
  /** Legacy assertions only. If present they must exactly match the preset route. */
  provider?: LLMProvider;
  response_format?: { type: "json_object" };
  signal?: AbortSignal; // [P0 修复] 上游取消信号，用于真正中断底层 fetch
  // [测试模式] 允许调用方覆盖 baseUrl / apiKey，避免硬读环境变量导致端点/密钥错配
  baseUrl?: string;
  apiKey?: string;
  /** Safe label only; secrets/endpoints are deliberately excluded from telemetry. */
  telemetry_label?: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type LLMProvider = KnownLLMProvider;

function mockFixtureFor(options: LLMOptions): string {
  if (process.env.LLM_MOCK_RESPONSE) return process.env.LLM_MOCK_RESPONSE;
  const label = options.telemetry_label || "";
  if (label === "A2_MotherTongueExplainer") return JSON.stringify({
    _mock_fixture: true, precise_definition: "[MOCK] Offline cultural explanation.",
    scene_introduction: "[MOCK] Offline learning scene.", pragmatic_rules: ["[MOCK] Use the expression politely."],
    examples: [{ chinese: "你好", pinyin: "nǐ hǎo", translation: "[MOCK] hello", notes: "[MOCK] fixture" }],
    taboo_warnings: ["[MOCK] Fixture only; not cultural evidence."], difficulty_notes: "[MOCK] fixture",
    key_terms: [{ chinese: "你好", pinyin: "nǐ hǎo", explanation: "[MOCK] fixture" }],
  });
  if (label === "A3_CulturalComparator") return '<response><mock_fixture>true</mock_fixture><framework_used>[MOCK] offline framework</framework_used><chinese_perspective>[MOCK] Chinese-side fixture</chinese_perspective><target_culture_perspective>[MOCK] target-side fixture</target_culture_perspective><learning_pitfall>[MOCK] fixture only</learning_pitfall><key_terms><term chinese="你好" pinyin="nǐ hǎo" explanation="[MOCK] fixture"/></key_terms></response>';
  if (label === "A4_ContentGenerator") return JSON.stringify({
    _mock_fixture: true,
    cultural_context: { explanation: "[MOCK] Offline renderable lesson; not research evidence.", native_ratio: 0.5 },
    language_points: [{ zh: "你好", native: "[MOCK] hello" }],
    comparison: { cn: "[MOCK] China fixture", target: "[MOCK] target fixture", differences: [] },
    exercises: Array.from({ length: 5 }, (_, i) => ({
      type: "multiple_choice", question: `[MOCK] 第${i + 1}题：请选择A。`,
      options: ["A. 你好", "B. 再见", "C. 谢谢", "D. 不客气"], correct_answer: "A",
      explanation: "[MOCK] Deterministic fixture answer.", dimension: i % 2 ? "grammar" : "cultural_pragmatic",
      pinyin_guide: "nǐ hǎo",
    })),
  });
  if (label === "A5_QualityController") return JSON.stringify({
    _mock_fixture: true, is_qualified: true,
    scores: { pinyin_score: 1, distractor_score: 1, hsk_compliance_score: 1, safety_score: 1 }, feedback: null,
  });
  if (options.preset === "guardrail_binary") return "True";
  if (options.preset === "guardrail_solver") return "A";
  if (options.preset === "guardrail_backtranslation") return "[MOCK] 离线回译";
  if (options.preset === "guardrail_final") return JSON.stringify({
    pinyin_accuracy: 1, distractor_quality: 1, cultural_compliance: 1,
    level_appropriateness: 1, overall_score: 1, is_qualified: true, _mock_fixture: true,
  });
  return JSON.stringify({ _mock_fixture: true, mock: true });
}

// ==================== DeepSeek客户端 ====================

class DeepSeekClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
    this.baseUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
  }

  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { temperature = 0.7, max_tokens = 8192, response_format, signal } = options;

    const body: Record<string, unknown> = {
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens,
    };
    if (response_format) body.response_format = response_format;

    const controller = new AbortController();
    // [P0 修复 P-01] 有外部 signal 时由调用方掌管截止时间（Agent 级超时 60~180s 不等），
    // 内部 120s 仅作为无 signal 调用的兜底，避免过早 abort 长链路调用
    const timeoutId = signal || options.signal ? null : setTimeout(() => controller.abort(), 120_000);
    // [P0 修复] 上游超时/用户断开时，通过外部 signal 真正中断本次请求
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    try {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
    return {
      content,
      usage: data.usage,
    };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async *chatStream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<string> {
    const { temperature = 0.7, max_tokens = 8192 } = options;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature,
        max_tokens,
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  }
}

// ==================== MiniMax客户端 ====================

class MiniMaxClient {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = process.env.MINIMAX_API_URL || '';
    this.apiKey = process.env.MINIMAX_API_KEY || '';
  }

  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { temperature = 0.7, max_tokens = 8192, response_format, signal } = options;

    const body: Record<string, unknown> = {
      // 校内网关已下线 M2.7，仅提供 MiniMax-M3（2026-08-05 核实）
      model: process.env.MINIMAX_MODEL || 'MiniMax-M3',
      messages,
      temperature,
      max_tokens,
    };
    if (response_format) body.response_format = response_format;

    const controller = new AbortController();
    // [P0 修复 P-01] 有外部 signal 时由调用方掌管截止时间（Agent 级超时 60~180s 不等），
    // 内部 120s 仅作为无 signal 调用的兜底，避免过早 abort 长链路调用
    const timeoutId = signal || options.signal ? null : setTimeout(() => controller.abort(), 120_000);
    // [P0 修复] 上游超时/用户断开时，通过外部 signal 真正中断本次请求
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    try {
    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
    return {
      content,
      usage: data.usage,
    };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async *chatStream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<string> {
    const { temperature = 0.7, max_tokens = 8192 } = options;

    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || 'MiniMax-M3',
        messages,
        temperature,
        max_tokens,
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  }
}

// ==================== OpenAI客户端 ====================

class OpenAIClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_API_URL || 'https://api.openai.com';
  }

  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { model = 'gpt-4o', temperature = 0.7, max_tokens = 8192, response_format } = options;
    const effTemperature = temperature;
    const apiKey = options.apiKey || this.apiKey;
    const baseUrl = options.baseUrl || this.baseUrl;

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: effTemperature,
      max_tokens,
    };
    if (response_format) body.response_format = response_format;

    const controller = new AbortController();
    // [P0 修复 P-01] 有外部 signal 时由调用方掌管截止时间（Agent 级超时 60~180s 不等），
    // 内部 120s 仅作为无 signal 调用的兜底，避免过早 abort 长链路调用
    const timeoutId = options.signal ? null : setTimeout(() => controller.abort(), 120_000); // 120s兜底
    // [P0 修复] 上游超时/用户断开时，通过外部 signal 真正中断本次请求
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      // 兼容 OPENAI_API_URL 可能已带 /v1 后缀的情况（如 Ollama 端点 http://127.0.0.1:11434/v1），
      // 避免拼出 /v1/v1/chat/completions 导致 404。
      const normalizedUrl = baseUrl.replace(/\/v1\/?$/, '');
      const response = await fetch(`${normalizedUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawText = await response.text();

      if (!response.ok) {
        throw new Error(`OpenAI API error ${response.status}: ${rawText.slice(0, 200)}`);
      }

      // e-flowcode 可能返回 SSE 格式 (data: {...}) 或纯 JSON
      let content = '';
      let reasoning = '';
      let usage;
      if (rawText.startsWith('data: ')) {
        // SSE 格式: 逐行解析
        for (const line of rawText.split('\n')) {
          if (line.startsWith('data: ') && line.length > 6) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const c = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
              const r = chunk.choices?.[0]?.delta?.reasoning_content || chunk.choices?.[0]?.message?.reasoning_content || '';
              content += c;
              reasoning += r;
              if (chunk.usage) usage = chunk.usage;
            } catch { /* skip unparseable chunks */ }
          }
        }
      } else {
        try {
          const data = JSON.parse(rawText);
          content = data.choices?.[0]?.message?.content || '';
          reasoning = data.choices?.[0]?.message?.reasoning_content || '';
          usage = data.usage;
        } catch {
          content = rawText; // 最后兜底
        }
      }
      // [测试模式] kimi-k2.6 等推理模型常把答案塞进 reasoning_content 而 content 为空，
      // 仅读 content 会判定为空响应、触发重试白等。此处兜底：content 为空时优先从 reasoning_content 抽 JSON，
      // 抽不到再回落为原文（供下游 safeJsonParse 兜底或文本型 Agent 直接使用）。
      if (!content.trim()) {
        const j = extractJsonFromReasoning(reasoning);
        content = (j || reasoning).trim();
      }

      return { content, usage };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

// ==================== 统一LLM服务 ====================

// ==================== GLM客户端 (国产模型, OpenAI兼容) ====================

class GLMClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.GLM_API_KEY || '';
    this.baseUrl = process.env.GLM_API_URL || 'https://e-flowcode.cc';
  }

  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { model = 'glm-5', temperature = 0.7, max_tokens = 8192, signal } = options;

    const controller = new AbortController();
    // [P0 修复 P-01] 有外部 signal 时由调用方掌管截止时间（Agent 级超时 60~180s 不等），
    // 内部 120s 仅作为无 signal 调用的兜底，避免过早 abort 长链路调用
    const timeoutId = signal || options.signal ? null : setTimeout(() => controller.abort(), 120_000);
    // [P0 修复] 上游超时/用户断开时，通过外部 signal 真正中断本次请求
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`GLM API error ${response.status}: ${rawText.slice(0, 200)}`);
      }

      if (rawText.startsWith('data: ')) {
        let content = '';
        for (const line of rawText.split('\n')) {
          if (line.startsWith('data: ') && line.length > 6 && line.slice(6) !== '[DONE]') {
            try { content += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''; } catch {}
          }
        }
        return { content };
      }

      const data = JSON.parse(rawText);
      return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

// ==================== 统一LLM服务 ====================

export class UnifiedLLMService {
  private deepseekClient = new DeepSeekClient();
  private minimaxClient = new MiniMaxClient();
  private openaiClient = new OpenAIClient();
  private glmClient = new GLMClient();

  constructor(private readonly defaultPreset: LLMPreset = "generation") {}

  private resolveRoute(options: LLMOptions): { preset: LLMPreset; provider: LLMProvider; options: LLMOptions } {
    const preset = options.preset || this.defaultPreset;
    const cfg = getLLMConfig(preset);
    const intendedProvider = resolveLLMProvider(cfg.provider);
    const mockExecution = preset === "mock" || isOfflineMockExecution();
    // mock 模式下 provider/model 都会被强制为 offline-mock，override 一致性检查无意义，
    // 且会误伤：agent 的 this.model 是模块加载时按 .env 解析的，而 mock 下 getLLMConfig
    // 会忽略 env override 落到默认模型（两者天然不同）。真实调用仍严格检查。
    if (!mockExecution) {
      if (options.provider && options.provider !== intendedProvider) {
        throw new LLMProviderError(`Provider override conflicts with preset=${preset}`);
      }
      if (options.model && options.model !== cfg.model) {
        throw new LLMProviderError(`Model override conflicts with preset=${preset}`);
      }
    }
    const provider: LLMProvider = mockExecution ? "mock" : intendedProvider;
    return {
      preset,
      provider,
      options: { ...options, provider, model: mockExecution ? "offline-mock" : cfg.model,
        baseUrl: mockExecution ? "" : cfg.baseUrl, apiKey: mockExecution ? "" : cfg.apiKey,
        temperature: options.temperature ?? cfg.temperature },
    };
  }

  /**
   * 统一chat接口
   */
  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const route = this.resolveRoute(options);
    const provider = route.provider;
    options = route.options;
    assertLLMCallAllowed(provider);

    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const model = options.model || (provider === 'mock' ? 'offline-mock' : '(provider-default)');
    const configSnapshot = safeLLMConfigSnapshot(provider, model, options);
    try {
      let result: LLMResponse;
      switch (provider) {
        case 'deepseek': result = await this.deepseekClient.chat(messages, options); break;
        case 'minimax': result = await this.minimaxClient.chat(messages, options); break;
        case 'openai': result = await this.openaiClient.chat(messages, options); break;
        case 'glm': result = await this.glmClient.chat(messages, options); break;
        case 'mock': result = { content: mockFixtureFor(options), usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }; break;
      }
      const cost = result.usage ? estimateCostCny(provider, result.usage.prompt_tokens, result.usage.completion_tokens) : null;
      emitExperimentCall({
        label: options.telemetry_label || 'unlabeled', provider, model,
        messages_sha256: hashMessages(messages), temperature: options.temperature ?? null,
        max_tokens: options.max_tokens ?? null, started_at: startedAt,
        ended_at: new Date().toISOString(), latency_ms: Date.now() - started,
        usage: result.usage ? { ...result.usage, estimated: false } : null,
        cost_cny: cost, config_sha256: String(configSnapshot.config_sha256), status: 'success', error: null,
      });
      return result;
    } catch (error) {
      const err = error as Error;
      emitExperimentCall({
        label: options.telemetry_label || 'unlabeled', provider, model,
        messages_sha256: hashMessages(messages), temperature: options.temperature ?? null,
        max_tokens: options.max_tokens ?? null, started_at: startedAt,
        ended_at: new Date().toISOString(), latency_ms: Date.now() - started,
        usage: null, cost_cny: null, config_sha256: String(configSnapshot.config_sha256), status: 'failed',
        error: { name: err.name || 'Error', message: err.message || String(error) },
      });
      throw error;
    }
  }

  /**
   * 流式chat接口
   */
  async *chatStream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<string> {
    const route = this.resolveRoute(options);
    const provider = route.provider;
    options = route.options;
    if (process.env.LLM_MOCK_MODE === 'true' && provider !== 'mock') throw new LLMProviderError("Mock mode forbids network streaming");
    assertLLMCallAllowed(provider);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const model = options.model || (provider === 'mock' ? 'offline-mock' : '(provider-default)');
    const config = safeLLMConfigSnapshot(provider, model, options);
    let output = '';
    try {
      const stream = provider === 'deepseek' ? this.deepseekClient.chatStream(messages, options)
        : provider === 'minimax' ? this.minimaxClient.chatStream(messages, options)
        : provider === 'mock' ? (async function* () { yield mockFixtureFor(options); })()
        : null;
      if (!stream) throw new LLMProviderError(`Streaming is not implemented for provider=${provider}`);
      for await (const chunk of stream) { output += chunk; yield chunk; }
      emitExperimentCall({ label: options.telemetry_label || 'unlabeled-stream', provider, model,
        messages_sha256: hashMessages(messages), output_sha256: hashMessages([{ role: 'assistant', content: output }]),
        config_sha256: String(config.config_sha256), temperature: options.temperature ?? null, max_tokens: options.max_tokens ?? null,
        started_at: startedAt, ended_at: new Date().toISOString(), latency_ms: Date.now() - started,
        usage: provider === 'mock' ? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated: false } : null,
        cost_cny: provider === 'mock' ? 0 : null, status: 'success', error: null });
    } catch (error) {
      const err = error as Error;
      emitExperimentCall({ label: options.telemetry_label || 'unlabeled-stream', provider, model,
        messages_sha256: hashMessages(messages), output_sha256: output ? hashMessages([{ role: 'assistant', content: output }]) : null,
        config_sha256: String(config.config_sha256), temperature: options.temperature ?? null, max_tokens: options.max_tokens ?? null,
        started_at: startedAt, ended_at: new Date().toISOString(), latency_ms: Date.now() - started,
        usage: null, cost_cny: null, status: 'failed', error: { name: err.name, message: err.message } });
      throw error;
    }
  }

  /**
   * 生成多语言阐释
   */
  async generateCulturalExplanation(
    knowledgePoint: { name: string; hskLevel: string; content: string },
    language: { code: string; name: string; nativeName: string }
  ): Promise<{
    precise_definition: string;
    scene_introduction: string;
    pragmatic_rules: string[];
    examples: string[];
    difficulty_notes: string;
    taboo_warnings: string[];
  }> {
    const systemPrompt = `You are a professional Chinese language and culture educator specializing in teaching Chinese to ${language.nativeName} speakers.`;

    const userPrompt = `Generate a cultural explanation for Chinese topic "${knowledgePoint.name}" (HSK ${knowledgePoint.hskLevel}):

Return JSON:
{
  "precise_definition": "...",
  "scene_introduction": "...",
  "pragmatic_rules": ["...", "...", "..."],
  "examples": ["...", "...", "..."],
  "difficulty_notes": "...",
  "taboo_warnings": ["...", "...", "..."]
}`;

    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { preset: "generation", temperature: 0.7 }
    );

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error('Failed to parse JSON response');
    }

    return {
      precise_definition: '',
      scene_introduction: '',
      pragmatic_rules: [],
      examples: [],
      difficulty_notes: '',
      taboo_warnings: [],
    };
  }
}

export const llmService = new UnifiedLLMService("generation");
export { DeepSeekClient, MiniMaxClient };
