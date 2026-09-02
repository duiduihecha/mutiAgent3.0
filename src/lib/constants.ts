/**
 * 系统共享常量 — 单一数据源
 * 所有语言映射、场景映射、偏见检测配置集中管理
 */

// ==================== 出题配置 ====================

/** 每轮学习会话的固定练习题数量。
 *  固定值而非范围，确保情感检测引擎的阈值（连续 3/5 题错）和
 *  疲劳检测（会话时长）在一致的题目基数上运行。 */
export const EXERCISES_PER_SESSION = 5;

// ==================== Agent 配置 ====================

import { getGenerationModel } from './llm-config';

export const AGENT_CONFIGS = {
  A1_LearnerProfiler: { model: null, temperature: null },
  // T4: 消融实验要求确定性可复现，全部固定贪心解码 temperature=0.0（A5 本就是 0.0）。
  // 这同时消除了"采样随机性"对消融分数差异的干扰，使跨条件比较只反映架构变量。
  // per-agent 模型：A2~A5 各自独立 preset（generation_a2~a5），默认继承当前
  // daily/quality 档；可用 LLM_A2_MODEL...LLM_A5_MODEL 单独覆盖。
  A2_MotherTongueExplainer: { model: getGenerationModel("a2"), temperature: 0.0 },
  A3_CulturalComparator: { model: getGenerationModel("a3"), temperature: 0.0 },
  A4_ContentGenerator: { model: getGenerationModel("a4"), temperature: 0.0 },
  A5_QualityController: { model: getGenerationModel("a5"), temperature: 0.0 }
} as const;

// ==================== 语言映射 ====================

/** 中文母语名称 → ISO 639-1 语言代码 */
export const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  '英语': 'en',
  '英语圈': 'en',
  '日语': 'ja',
  '日语圈': 'ja',
  '韩语': 'ko',
  '韩语圈': 'ko',
  '西班牙语': 'es',
  '西班牙语圈': 'es',
  '阿拉伯语': 'ar',
  '阿拉伯语圈': 'ar',
  '俄语': 'ru',
  '俄语圈': 'ru',
  '法语': 'fr',
  '法语圈': 'fr',
  '泰语': 'th',
  '东南亚文化圈': 'th'
};

/** ISO 639-1 语言代码 → 自然语言名称 */
export const LANGUAGE_CODE_TO_NATURAL_NAME: Record<string, string> = {
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
  'es': 'Español',
  'ar': 'العربية',
  'ru': 'Русский',
  'fr': 'Français',
  'th': 'ภาษาไทย',
  'vi': 'Tiếng Việt',
  'id': 'Bahasa Indonesia',
  'ms': 'Bahasa Melayu'
};

/**
 * 根据中文母语名称获取语言代码，fallback 为 'en'。
 *
 * 【幂等】允许传入已是代码的值（'ja'、'ko'…）并原样返回。
 * 曾发生过双重转换 bug：learning-graph 已把「日语」转成 'ja' 传给 A2，
 * A2 又调一次本函数 → `LANGUAGE_NAME_TO_CODE['ja']` 未命中 → 静默兜底成 'en'
 * → 日/韩/西/阿等所有非英语学习者，A2 都在读英语文化圈的图谱数据。
 * 这里做幂等处理，从根上杜绝这类静默错配。
 */
export function getLanguageCode(nativeLanguage: string): string {
  if (!nativeLanguage) return 'en';
  const direct = LANGUAGE_NAME_TO_CODE[nativeLanguage];
  if (direct) return direct;
  // 已经是合法语言代码 → 原样返回（幂等）
  const asCode = nativeLanguage.toLowerCase();
  if (LANGUAGE_CODE_TO_NATURAL_NAME[asCode]) return asCode;
  return 'en';
}

/** 实验协议使用的严格版本：未知文化条件不得静默退回英语。 */
export function getLanguageCodeStrict(nativeLanguage: string): string {
  if (!nativeLanguage) throw new Error('native language/culture must not be empty');
  const direct = LANGUAGE_NAME_TO_CODE[nativeLanguage];
  if (direct) return direct;
  const asCode = nativeLanguage.toLowerCase();
  if (LANGUAGE_CODE_TO_NATURAL_NAME[asCode]) return asCode;
  throw new Error(`Unknown native language/culture condition: ${nativeLanguage}`);
}

/** 根据语言代码获取自然语言名称，fallback 返回代码本身 */
export function getLanguageNaturalName(code: string): string {
  return LANGUAGE_CODE_TO_NATURAL_NAME[code] || code;
}

// ==================== 场景映射 ====================

/** 中文关键词 → 场景类型ID */
export const SCENE_TYPE_MAP: Record<string, string> = {
  // daily - 日常社交
  '寒暄': 'daily', '问候': 'daily', '打招呼': 'daily', '称呼': 'daily', '告别': 'daily',
  '自我介绍': 'daily', '介绍他人': 'daily', '邀约': 'daily', '拒绝': 'daily', '闲聊': 'daily',
  '社交': 'daily',
  // campus - 校园生活
  '校园': 'campus', '学校': 'campus', '学习': 'campus', '课堂': 'campus', '宿舍': 'campus',
  '社团': 'campus', '老师': 'campus', '汉语拼音': 'campus',
  // food - 餐饮美食
  '饮食': 'food', '食物': 'food', '点餐': 'food', '外卖': 'food', '买单': 'food',
  '请客': 'food', '餐桌': 'food', '筷子': 'food', '合餐': 'food', '超市': 'food',
  '日常饮食': 'food', '筷子与合餐': 'food',
  // travel - 旅游出行
  '长城': 'travel', '故宫': 'travel', '旅游': 'travel', '名山大川': 'travel',
  '酒店': 'travel', '景点': 'travel', '门票': 'travel', '问路': 'travel', '指路': 'travel',
  '票务': 'travel',
  // shopping - 购物消费
  '购物': 'shopping', '砍价': 'shopping', '支付': 'shopping', '退换': 'shopping',
  '讨价还价': 'shopping',
  // transport - 交通出行
  '交通': 'transport', '交通工具': 'transport', '交通规则': 'transport', '出行': 'transport',
  '地铁': 'transport', '打车': 'transport', '购票': 'transport', '改签': 'transport',
  // medical - 医疗健康
  '身体': 'medical', '医院': 'medical', '医疗': 'medical', '健康': 'medical',
  '挂号': 'medical', '症状': 'medical', '取药': 'medical', '中医': 'medical',
  // banking - 银行金融
  '人民币': 'banking', '银行': 'banking', '金融': 'banking', '开户': 'banking',
  '转账': 'banking', '汇款': 'banking', '兑换': 'banking', '移动支付': 'banking',
  '国家概况': 'banking',
  // housing - 租房住宿
  '住房': 'housing', '室内布局': 'housing', '家': 'housing',
  '租房': 'housing', '房东': 'housing', '报修': 'housing', '邻里': 'housing',
  // entertainment - 休闲娱乐
  '游戏': 'entertainment', '儿童游戏': 'entertainment', '民歌': 'entertainment',
  'KTV': 'entertainment', '观影': 'entertainment', '影院': 'entertainment', '健身': 'entertainment',
  '追剧': 'entertainment', '休闲': 'entertainment',
  // emergency - 紧急情况
  '紧急': 'emergency', '报警': 'emergency', '警察': 'emergency', '帮助': 'emergency',
  '失物': 'emergency', '急诊': 'emergency', '灾害': 'emergency', '地震': 'emergency',
  '火灾': 'emergency',
  // family - 家庭与亲属
  '家庭': 'family', '家庭结构': 'family', '亲属': 'family', '称谓': 'family',
  '聚会': 'family', '拜年': 'family', '长辈': 'family', '红包': 'family',
  // festival - 节日与传统
  '春节': 'festival', '节日': 'festival', '过年': 'festival',
  '传统': 'festival', '庙会': 'festival', '婚丧': 'festival', '送礼': 'festival',
  // workplace - 职场办公
  '工作': 'workplace', '工作服': 'workplace', '职场': 'workplace', '办公': 'workplace',
  '会议': 'workplace', '汇报': 'workplace', '面试': 'workplace', '同事': 'workplace',
  // legacy
  'default': 'daily'
};

/** 场景ID → 知识点主题关键词数组 */
export const SCENE_TO_KP_KEYWORDS: Record<string, string[]> = {
  'daily': ['日常', '寒暄', '问候', '打招呼', '称呼', '告别'],
  'campus': ['校园', '学校', '学习', '汉语拼音', '声母', '韵母'],
  'food': ['饮食', '日常饮食', '食物', '筷子', '合餐', '超市'],
  'travel': ['长城', '故宫', '旅游', '名山大川', '出行'],
  'shopping': ['购物', '砍价', '支付'],
  'transport': ['交通', '交通工具', '交通规则', '出行'],
  'workplace': ['工作', '工作服', '职场', '办公'],
  'medical': ['身体', '医院', '医疗', '健康'],
  'banking': ['人民币', '国家概况', '银行', '金融'],
  'housing': ['住房', '室内布局', '家', '租房', '物业'],
  'entertainment': ['游戏', '儿童游戏', '民歌', '休闲', '电影', '电影院', '观影', 'KTV'],
  'emergency': ['紧急', '报警', '警察', '帮助', '急救'],
  'family': ['家庭', '家庭结构', '称呼'],
  'festival': ['春节', '节日', '过年', '传统节日']
};

/** 根据场景ID或关键词获取场景类型，fallback 为 'daily' */
export function getSceneType(knowledgePointId: string, keywords?: string[]): string {
  // 优先：从 snake_case 的 kp_id 中提取前缀作为 scene_id
  // 例如 workplace_meeting_agree → workplace, food_ordering_basic → food
  if (knowledgePointId && knowledgePointId.includes("_")) {
    const prefix = knowledgePointId.split("_")[0].toLowerCase();
    if (SCENE_TO_KP_KEYWORDS[prefix]) return prefix;
  }

  const directMatch = SCENE_TYPE_MAP[knowledgePointId.toLowerCase()];
  if (directMatch) return directMatch;

  if (keywords && keywords.length > 0) {
    for (const keyword of keywords) {
      const match = SCENE_TYPE_MAP[keyword];
      if (match) return match;
    }
  }

  return 'daily';
}

// ==================== 学习动机 → 领域亲和力 ====================

/** 学习动机 → 推荐 Domain 列表。
 *  interest/exam 为空数组，表示不做领域过滤，纯 HSK 级别驱动。 */
export const MOTIVATION_DOMAIN_AFFINITY: Record<string, string[]> = {
  tourism:       ["travel", "food", "shopping", "transport", "entertainment"],
  study_abroad:  ["campus", "daily", "housing", "banking", "food", "medical"],
  work:          ["workplace", "banking", "housing", "transport", "daily"],
  interest:      [],
  exam:          [],
};

// ==================== 偏见检测 ====================

/** θ₁ 价值中立 — 刻板印象 + 神秘化 */
export const BIAS_KEYWORDS = [
  '所有', '都', '必须', '应该', '从来不', '永远都', '一定', '必然',
  '落后', '保守', '封闭', '愚昧', '专制', '压迫', '低级', '原始',
  '像西方那样', '西方文明', '发达国家的', '文明世界',
  '神秘的东方', '古老的东方', '神秘的'
];

export const BIAS_PATTERNS = [
  /(所有|每个)([A-Za-z一-龥]+人都)/g,
  /([A-Za-z一-龥]+人都(会|能|必须|应该|从不))/g,
  /(像|跟)(西方|欧美|美国|英国)(一样|那样)/g
];

/** θ₂ 时间中止 — 进化论语汇 + 救世主话术 */
export const BIAS_KEYWORDS_TEMPORAL = [
  '原始', '低级', '初级阶段', '尚未发展', '还不够', '落后于',
  '未开化', '不开化', '野蛮', '蒙昧',
];

export const BIAS_PATTERNS_TEMPORAL = [
  // "帮助XX人学会/理解..."
  /(帮助|教会|让|使)([一-龥]{2,6})(人|民族|国家|地区).{0,10}(学会|理解|进步|文明)/g,
  // "还不够XX" / "尚未XX"
  /(还|仍|依然|尚且)(不够|不能|没有|无法|难以)/g,
  // 发展阶段的比较
  /(比|相比|相对于)([一-龥]{2,6})(更|更加|更为)(先进|发达|文明|进步)/g,
  // "初级阶段" / "尚未发展到"
  /(初级|低级|早期|原始)(阶段|水平|状态)/g,
];

/** θ₁ + θ₂ 合并检测时用的关键词（θ₁ 偏见分 + θ₂ 时间偏移） */
export const BIAS_KEYWORDS_ALL = [
  ...BIAS_KEYWORDS,
  ...BIAS_KEYWORDS_TEMPORAL,
];
