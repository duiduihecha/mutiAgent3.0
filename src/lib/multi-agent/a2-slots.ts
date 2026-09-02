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


import type { SlotDef, SlotTemplate, SlotResult } from './types';
import { AgentError } from './errors';
// 槽位校验在 algorithms 中，本文件只负责生成

export function getSlotStructure(anxiety_score: number): SlotTemplate {
  if (anxiety_score > 80) {
    return {
      anxiety_level: 'high',
      slots: [
        { index: 1, lang: 'native', label: '文化概念定义', description: '用母语解释这个中国文化概念的基本定义（2-4句）' },
        { index: 2, lang: 'native', label: '文化场景介绍', description: '用母语描述具体使用场景，附简短中文对话示例' },
        { index: 3, lang: 'native', label: '语用规则说明', description: '用母语列出3条该场景的语用规则' },
        { index: 4, lang: 'native', label: '禁忌与难点', description: '用母语列出禁忌提醒和学习难点预判' },
        { index: 5, lang: 'native', label: '关键中文表达', description: '列出3-5个关键中文表达词，用母语解释每个的用法' },
        { index: 6, lang: 'chinese', label: '中文对话练习', description: '一段简短的中文场景对话，附拼音' },
      ],
      native_count: 5, chinese_count: 1, target_ratio: 0.75,
    };
  } else if (anxiety_score >= 40) {
    return {
      anxiety_level: 'medium',
      slots: [
        { index: 1, lang: 'native', label: '文化概念定义', description: '用母语解释这个中国文化概念的基本定义（2-4句）' },
        { index: 2, lang: 'native', label: '文化场景与语用规则', description: '用母语描述使用场景+列出3条语用规则' },
        { index: 3, lang: 'native', label: '关键中文表达', description: '列出3-5个关键中文表达，用母语解释每个的用法' },
        { index: 4, lang: 'chinese', label: '中文场景对话', description: '一段简短的场景中文对话（附拼音）' },
        { index: 5, lang: 'chinese', label: '中文词汇表', description: '列出本课重点中文词汇（附拼音和母语简短注释）' },
        { index: 6, lang: 'chinese', label: '文化对比中文小结', description: '用简单中文写一段跨文化对比的小结' },
      ],
      native_count: 3, chinese_count: 3, target_ratio: 0.50,
    };
  } else {
    return {
      anxiety_level: 'low',
      slots: [
        { index: 1, lang: 'native', label: '文化概念速览', description: '用母语简短解释（2-3句）' },
        { index: 2, lang: 'chinese', label: '中文场景对话', description: '场景中文对话（附拼音和母语注释）' },
        { index: 3, lang: 'chinese', label: '中文词汇表', description: '重点中文词汇（附拼音和母语注释）' },
        { index: 4, lang: 'chinese', label: '中文语用练习', description: '用中文写3条该场景的语用规则' },
        { index: 5, lang: 'chinese', label: '中文阅读理解', description: '一段中文文化背景阅读（附拼音）' },
        { index: 6, lang: 'chinese', label: '跨文化对比练习', description: '用中文写一道逆向表达题' },
      ],
      native_count: 1, chinese_count: 5, target_ratio: 0.25,
    };
  }
}

/**
 * 过渡锚句模板 — 在母语→中文切换边界插入
 */
function getTransitionAnchor(anxietyLevel: 'high' | 'medium' | 'low', targetLangName: string): string {
  const anchors: Record<string, string> = {
    high: `\n\n---\n*现在，让我们用刚才学到的背景知识，来读一段真实的中文对话。别担心——你已经掌握了所有需要理解的文化背景。试着读一读：*\n`,
    medium: `\n\n---\n*让我们把学到的知识用起来——读一段真实的中文对话，看看能理解多少。*\n`,
    low: `\n\n---\n*进入中文练习环节。*\n`,
  };
  return anchors[anxietyLevel] || anchors.medium;
}

/**
 * 分段生成6个槽位（串行，每个槽带前一个的尾句作为上下文窗口）
 */
/** A2 结构化字段名——槽位输出里出现这些键说明 LLM 回吐了整块 JSON */
const A2_SCHEMA_KEYS = [
  'precise_definition', 'scene_introduction', 'pragmatic_rules',
  'taboo_warnings', 'difficulty_notes', 'key_terms',
];

/**
 * 清洗单个槽位的 LLM 输出。
 *
 * 槽位模式要求 LLM 只输出一段纯文本，但它偶尔会无视指令、回吐整块 JSON
 * （如 {"precise_definition": "...", "scene_introduction": ...}）。
 * 不清洗的话这段 JSON 字符串会被原样塞进 cultural_explanation.precise_definition，
 * 最终在前端渲染出原始键名——这正是 A2 阐释显示 JSON 的根因。
 */
function cleanSlotContent(raw: string, slotIndex: number): string {
  if (!raw) return '';
  let s = raw.trim();

  // 1) 剥离 ```json ... ``` 代码块围栏
  const fence = s.match(/^```(?:json|markdown|text)?\s*([\s\S]*?)```$/);
  if (fence) s = fence[1].trim();

  // 2) 整体是 JSON 对象/数组 → 递归抽取字符串叶子，按顺序拼回段落
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      const parsed = JSON.parse(s);
      const leaves: string[] = [];
      const walk = (n: unknown, depth = 0): void => {
        if (depth > 4) return;
        if (typeof n === 'string') {
          const t = n.trim();
          if (t) leaves.push(t);
        } else if (Array.isArray(n)) {
          n.forEach((x) => walk(x, depth + 1));
        } else if (n && typeof n === 'object') {
          Object.values(n as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
        }
      };
      walk(parsed);
      if (leaves.length) {
        console.warn(`[θ₃] Slot ${slotIndex} 输出为 JSON，已抽取 ${leaves.length} 段纯文本`);
        return leaves.join(' ').trim();
      }
    } catch {
      // JSON 不完整（比如被截断），落到下面的键名剥离兜底
    }
  }

  // 3) 兜底：仅当确实出现 A2 结构化键名时，才剥掉 "key": 前缀和残留花括号
  if (A2_SCHEMA_KEYS.some((k) => s.includes(`"${k}"`))) {
    console.warn(`[θ₃] Slot ${slotIndex} 输出含结构化键名，执行降级清洗`);
    s = s
      .replace(/^\s*[{[]\s*/, '')
      .replace(/\s*[}\]]\s*$/, '')
      .replace(/"(?:[a-z_]+)"\s*:\s*/gi, '')
      .replace(/",\s*"/g, ' ')
      .replace(/^"|"$/g, '')
      .trim();
  }

  return s.trim();
}

/** 单槽位软预算（字符）。超出后按句边界回退，绝不从句中硬切。 */
const SLOT_CHAR_BUDGET = 400;
/** 超过此长度才真正动刀，给 LLM 留一点自然溢出空间 */
const SLOT_CHAR_HARD_CAP = 600;

/**
 * 按句边界收敛过长槽位。
 *
 * 实测 LLM 基本无视 prompt 里的「400 字以内」（实际产出 217/399/680/710/931/1061），
 * 单次 A2 输出近 4000 字，既拖慢冷启动也稀释重点。
 * 这里做保底裁剪：只在句号/问号/感叹号/换行处断开，宁可略超预算也不切碎句子
 * —— 之前 A4 填空题被 solver 判废，正是"从中间截断"造成的，不能重蹈覆辙。
 */
function trimSlotToBudget(text: string, slotIndex: number): string {
  if (text.length <= SLOT_CHAR_HARD_CAP) return text;

  // 按句切分并保留结尾标点
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?\n*/g);
  if (!sentences || sentences.length <= 1) return text; // 切不开就别动，避免切碎

  let out = '';
  for (const s of sentences) {
    if (out.length && out.length + s.length > SLOT_CHAR_BUDGET) break;
    out += s;
  }
  // 一句就超预算 → 至少保住第一句完整
  if (!out.trim()) out = sentences[0];

  const trimmed = out.trim();
  console.log(`[θ₃] Slot ${slotIndex} 超长收敛: ${text.length} → ${trimmed.length} chars（按句边界）`);
  return trimmed;
}

/**
 * 批量槽位分隔符解析：从一次批量输出中提取每个 <SLOT_N> 的内容。
 * 只认严格的分隔符；没解析到或内容为空的槽位由调用方补生成。
 */
function parseSlotBatch(raw: string, batchSlots: SlotDef[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const slot of batchSlots) {
    const re = new RegExp(`<SLOT_${slot.index}>\\s*([\\s\\S]*?)\\s*</SLOT_${slot.index}>`, 'i');
    const m = raw.match(re);
    if (m) {
      const cleaned = cleanSlotContent(m[1], slot.index);
      if (cleaned.trim()) map.set(slot.index, cleaned);
    }
  }
  return map;
}

/** 单槽生成（供批量缺槽补生成 / 批量失败逐槽退化时使用）。失败返回 null（由调用方决定重试或抛错）。 */
export async function generateSingleSlot(
  slot: SlotDef,
  baseSystemPrompt: string,
  knowledgePointId: string,
  targetLangName: string,
  hskLevel: number,
  kpSemanticBlock: string,
  graphContextBlock: string,
  generateResponse: (systemPrompt: string, userMessage: string, timeout?: number) => Promise<string>,
): Promise<string | null> {
  const langName = slot.lang === 'native' ? targetLangName : '中文';
  const prompt = `${baseSystemPrompt}

## 当前任务：只输出第 ${slot.index} 个槽位

  <current_slot>
  <task>用${langName}写: ${slot.description}</task>
  <knowledge_point>${knowledgePointId}</knowledge_point>
  <hsk_level>${hskLevel}</hsk_level>
  ${kpSemanticBlock || ''}
  ${graphContextBlock ? `<graph_context>${graphContextBlock}</graph_context>` : ''}
</current_slot>

    <important>
      - 只输出这一段内容，不要输出其他槽位
      - 【长度硬上限】本段不超过 ${SLOT_CHAR_BUDGET} 字（含标点），约 3-5 句话
      - 【格式硬约束】只输出这一段自然语言正文。禁止输出 JSON、禁止 Markdown 代码块、
        禁止任何形如 "precise_definition": 的字段名，禁止用花括号包裹整段内容。
    </important>`;
  try {
    const content = await generateResponse(prompt, '请生成当前槽位内容。', 240000);
    return trimSlotToBudget(cleanSlotContent(content, slot.index), slot.index);
  } catch (e) {
    console.warn(`[θ₃] 单槽生成失败 Slot ${slot.index}:`, (e as Error).message);
    return null;
  }
}

/**
 * 批量生成一批同语言槽位（一次 LLM 调用，槽位间用 <SLOT_N> 分隔符）。
 * - 批量输出解析：strict <SLOT_N> 分隔符，漏/空槽逐个单槽补生成（带 1 次重试）
 * - 批量整体失败：逐槽退化为单槽生成，任一槽最终失败才整体抛错（保持 P0 语义，禁止占位文本）
 */
export async function generateSlotBatch(
  batchSlots: SlotDef[],
  batchLang: 'native' | 'chinese',
  template: SlotTemplate,
  baseSystemPrompt: string,
  knowledgePointId: string,
  targetLangName: string,
  hskLevel: number,
  graphContextBlock: string,
  kpSemanticBlock: string,
  generateResponse: (systemPrompt: string, userMessage: string, timeout?: number) => Promise<string>,
): Promise<Map<number, string>> {
  const langName = batchLang === 'native' ? targetLangName : '中文';
  const slotTasks = batchSlots
    .map((s) => `<SLOT_${s.index}> 用${langName}写: ${s.description}`)
    .join('\n');

  const batchPrompt = `${baseSystemPrompt}

## 当前任务：一次生成本批 ${batchSlots.length} 个槽位（${batchLang === 'native' ? '母语' : '中文'}部分，共 ${template.slots.length} 个槽位中的 ${batchSlots.map(s => s.index).join('、')} 号）

${graphContextBlock ? `<graph_context>${graphContextBlock}</graph_context>` : ''}
${kpSemanticBlock || ''}
<knowledge_point>${knowledgePointId}</knowledge_point>
<hsk_level>${hskLevel}</hsk_level>

请按顺序输出下面每个槽位的内容，每个槽位内容用 <SLOT_N>...</SLOT_N> 标签包裹（N 是该槽位编号）：

${slotTasks}

<important>
- 必须使用 <SLOT_N>...</SLOT_N> 标签包裹每个槽位，例如 <SLOT_1>...</SLOT_1>；标签必须成对出现，一个槽位一段
- 每个槽位内容不超过 ${SLOT_CHAR_BUDGET} 字（含标点），约 3-5 句话；只讲本槽该讲的核心信息
- 槽与槽之间内容保持连贯，整体构成一个完整的${batchLang === 'native' ? '母语' : '中文'}阐释段落集合
- 【格式硬约束】只输出被 <SLOT_N> 标签包裹的正文。禁止输出 JSON、禁止 Markdown 代码块、
  禁止任何形如 "precise_definition": 的字段名，禁止标签外的任何说明文字。
</important>`;

  const batchResult = new Map<number, string>();
  try {
    const raw = await generateResponse(batchPrompt, `请一次生成 ${batchSlots.map(s => s.index).join('、')} 号槽位内容。`, 300000);
    const parsed = parseSlotBatch(raw, batchSlots);
    for (const [idx, content] of parsed) {
      batchResult.set(idx, content);
      console.log(`[θ₃] Slot ${idx}/${template.slots.length} (${batchLang}) 批量完成, ${content.length} chars`);
    }
    // 漏/空槽 → 单槽补生成（带 1 次重试）
    for (const slot of batchSlots) {
      if (!batchResult.has(slot.index)) {
        console.warn(`[θ₃] 批量缺失 Slot ${slot.index}，单槽补生成`);
        let single = await generateSingleSlot(slot, baseSystemPrompt, knowledgePointId, targetLangName, hskLevel, kpSemanticBlock, '', generateResponse);
        if (!single) {
          await new Promise((r) => setTimeout(r, 1500));
          single = await generateSingleSlot(slot, baseSystemPrompt, knowledgePointId, targetLangName, hskLevel, kpSemanticBlock, '', generateResponse);
        }
        if (single) {
          batchResult.set(slot.index, single);
          console.log(`[θ₃] Slot ${slot.index}/${template.slots.length} (${batchLang}) 补生成成功, ${single.length} chars`);
        } else {
          throw new AgentError(
            `Slot ${slot.index} 生成失败（批量缺失且补生成失败）`,
            'A2_MotherTongueExplainer',
            false
          );
        }
      }
    }
    return batchResult;
  } catch (e) {
    // 批量整体失败 → 逐槽退化为单槽生成
    console.warn(`[θ₃] 批量生成失败（${(e as Error).message}），逐槽退化生成`);
    const fallback = new Map<number, string>();
    for (const slot of batchSlots) {
      let single = await generateSingleSlot(slot, baseSystemPrompt, knowledgePointId, targetLangName, hskLevel, kpSemanticBlock, graphContextBlock, generateResponse);
      if (!single) {
        await new Promise((r) => setTimeout(r, 1500));
        single = await generateSingleSlot(slot, baseSystemPrompt, knowledgePointId, targetLangName, hskLevel, kpSemanticBlock, graphContextBlock, generateResponse);
      }
      if (single) {
        fallback.set(slot.index, single);
        console.log(`[θ₃] Slot ${slot.index}/${template.slots.length} (${batchLang}) 退化生成成功, ${single.length} chars`);
      } else {
        throw new AgentError(
          `Slot ${slot.index} 生成失败（批量失败且退化生成失败）`,
          'A2_MotherTongueExplainer',
          false
        );
      }
    }
    return fallback;
  }
}

/**
 * 分段生成槽位 —— 双批并行版。
 *
 * 旧实现：6 槽串行，每槽 20-35s，A2 合计 ~150-170s（整链路最大瓶颈）。
 * 新实现：母语槽与中文槽各合并为一次批量调用，两批 Promise.all 并行（最多 2 次 LLM 调用），
 * 槽位间用 <SLOT_N> 分隔符严格解析，漏/空槽单槽补生成，批量失败逐槽退化。
 * 代价：槽间显式 previous_context / next_preview 传递退化为「每槽自足 + 批内连贯提示 +
 * assembleSlots 过渡锚句」；母语比例、槽位模板、清洗/裁剪逻辑完全不变。
 */
export async function generateSlots(
  template: SlotTemplate,
  baseSystemPrompt: string,
  knowledgePointId: string,
  targetLangName: string,
  hskLevel: number,
  graphContextBlock: string,
  kpSemanticBlock: string,
  generateResponse: (systemPrompt: string, userMessage: string, timeout?: number) => Promise<string>,
): Promise<SlotResult[]> {
  const nativeSlots = template.slots.filter((s) => s.lang === 'native');
  const chineseSlots = template.slots.filter((s) => s.lang === 'chinese');

  // 两批并行：母语批带 graph 上下文（原首槽特权），中文批不带（防跑题靠 kpSemantic）
  const [nativeMap, chineseMap] = await Promise.all([
    generateSlotBatch(nativeSlots, 'native', template, baseSystemPrompt, knowledgePointId,
      targetLangName, hskLevel, graphContextBlock, kpSemanticBlock, generateResponse),
    generateSlotBatch(chineseSlots, 'chinese', template, baseSystemPrompt, knowledgePointId,
      targetLangName, hskLevel, '', kpSemanticBlock, generateResponse),
  ]);

  const merged = new Map<number, string>([...nativeMap, ...chineseMap]);
  const results: SlotResult[] = [];
  for (const slot of template.slots) {
    const content = merged.get(slot.index);
    if (content) results.push({ index: slot.index, lang: slot.lang, content });
  }
  // 防御：理论上不会走到这里（缺槽已抛错），但兜底确保顺序完整
  if (results.length !== template.slots.length) {
    throw new AgentError(
      `槽位不完整: 期望 ${template.slots.length} 个，实际 ${results.length} 个`,
      'A2_MotherTongueExplainer',
      false
    );
  }
  return results;
}

/**
 * 拼接6个槽位 + 在语言切换边界插入过渡锚句
 */
export function assembleSlots(slotResults: SlotResult[], template: SlotTemplate, targetLangName: string): string {
  const parts: string[] = [];

  for (let i = 0; i < slotResults.length; i++) {
    const current = slotResults[i];
    const prev = i > 0 ? slotResults[i - 1] : null;

    // Layer 2: 检测语言切换边界，插入过渡锚句
    if (prev && prev.lang !== current.lang) {
      // 母语→中文切换：插入过渡锚句
      parts.push(getTransitionAnchor(template.anxiety_level, targetLangName));
    }

    parts.push(current.content);
  }

  return parts.join('\n\n');
}

/**
 * 检查生成内容是否遵循了slot结构的母语比例
 * 返回实际比例和是否通过
 */
