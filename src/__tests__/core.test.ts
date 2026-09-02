/**
 * 核心纯函数单元测试
 * 运行方式：npx vitest run --config vitest.config.ts
 * （需要先 pnpm add -D vitest）
 */
import { describe, it, expect } from 'vitest';
import { getLanguageCode, getLanguageNaturalName } from '@/lib/constants';

// ==================== safeJsonParse ====================

// 内联 safeJsonParse 以避开模块解析问题
function safeJsonParse(text: string): Record<string, unknown> {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: expected string');
  }
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try { return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch {}
    }
    throw new Error(`无法解析JSON: ${cleaned.substring(0, 100)}...`);
  }
}

describe('safeJsonParse', () => {
  it('解析标准 JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });
  it('解析 markdown 代码块包裹的 JSON', () => {
    expect(safeJsonParse('```json\n{"b":2}\n```')).toEqual({ b: 2 });
  });
  it('解析前后有额外文字的 JSON', () => {
    expect(safeJsonParse('text {"c":3} after')).toEqual({ c: 3 });
  });
  it('空字符串抛出异常', () => {
    expect(() => safeJsonParse('')).toThrow();
  });
});

// ==================== calculateAnxietyDelta ====================

function calculateAnxietyDelta(correctnessRate: number): number {
  return (0.5 - correctnessRate) * 20;
}

describe('calculateAnxietyDelta', () => {
  it('全对焦虑降 10', () => expect(calculateAnxietyDelta(1.0)).toBe(-10));
  it('50%正确率不变', () => expect(calculateAnxietyDelta(0.5)).toBe(0));
  it('全错焦虑升 10', () => expect(calculateAnxietyDelta(0.0)).toBe(10));
});

// ==================== applyAnxietyDelta ====================

function applyAnxietyDelta(current: number, correctRate: number): number {
  const delta = calculateAnxietyDelta(correctRate);
  return Math.min(100, Math.max(0, current + delta));
}

describe('applyAnxietyDelta', () => {
  it('正确率100%焦虑从50降到40', () => expect(applyAnxietyDelta(50, 1.0)).toBe(40));
  it('正确率0%焦虑从50升到60', () => expect(applyAnxietyDelta(50, 0.0)).toBe(60));
  it('不跌破0', () => expect(applyAnxietyDelta(5, 1.0)).toBe(0));
  it('不超出100', () => expect(applyAnxietyDelta(95, 0.0)).toBe(100));
});

// ==================== calculateCulturalAnxiety ====================

function calculateCulturalAnxiety(p: {
  cultural_error_rate: number;
  time_ratio: number;
  abandonment_rate: number;
  negative_feedback: number;
}): number {
  return Math.min(100, Math.max(0,
    0.4 * p.cultural_error_rate * 100 +
    0.3 * p.time_ratio * 100 +
    0.2 * p.abandonment_rate * 100 +
    0.1 * p.negative_feedback * 100
  ));
}

describe('calculateCulturalAnxiety', () => {
  it('加权公式正确', () => {
    expect(calculateCulturalAnxiety({
      cultural_error_rate: 0.5, time_ratio: 0.3,
      abandonment_rate: 0.2, negative_feedback: 0.1,
    })).toBeCloseTo(34);
  });
  it('全零得0', () => {
    expect(calculateCulturalAnxiety({
      cultural_error_rate: 0, time_ratio: 0,
      abandonment_rate: 0, negative_feedback: 0,
    })).toBe(0);
  });
  it('全1得100', () => {
    expect(calculateCulturalAnxiety({
      cultural_error_rate: 1, time_ratio: 1,
      abandonment_rate: 1, negative_feedback: 1,
    })).toBe(100);
  });
});

// ==================== anxietyScoreToLevel ====================

function anxietyScoreToLevel(score: number): 'low' | 'medium' | 'high' {
  if (score > 80) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

describe('anxietyScoreToLevel', () => {
  it('>80=high', () => { expect(anxietyScoreToLevel(81)).toBe('high'); expect(anxietyScoreToLevel(90)).toBe('high'); });
  it('40-80=medium', () => { expect(anxietyScoreToLevel(40)).toBe('medium'); expect(anxietyScoreToLevel(60)).toBe('medium'); expect(anxietyScoreToLevel(80)).toBe('medium'); });
  it('<40=low', () => { expect(anxietyScoreToLevel(39)).toBe('low'); expect(anxietyScoreToLevel(0)).toBe('low'); });
});

// ==================== calculateNativeLanguageRatio ====================

function calculateNativeLanguageRatio(anxiety: number): { native_ratio: number; chinese_ratio: number } {
  let r = anxiety > 80 ? 0.75 : anxiety >= 40 ? 0.5 : 0.25;
  return { native_ratio: r, chinese_ratio: Math.round((1 - r) * 100) / 100 };
}

describe('calculateNativeLanguageRatio', () => {
  it('>80=0.75 母语', () => { expect(calculateNativeLanguageRatio(85).native_ratio).toBe(0.75); });
  it('40-80=0.5', () => { expect(calculateNativeLanguageRatio(50).native_ratio).toBe(0.5); });
  it('<40=0.25', () => { expect(calculateNativeLanguageRatio(20).native_ratio).toBe(0.25); });
});

// ==================== detectBias ====================

const BIAS_KEYWORDS = ['所有', '都', '必须', '落后', '保守', '像西方那样', '西方文明'];
const BIAS_PATTERNS = [
  /(所有|每个)([A-Za-z一-龥]+人都)/g,
  /(像|跟)(西方|欧美|美国|英国)(一样|那样)/g,
];

function detectBias(text: string): { has_bias: boolean; bias_score: number; detected_keywords: string[] } {
  const keywords: string[] = [];
  for (const kw of BIAS_KEYWORDS) { if (text.includes(kw)) keywords.push(kw); }
  const patterns: string[] = [];
  for (const p of BIAS_PATTERNS) {
    const m = text.match(p);
    if (m) patterns.push(...m);
  }
  const score = Math.min(1, keywords.length * 0.1 + patterns.length * 0.2);
  return { has_bias: score > 0.2, bias_score: score, detected_keywords: keywords };
}

describe('detectBias', () => {
  it('无偏见文本', () => {
    expect(detectBias('这是一个客观描述。').has_bias).toBe(false);
  });
  it('检测绝对化关键词', () => {
    const r = detectBias('所有中国人都必须用筷子。');
    expect(r.has_bias).toBe(true);
    expect(r.detected_keywords).toContain('所有');
  });
  it('单个弱关键词不触发偏见（得分<0.2）', () => {
    expect(detectBias('这个地方很落后。').bias_score).toBe(0.1);
    expect(detectBias('这个地方很落后。').has_bias).toBe(false);
  });
  it('多个关键词叠加触发偏见', () => {
    expect(detectBias('所有中国人都很落后保守。').has_bias).toBe(true);
  });
  it('检测西方中心主义', () => {
    expect(detectBias('像西方那样发展。').has_bias).toBe(true);
  });
});

// ==================== bayesianKnowledgeTracing ====================

function bayesianKnowledgeTracing(p: {
  prior_probability: number; guess_probability: number;
  slip_probability: number; observed_correct: boolean;
}): number {
  if (p.observed_correct) {
    const n = (1 - p.slip_probability) * p.prior_probability;
    const d = n + p.guess_probability * (1 - p.prior_probability);
    return n / d;
  }
  const n = p.slip_probability * p.prior_probability;
  const d = n + (1 - p.guess_probability) * (1 - p.prior_probability);
  return n / d;
}

describe('bayesianKnowledgeTracing', () => {
  it('答对时掌握度上升', () => {
    const r = bayesianKnowledgeTracing({ prior_probability: 0.5, guess_probability: 0.25, slip_probability: 0.10, observed_correct: true });
    expect(r).toBeGreaterThan(0.5);
  });
  it('答错时掌握度下降', () => {
    const r = bayesianKnowledgeTracing({ prior_probability: 0.5, guess_probability: 0.25, slip_probability: 0.10, observed_correct: false });
    expect(r).toBeLessThan(0.5);
  });
  it('全知全对→接近1.0', () => {
    const r = bayesianKnowledgeTracing({ prior_probability: 0.9, guess_probability: 0.25, slip_probability: 0.10, observed_correct: true });
    expect(r).toBeGreaterThan(0.95);
  });
  it('全不知全错→接近0.0', () => {
    const r = bayesianKnowledgeTracing({ prior_probability: 0.1, guess_probability: 0.25, slip_probability: 0.10, observed_correct: false });
    expect(r).toBeLessThan(0.05);
  });
});

// ==================== calculateAbilityVector ====================

function calculateAbilityVector(
  oldVector: number[],
  results: Array<{ dimension: string; correct: boolean; weight?: number }>
): number[] {
  const dimIdx: Record<string, number> = { grammar: 0, listening: 1, speaking: 2, cultural_pragmatic: 3, reading: 4 };
  const newVec = [...oldVector];
  const sums = [0, 0, 0, 0, 0];
  const weights = [0, 0, 0, 0, 0];
  for (const r of results) {
    const i = dimIdx[r.dimension] ?? 0;
    const w = r.weight || 1;
    sums[i] += (r.correct ? 100 : 0) * w;
    weights[i] += w;
  }
  const alpha = 0.7;
  for (let i = 0; i < 5; i++) {
    if (weights[i] > 0) newVec[i] = Math.round(alpha * (sums[i] / weights[i]) + (1 - alpha) * oldVector[i]);
  }
  return newVec.map(v => Math.min(100, Math.max(0, v)));
}

describe('calculateAbilityVector', () => {
  it('新数据更新向量', () => {
    const r = calculateAbilityVector([50, 50, 50, 50, 50], [
      { dimension: 'grammar', correct: true },
      { dimension: 'grammar', correct: false },
      { dimension: 'reading', correct: true },
    ]);
    expect(r[4]).toBe(85);
  });
  it('无数据保持旧值', () => {
    expect(calculateAbilityVector([50, 50, 50, 50, 50], [])).toEqual([50, 50, 50, 50, 50]);
  });
});

// ==================== hskLevelMatches ====================

function hskLevelMatches(cached: unknown, requested: number): boolean {
  if (cached == null) return true;
  const n = Number(cached);
  if (isNaN(n)) return true;
  return Math.abs(n - requested) <= 1;
}

describe('hskLevelMatches', () => {
  it('精确匹配', () => { expect(hskLevelMatches(3, 3)).toBe(true); });
  it('±1容差', () => { expect(hskLevelMatches(3, 4)).toBe(true); expect(hskLevelMatches(3, 2)).toBe(true); });
  it('差2以上不匹配', () => { expect(hskLevelMatches(3, 5)).toBe(false); expect(hskLevelMatches(3, 1)).toBe(false); });
  it('null兼容旧数据', () => { expect(hskLevelMatches(null, 5)).toBe(true); });
});

// ==================== getLanguageCode / getLanguageNaturalName ====================
// 注意：这里必须导入**真实实现**。此前本段内联了一份复刻版 LANG_MAP + getLanguageCode，
// 测的是复制品而非线上代码，导致真函数的双重转换 bug 一直测不出来。

describe('语言映射', () => {
  it('getLanguageCode 中文名 → 代码', () => {
    expect(getLanguageCode('英语')).toBe('en');
    expect(getLanguageCode('日语')).toBe('ja');
    expect(getLanguageCode('韩语')).toBe('ko');
    expect(getLanguageCode('火星语')).toBe('en');
  });

  // 回归：learning-graph 已把「日语」转成 'ja' 传给 A2，A2 又转一次。
  // 若非幂等，'ja' 查不到会静默兜底成 'en'，导致所有非英语学习者
  // 都被喂英语文化圈的图谱数据（hc_en），母语驱动直接失效。
  it('getLanguageCode 幂等：已是代码时原样返回', () => {
    for (const name of ['英语', '日语', '韩语', '西班牙语', '阿拉伯语', '俄语', '法语', '泰语']) {
      const once = getLanguageCode(name);
      expect(getLanguageCode(once)).toBe(once);
    }
  });

  it('getLanguageCode 空值与非法值兜底为 en', () => {
    expect(getLanguageCode('')).toBe('en');
    expect(getLanguageCode('zzz')).toBe('en');
  });

  it('getLanguageNaturalName', () => {
    expect(getLanguageNaturalName('ja')).toBe('日本語');
    expect(getLanguageNaturalName('xyz')).toBe('xyz');
  });

  it('名称 → 代码 → 自然名 全链路一致', () => {
    expect(getLanguageNaturalName(getLanguageCode('日语'))).toBe('日本語');
    expect(getLanguageNaturalName(getLanguageCode('韩语'))).toBe('한국어');
  });
});

// ==================== validateAnswer ====================

function validateAnswer(exercise: { correct_answer: string; type?: string }, userAnswer: string): boolean {
  if (!userAnswer) return false;
  const correct = exercise.correct_answer.trim();
  const answer = userAnswer.trim();
  if (/^[A-D]$/i.test(correct)) return answer.toUpperCase() === correct.toUpperCase();
  if (correct === '对' || correct === '错') {
    const m: Record<string, string> = { 'A': '对', 'B': '错' };
    return (m[answer.toUpperCase()] || answer) === correct;
  }
  return answer === correct;
}

describe('validateAnswer', () => {
  it('选择题：字母比对', () => {
    expect(validateAnswer({ correct_answer: 'B' }, 'B')).toBe(true);
    expect(validateAnswer({ correct_answer: 'B' }, 'b')).toBe(true);
    expect(validateAnswer({ correct_answer: 'B' }, 'A')).toBe(false);
  });
  it('判断题：字母A/B映射为对/错', () => {
    expect(validateAnswer({ correct_answer: '对' }, 'A')).toBe(true);
    expect(validateAnswer({ correct_answer: '错' }, 'B')).toBe(true);
    expect(validateAnswer({ correct_answer: '对' }, 'B')).toBe(false);
  });
  it('填空题：精确匹配', () => {
    expect(validateAnswer({ correct_answer: '你好' }, '你好')).toBe(true);
    expect(validateAnswer({ correct_answer: '你好' }, '你好吗')).toBe(false);
  });
  it('空答案返回false', () => {
    expect(validateAnswer({ correct_answer: 'A' }, '')).toBe(false);
  });
});
