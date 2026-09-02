/**
 * 学习情感预测与干预模块
 *
 * 纯规则引擎，零 LLM 调用。在答题后根据正确率、焦虑变化、错误模式
 * 判断学习者情感状态（green/yellow/red），并生成跨文化定制的干预提示。
 *
 * 使用方式：
 *   import { detectEmotionState } from "@/lib/emotion-check";
 *   const snapshot = detectEmotionState({ correctRate, rawResults, ... });
 */

// ====================== 数据结构 ======================

export interface EmotionSignals {
  frustration: number;          // 0-1 挫败感（连续错误）
  fatigue: number;              // 0-1 认知疲劳
  disengagement: number;        // 0-1 脱离（内容太简单）
  anxiety_spike: boolean;       // 焦虑突增 >= 15 分
  repeated_same_error: boolean; // 同一维度反复出错 >= 3 次
  accuracy_trend: "improving" | "stable" | "declining";
}

export interface InterventionHint {
  tier: "yellow" | "red";
  reason: string;
  learner_message: string;
  suggested_action: ActionType;
  difficulty_multiplier?: number;
}

export type ActionType =
  | "lower_difficulty"
  | "raise_difficulty"
  | "suggest_break"
  | "change_topic"
  | "encourage";

export interface EmotionSnapshot {
  state: "green" | "yellow" | "red";
  signals: EmotionSignals;
  intervention: InterventionHint | null;
}

// ====================== 阈值常量 ======================

const FRUSTRATION_YELLOW = 3;    // 连续 N 题错 → yellow
const FRUSTRATION_RED = 5;
const DISENGAGEMENT_STREAK = 8;  // 连续 N 题对 + 高正确率 → yellow
const DISENGAGEMENT_RATE = 0.9;
const ANXIETY_SPIKE_YELLOW = 15; // 焦虑突增 ≥ N → yellow
const ANXIETY_SPIKE_RED = 25;
const FATIGUE_MINUTES = 20;      // 会话超 N 分钟 + 焦虑上升 + 正确率下降 → red
const REPEATED_ERROR_YELLOW = 2; // 同一维度错误 ≥ N 次 → yellow
const REPEATED_ERROR_RED = 3;

// ====================== 工具函数 ======================

/** 计算最近连续错误数（从数组末尾往前数） */
function countConsecutiveErrors(rawResults: string[]): number {
  let count = 0;
  for (let i = rawResults.length - 1; i >= 0; i--) {
    if (rawResults[i] === "wrong") count++;
    else break;
  }
  return count;
}

/** 计算整个会话中的最长连续正确数（非仅尾部） */
function maxConsecutiveCorrect(rawResults: string[]): number {
  let maxStreak = 0;
  let current = 0;
  for (const r of rawResults) {
    if (r === "correct") {
      current++;
      if (current > maxStreak) maxStreak = current;
    } else {
      current = 0;
    }
  }
  return maxStreak;
}

/** 语言代码 → HomeCulture ID */
function langToCultureCode(lang: string): string {
  const normalized = (lang || "en").toLowerCase();
  const known = ["en", "ja", "ko", "es", "ar", "ru", "fr", "th"];
  return known.includes(normalized) ? `hc_${normalized}` : "hc_en";
}

// ====================== 跨文化干预话术 ======================

type MessageSet = Record<string, string>;

const ENCOURAGE: MessageSet = {
  hc_en: "You're making progress! Take your time with this next one — it's a bit challenging.",
  hc_ja: "よく頑張っていますね。次の問題は少し難しいかもしれませんが、ゆっくりで大丈夫です。",
  hc_ko: "잘하고 있어요! 다음 문제는 조금 어려울 수 있으니 천천히 해보세요.",
  hc_es: "¡Vas muy bien! Este siguiente es un poco más difícil, tómate tu tiempo.",
  hc_fr: "Vous progressez ! Prenez votre temps pour la suite — c'est un peu plus difficile.",
  default: "你已经做得很好了，接下来的题目稍微有点挑战，慢慢来。",
};

const LOWER_DIFFICULTY: MessageSet = {
  hc_en: "Let's step back and reinforce the basics first — you'll get there!",
  hc_ja: "基礎をしっかり固めましょう。少しずつ進めば大丈夫です。",
  hc_ko: "기초를 먼저 다지는 게 좋겠어요. 천천히 해도 괜찮아요.",
  hc_es: "Reforcemos primero lo básico — ¡poco a poco lo conseguirás!",
  hc_fr: "Revenons aux bases pour les renforcer — vous y arriverez !",
  default: "我们稍微降低难度，先巩固基础，慢慢来。",
};

const SUGGEST_BREAK: MessageSet = {
  hc_en: "You've been studying for a while. How about a 5-minute break to recharge?",
  hc_ja: "しばらく勉強していますね。5分ほど休憩してリフレッシュしませんか？",
  hc_ko: "오래 공부하셨어요. 5분 정도 쉬면서 재충전하는 게 어떨까요?",
  hc_es: "Has estado estudiando un buen rato. ¿Qué tal un descanso de 5 minutos?",
  hc_fr: "Vous étudiez depuis un moment. Et si vous preniez une pause de 5 minutes ?",
  default: "你已经学习了一段时间，要不要休息5分钟，放松一下？",
};

const RAISE_DIFFICULTY: MessageSet = {
  hc_en: "Great job! You seem ready for a bigger challenge — let's level up!",
  hc_ja: "素晴らしい！もっと難しい問題にチャレンジしてみましょう。",
  hc_ko: "잘했어요! 더 어려운 문제에 도전해볼 준비가 됐네요.",
  hc_es: "¡Excelente! Parece que estás listo para un reto mayor.",
  hc_fr: "Excellent ! Vous semblez prêt pour un plus grand défi.",
  default: "看来你已经掌握了，试试更有挑战的内容吧！",
};

function getMessage(set: MessageSet, homeCultureCode: string): string {
  return set[homeCultureCode] || set["default"] || "";
}

// ====================== 核心检测 ======================

export function detectEmotionState(params: {
  correctRate: number;
  rawResults: string[];
  anxietyBefore: number;
  anxietyAfter: number;
  dimensionScores: Record<string, number>;
  errorPatterns: Array<{ dimension: string; question_index: number; pattern: string }>;
  sessionDurationMs: number;
  homeCultureCode?: string;
}): EmotionSnapshot {
  const {
    correctRate,
    rawResults,
    anxietyBefore,
    anxietyAfter,
    dimensionScores,
    errorPatterns,
    sessionDurationMs,
  } = params;
  const hcId = params.homeCultureCode || langToCultureCode("en");

  const consecutiveErrors = countConsecutiveErrors(rawResults);
  const maxCorrectStreak = maxConsecutiveCorrect(rawResults);
  const anxietyDelta = anxietyAfter - anxietyBefore;
  const sessionMinutes = sessionDurationMs / 60_000;

  // --- 挫败感 ---
  const frustration =
    rawResults.length > 0
      ? Math.min(1, consecutiveErrors / rawResults.length)
      : 0;

  // --- 认知疲劳 ---
  const anxietyRising = anxietyDelta > 0;
  const accuracyDeclining = correctRate <= 0.5;
  const isLongSession = sessionMinutes >= FATIGUE_MINUTES;
  const fatigue =
    anxietyRising && accuracyDeclining && isLongSession ? 1 : 0;

  // --- 脱离（使用整个会话中的最长连续正确数，防止被末尾错误抹掉） ---
  const disengagement =
    maxCorrectStreak >= DISENGAGEMENT_STREAK && correctRate > DISENGAGEMENT_RATE
      ? Math.min(1, maxCorrectStreak / rawResults.length)
      : 0;

  // --- 焦虑突增 ---
  const anxietySpike = anxietyDelta >= ANXIETY_SPIKE_YELLOW;

  // --- 同类错误反复出现 ---
  const dimErrorCounts: Record<string, number> = {};
  for (const ep of errorPatterns) {
    dimErrorCounts[ep.dimension] = (dimErrorCounts[ep.dimension] || 0) + 1;
  }
  const maxDimErrors = Math.max(0, ...Object.values(dimErrorCounts));
  const repeatedSameError = maxDimErrors >= REPEATED_ERROR_RED;

  // --- 正确率趋势 ---
  const overallAccuracy =
    Object.values(dimensionScores).filter((v) => typeof v === "number").length > 0
      ? Object.values(dimensionScores)
          .filter((v) => typeof v === "number")
          .reduce((a, b) => a + b, 0) /
        Object.values(dimensionScores).filter((v) => typeof v === "number").length /
        100
      : correctRate;

  let accuracyTrend: "improving" | "stable" | "declining" = "stable";
  if (correctRate < 0.4) accuracyTrend = "declining";
  else if (correctRate > 0.8) accuracyTrend = "improving";

  const signals: EmotionSignals = {
    frustration: Math.round(frustration * 100) / 100,
    fatigue,
    disengagement: Math.round(disengagement * 100) / 100,
    anxiety_spike: anxietySpike,
    repeated_same_error: repeatedSameError,
    accuracy_trend: accuracyTrend,
  };

  // --- 信号归类 ---
  const yellowFlags: string[] = [];
  const redFlags: string[] = [];

  if (consecutiveErrors >= FRUSTRATION_RED) {
    redFlags.push("frustration");
  } else if (consecutiveErrors >= FRUSTRATION_YELLOW) {
    yellowFlags.push("frustration");
  }

  if (fatigue >= 1) redFlags.push("fatigue");

  if (disengagement > 0) yellowFlags.push("disengagement");

  if (anxietyDelta >= ANXIETY_SPIKE_RED) {
    redFlags.push("anxiety_spike");
  } else if (anxietyDelta >= ANXIETY_SPIKE_YELLOW) {
    yellowFlags.push("anxiety_spike");
  }

  if (maxDimErrors >= REPEATED_ERROR_RED) {
    redFlags.push("repeated_same_error");
  } else if (maxDimErrors >= REPEATED_ERROR_YELLOW) {
    yellowFlags.push("repeated_same_error");
  }

  // --- 综合判断 ---
  let state: "green" | "yellow" | "red" = "green";
  if (redFlags.length > 0) {
    state = "red";
  } else if (yellowFlags.length >= 1) {
    state = "yellow";
  }

  // --- 生成干预 ---
  let intervention: InterventionHint | null = null;

  if (state === "red") {
    if (redFlags.includes("fatigue")) {
      intervention = {
        tier: "red",
        reason: `认知疲劳: anxiety上升${anxietyDelta.toFixed(0)} 会话${sessionMinutes.toFixed(0)}min`,
        learner_message: getMessage(SUGGEST_BREAK, hcId),
        suggested_action: "suggest_break",
      };
    } else if (redFlags.includes("frustration") || redFlags.includes("repeated_same_error")) {
      intervention = {
        tier: "red",
        reason: `连续${consecutiveErrors}题错误, 同维度最多${maxDimErrors}次`,
        learner_message: getMessage(LOWER_DIFFICULTY, hcId),
        suggested_action: "lower_difficulty",
        difficulty_multiplier: 0.7,
      };
    } else {
      intervention = {
        tier: "red",
        reason: redFlags.join(", "),
        learner_message: getMessage(ENCOURAGE, hcId),
        suggested_action: "encourage",
      };
    }
  } else if (state === "yellow") {
    if (yellowFlags.includes("disengagement")) {
      intervention = {
        tier: "yellow",
        reason: `最长连续${maxCorrectStreak}题正确, 可能内容偏简单`,
        learner_message: getMessage(RAISE_DIFFICULTY, hcId),
        suggested_action: "raise_difficulty",
        difficulty_multiplier: 1.2,
      };
    } else {
      intervention = {
        tier: "yellow",
        reason: yellowFlags.join(", "),
        learner_message: getMessage(ENCOURAGE, hcId),
        suggested_action: "encourage",
      };
    }
  }

  return { state, signals, intervention };
}
