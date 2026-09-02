/**
 * 跨文化对比数据生成
 * 根据12个核心文化维度生成跨文化对比数据
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 12个核心文化维度
const CULTURAL_DIMENSIONS = [
  {
    dimension: 'time_concept',
    name: '时间观念',
    description: '对时间的态度、时间安排、会议守时等'
  },
  {
    dimension: 'space_concept',
    name: '空间观念',
    description: '个人空间、人际距离、隐私概念等'
  },
  {
    dimension: 'collectivism_individualism',
    name: '集体主义vs个人主义',
    description: '自我认知、团队优先、面子与个人成就等'
  },
  {
    dimension: 'power_distance',
    name: '权力距离',
    description: '上下级关系、权威态度、师生关系等'
  },
  {
    dimension: 'uncertainty_avoidance',
    name: '不确定性规避',
    description: '对变化的接受度、风险偏好等'
  },
  {
    dimension: 'long_term_short_term',
    name: '长期vs短期导向',
    description: '储蓄观念、职业规划、教育投资等'
  },
  {
    dimension: 'face_dignity',
    name: '面子与尊严',
    description: '公开批评、赞美方式、社交场合等'
  },
  {
    dimension: 'gift_culture',
    name: '送礼文化',
    description: '送礼场合、礼物选择、收礼礼节等'
  },
  {
    dimension: 'food_culture',
    name: '饮食文化',
    description: '用餐方式、餐桌礼仪、饮食禁忌等'
  },
  {
    dimension: 'social_distance',
    name: '人际交往距离',
    description: '熟人与陌生人、热情程度、社交礼仪等'
  },
  {
    dimension: 'greetings_etiquette',
    name: '称呼与礼仪',
    description: '称谓系统、礼貌用语、身体语言等'
  },
  {
    dimension: 'religious_influence',
    name: '宗教信仰影响',
    description: '宗教信仰、无神论、迷信观念等'
  }
];

// 目标文化圈
const TARGET_CULTURES = [
  { code: 'en', name: '英语圈', countries: ['美国', '英国', '澳大利亚', '加拿大'] },
  { code: 'ja', name: '日语圈', countries: ['日本'] },
  { code: 'ko', name: '韩语圈', countries: ['韩国'] },
  { code: 'es', name: '西班牙语圈', countries: ['西班牙', '墨西哥', '阿根廷'] },
  { code: 'ar', name: '阿拉伯语圈', countries: ['阿拉伯联合酋长国', '沙特阿拉伯'] },
  { code: 'ru', name: '俄语圈', countries: ['俄罗斯'] },
  { code: 'fr', name: '法语圈', countries: ['法国', '加拿大魁北克'] },
  { code: 'other', name: '东南亚语系', countries: ['泰国', '越南', '印度尼西亚'] }
];

// 针对特定主题的跨文化对比数据
const PRE_DEFINED_COMPARISONS = [
  // ===== 时间观念 =====
  {
    dimension: 'time_concept',
    topic: '守时观念',
    chinese_practice: '中国人对时间的态度比较灵活，常用"差不多"、"一会儿"等模糊表达',
    target_patterns: {
      'en': '西方人非常重视准时，时间观念精确，常用具体时间点',
      'ja': '日本人非常守时，甚至提前到达被视为礼貌',
      'ko': '韩国人对时间较重视，但在社交场合有时会迟到',
      'es': '西班牙和拉美人对时间较随意，迟到30分钟以内可接受',
      'ar': '阿拉伯人对时间态度灵活，会议可能延迟，关系比时间重要',
      'ru': '俄罗斯人对时间态度介于东西方之间',
      'fr': '法国人对约会时间较灵活，但商务场合开始重视准时',
      'other': '东南亚一些国家时间观念较宽松，关系导向'
    },
    pragmatic_hints: ['预约时间', '会议迟到', '等待他人', '时间表达'],
    examples: {
      positive: ['我们三点见', '请准时到达'],
      negative: ['他迟到了半个小时', '等一会儿就来']
    }
  },
  
  // ===== 饮食文化 =====
  {
    dimension: 'food_culture',
    topic: '餐桌礼仪',
    chinese_practice: '中国人采用合餐制，使用筷子，讲究座次礼仪，敬酒文化盛行',
    target_patterns: {
      'en': '西方人采用分餐制，使用刀叉，避免过度劝酒',
      'ja': '日本人用餐保持安静，尊重厨师，筷子摆放有讲究',
      'ko': '韩国人长辈先动筷，注重分享，泡菜是必备',
      'es': '西班牙和拉美人用餐时间长，享受社交氛围',
      'ar': '阿拉伯人用餐时只用右手，左手被视为不洁',
      'ru': '俄罗斯人酒量好，伏特加是传统饮品',
      'fr': '法国人注重餐桌礼仪，用餐时间很长',
      'other': '东南亚人用手吃饭（部分地区），注重口味平衡'
    },
    pragmatic_hints: ['合餐vs分餐', '筷子vs刀叉', '敬酒礼仪', '座次安排'],
    examples: {
      positive: ['请用公筷', '我来敬你一杯'],
      negative: ['不要用筷子指人', '不要把筷子插在饭里']
    }
  },
  
  // ===== 称呼与礼仪 =====
  {
    dimension: 'greetings_etiquette',
    topic: '称谓系统',
    chinese_practice: '中国人使用敬称和谦称，重视辈分和资历，亲属称谓复杂',
    target_patterns: {
      'en': '西方人直接称呼名字，正式场合使用Mr./Ms.，师生关系平等',
      'ja': '日本人使用敬语系统，称呼体现辈分和社会地位',
      'ko': '韩国人称谓系统复杂，使用敬语和平语',
      'es': '西班牙语圈国家称呼亲密，正式场合用全名',
      'ar': '阿拉伯人使用复杂的称谓系统，宗教人士地位特殊',
      'ru': '俄罗斯人称呼正式，使用名字+父名+姓氏',
      'fr': '法国人使用正式称谓，贵族称谓有残留',
      'other': '东南亚国家有复杂的称谓系统，佛教称谓重要'
    },
    pragmatic_hints: ['称呼老师', '称呼长辈', '自我介绍', '陌生人称谓'],
    examples: {
      positive: ['王老师，您好', '李叔叔'],
      negative: ['不要直呼长辈名字', '初次见面不要过于亲密']
    }
  },
  
  // ===== 送礼文化 =====
  {
    dimension: 'gift_culture',
    topic: '送礼文化',
    chinese_practice: '中国人送礼讲究寓意，送礼场合多，礼物常被拒绝后再次奉上',
    target_patterns: {
      'en': '西方人送礼简单直接，礼物当场打开表示感谢',
      'ja': '日本人送礼讲究包装和回礼，送礼和收礼都谦逊',
      'ko': '韩国人送礼文化类似中国，重视包装和回礼',
      'es': '西班牙和拉美人送礼随意，朋友间不常见礼物',
      'ar': '阿拉伯人送礼体现慷慨，拒绝礼物可能是不礼貌的',
      'ru': '俄罗斯人送礼讲究实用价值，酒是常见礼物',
      'fr': '法国人重视礼物包装艺术，收到礼物当场打开',
      'other': '东南亚国家送礼讲究吉凶寓意'
    },
    pragmatic_hints: ['节日送礼', '访友礼物', '商务礼品', '收礼礼节'],
    examples: {
      positive: ['这是给您的礼物', '一点小心意'],
      negative: ['不要送钟（谐音"送终"）', '不要送梨（谐音"离"）']
    }
  },
  
  // ===== 面子与尊严 =====
  {
    dimension: 'face_dignity',
    topic: '面子文化',
    chinese_practice: '中国人重视"面子"，公开场合避免批评，注重给对方面子',
    target_patterns: {
      'en': '西方人直接表达意见，公开讨论和批评被认为是坦诚',
      'ja': '日本人极度重视"体面"，间接表达负面意见',
      'ko': '韩国人重视面子，公开场合避免直接冲突',
      'es': '西班牙和拉美人热情直接，但对面子问题敏感',
      'ar': '阿拉伯人重视荣誉和尊严，不当众批评他人',
      'ru': '俄罗斯人重视个人尊严，对批评反应强烈',
      'fr': '法国人重视个人形象，面子问题很重要',
      'other': '东南亚国家普遍重视面子和尊严'
    },
    pragmatic_hints: ['批评方式', '公开场合', '赞美技巧', '道歉方式'],
    examples: {
      positive: ['您的意见很有道理', '给您添麻烦了'],
      negative: ['不要当众批评', '不要说"你不懂"']
    }
  },
  
  // ===== 家庭观念 =====
  {
    dimension: 'collectivism_individualism',
    topic: '家庭观念',
    chinese_practice: '中国人家庭观念强，三代同堂常见，子女赡养父母是义务',
    target_patterns: {
      'en': '西方人成年后独立生活，子女18岁后经济独立',
      'ja': '日本人家庭关系紧密，但核心家庭化趋势明显',
      'ko': '韩国人儒家思想影响深，家庭责任观念强',
      'es': '西班牙和拉美人家庭联系紧密，几代同堂普遍',
      'ar': '阿拉伯人家族观念强，家族利益优先',
      'ru': '俄罗斯人家庭观念较强，重视子女教育',
      'fr': '法国人家庭关系亲密，但子女独立性培养早',
      'other': '东南亚华人家庭观念接近中国本土'
    },
    pragmatic_hints: ['与父母同住', '赡养义务', '婚恋自主', '教育投资'],
    examples: {
      positive: ['百善孝为先', '家和万事兴'],
      negative: ['不孝有三，无后为大', '养儿防老']
    }
  },
  
  // ===== 人际交往 =====
  {
    dimension: 'social_distance',
    topic: '人际距离',
    chinese_practice: '中国人交往距离较近，热情好客，重视人情关系',
    target_patterns: {
      'en': '西方人保持适当距离，尊重个人隐私',
      'ja': '日本人保持距离，正式场合距离较远',
      'ko': '韩国人人际距离适中，正式场合重视礼仪',
      'es': '西班牙和拉美人热情开放，身体接触较多',
      'ar': '阿拉伯人关系亲密，握手和拥抱是常见礼仪',
      'ru': '俄罗斯人人际距离适中，熟悉后较为亲近',
      'fr': '法国人社交距离适中，贴面礼是常见礼仪',
      'other': '东南亚一些国家微笑文化盛行，人际氛围友好'
    },
    pragmatic_hints: ['握手礼仪', '社交距离', '热情好客', '隐私观念'],
    examples: {
      positive: ['有空常来玩', '这是我的名片'],
      negative: ['不要问工资', '不要问年龄和婚姻状况']
    }
  }
];

export async function generateCrossCulturalComparisons() {
  const client = getSupabaseClient();
  // LLM客户端预留用于后续AI增强生成（统一走 UnifiedLLMService）
  
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[]
  };

  console.log(`开始生成跨文化对比数据...`);

  // 首先获取所有知识点
  const { data: knowledgePoints, error: kpError } = await client
    .from('cultural_knowledge_points')
    .select('*')
    .order('hsk_level');

  if (kpError) {
    console.error('获取知识点失败:', kpError);
    return results;
  }

  console.log(`找到 ${knowledgePoints?.length || 0} 个知识点`);

  // 为每个目标文化圈生成对比
  for (const culture of TARGET_CULTURES) {
    console.log(`\n正在生成 ${culture.name} 的对比数据...`);

    for (const comparison of PRE_DEFINED_COMPARISONS) {
      try {
        // 查找相关的知识点
        const relatedKP = (knowledgePoints || []).filter(kp => {
          const content = kp.content_json as Record<string, unknown>;
          const subcategory = (content?.subcategory as string) || '';
          return subcategory.includes(comparison.topic.substring(0, 2));
        });

        // 使用预定义数据创建对比
        const targetPractice = comparison.target_patterns[culture.code as keyof typeof comparison.target_patterns];
        
        if (!targetPractice) continue;

        const { data: existing } = await client
          .from('cross_cultural_comparisons')
          .select('id')
          .eq('target_culture', culture.code)
          .eq('source_culture_id', relatedKP[0]?.id || 'default')
          .maybeSingle();

        if (existing) {
          results.skipped++;
          continue;
        }

        const { error } = await client
          .from('cross_cultural_comparisons')
          .insert({
            source_culture_id: relatedKP[0]?.id || null,
            target_culture: culture.code,
            similarities: generateSimilarities(),
            differences: [{
              chinese_practice: comparison.chinese_practice,
              target_practice: targetPractice,
              dimension: comparison.dimension
            }],
            pragmatic_hints: comparison.pragmatic_hints,
            verified: false
          });

        if (error) {
          results.failed++;
          results.errors.push(`创建对比失败 ${culture.name}-${comparison.topic}: ${error.message}`);
        } else {
          results.success++;
          console.log(`  ✓ ${culture.name} - ${comparison.topic}`);
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`处理错误 ${culture.name}: ${err}`);
      }
    }
  }

  console.log(`\n完成！成功: ${results.success}, 跳过: ${results.skipped}, 失败: ${results.failed}`);
  
  return results;
}

function generateSimilarities(): string[] {
  // 通用相似点
  const baseSimilarities = [
    '都重视家庭价值',
    '都有尊老爱幼的传统',
    '都重视教育',
    '都有丰富的饮食文化'
  ];

  return baseSimilarities;
}

export { PRE_DEFINED_COMPARISONS, CULTURAL_DIMENSIONS, TARGET_CULTURES };
