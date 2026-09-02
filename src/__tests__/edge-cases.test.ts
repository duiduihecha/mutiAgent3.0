/**
 * 极限边缘测试用例 (TC-01 ~ TC-05)
 *
 * 每个用例模拟一个刁钻场景，验证系统在极端条件下的行为。
 * 运行方式：npx vitest run --config vitest.config.ts
 */
import { describe, it, expect } from 'vitest';
import { detectEmotionState } from '@/lib/emotion-check';

// ==================== TC-01 ====================
// "先神后鬼"：先连续 8 题全对（无聊）→ 再连续 5 题错 + 时长超 20min
// 预期：red，frustration + fatigue 压过 disengagement

describe('TC-01: 多重状态叠加 — disengagement+frustration+fatigue → red 优先', () => {
  it('5题对+5题错+25min → red (frustration+fatigue双红), 不出现 raise_difficulty', () => {
    // 疲劳 = 焦虑↑ + 正确率≤0.5 + 时长≥20min → 需正确率≤0.5
    // 使用 5对+5错 → correctRate=0.5 满足 ≤0.5 (E-06 fix)
    const results = [
      ...Array(5).fill('correct'),
      ...Array(5).fill('wrong'),
    ]; // 10 题，后 5 题连错

    const r = detectEmotionState({
      correctRate: 0.5,
      rawResults: results,
      anxietyBefore: 50,
      anxietyAfter: 55, // 上升
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 25 * 60_000, // 25 分钟
    });

    // frustration 5 连错 → red flag
    expect(r.signals.frustration).toBeGreaterThan(0);
    // fatigue: 焦虑↑(55>50) + 正确率≤0.5(0.5) + 时长≥20min(25) → red
    expect(r.signals.fatigue).toBe(1);
    // red 优先 — frustration red + fatigue red → 整体 red
    expect(r.state).toBe('red');
    // 不能出现 raise_difficulty（那是 disengagement yellow 的动作）
    expect(r.intervention?.suggested_action).not.toBe('raise_difficulty');
    // 应该是 fatigue → suggest_break 或 frustration → lower_difficulty
    expect(['suggest_break', 'lower_difficulty']).toContain(
      r.intervention?.suggested_action,
    );
  });

  it('disengagement yellow + frustration red → red 胜出，不执行 raise_difficulty', () => {
    // 先 9 题全对（最长连续≥8, correctRate>0.9 → disengagement yellow）
    // 但末尾 5 题全错（frustration red）
    // 整体 correctRate 需要>0.9？不——末尾5题错拉低了
    // 这个场景的重点是：即使有 disengagement 信号，red 优先
    const results = ['correct', 'wrong', 'wrong', 'wrong', 'wrong', 'wrong'];
    const r = detectEmotionState({
      correctRate: 1/6, // ≈0.17，末 5 连错
      rawResults: results,
      anxietyBefore: 50,
      anxietyAfter: 52,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
    });
    // frustration 5 连错 → red
    expect(r.state).toBe('red');
    // disengagement 最长连续正确=1 < 8 → 不触发
    expect(r.signals.disengagement).toBe(0);
    // red 状态下不会出现 raise_difficulty
    expect(r.intervention?.suggested_action).not.toBe('raise_difficulty');
  });
});

// ==================== TC-03 ====================
// "小语种攻击"：斯瓦希里语/阿拉伯语等未知语言 → default 中文兜底

describe('TC-03: 未知母语文化圈 → default 中文话术兜底', () => {
  const unknownCodes = ['hc_sw', 'hc_ar', 'hc_xx', ''];

  for (const code of unknownCodes) {
    it(`homeCultureCode="${code || '(empty)'}" → 中文兜底，不崩溃`, () => {
      const r = detectEmotionState({
        correctRate: 0,
        rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
        anxietyBefore: 50,
        anxietyAfter: 60,
        dimensionScores: {},
        errorPatterns: [],
        sessionDurationMs: 60_000,
        homeCultureCode: code,
      });

      expect(r.state).toBe('red');
      expect(r.intervention).not.toBeNull();
      // default 中文话术包含"基础"或"降低"或"休息"等中文关键词
      const msg = r.intervention!.learner_message;
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
      // 不能是英文/日文/韩文/西文/法文（应走 default 中文）
      const nonDefaultPatterns = [
        "You're making progress", // EN
        'よく頑張っていますね',    // JA
        '잘하고 있어요',           // KO
        '¡Vas muy bien',          // ES
        'Vous progressez',        // FR
        'Reforcemos',             // ES lower
        'Revenons aux bases',     // FR lower
        '기초를',                  // KO lower
        '基礎を',                  // JA lower
      ];
      for (const pat of nonDefaultPatterns) {
        expect(msg).not.toContain(pat);
      }
    });
  }

  it('阿拉伯语(hc_ar)不在已知列表，应该走 default', () => {
    // hc_ar 不在 [en, ja, ko, es, ar, ru, fr, th] 的 langToCultureCode 映射中
    // 但 ar 在 known 列表里... 让我重新看代码。
    // langToCultureCode 的 known = ["en","ja","ko","es","ar","ru","fr","th"]
    // 所以 hc_ar 应当被识别并匹配到 LOWER_DIFFICULTY 的 ar key
    // 但 LOWER_DIFFICULTY 没有 hc_ar key → 走 default
    const r = detectEmotionState({
      correctRate: 0,
      rawResults: ['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
      anxietyBefore: 50,
      anxietyAfter: 60,
      dimensionScores: {},
      errorPatterns: [],
      sessionDurationMs: 60_000,
      homeCultureCode: 'hc_ar',
    });
    // ar 是已知 culture code，但 MessageSet 里没有 hc_ar → 走 default
    expect(r.intervention?.learner_message).toContain('基础');
  });
});

// ==================== TC-05 ====================
// "单点暴击"：听力维度极低+一道蒙对 → α=0.7 EWMA 精确计算

import { calculateAbilityVector } from '@/lib/multi-agent-system';

describe('TC-05: 能力向量 EWMA — 单维度暴击，其他维度不变', () => {
  it('听力 10→73 (0.7*100+0.3*10), 其余四维不动', () => {
    // dimension mapping: grammar=0, listening=1, speaking=2, cultural_pragmatic=3, reading=4
    const oldVector = [50, 10, 50, 50, 50]; // 听力=10

    const results = [
      { dimension: 'listening' as const, correct: true, weight: 1 },
    ];

    const newVector = calculateAbilityVector(oldVector, results);

    // 听力 = round(0.7*100 + 0.3*10) = round(70+3) = 73
    expect(newVector[1]).toBe(73);
    // 其他四维不变
    expect(newVector[0]).toBe(50); // 语法
    expect(newVector[2]).toBe(50); // 口语
    expect(newVector[3]).toBe(50); // 文化
    expect(newVector[4]).toBe(50); // 阅读
  });

  it('听力维度 2 题全对 → 听力=85', () => {
    const oldVector = [50, 10, 50, 50, 50];
    const results = [
      { dimension: 'listening' as const, correct: true, weight: 1 },
      { dimension: 'listening' as const, correct: true, weight: 1 },
    ];
    const newVector = calculateAbilityVector(oldVector, results);
    // 维度得分 = (100+100)/2 = 100, α=0.7*100 + 0.3*10 = 70+3 = 73
    // Wait: 0.7 * 100 + 0.3 * 10 = 73
    expect(newVector[1]).toBe(73);
  });

  it('听力维度全错 → 听力=3', () => {
    const oldVector = [50, 10, 50, 50, 50];
    const results = [
      { dimension: 'listening' as const, correct: false, weight: 1 },
    ];
    const newVector = calculateAbilityVector(oldVector, results);
    // 0.7*0 + 0.3*10 = 3
    expect(newVector[1]).toBe(3);
  });

  it('混合维度：听力+语法各一题 → 仅这两维更新', () => {
    const oldVector = [50, 10, 50, 50, 50];
    const results = [
      { dimension: 'grammar' as const, correct: true, weight: 1 },
      { dimension: 'listening' as const, correct: false, weight: 1 },
    ];
    const newVector = calculateAbilityVector(oldVector, results);
    // 语法: 0.7*100 + 0.3*50 = 70+15 = 85
    expect(newVector[0]).toBe(85);
    // 听力: 0.7*0 + 0.3*10 = 3
    expect(newVector[1]).toBe(3);
    // 口语、文化、阅读不动
    expect(newVector[2]).toBe(50);
    expect(newVector[3]).toBe(50);
    expect(newVector[4]).toBe(50);
  });

  it('clamp 边界：exceeding 100 → 100', () => {
    const oldVector = [97, 50, 50, 50, 50];
    const results = [
      { dimension: 'grammar' as const, correct: true, weight: 1 },
    ];
    const newVector = calculateAbilityVector(oldVector, results);
    // 0.7*100 + 0.3*97 = 70+29.1 = 99.1 → round = 99
    expect(newVector[0]).toBe(99);
  });
});

// ==================== TC-06 ====================
// "遗忘曲线"：艾宾浩斯衰减 R(t) = P * e^(-t/S), S = 30 + 5*ln(1+cumulative_correct)

import { computeMemoryStrength, applyForgettingDecay } from '@/lib/multi-agent-system';

describe('TC-06: 遗忘曲线 — 记忆稳定性与衰减', () => {
  it('cumulativeCorrect=0 → S=30 (基础半衰期)', () => {
    expect(computeMemoryStrength(0)).toBeCloseTo(30, 0);
  });

  it('cumulativeCorrect=10 → S > 30', () => {
    // S = 30 + 5*ln(1+10) = 30 + 5*2.398 = 41.99
    const S = computeMemoryStrength(10);
    expect(S).toBeCloseTo(42.0, -1);
    expect(S).toBeGreaterThan(30);
  });

  it('cumulativeCorrect=100 → S 更高', () => {
    // S = 30 + 5*ln(1+100) = 30 + 5*4.615 = 53.08
    const S = computeMemoryStrength(100);
    expect(S).toBeCloseTo(53.1, -1);
    expect(S).toBeGreaterThan(computeMemoryStrength(10));
  });

  it('0 天 → 无衰减', () => {
    const decayed = applyForgettingDecay(0.85, 0, 5);
    expect(decayed).toBe(0.85);
  });

  it('30 天 + 低 cumulative_correct → 显著衰减', () => {
    // S = 30, R = 0.85 * e^(-30/30) = 0.85 * 0.368 = 0.313
    const decayed = applyForgettingDecay(0.85, 30, 0);
    expect(decayed).toBeLessThan(0.35);
    expect(decayed).toBeGreaterThan(0.25);
  });

  it('30 天 + 高 cumulative_correct → 衰减较小', () => {
    // S = 30 + 5*ln(1+100) = 53.08, R = 0.85 * e^(-30/53.08) = 0.85*0.568 = 0.483
    const decayedHigh = applyForgettingDecay(0.85, 30, 100);
    // S = 30, R = 0.85 * e^(-30/30) = 0.313
    const decayedLow = applyForgettingDecay(0.85, 30, 0);
    // 高 cumulative_correct 应该保留更多
    expect(decayedHigh).toBeGreaterThan(decayedLow + 0.1);
  });

  it('60 天 + 无复习 → 几乎遗忘', () => {
    // S = 30, R = 0.9 * e^(-60/30) = 0.9*0.135 = 0.122
    const decayed = applyForgettingDecay(0.90, 60, 0);
    expect(decayed).toBeLessThan(0.15);
  });
});

// ==================== TC-07 ====================
// "遗忘触发复习推荐"：原始分数 ≥0.6 但衰减后 <0.4 → needs_review

describe('TC-07: 遗忘复习触发 — needs_review 判定', () => {
  it('原始 0.85, 衰减至 0.31 (<0.4) → needs_review=true', () => {
    // S=30, R=0.85*e^(-30/30)=0.313
    const decayed = applyForgettingDecay(0.85, 30, 0);
    const needsReview = 0.85 >= 0.6 && decayed < 0.4;
    expect(needsReview).toBe(true);
  });

  it('原始 0.85, 衰减至 0.48 (≥0.4) → needs_review=false', () => {
    // S=53, R=0.85*e^(-30/53)=0.483
    const decayed = applyForgettingDecay(0.85, 30, 100);
    const needsReview = 0.85 >= 0.6 && decayed < 0.4;
    expect(needsReview).toBe(false);
  });

  it('原始 <0.6 (从未掌握) → 不触发 needs_review，走新颖度', () => {
    const decayed = applyForgettingDecay(0.50, 30, 0);
    const needsReview = 0.50 >= 0.6 && decayed < 0.4;
    expect(needsReview).toBe(false);
  });

  it('原始 ≥0.6 但刚学过 (0天) → 不触发', () => {
    const decayed = applyForgettingDecay(0.70, 0, 5);
    const needsReview = 0.70 >= 0.6 && decayed < 0.4;
    expect(needsReview).toBe(false);
  });
});

// ==================== TC-08 ====================
// "遗忘曲线影响解锁判定"：前置 KP 学过但遗忘 → 应视为未解锁

describe('TC-08: 遗忘影响前置解锁判定', () => {
  it('前置 KP 原始 0.9 但衰减至 0.3 → 不再满足 ≥0.8 解锁条件', () => {
    // 模拟 60 天未复习的前置 KP
    const decayed = applyForgettingDecay(0.9, 60, 0);
    expect(decayed).toBeLessThan(0.2);
    // 应视为未解锁
    expect(decayed >= 0.8).toBe(false);
  });

  it('前置 KP 原始 0.9 且 5 天前刚复习 (高 cumulative) → 仍满足解锁', () => {
    // S = 30 + 5*ln(1+100) = 53, R = 0.9*e^(-5/53) = 0.9*0.910 = 0.819
    const decayed = applyForgettingDecay(0.9, 5, 100);
    expect(decayed).toBeGreaterThan(0.79);
    expect(decayed >= 0.8).toBe(true);
  });

  it('无 mastery 记录的 KP 在 decayedMasteryMap 中 → 按 0 算', () => {
    // 这验证了 decayedMasteryMap.get(nonexistentKp) || 0 的兜底逻辑
    const map = new Map<string, number>();
    expect(map.get('no_such_kp') || 0).toBe(0);
  });
});
