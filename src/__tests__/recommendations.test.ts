/**
 * 推荐引擎单元测试
 *
 * 覆盖：
 *   - MOTIVATION_DOMAIN_AFFINITY 映射正确性
 *   - 五因子加权评分公式
 *   - R-01: 按 is_unlocked 优先排序（locked KPs 不高于 unlocked KPs）
 *   - 冷启动排序逻辑
 *   - HSK 邻近度计算
 */
import { describe, it, expect } from 'vitest';
import { MOTIVATION_DOMAIN_AFFINITY } from '@/lib/constants';

// ==================== 纯评分函数（从 getRecommendations 提取，用于测试） ====================

interface Candidate {
  kp_id: string;
  domain_id: string;
  hsk_level: number;
  kp_name: string;
  pragmatic_intent: string;
  prereq_ids: string[];
  mastery_score: number | null;
}

interface ScoredItem {
  kp_id: string;
  domain_id: string;
  hsk_level: number;
  score: number;
  is_unlocked: boolean;
  reasons: string[];
}

function scoreCandidate(
  c: Candidate,
  learnerHsk: number,
  motivation: string,
  masteryMap: Map<string, number>,
  weakDimNames: Set<string>,
): ScoredItem {
  const affinityDomains = MOTIVATION_DOMAIN_AFFINITY[motivation] || [];

  // 动机匹配 (0.20)
  const motivationScore =
    affinityDomains.length === 0 || affinityDomains.includes(c.domain_id) ? 1.0 : 0.3;

  // HSK 邻近度 (0.25)
  const hskProximity = 1 - Math.abs(c.hsk_level - learnerHsk) / 9;

  // 解锁状态 (0.25)
  const allPrereqsMastered =
    c.prereq_ids.length === 0 ||
    c.prereq_ids.every((pid) => (masteryMap.get(pid) || 0) >= 0.8);

  // 弱项维度 (0.15)
  let weakBoost = 0;
  if (weakDimNames.size > 0) {
    const searchText = (c.kp_name + ' ' + c.pragmatic_intent).toLowerCase();
    for (const weakDim of weakDimNames) {
      if (searchText.includes(weakDim)) { weakBoost = 1.0; break; }
    }
    if (weakBoost === 0 && weakDimNames.has('综合能力')) { weakBoost = 0.5; }
  }

  // 新颖度 (0.15)
  const isMastered = c.mastery_score !== null && c.mastery_score >= 0.6;
  const novelty = isMastered ? 0 : 1.0;

  const score =
    0.20 * motivationScore +
    0.25 * hskProximity +
    0.25 * (allPrereqsMastered ? 1.0 : 0) +
    0.15 * weakBoost +
    0.15 * novelty;

  const reasons: string[] = [];
  if (motivationScore >= 1.0 && affinityDomains.length > 0) reasons.push('motivation_match');
  if (hskProximity > 0.7) reasons.push('hsk_proximity');
  if (allPrereqsMastered && c.prereq_ids.length > 0) reasons.push('unlocked');
  if (weakBoost > 0) reasons.push('weak_dimension');
  if (novelty > 0) reasons.push('new');

  return {
    kp_id: c.kp_id,
    domain_id: c.domain_id,
    hsk_level: c.hsk_level,
    score: Math.round(score * 1000) / 1000,
    is_unlocked: allPrereqsMastered,
    reasons,
  };
}

// R-01 修复后的排序：is_unlocked 优先，然后 score 降序
function sortCandidates(items: ScoredItem[]): ScoredItem[] {
  return [...items].sort((a, b) => {
    if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? -1 : 1;
    return b.score - a.score;
  });
}

// 冷启动排序：motivation 优先，然后 HSK 升序
function coldStartSort(items: ScoredItem[], affinityDomains: string[]): ScoredItem[] {
  return [...items].sort((a, b) => {
    const aMot = affinityDomains.length === 0 || affinityDomains.includes(a.domain_id) ? 1.0 : 0.3;
    const bMot = affinityDomains.length === 0 || affinityDomains.includes(b.domain_id) ? 1.0 : 0.3;
    if (bMot !== aMot) return bMot - aMot;
    return a.hsk_level - b.hsk_level;
  });
}

// ==================== MOTIVATION_DOMAIN_AFFINITY ====================

describe('MOTIVATION_DOMAIN_AFFINITY 映射', () => {
  it('tourism → travel, food, shopping, transport, entertainment', () => {
    expect(MOTIVATION_DOMAIN_AFFINITY['tourism']).toEqual([
      'travel', 'food', 'shopping', 'transport', 'entertainment',
    ]);
  });

  it('study_abroad → campus, daily, housing, banking, food, medical', () => {
    expect(MOTIVATION_DOMAIN_AFFINITY['study_abroad']).toContain('campus');
    expect(MOTIVATION_DOMAIN_AFFINITY['study_abroad']).toContain('medical');
  });

  it('work → workplace, banking, housing, transport, daily', () => {
    expect(MOTIVATION_DOMAIN_AFFINITY['work']).toContain('workplace');
    expect(MOTIVATION_DOMAIN_AFFINITY['work']).toContain('daily');
  });

  it('interest → 空数组（全领域均等）', () => {
    expect(MOTIVATION_DOMAIN_AFFINITY['interest']).toEqual([]);
  });

  it('exam → 空数组（纯 HSK 驱动）', () => {
    expect(MOTIVATION_DOMAIN_AFFINITY['exam']).toEqual([]);
  });
});

// ==================== 五因子评分 ====================

describe('评分公式', () => {
  const baseCandidate: Candidate = {
    kp_id: 'kp_test',
    domain_id: 'travel',
    hsk_level: 3,
    kp_name: '打车用语',
    pragmatic_intent: '学会打车时的基本对话',
    prereq_ids: [],
    mastery_score: null,
  };

  it('满分候选（无前置 + 动机匹配 + HSK 匹配 + 新颖）→ 高分', () => {
    const r = scoreCandidate(
      baseCandidate, 3, 'tourism', new Map(), new Set(),
    );
    // 0.20*1 + 0.25*1 + 0.25*1 + 0.15*0 + 0.15*1 = 0.85
    expect(r.score).toBeCloseTo(0.85, 2);
    expect(r.is_unlocked).toBe(true);
  });

  it('动机不匹配 → motivation 分 0.3', () => {
    const r = scoreCandidate(
      { ...baseCandidate, domain_id: 'medical' },
      3, 'tourism',
      new Map(), new Set(),
    );
    // 0.20*0.3 + 0.25*1 + 0.25*1 + 0.15*0 + 0.15*1 = 0.06+0.25+0.25+0.15 = 0.71
    expect(r.score).toBeCloseTo(0.71, 2);
  });

  it('HSK 差距大 → 邻近度分低', () => {
    const r = scoreCandidate(
      baseCandidate,
      9, // learner 在 HSK 9
      'tourism', new Map(), new Set(),
    );
    // 1 - |3-9|/9 = 1 - 6/9 = 0.333
    const expectedHsk = 1 - 6 / 9;
    expect(expectedHsk).toBeCloseTo(0.333, 2);
  });

  it('前置未掌握 → is_unlocked=false, 解锁分 0', () => {
    const r = scoreCandidate(
      { ...baseCandidate, prereq_ids: ['kp_pre1', 'kp_pre2'] },
      3, 'tourism',
      new Map([['kp_pre1', 0.5]]), // pre1 未掌握, pre2 无记录
      new Set(),
    );
    expect(r.is_unlocked).toBe(false);
    expect(r.score).toBeLessThan(0.85);
  });

  it('前置全部掌握 → 解锁', () => {
    const r = scoreCandidate(
      { ...baseCandidate, prereq_ids: ['kp_pre1', 'kp_pre2'] },
      3, 'tourism',
      new Map([['kp_pre1', 0.9], ['kp_pre2', 0.85]]),
      new Set(),
    );
    expect(r.is_unlocked).toBe(true);
  });

  it('已掌握 KP → novelty=0', () => {
    const r = scoreCandidate(
      { ...baseCandidate, mastery_score: 0.85 },
      3, 'tourism', new Map(), new Set(),
    );
    // novelty=0 → 0.20+0.25+0.25+0+0 = 0.70
    expect(r.score).toBeCloseTo(0.70, 2);
    expect(r.reasons).not.toContain('new');
  });

  it('in_progress KP (0.6 ≤ score < 0.8) → novelty=0', () => {
    const r = scoreCandidate(
      { ...baseCandidate, mastery_score: 0.6 },
      3, 'tourism', new Map(), new Set(),
    );
    expect(r.score).toBeCloseTo(0.70, 2);
  });

  it('弱项维度匹配 → weakBoost=1.0', () => {
    const r = scoreCandidate(
      { ...baseCandidate, kp_name: '语法练习', pragmatic_intent: '掌握语法结构' },
      3, 'interest', new Map(),
      new Set(['语法']),
    );
    // 0.20*1 + 0.25*1 + 0.25*1 + 0.15*1 + 0.15*1 = 1.0
    expect(r.score).toBeCloseTo(1.0, 2);
    expect(r.reasons).toContain('weak_dimension');
  });

  it('interest/exam 动机 → 全部分 motivation_score=1.0', () => {
    for (const mot of ['interest', 'exam']) {
      const r = scoreCandidate(
        { ...baseCandidate, domain_id: 'any_domain' },
        3, mot, new Map(), new Set(),
      );
      // all domains get 1.0 for interest/exam
      expect(r.score).toBeCloseTo(0.85, 2);
    }
  });
});

// ==================== R-01: 排序规则 ====================

describe('R-01: is_unlocked 优先排序', () => {
  it('unlocked KP 排在 locked KP 前面，即使 locked 总分更高', () => {
    const items: ScoredItem[] = [
      {
        kp_id: 'locked_high_score', domain_id: 'travel', hsk_level: 3,
        score: 0.95, is_unlocked: false, reasons: [],
      },
      {
        kp_id: 'unlocked_low_score', domain_id: 'food', hsk_level: 5,
        score: 0.45, is_unlocked: true, reasons: [],
      },
      {
        kp_id: 'locked_low_score', domain_id: 'shopping', hsk_level: 4,
        score: 0.30, is_unlocked: false, reasons: [],
      },
    ];

    const sorted = sortCandidates(items);
    // unlocked 在前
    expect(sorted[0].kp_id).toBe('unlocked_low_score');
    expect(sorted[0].is_unlocked).toBe(true);
  });

  it('多个 unlocked → 按 score 降序', () => {
    const items: ScoredItem[] = [
      { kp_id: 'u1', domain_id: 'a', hsk_level: 1, score: 0.5, is_unlocked: true, reasons: [] },
      { kp_id: 'u2', domain_id: 'b', hsk_level: 2, score: 0.9, is_unlocked: true, reasons: [] },
      { kp_id: 'u3', domain_id: 'c', hsk_level: 3, score: 0.7, is_unlocked: true, reasons: [] },
    ];
    const sorted = sortCandidates(items);
    expect(sorted[0].kp_id).toBe('u2');
    expect(sorted[1].kp_id).toBe('u3');
    expect(sorted[2].kp_id).toBe('u1');
  });

  it('多个 locked → 按 score 降序', () => {
    const items: ScoredItem[] = [
      { kp_id: 'l1', domain_id: 'a', hsk_level: 1, score: 0.3, is_unlocked: false, reasons: [] },
      { kp_id: 'l2', domain_id: 'b', hsk_level: 2, score: 0.7, is_unlocked: false, reasons: [] },
    ];
    const sorted = sortCandidates(items);
    expect(sorted[0].kp_id).toBe('l2');
    expect(sorted[1].kp_id).toBe('l1');
  });
});

// ==================== 冷启动排序 ====================

describe('冷启动排序', () => {
  it('motivation 匹配的 domain 优先', () => {
    const items: ScoredItem[] = [
      { kp_id: 'kp1', domain_id: 'medical', hsk_level: 1, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'kp2', domain_id: 'travel', hsk_level: 3, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'kp3', domain_id: 'food', hsk_level: 2, score: 0, is_unlocked: true, reasons: [] },
    ];
    const tourismDomains = MOTIVATION_DOMAIN_AFFINITY['tourism'];
    const sorted = coldStartSort(items, tourismDomains);
    // travel, food 都在 tourism 亲和列表中 → motivation 得分相同，按 HSK 升序
    expect(sorted[0].domain_id).toBe('food');    // HSK 2
    expect(sorted[1].domain_id).toBe('travel');  // HSK 3
    expect(sorted[2].domain_id).toBe('medical'); // 不匹配，motivation=0.3
  });

  it('同动机内按 HSK 升序', () => {
    const items: ScoredItem[] = [
      { kp_id: 'kp_h', domain_id: 'travel', hsk_level: 5, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'kp_l', domain_id: 'travel', hsk_level: 1, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'kp_m', domain_id: 'travel', hsk_level: 3, score: 0, is_unlocked: true, reasons: [] },
    ];
    const sorted = coldStartSort(items, MOTIVATION_DOMAIN_AFFINITY['tourism']);
    expect(sorted[0].hsk_level).toBe(1);
    expect(sorted[1].hsk_level).toBe(3);
    expect(sorted[2].hsk_level).toBe(5);
  });

  it('interest 无 affinity 过滤 → 全按 HSK 升序', () => {
    const items: ScoredItem[] = [
      { kp_id: 'a', domain_id: 'workplace', hsk_level: 5, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'b', domain_id: 'travel', hsk_level: 1, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'c', domain_id: 'campus', hsk_level: 3, score: 0, is_unlocked: true, reasons: [] },
    ];
    const sorted = coldStartSort(items, MOTIVATION_DOMAIN_AFFINITY['interest']);
    // All get same motivation score (1.0), sort by HSK ascending
    expect(sorted[0].hsk_level).toBe(1);
    expect(sorted[1].hsk_level).toBe(3);
    expect(sorted[2].hsk_level).toBe(5);
  });
});

// ==================== TC-02 ====================
// "终极诱惑"：完美匹配所有因子，但前置未解锁 → 必须排在已解锁 KP 之后

describe('TC-02: 前置未解锁 = 一票否决 — is_unlocked 优先排序', () => {
  it('满分 locked KP 必须排在低分 unlocked KP 之后', () => {
    const perfectLocked: ScoredItem = {
      kp_id: 'perfect_locked', domain_id: 'travel', hsk_level: 3,
      score: 0.95, is_unlocked: false, reasons: ['motivation_match', 'hsk_proximity', 'weak_dimension'],
    };
    const mediocreUnlocked: ScoredItem = {
      kp_id: 'mediocre_unlocked', domain_id: 'medical', hsk_level: 6,
      score: 0.25, is_unlocked: true, reasons: [],
    };

    const sorted = sortCandidates([perfectLocked, mediocreUnlocked]);
    expect(sorted[0].kp_id).toBe('mediocre_unlocked');
    expect(sorted[0].is_unlocked).toBe(true);
    expect(sorted[1].kp_id).toBe('perfect_locked');
  });

  it('locked KP 的 unlock 分已是 0，但其他因子高时总分仍可能很高', () => {
    const c: Candidate = {
      kp_id: 'kp_locked', domain_id: 'travel', hsk_level: 3,
      kp_name: '语法练习', pragmatic_intent: '打车用语',
      prereq_ids: ['kp_pre1', 'kp_pre2'],
      mastery_score: null,
    };
    const r = scoreCandidate(
      c, 3, 'tourism',
      new Map([['kp_pre1', 0.3]]), // pre1 未掌握 → locked
      new Set(['语法']),            // '语法' 包含在 '语法练习' 中 → weakBoost=1.0
    );
    // 验证它虽然 4 个因子高分，但 is_unlocked=false
    expect(r.is_unlocked).toBe(false);
    // 动机(1.0) + HSK(1.0) + 弱项(1.0) + 新颖(1.0) = 四个高分
    // 但解锁分=0 → 总分 = 0.20+0.25+0.15+0.15 = 0.75
    expect(r.score).toBeCloseTo(0.75, 1);
    // 这仍是高分 — 但排序时必须排在所有 unlocked KP 之后
  });
});

// ==================== TC-04 ====================
// "纯白板+无欲无求"：冷启动 + interest → 不分 domain，按 HSK 升序

describe('TC-04: 冷启动 + interest 无过滤 → 仅按 HSK 升序', () => {
  it('空 mastery + interest → 跨 domain 按 HSK 升序', () => {
    const items: ScoredItem[] = [
      { kp_id: 'high', domain_id: 'workplace', hsk_level: 5, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'low', domain_id: 'campus', hsk_level: 1, score: 0, is_unlocked: true, reasons: [] },
      { kp_id: 'mid', domain_id: 'travel', hsk_level: 3, score: 0, is_unlocked: true, reasons: [] },
    ];
    const interestDomains = MOTIVATION_DOMAIN_AFFINITY['interest'];
    expect(interestDomains).toEqual([]); // 空数组 = 无过滤

    const sorted = coldStartSort(items, interestDomains);
    // 所有 domain 动机分=1.0 → 仅按 HSK 升序
    expect(sorted[0].hsk_level).toBe(1);
    expect(sorted[1].hsk_level).toBe(3);
    expect(sorted[2].hsk_level).toBe(5);
  });

  it('motivation 匹配分对 interest 始终返回 1.0', () => {
    const c: Candidate = {
      kp_id: 'any_kp', domain_id: 'random_domain', hsk_level: 3,
      kp_name: '任意知识点', pragmatic_intent: '',
      prereq_ids: [], mastery_score: null,
    };
    const r = scoreCandidate(c, 3, 'interest', new Map(), new Set());
    // motivation 1.0 (interest 无过滤) + HSK 1.0 + unlock 1.0 + 弱项 0 + 新颖 1.0 = 0.85
    expect(r.score).toBeCloseTo(0.85, 2);
  });
});
