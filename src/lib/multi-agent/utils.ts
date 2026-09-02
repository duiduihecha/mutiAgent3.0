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


// 子模块交叉 import（拆分后新增，原文件内这些是同文件内互用）
import type { AgentMessage } from './types';
import { AgentError, ValidationError } from './errors';

export function safeJsonParse(text: string): Record<string, unknown> {
  if (!text || typeof text !== 'string') {
    throw new ValidationError('Invalid input: expected string');
  }

  // 剥离 LLM 思维链标签（如 MiniMax 的 <think>...</think>）
  let cleaned = text.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
        // 尝试提取markdown代码块
    //   注意：Reasoner 思维链里常常会写"骨架举例段"（```json 包裹的全英文 placeholder JSON 模板），
    //         不能直接接受，必须满足"段内总汉字数≥10"才视为真实生成内容，否则继续往下走策略D/E。
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const candidate = codeBlockMatch[1].trim();
        const cjkInBlock = (candidate.match(/[\u4e00-\u9fff]/g) || []).length;
        if (cjkInBlock >= 10) {
          return JSON.parse(candidate);
        }
        // else: 汉字不够 → 视为思维链里的伪模板举例，不采用，继续后续容错策略
      } catch {
        // 继续尝试
      }
    }    // =====================================================================
    // 增强容错（DeepSeek-Reasoner / V4-Flash 长输出思维链泄漏 污染 JSON）
    // =====================================================================
    // 策略A：锚点优先 —— 找所有 '{' 且紧接着合法 JSON 起始字符（"、数字、嵌套 [{、true/false/null/-）
    //   避开思维链英文自言自语里举例说明的伪 '{"key": "<placeholder>"}' 片段？不行，那也有引号。
    //   所以真实的启发是：从后往前找 '{'（思维链举例都在"前面"，真正JSON在"后面"）
    const anchorCandidates: number[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] !== '{') continue;
      const after = cleaned.slice(i + 1, i + 20);
      if (/^\s*["\d[{ftn-]/.test(after)) anchorCandidates.push(i);
    }
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1) {
      // 从后往前遍历所有 '{' 位置（真实 JSON 在后半段，优先命中）
      const opens: number[] = [];
      for (let i = 0; i < cleaned.length; i++) if (cleaned[i] === '{') opens.push(i);
      for (let k = opens.length - 1; k >= 0; k--) {
        const open = opens[k];
        if (open >= lastBrace) continue;
        try { return JSON.parse(cleaned.slice(open, lastBrace + 1)); } catch {}
      }
      // 兜底：锚点序列从前往后扫一遍
      for (const open of anchorCandidates) {
        if (open >= lastBrace) continue;
        try { return JSON.parse(cleaned.slice(open, lastBrace + 1)); } catch {}
      }
      // 策略B：尾端裁剪（应对 } 之后残留零散字符导致 first brace 取错的情况）
      for (let shrink = 0; shrink <= 800 && shrink < lastBrace; shrink++) {
        const slice = cleaned.slice(0, lastBrace + 1 - shrink);
        const fb = slice.indexOf('{');
        if (fb < 0) continue;
        try { return JSON.parse(slice.slice(fb)); } catch {}
      }
    }
    // =====================================================================
    // 策略D：平衡括号栈 O(n) 扫所有成对{}段（对付 A4 Reasoner 思维链泄漏 + 伪JSON举例混排）
    // =====================================================================
    // Step D0：清理 JSON 不允许出现的裸控制字符（保留 \r, \n, \t 三种正常空白）
    //   移除范围：[\x00-\x08] + [\x0b-\x1f] + \x7f + BOM \ufeff
    const sanitized = cleaned
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
      .replace(/\ufeff/g, "");
    const segments: Array<{open:number, close:number, len:number}> = [];
    const stack: number[] = [];
    // 处理字符串内的花括号不算（不影响 JSON 的配对）—— 简单的 "引号内跳过" 状态机
    let inStr = false, prev = '', quote = '';
    let maxEscape = 0;
    for (let i = 0; i < sanitized.length && maxEscape++ < 400000; i++) {
      const ch = sanitized[i];
      if (inStr) {
        if (ch === '\\') { i++; continue; } // 跳过转义后的下一字符
        if (ch === quote) { inStr = false; quote = ''; }
        continue;
      }
      if ((ch === '"' || ch === "'") && prev !== '\\') {
        inStr = true; quote = ch; continue;
      }
      if (ch === '{') stack.push(i);
      else if (ch === '}' && stack.length > 0) {
        const open = stack.pop()!;
        segments.push({ open, close: i, len: i - open + 1 });
      }
      prev = ch;
    }
    // 启发式加权：按段内 CJK 汉字数（U+4E00..U+9FFF）降序 → 长度降序 → 结束位置降序
    //   思维链伪举例段全是英文占位符 <...>，汉字数≈0；真实教案JSON段汉字数≥500
    //   这是 100% 可区分的特征
    const CJK_RE = /[\u4e00-\u9fff]/g;
    for (const seg of segments) {
      const s = sanitized.slice(seg.open, seg.close + 1);
      (seg as any).cjkCount = (s.match(CJK_RE) || []).length;
    }
    segments.sort((a: any, b: any) => (b.cjkCount - a.cjkCount) || (b.len - a.len) || (b.close - a.close));
    for (const seg of segments.slice(0, 60)) {
      let candidate = sanitized.slice(seg.open, seg.close + 1);
      try { return JSON.parse(candidate); } catch {}
      // D1：宽松修复1 — 清理尾部残留逗号（数组/对象最后成员后多了 ,）
      try {
        const fixed1 = candidate.replace(/,\s*([\]}])/g, '$1');
        if (fixed1 !== candidate) try { return JSON.parse(fixed1); } catch {}
      } catch {}
      // D2：宽松修复2 — 字符串内的裸 \n（不在引号外的那种）做启发式转义
      //     仅对极端 case：candidate 里 "..." 字符串内部出现非转义 \r\n → \n
      try {
        let fixed2 = ''; let inS = false, q = '';
        for (let i = 0; i < candidate.length; i++) {
          const c = candidate[i];
          if (!inS && (c === '"' || c === "'")) { inS = true; q = c; fixed2 += c; continue; }
          if (inS && c === '\\') { fixed2 += c + (candidate[i+1] || ''); i++; continue; }
          if (inS && c === q) { inS = false; q = ''; fixed2 += c; continue; }
          if (inS && c === '\n') { fixed2 += '\\n'; continue; }
          if (inS && c === '\r') { continue; }
          fixed2 += c;
        }
        if (fixed2 !== candidate) try { return JSON.parse(fixed2); } catch {}
      } catch {}
      // D3：JSON5 风格宽松（单引号键 → 双引号 + 未加引号的键）
      try {
        let f3 = candidate;
        f3 = f3.replace(/(['"])?([a-zA-Z_$][\w$]*)\1\s*:/g, (m, q, k) => `"${k}":`); // 键名加双引号
        f3 = f3.replace(/'([^'\\]*?)'/g, (m, inner) => `"${inner.replace(/"/g, '\\"')}"`); // 值单引号 → 双引号
        if (f3 !== candidate) try { return JSON.parse(f3); } catch {}
      } catch {}
    }
    // 策略E：再次回退 — 剥离前缀后应用 平衡栈
    const firstOpen = sanitized.indexOf('{');
    if (firstOpen > 0 && firstOpen < 15000) {
      const stripped2 = sanitized.slice(firstOpen);
      // 复用上面的平衡栈逻辑（简化：扫 stripped2 所有段）
      const segs2: Array<{open:number, close:number, len:number}> = [];
      const sk2: number[] = [];
      let ins=false, q2='', pr=''; let guard=0;
      for (let i=0;i<stripped2.length && guard++ < 400000; i++){
        const ch=stripped2[i];
        if (ins){ if (ch==='\\'){ i++; continue; } if (ch===q2){ins=false;q2='';} continue; }
        if ((ch==='"'||ch==="'") && pr!=='\\'){ins=true; q2=ch; pr=ch; continue;}
        if (ch==='{') sk2.push(i);
        else if (ch==='}' && sk2.length>0) { const o=sk2.pop()!; segs2.push({open:o, close:i, len:i-o+1}); }
        pr=ch;
      }
      // 同策略D：CJK汉字数优先启发
      for (const seg of segs2) {
        const s = stripped2.slice(seg.open, seg.close + 1);
        (seg as any).cjkCount = (s.match(CJK_RE) || []).length;
      }
      segs2.sort((a: any, b: any) => (b.cjkCount - a.cjkCount) || (b.len - a.len) || (b.close - a.close));
      for (const seg of segs2.slice(0,50)){
        try{ return JSON.parse(stripped2.slice(seg.open, seg.close+1)); }catch{}
      }
    }

    // ===== SAFEJSONPARSE DEBUG DUMP（失败时落盘 /tmp/） =====
    const _ts = Date.now();
    try {
      const _fs = require('fs') as typeof import('fs');
      _fs.writeFileSync(`/tmp/safeJsonParse_fail_${_ts}_cleaned.txt`, cleaned, 'utf8');
      try { _fs.writeFileSync(`/tmp/safeJsonParse_fail_${_ts}_sanitized.txt`, typeof sanitized==='string'?sanitized:'N/A', 'utf8'); } catch {}
      console.error(`[safeJsonParse FAIL dump] ts=${_ts} cleanedLen=${cleaned.length} → /tmp/safeJsonParse_fail_${_ts}_*.txt`);
    } catch {}
    throw new ValidationError(`无法解析JSON: ${cleaned.substring(0, 100)}... [dump=${_ts}]`);
  }
}

/**
 * A4 输入瘦身：A2/A3 产物只取要点进 A4 prompt，避免 prompt 过大导致
 * e-flowcode 网关 524（Cloudflare 源站超时，~100-120s 窗口）。
 */
export function truncateForA4(obj: unknown, maxLen = 2000): string {
  const s = JSON.stringify(obj);
  if (!s) return "";
  return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…[已截断，仅保留要点]`;
}

/**
 * 带超时的Promise包装
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * 带重试的Promise包装
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      // [P0 修复] 被上游取消（超时/用户断开）的请求不要重试，否则会重复烧钱
      if (signal?.aborted || (error as Error)?.name === 'AbortError') {
        throw error;
      }
      // [P0 修复 P-01] 显式标记不可重试的错误（如 Agent 超时）直接抛出，不再消耗配额
      if (error instanceof AgentError && error.retryable === false) {
        throw error;
      }
      if (i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError!;
}

// ==================== 类型定义 ====================


/**
 * 统计字符串中的 CJK 字符数（近似 = 中文内容字符数）。
 * 覆盖 CJK 统一表意文字 + 扩展 A 区 + 常见中文标点/全角区间；此定义同时供 θ₃ 比例校验与
 * 方案三校准器共用，保证「焦虑→母语占比」KPI 在消融对比中口径一致、可比。
 */
export function countCjkChars(text: string): number {
  if (!text) return 0;
  // 区间：CJK Ext A + Unified Ideographs + CJK Symbols/Punctuation + Halfwidth/Fullwidth Forms
  // eslint-disable-next-line no-control-regex
  const re = /[\u3400-\u4DBF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g;
  const m = text.match(re);
  return m ? m.length : 0;
}

/**
 * 按句边界回退到预算：不切碎句子，宁可略超预算，至少保住完整第一句。
 * 与 truncateForA4 同源，但目标是「θ₃ KPI 的字段预算校准」，独立保留避免 A4 瘦身需求
 * 变化时污染 θ₃ 算法真相源。
 */
export function truncateToSentenceBudget(text: string, softBudget: number, hardCapRatio = 1.6): string {
  if (!text) return "";
  const hardCap = Math.round(softBudget * hardCapRatio);
  if (text.length <= hardCap) return text;
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?\n*/g);
  if (!sentences || sentences.length <= 1) {
    return text.slice(0, softBudget).trim();
  }
  let out = "";
  for (const sent of sentences) {
    if (out.length && out.length + sent.length > softBudget) break;
    out += sent;
  }
  const trimmed = out.trim();
  return trimmed || sentences[0].trim();
}
