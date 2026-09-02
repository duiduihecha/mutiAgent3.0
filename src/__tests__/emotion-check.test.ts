/**
 * emotion-check.ts 单元测试
 *
 * 覆盖所有 6 个信号、3 级分类、边界条件，包括已修复的 bug：
 *   E-01: disengagement 使用 maxConsecutiveCorrect（全数组扫描，非仅尾部）
 *   E-04: fatigue 边界改为 >= 20min
 *   E-06: accuracyDeclining 边界改为 <= 0.5
 *   E-07: hc_fr 法语话术覆盖所有 MessageSet
 */
import { describe, it, expect } from 'vitest';
import { detectEmotionState } from '@/lib/emotion-check';

// ==================== Green 状态 ====================

describe('detectEmotionState — green', () => {
  it('全部正常 → green, 无 intervention', () => {
    const r = detectEmotionState({
      correctRate: 0.7,
      rawResults: ['correct', 'wrong', 'correct', 'wrong', 'correct'],
      anxietyBefore: 50,
      anxietyAfter: 55,
      dimensionScores: { grammar: 60, listening: 70 },
      errorPatterns: [{ dimension: 'grammar', question_index: 1, pattern: 'wrong_answer' }],
      sessionDurationMs: 5 * 60_000,
      homeCultureCode: 'hc_en',
    });
    expect(r.state).toBe('green');
    expect(r.intervention).toBeNull();
  });

  it('焦虑变化 < 15 不触发 yellow', () => {
    const r = detectEmotionState({
      correctRate: 0.6,
      rawResults: ['correct'],
      anxietyBefore: 50,
      anxietyAfter: 63, // delta=13 < 15
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.signals.anxiety_spike).toBe(false);
  });
});

// ==================== Yellow 状态 ====================

describe('detectEmotionState — yellow', () => {
  it('连续 3-4 题错误 → frustration yellow', () => {
    const r = detectEmotionState({
      correctRate: 0.25,
      rawResults: ['correct', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 55,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('yellow');
    expect(r.signals.frustration).toBe(0.75); // 3/4
  });

  it('最长连续正确 >= 8 且 correctRate > 0.9 → disengagement yellow (E-01: 全数组扫描)', () => {
    // 末尾有错误不应抹掉前面的连续正确——这是 E-01 的修复点
    const results = [
      'correct', 'correct', 'correct', 'correct',
      'correct', 'correct', 'correct', 'correct', // 连续 8 个正确
      'wrong', 'wrong', // 末尾两个错误
    ];
    const r = detectEmotionState({
      correctRate: 0.91, // > 0.9, 10/11 ≈ 0.91
      rawResults: results,
      anxietyBefore: 40,
      anxietyAfter: 38,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('yellow');
    expect(r.signals.disengagement).toBeGreaterThan(0);
    expect(r.intervention?.suggested_action).toBe('raise_difficulty');
  });

  it('最长连续正确 < 8 不触发 disengagement', () => {
    const results = ['correct', 'correct', 'correct', 'correct', 'wrong', 'correct'];
    const r = detectEmotionState({
      correctRate: 0.95,
      rawResults: results,
      anxietyBefore: 40,
      anxietyAfter: 38,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.signals.disengagement).toBe(0);
  });

  it('焦虑突增 15-24 → anxiety_spike yellow', () => {
    const r = detectEmotionState({
      correctRate: 0.4,
      rawResults: ['wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 68, // delta=18
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('yellow');
    expect(r.signals.anxiety_spike).toBe(true);
  });

  it('同维度错误 2 次 → repeated_same_error yellow', () => {
    const r = detectEmotionState({
      correctRate: 0.3,
      rawResults: ['wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 52,
      dimensionScores: { grammar: 0 },
      errorPatterns: [
        { dimension: 'grammar', question_index: 0, pattern: 'wrong_answer' },
        { dimension: 'grammar', question_index: 1, pattern: 'wrong_answer' },
      ],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('yellow');
  });

  it('disengagement → raise_difficulty with multiplier 1.2', () => {
    const corrects = Array(9).fill('correct');
    const r = detectEmotionState({
      correctRate: 1.0,
      rawResults: corrects,
      anxietyBefore: 30,
      anxietyAfter: 25,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('yellow');
    expect(r.intervention?.suggested_action).toBe('raise_difficulty');
    expect(r.intervention?.difficulty_multiplier).toBe(1.2);
  });
});

// ==================== Red 状态 ====================

describe('detectEmotionState — red', () => {
  it('连续 5 题错误 → frustration red', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 60,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('red');
    expect(r.signals.frustration).toBe(1);
    expect(r.intervention?.suggested_action).toBe('lower_difficulty');
    expect(r.intervention?.difficulty_multiplier).toBe(0.7);
  });

  it('疲劳检测 (E-04: session >= 20min) — 刚好 20min 也触发', () => {
    // E-04 fix: >= instead of >
    const r = detectEmotionState({
      correctRate: 0.3,       // < 0.5 → declining (E-06 fix)
      rawResults: ['wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 55,       // 上升
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 20 * 60_000, // 恰好 20 分钟
    });
    expect(r.state).toBe('red');
    expect(r.signals.fatigue).toBe(1);
    expect(r.intervention?.suggested_action).toBe('suggest_break');
  });

  it('疲劳未触发 — accuracyDeclining 边界 exactly 0.5 触发 (E-06)', () => {
    // E-06 fix: < 0.5 → <= 0.5
    const r = detectEmotionState({
      correctRate: 0.5,       // exactly 0.5 → should trigger declining
      rawResults: ['wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 55,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 25 * 60_000,
    });
    expect(r.signals.fatigue).toBe(1);
  });

  it('焦虑突增 >= 25 → anxiety_spike red', () => {
    const r = detectEmotionState({
      correctRate: 0.2,
      rawResults: ['wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 78, // delta=28
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('red');
    expect(r.signals.anxiety_spike).toBe(true);
  });

  it('同维度错误 >= 3 → repeated_same_error red', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 52,
      dimensionScores: {},
      errorPatterns: [
        { dimension: 'listening', question_index: 0, pattern: 'wrong_answer' },
        { dimension: 'listening', question_index: 1, pattern: 'wrong_answer' },
        { dimension: 'listening', question_index: 2, pattern: 'wrong_answer' },
      ],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('red');
    expect(r.signals.repeated_same_error).toBe(true);
  });

  it('frustration red → lower_difficulty with multiplier 0.7', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 55,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.intervention?.tier).toBe('red');
    expect(r.intervention?.suggested_action).toBe('lower_difficulty');
    expect(r.intervention?.difficulty_multiplier).toBe(0.7);
  });
});

// ==================== accuracy_trend ====================

describe('accuracy_trend', () => {
  it('correctRate < 0.4 → declining', () => {
    const r = detectEmotionState({
      correctRate: 0.3,
      rawResults: ['wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 50,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.signals.accuracy_trend).toBe('declining');
  });

  it('correctRate > 0.8 → improving', () => {
    const r = detectEmotionState({
      correctRate: 0.9,
      rawResults: ['correct', 'correct'],
      anxietyBefore: 50, anxietyAfter: 50,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.signals.accuracy_trend).toBe('improving');
  });

  it('correctRate 0.4-0.8 → stable', () => {
    const r = detectEmotionState({
      correctRate: 0.6,
      rawResults: ['correct', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 50,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.signals.accuracy_trend).toBe('stable');
  });
});

// ==================== 跨文化话术 (E-07) ====================

describe('跨文化干预话术', () => {
  it('hc_en disengagement → raise_difficulty 英文', () => {
    const r = detectEmotionState({
      correctRate: 1.0,
      rawResults: Array(9).fill('correct'),
      anxietyBefore: 30, anxietyAfter: 25,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_en',
    });
    expect(r.intervention?.learner_message).toContain('Great job');
  });

  it('hc_fr disengagement → raise_difficulty 法文 (E-07)', () => {
    const r = detectEmotionState({
      correctRate: 1.0,
      rawResults: Array(9).fill('correct'),
      anxietyBefore: 30, anxietyAfter: 25,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_fr',
    });
    expect(r.intervention?.learner_message).toContain('Excellent');
  });

  it('hc_fr frustration → lower_difficulty 法文', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 60,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_fr',
    });
    expect(r.intervention?.learner_message).toContain('Revenons');
  });

  it('hc_fr fatigue → suggest_break 法文', () => {
    const r = detectEmotionState({
      correctRate: 0.3,
      rawResults: ['wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 55,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 25 * 60_000,
      homeCultureCode: 'hc_fr',
    });
    expect(r.intervention?.learner_message).toContain('Vous étudiez');
  });

  it('hc_fr anxiety_spike → encourage 法文', () => {
    const r = detectEmotionState({
      correctRate: 0.4,
      rawResults: ['wrong'],
      anxietyBefore: 50, anxietyAfter: 76,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_fr',
    });
    expect(r.intervention?.learner_message).toContain('progressez');
  });

  it('hc_ja → 日文话术', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 60,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_ja',
    });
    expect(r.intervention?.learner_message).toContain('基礎');
  });

  it('hc_ko → 韩文话术', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 60,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_ko',
    });
    expect(r.intervention?.learner_message).toContain('기초');
  });

  it('hc_es → 西文话术', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 60,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_es',
    });
    expect(r.intervention?.learner_message).toContain('Reforcemos');
  });

  it('未知 culture code → default 中文兜底', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 60,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_unknown',
    });
    expect(r.intervention?.learner_message).toContain('基础');
  });
});

// ==================== signals 数值精度 ====================

describe('signals 数值', () => {
  it('frustration 取整到小数点后 2 位', () => {
    const r = detectEmotionState({
      correctRate: 0.33,
      rawResults: ['correct', 'wrong', 'wrong'], // 2 consecutive errors / 3 = 0.666...
      anxietyBefore: 50, anxietyAfter: 50,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    // 2/3 = 0.666..., rounded to 2 decimal = 0.67
    expect(r.signals.frustration).toBe(0.67);
  });

  it('disengagement 取整到小数点后 2 位', () => {
    const corrects = Array(12).fill('correct');
    const r = detectEmotionState({
      correctRate: 1.0,
      rawResults: corrects, // max streak = 12, total = 12 → min(1, 12/12) = 1
      anxietyBefore: 30, anxietyAfter: 25,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.signals.disengagement).toBe(1);
  });
});

// ==================== 阈值与出题数量对齐 ====================

import { EXERCISES_PER_SESSION } from '@/lib/constants';

describe('EXERCISES_PER_SESSION 与情感阈值对齐', () => {
  it('固定 5 道题确保 frustration 3→yellow, 5→red 有意义', () => {
    expect(EXERCISES_PER_SESSION).toBe(5);
  });

  it('5 题全错触发 frustration red', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: Array(5).fill('wrong'),
      anxietyBefore: 50, anxietyAfter: 55,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('red');
    expect(r.signals.frustration).toBe(1);
  });

  it('5 题错 3 触发 frustration yellow', () => {
    const r = detectEmotionState({
      correctRate: 0.4,
      rawResults: ['correct', 'correct', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 52,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('yellow');
    expect(r.signals.frustration).toBe(0.6); // 3/5
  });

  it('只有 2 题时，全错也无法触发 yellow（说明固定 5 题的必要性）', () => {
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong'],
      anxietyBefore: 50, anxietyAfter: 52,
      dimensionScores: {}, errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    expect(r.state).toBe('green');
    expect(r.signals.frustration).toBe(1); // 2/2 = 1 but consecutive errors = 2 < 3
  });
});
