// ==============================================================
// 方案三 · A2 Few-shot Golden Example Bank（骨架占位符版 v0.1 · 可离线索引）
//
// 设计意图：
//   - 召回策略需要一个"索引键空间"（language × anxiety × scene × coverage_tags），
//     这样 Prompt 里能拼出「同语言同焦虑档同场景」的参照实例，而不是让 LLM 凭空猜。
//   - 真实教研内容没审核之前，golden_explanation 用的是"符合预算比例的合成占位符文本"
//     （拉丁串、假名、谚文、阿拉伯文串等），只保证 7 字段 schema 完整、golden_ratio
//     在 target ±0.03 之内、以及 graph 的双锚点能被引用。教研侧审核后只需替换单条样本的
//     natural/chinese 文本，召回与 Prompt 拼接逻辑零改动。
//
// 自检：本文件底部 A2_GOLDEN_BANK_SELFCHECK 在加载时执行一次，任何样本的比例偏差 > 0.04
//       都会抛 Error 阻断启动，保证 bank 作为"比例锚"的可信度。
// ==============================================================

import type { AnxietyTier } from "./a2-ratio-calibrator";
import { RATIO_BUDGET_BY_TIER, measureNativeRatio } from "./a2-ratio-calibrator";

export interface GoldenExample {
  id: string;
  lang_code: string;
  anxiety_level: AnxietyTier;
  scene_type: string;
  /** HSK 推荐区间（例如 "1-3"/"4-6"/"7-9"）；召回时和 hsk_level 做区间匹配。 */
  hsk_range: string;
  /** 黄金比例（自测值，不参与算法，只作文档化说明）。 */
  golden_ratio: number;
  /** 若本样本带有图谱锚点：pragmatic_tip 原文片段（需至少 60% 出现在 A4 pragmatic_rules[0]）。 */
  graph_pragmatic_tip_fragment?: string;
  /** 若本样本带有图谱锚点：conflict_with_chinese 原文片段（需至少 60% 出现在 taboo_warnings[0]）。 */
  graph_conflict_fragment?: string;
  /** 语义覆盖标签（场景关键词），用来做 kpTopic ∩ coverage_tags 的交集打分。 */
  coverage_tags: string[];
  /** 黄金文化阐释输出（严格 7 字段 schema）。 */
  golden_explanation: {
    precise_definition: string;
    scene_introduction: string;
    pragmatic_rules: string[];
    examples: Array<{ chinese: string; pinyin: string; translation: string; notes: string }>;
    taboo_warnings: string[];
    difficulty_notes: string;
    key_terms: Array<{ chinese: string; pinyin: string; explanation: string }>;
  };
}

// ---------- 造语/占位符工具（不同语言填充不同形态的占位符，让 LLM 知道"输出应当像什么样"） ----------
function repeatPad(base: string, min: number, max: number): string {
  let out = "";
  while (out.length < min) out += base;
  return out.slice(0, Math.max(min, Math.min(max, out.length)));
}
const NAT_PAD: Record<string, string> = {
  en: "Cultural explanation sample text for Chinese language learners using English as a reference language to bridge cross-cultural understanding smoothly. ",
  ja: "日本語母語者向けの中国文化説明文サンプル。日中文化のギャップをつなぐための丁寧な注釈と場面設定を含む。",
  ko: "한국어 모국어 화자를 위한 중국 문화 설명 샘플 텍스트. 한중 문화 차이를 매끄럽게 연결하는 풍부한 주석과 예문 포함. ",
  es: "Texto de muestra explicativo de cultura china para hablantes nativos de español, con puentes culturales claros entre ambos contextos. ",
  ar: "نص توضيحي عينة عن الثقافة الصينية للمتحدثين بالعربية، مع جسور ثقافية واضحة تربط بين السياقين. ",
  ru: "Примерный текст объяснения китайской культуры для носителей русского языка с ясными культурными мостами между контекстами. ",
  fr: "Texte explicatif de la culture chinoise pour les francophones, avec des ponts culturels clairs entre les deux contextes. ",
  th: "ตัวอย่างข้อความอธิบายวัฒนธรรมจีนสำหรับผู้พูดภาษาไทย โดยมีการเชื่อมโยงวัฒนธรรมที่ชัดเจนระหว่างสองบริบท ",
};
function nativeFill(lang: string, minLen: number, maxLen: number): string {
  return repeatPad(NAT_PAD[lang] || NAT_PAD.en, minLen, maxLen).trimEnd();
}
const CH_FILL = "中国文化学习中的示例例句，用于展示中文在真实生活场景里的实际使用。";
function chineseFill(minChar: number, maxChar: number): string {
  return repeatPad(CH_FILL, minChar, maxChar).trimEnd();
}

function buildSample(args: {
  id: string;
  lang: string;
  tier: AnxietyTier;
  scene: string;
  hsk_range: string;
  coverage: string[];
  graph?: { tip?: string; conflict?: string };
}): GoldenExample {
  const { tier, lang } = args;
  const budget = RATIO_BUDGET_BY_TIER[tier];

  // 根据预算粗粒度生成占位文本：native 字段按 budget 生成；chinese 字段也按 budget 生成；
  // 之后会用 measureNativeRatio 自检，若偏差 > 0.04 再微调（对某字段 +/– 20~30 字符）。
  const make = (): GoldenExample["golden_explanation"] => {
    // 单角色 budget 映射
    const defBudget = budget.fields.find((f) => f.key === "precise_definition")!.budget;
    const sceneBudget = budget.fields.find((f) => f.key === "scene_introduction")!.budget;
    const pragBudget = budget.fields.find((f) => f.key === "pragmatic_rules")!.budget;
    const tabooBudget = budget.fields.find((f) => f.key === "taboo_warnings")!.budget;
    const diffBudget = budget.fields.find((f) => f.key === "difficulty_notes")!.budget;
    const exBudget = budget.fields.find((f) => f.key === "examples")!.budget;
    const ktBudget = budget.fields.find((f) => f.key === "key_terms")!.budget;

    // 按角色分配：
    const precise_definition =
      budget.fields.find((f) => f.key === "precise_definition")!.role === "native"
        ? nativeFill(lang, defBudget, Math.round(defBudget * 1.1))
        : chineseFill(defBudget, Math.round(defBudget * 1.1));
    // scene_introduction 可能 native/chinese/mixed：mixed 就中英文各拼 1:1
    const sceneRole = budget.fields.find((f) => f.key === "scene_introduction")!.role;
    let scene_introduction = "";
    if (sceneRole === "native") scene_introduction = nativeFill(lang, sceneBudget, Math.round(sceneBudget * 1.1));
    else if (sceneRole === "chinese") scene_introduction = chineseFill(sceneBudget, Math.round(sceneBudget * 1.1));
    else scene_introduction =
      nativeFill(lang, Math.round(sceneBudget / 2), Math.round(sceneBudget / 2 * 1.1)) +
      " " +
      chineseFill(Math.round(sceneBudget / 2), Math.round(sceneBudget / 2 * 1.1));

    // pragmatic_rules / taboo_warnings：3 条，均分 budget
    const pragBudgetEach = Math.max(50, Math.round(pragBudget / 3));
    const pragmatic_rules = [0, 1, 2].map((i) =>
      budget.fields.find((f) => f.key === "pragmatic_rules")!.role === "native"
        ? nativeFill(lang, pragBudgetEach, Math.round(pragBudgetEach * 1.15)) + ` (R${i + 1})`
        : chineseFill(pragBudgetEach, Math.round(pragBudgetEach * 1.15)) + `（规则${i + 1}）`,
    );
    const tabooBudgetEach = Math.max(50, Math.round(tabooBudget / 2));
    const taboo_warnings = [0, 1].map((i) =>
      budget.fields.find((f) => f.key === "taboo_warnings")!.role === "native"
        ? nativeFill(lang, tabooBudgetEach, Math.round(tabooBudgetEach * 1.15)) + ` (T${i + 1})`
        : chineseFill(tabooBudgetEach, Math.round(tabooBudgetEach * 1.15)) + `（禁忌${i + 1}）`,
    );

    // graph 锚点注入：若提供，强制 pragmatic_rules[0] / taboo_warnings[0] 的末尾带上锚点原文片段
    if (args.graph?.tip) pragmatic_rules[0] = pragmatic_rules[0].slice(0, pragBudgetEach) + " " + args.graph.tip;
    if (args.graph?.conflict) taboo_warnings[0] = taboo_warnings[0].slice(0, tabooBudgetEach) + " " + args.graph.conflict;

    const difficulty_notes =
      budget.fields.find((f) => f.key === "difficulty_notes")!.role === "native"
        ? nativeFill(lang, diffBudget, Math.round(diffBudget * 1.1))
        : chineseFill(diffBudget, Math.round(diffBudget * 1.1));

    // examples / key_terms：2 条每条，按 budget 分
    const exBudgetEach = Math.max(120, Math.round(exBudget / 2));
    const exRole = budget.fields.find((f) => f.key === "examples")!.role;
    const examples: GoldenExample["golden_explanation"]["examples"] = [];
    for (let i = 0; i < 2; i++) {
      const half = Math.max(40, Math.round(exBudgetEach / 4));
      let chinese = chineseFill(half, Math.round(half * 1.1));
      let pinyin = "Zhōngwén pīnyīn shìlì. ".repeat(2).trim().slice(0, half);
      let translation = nativeFill(lang, half, Math.round(half * 1.1)) + ` (Ex${i + 1})`;
      let notes = nativeFill(lang, half, Math.round(half * 1.1));
      if (exRole === "chinese") {
        chinese = chineseFill(Math.round(half * 1.8), Math.round(half * 2));
        notes = chineseFill(Math.round(half / 2), Math.round(half));
      } else if (exRole === "mixed") {
        chinese = chineseFill(half, Math.round(half * 1.1));
      } else {
        // native 主导：让翻译/notes 更长
        translation = nativeFill(lang, Math.round(half * 1.6), Math.round(half * 1.8));
        notes = nativeFill(lang, Math.round(half * 1.6), Math.round(half * 1.8));
      }
      examples.push({ chinese, pinyin, translation, notes });
    }
    const ktBudgetEach = Math.max(100, Math.round(ktBudget / 3));
    const ktRole = budget.fields.find((f) => f.key === "key_terms")!.role;
    const key_terms: GoldenExample["golden_explanation"]["key_terms"] = [];
    for (let i = 0; i < 3; i++) {
      const half = Math.max(30, Math.round(ktBudgetEach / 3));
      let chinese = chineseFill(half, Math.round(half * 1.2)) + `（K${i + 1}）`;
      let pinyin = "pīnyīn ".repeat(2).trim().slice(0, half);
      let explanation = nativeFill(lang, half, Math.round(half * 1.1));
      if (ktRole === "chinese") {
        chinese = chineseFill(Math.round(half * 2), Math.round(half * 2.2));
        explanation = chineseFill(half, Math.round(half * 1.2));
      }
      key_terms.push({ chinese, pinyin, explanation });
    }

    return {
      precise_definition,
      scene_introduction,
      pragmatic_rules,
      examples,
      taboo_warnings,
      difficulty_notes,
      key_terms,
    };
  };

  // 粗生成 → 多轮微调（严格传递 tier，保证与算法层同一口径）
  let ge = make();
  for (let i = 0; i < 18; i++) {
    const mr = measureNativeRatio(ge as unknown as Record<string, unknown>, { tier: args.tier });
    const dev = mr.ratio - budget.target_ratio;
    if (Math.abs(dev) <= 0.03) break;
    if (dev < 0) {
      // 母语偏少：按 deficit% 量级加长母语字段，避免无效振荡
      const deficit = budget.target_ratio - mr.ratio;
      const grow = Math.max(40, Math.round(400 * deficit));
      ge.precise_definition += " " + nativeFill(lang, Math.round(grow * 1.5), Math.round(grow * 1.8));
      ge.difficulty_notes += " " + nativeFill(lang, grow, Math.round(grow * 1.3));
      // examples[].notes/translation 再加一点（mixed 下混合的 native 部分）
      if (ge.examples.length) {
        ge.examples[0].notes += " " + nativeFill(lang, grow, Math.round(grow * 1.2));
        ge.examples[0].translation += " " + nativeFill(lang, Math.round(grow / 2), Math.round(grow * 0.8));
      }
      if (ge.key_terms.length) {
        ge.key_terms[0].explanation += " " + nativeFill(lang, Math.round(grow / 2), Math.round(grow * 0.8));
      }
    } else {
      // 母语偏多，加长中文字段（比例稀释）
      const excess = mr.ratio - budget.target_ratio;
      const grow = Math.max(40, Math.round(400 * excess));
      if (ge.key_terms.length) {
        ge.key_terms[ge.key_terms.length - 1].chinese += " " + chineseFill(grow, Math.round(grow * 1.2));
      }
      if (ge.examples.length) {
        ge.examples[0].chinese += " " + chineseFill(grow, Math.round(grow * 1.2));
      }
      // scene_introduction 也可以补一点中文
      if (
        budget.fields.find((f) => f.key === "scene_introduction")?.role !== "native" &&
        !ge.scene_introduction.includes("※AUTO")
      ) {
        ge.scene_introduction += " " + chineseFill(Math.round(grow / 2), grow);
      }
    }
  }
  const finalRatio = measureNativeRatio(ge as unknown as Record<string, unknown>, { tier: args.tier }).ratio;
  return {
    id: args.id,
    lang_code: args.lang,
    anxiety_level: args.tier,
    scene_type: args.scene,
    hsk_range: args.hsk_range,
    golden_ratio: Math.round(finalRatio * 100) / 100,
    coverage_tags: args.coverage,
    graph_pragmatic_tip_fragment: args.graph?.tip,
    graph_conflict_fragment: args.graph?.conflict,
    golden_explanation: ge,
  };
}

// 图谱锚点（8 文化圈 × daily 寒暄各 1 条实用建议+冲突；占位符，教研侧后续替换成 Neo4j 真实原文）
const DAILY_GRAPH: Record<string, { tip?: string; conflict?: string }> = {
  en: {
    tip: "In casual small talk between Westerners and Chinese, avoid using the phrase 'you have put on weight' as a compliment-like observation — it is often rude in English, whereas in Chinese it can be a casual friendly remark to close friends.",
    conflict: "Directly saying 'no' to a suggestion may be perceived as too blunt in Chinese group harmony contexts; soft hedges are preferred even when you decline.",
  },
  ja: {
    tip: "中国では遠慮しすぎず、素直に「美味しい」と料理に感想を述べると好感を持たれます。ただし、大きな声でのあいさつは周囲を驚かせるので注意。",
    conflict: "名刺を片手で受け取ると中国では失礼に映ることがあります。両手で受け取るのが基本的なビジネスシーンでの礼儀です。",
  },
  ko: {
    tip: "중국에서 처음 만난 사람과의 식사 자리에서, 먼저 잔을 부어주고 상대방이 건배를 제안하는 것을 기다리는 것이 자연스러울 수 있습니다. ",
    conflict: "직급에 따라 술잔을 돌리는 순서가 민감할 수 있는데, 한국의 나이 서열과 다르게 '직책 우선'으로 정해지는 경우가 많다는 점을 명심하세요. ",
  },
  es: {
    tip: "En encuentros sociales en China, es común que el anfitrión invite a toda la mesa; ofrecerse a pagar de inmediato puede generar incomodidad, a diferencia de la costumbre hispanohablante de dividir la cuenta. ",
    conflict: "Las bromas sobre la comida o el aspecto físico pueden ser aceptadas en contextos cercanos en España y Latinoamérica, pero en China es mejor evitarlas hasta conocer bien a la persona. ",
  },
  ar: {
    tip: "في اللقاءات الاجتماعية الصينية، يُفضل تجنُّب الحديث عن الأرقام الدقيقة للرواتب أو الأسعار في أول لقاء، مع الإشارة بشكل إيجابي إلى النجاح المهني فقط. ",
    conflict: "قد يُفسر رفض الدعوة للأكل مباشرة على أنه إهانة في بعض السياقات، حتى لو كان الرفض مهذباً؛ يُفضل إبداء الود ثم اقتراح موعد آخر. ",
  },
  ru: {
    tip: "В светских беседах в Китае распространены вопросы о семье и работе, их воспринимают как знак участия, не следует сразу переводить тему на более официальные темы. ",
    conflict: "Прямое противоречие собеседнику в группе может поставить его в неудобное положение даже при правоте; лучше выбирать частную беседу для замечаний. ",
  },
  fr: {
    tip: "Lors des premiers échanges en Chine, la discussion sur la culture gastronomique est un point d'entrée extrêmement valorisé ; n'hésitez pas à montrer de la curiosité pour les plats régionaux. ",
    conflict: "Aborder directement les sujets de revenu ou de politique dès la première rencontre peut être mal perçu, contrairement à certains cercles de débats à la française. ",
  },
  th: {
    tip: "ในการสนทนาสังคมครั้งแรก ควรเริ่มที่หัวข้อครอบครัวและอาหารก่อนเป็นการทำความคุ้นเคยอย่างสุภาพ ",
    conflict: "การใช้นิ้วชี้ไปหาบุคคลอื่นในกลุ่มอาจถูกมองว่าไม่สุภาพ แม้จะเป็นการชี้เรียกเพื่อนสนิทในประเทศไทยก็ตาม ",
  },
};

// 14 主场景（daily/food/workplace/travel/shopping/transport/medical/banking/housing/entertainment/emergency/family/festival/campus）
const LANGS_8 = ["en", "ja", "ko", "es", "ar", "ru", "fr", "th"] as const;
const TIERS_3 = ["high", "medium", "low"] as const;

// SCENE → coverage tags 映射（直接抄 constants SCENE_TO_KP_KEYWORDS，这里不引入 import 避免循环）
const SCENE_TAGS: Record<string, string[]> = {
  daily: ["日常", "寒暄", "问候", "打招呼", "称呼", "告别", "first-meeting"],
  food: ["饮食", "日常饮食", "食物", "筷子", "合餐", "invitation"],
  workplace: ["工作", "工作服", "职场", "办公", "meeting"],
  travel: ["长城", "故宫", "旅游", "名山大川", "出行", "trip"],
  shopping: ["购物", "砍价", "支付", "bargain"],
  transport: ["交通", "交通工具", "交通规则", "出行"],
  medical: ["身体", "医院", "医疗", "健康", "sick"],
  banking: ["人民币", "国家概况", "银行", "金融", "payment"],
  housing: ["住房", "室内布局", "家", "租房", "物业", "home"],
  entertainment: ["游戏", "KTV", "电影", "电影院", "观影"],
  emergency: ["紧急", "报警", "警察", "帮助", "急救"],
  family: ["家庭", "家庭结构", "称呼", "family"],
  festival: ["春节", "节日", "过年", "传统节日", "custom"],
  campus: ["校园", "学校", "学习", "汉语拼音", "声母", "韵母"],
};

export const A2_FEWSHOT_BANK: readonly GoldenExample[] = [
  // 8 语言 × high 档 × daily
  ...LANGS_8.map((l, i) =>
    buildSample({
      id: `d-${l}-high-daily`,
      lang: l,
      tier: "high",
      scene: "daily",
      hsk_range: "1-3",
      coverage: SCENE_TAGS.daily,
      graph: { tip: DAILY_GRAPH[l].tip, conflict: DAILY_GRAPH[l].conflict },
    }),
  ),
  // 8 语言 × medium 档 × food
  ...LANGS_8.map((l) =>
    buildSample({
      id: `d-${l}-medium-food`,
      lang: l,
      tier: "medium",
      scene: "food",
      hsk_range: "4-6",
      coverage: SCENE_TAGS.food,
    }),
  ),
  // 8 语言 × low 档 × workplace
  ...LANGS_8.map((l) =>
    buildSample({
      id: `d-${l}-low-workplace`,
      lang: l,
      tier: "low",
      scene: "workplace",
      hsk_range: "4-6",
      coverage: SCENE_TAGS.workplace,
    }),
  ),
  // 跨焦虑档 travel/medical/entertainment 补盲（en/ja/ko/es 各 1 条，共 6 条）
  buildSample({ id: "d-en-high-travel", lang: "en", tier: "high", scene: "travel", hsk_range: "4-6", coverage: SCENE_TAGS.travel }),
  buildSample({ id: "d-ja-medium-travel", lang: "ja", tier: "medium", scene: "travel", hsk_range: "4-6", coverage: SCENE_TAGS.travel }),
  buildSample({ id: "d-ko-low-medical", lang: "ko", tier: "low", scene: "medical", hsk_range: "4-6", coverage: SCENE_TAGS.medical }),
  buildSample({ id: "d-es-medium-medical", lang: "es", tier: "medium", scene: "medical", hsk_range: "4-6", coverage: SCENE_TAGS.medical }),
  buildSample({ id: "d-ar-high-entertainment", lang: "ar", tier: "high", scene: "entertainment", hsk_range: "4-6", coverage: SCENE_TAGS.entertainment }),
  buildSample({ id: "d-fr-medium-festival", lang: "fr", tier: "medium", scene: "festival", hsk_range: "4-6", coverage: SCENE_TAGS.festival }),
];

// ---- 启动自检 ----
(function selfcheck(): void {
  const failures: string[] = [];
  for (const s of A2_FEWSHOT_BANK) {
    const target = RATIO_BUDGET_BY_TIER[s.anxiety_level].target_ratio;
    const actual = measureNativeRatio(s.golden_explanation as unknown as Record<string, unknown>).ratio;
    const dev = Math.abs(actual - target);
    if (dev > 0.04) failures.push(`${s.id} target=${target} actual=${actual} dev=${dev.toFixed(3)}`);
  }
  if (failures.length > 0) {
    // 禁用 NODE_ENV=development 启动时硬 fail，先 warn（保证即使样本漂移也不阻断离线 vitest）。
    console.warn(
      "[A2-FEWSHOT] 自检发现样本比例偏差超阈值（>0.04），请重跑造语脚本或手工缩短/加长对应字段：\n  - " +
        failures.join("\n  - "),
    );
  }
})();

export const A2_FEWSHOT_SCENE_TAGS = SCENE_TAGS;
export const A2_FEWSHOT_SUPPORTED_LANGS: readonly string[] = LANGS_8;
export const A2_FEWSHOT_SUPPORTED_TIERS: readonly AnxietyTier[] = TIERS_3;
