// 导师演示 · 0 等待离线极速数据包
// 生成时间：2026-08-30T07:56:31.374Z
// Host LLM API: http://127.0.0.1:5000
// 案例数量：8 个（真实 LLM 生成 8 条，内置手工兜底模板 0 条）
// 覆盖案例：日常社交 · 英语 HSK3 / 筷子文化 · 英语 HSK3 / 亲属称谓 · 英语 HSK3 / 春节红包 · 英语 HSK4 / 日常寒暄 · 日语 HSK3 / 饮食文化 · 日语 HSK3 / 职场敬语 · 日语 HSK4 / 长城故宫 · 英语 HSK5

/* eslint-disable */
// @ts-nocheck

import type { LearningData } from "@/app/learning/page";

export interface DemoMeta {
  scene: string;
  lang: string;
  hsk: number;
  label: string;
  key: string;
  generated_at: string;
  fallback_used?: boolean;
  llm_fail_reason?: string;
  source?: string;
  quality_gate?: string;
  quality_warning?: string | null;
  api_from_cache_before?: boolean;
  exercises_n?: number;
}
export interface DemoCase extends Omit<LearningData, "is_fallback"> {
  from_cache?: boolean;
  is_fallback?: boolean;
  quality_gate?: string;
  quality_warning?: string | null;
  cache_status?: string;
  cultural_explanation_obj?: unknown;
  cross_cultural_comparison_obj?: unknown;
  _demo_meta?: DemoMeta;
}

export const DEMO_CASES: Record<string, DemoCase> = {
  "daily_en_hsk3": {
  "learner": {
    "id": "3f21429a-184a-4091-9234-2f1636ec0b1b",
    "uid": "fix-8f2478d3-2e90-4352-bd43-2148c320b462",
    "native_language": "英语",
    "hsk_level": 3,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:10:21.474Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "daily_st_topic",
    "hsk_level": 3,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "daily_st_topic",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:10:21.474Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"In Chinese culture, decisions often involve family input, and helping colleagues is seen as teamwork. This contrasts with English-speaking cultures that value personal autonomy and individual task ownership.\",\"scene_introduction\":\"Imagine you finish your part of a project and see your British colleague struggling with a PPT. In China, you might say '我来帮你吧' (wǒ lái bāng nǐ ba, let me help you). But in English culture, this can feel intrusive.\",\"pragmatic_rules\":[\"You should respect the other person's personal decision-making rights, an\",\"When offering help in Chinese, use polite phrases like '需要帮忙吗？\",\"If your help is declined, respond with '好的，有需要随时找我' (hǎo de, yǒu xū yào s\"],\"examples\":[{\"chinese\":\"抱歉打扰你了，有需要随时找我。\",\"pinyin\":\"Bàoqiàn dǎrǎo nǐ le, yǒu xūyào suíshí zhǎo wǒ.\",\"translation\":\"Sorry to bother you, feel free to find me anytime if needed.\",\"notes\":\"Use this when your help is declined. It shows respect for the other person's autonomy while keeping the door open for future requests.\"},{\"chinese\":\"需要帮忙吗？\",\"pinyin\":\"Xūyào bāngmáng ma?\",\"translation\":\"Do you need help?\",\"notes\":\"Asking before helping is key in English-speaking cultures. It respects personal space and lets the other person decide.\"}],\"taboo_warnings\":[\"Chinese culture is more collective-oriented, so major decisions often involve co\",\"Avoid directly taking over a colleague's work without being asked, as it may be\"],\"difficulty_notes\":\"The biggest challenge for English speakers is understanding that in China, proactive help is often a sign of care and group harmony, not interference. Adjust your expectations and communication style accordingly.\",\"key_terms\":[{\"chinese\":\"帮忙\",\"pinyin\":\"bāngmáng\",\"explanation\":\"To help. In Chinese, offering help is common, but in English contexts, it's better to ask first.\"},{\"chinese\":\"打扰\",\"pinyin\":\"dǎrǎo\",\"explanation\":\"To disturb or bother. Used in apologies like '抱歉打扰你了' to soften an interruption.\"},{\"chinese\":\"随时\",\"pinyin\":\"suíshí\",\"explanation\":\"Anytime. Used to express availability, e.g., '随时找我' means 'find me anytime'.\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.93,\"after\":0.91,\"deviation_before\":0.43,\"deviation_after\":0.41,\"trimmed_fields\":[\"pragmatic_rules\",\"taboo_warnings\"],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"Hofstede's Cultural Dimensions - Individualism vs Collectivism (权重0.8) 与 Uncertainty Avoidance (权重0.8)\",\"chinese_perspective\":\"在中国文化中，个人重大决策（如职业、婚姻）常主动征询家人意见，体现集体导向的相互依存。职场中，主动帮同事分担任务被视为团队凝聚力的表现，也是维系人际和谐的重要方式。不确定性规避维度上，中国人倾向于通过集体协商和关系网络来降低决策风险，寻求群体共识以应对未知。\",\"target_culture_perspective\":\"In English-speaking cultures (e.g., UK, US), individuals are expected to make autonomous decisions regarding career and marriage without mandatory parental consultation. In the workplace, personal task ownership is paramount; unsolicited help is often perceived as boundary-crossing or questioning one's competence. With moderate uncertainty avoidance, English speakers prefer clear personal responsibility and explicit task boundaries to manage ambiguity, viewing self-reliance as a core professional virtue.\",\"learning_pitfall\":\"中国学习者最易将\\\"主动帮忙\\\"视为善意，却在英语文化中被误解为越界或质疑对方能力，导致关系紧张。\",\"key_terms\":[{\"chinese\":\"越界\",\"pinyin\":\"yuè jiè\",\"explanation\":\"To overstep boundaries; in cross-cultural contexts, refers to actions that intrude upon another person's personal or professional autonomy, often perceived negatively in individualistic cultures.\"},{\"chinese\":\"自主决策\",\"pinyin\":\"zì zhǔ jué cè\",\"explanation\":\"Autonomous decision-making; the right and expectation of an individual to make personal life and career choices independently, a core value in individualistic societies.\"}],\"cultural_dimension\":\"Hofstede's Cultural Dimensions - Individualism vs Collectivism (权重0.8) 与 Uncertainty Avoidance (权重0.8)\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"在中国文化中，个人重大决策（如职业、婚姻）常主动征询家人意见，体现集体导向的相互依存。职场中，主动帮同事分担任务被视为团队凝聚力的表现，也是维系人际和谐的重要方式。不确定性规避维度上，中国人倾向于通过集体协商和关系网络来降低决策风险，寻求群体共识以应对未知。\",\"target_practice\":\"In English-speaking cultures (e.g., UK, US), individuals are expected to make autonomous decisions regarding career and marriage without mandatory parental consultation. In the workplace, personal task ownership is paramount; unsolicited help is often perceived as boundary-crossing or questioning one's competence. With moderate uncertainty avoidance, English speakers prefer clear personal responsibility and explicit task boundaries to manage ambiguity, viewing self-reliance as a core professional virtue.\",\"description\":\"中国学习者最易将\\\"主动帮忙\\\"视为善意，却在英语文化中被误解为越界或质疑对方能力，导致关系紧张。\"}],\"pragmatic_hints\":[\"中国学习者最易将\\\"主动帮忙\\\"视为善意，却在英语文化中被误解为越界或质疑对方能力，导致关系紧张。\"]}",
  "learning_content": {
    "scene_title": "In Chinese culture, ",
    "cultural_background": "In Chinese culture, decisions often involve family input, and helping colleagues is seen as teamwork. This contrasts with English-speaking cultures that value personal autonomy and individual task ownership. For example, in a Chinese workplace, offering help proactively is a sign of care and group harmony. However, in English-speaking cultures, unsolicited help can feel intrusive or imply that the person is not competent. Therefore, it is important to ask before helping, using phrases like '需要帮忙吗？' (Do you need help?). If your help is declined, respond politely with '好的，有需要随时找我' (Okay, feel free to find me anytime if needed). This shows respect for the other person's autonomy while keeping the door open for future requests.",
    "core_language_points": [
      "需要帮忙吗？",
      "我来帮你吧。",
      "抱歉打扰你了。",
      "有需要随时找我。"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "你的英国同事正在做PPT，看起来很忙。你想帮他，应该怎么说？",
        "translation": "In English-speaking cultures, it's polite to ask before helping. '我来帮你吧' is a polite offer, while the other options are rude or inappropriate.",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "在中国文化中，主动帮同事分担任务通常被视为团队凝聚力的表现。",
        "translation": "In Chinese culture, proactive help is often seen as a sign of care and group harmony, not interference.",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "如果你的帮助被拒绝了，你可以说：“好的，有需要＿＿找我。”（提示：表示任何时候）",
        "translation": "The phrase '有需要随时找我' means 'feel free to find me anytime if needed', showing respect and keeping the door open.",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "你的英国同事正在做PPT，看起来很忙。你想帮他，应该怎么说？",
        "options": [
          "我来帮你吧。",
          "你做得不好。",
          "你快点做。",
          "别做了。"
        ],
        "correct_answer": "A",
        "explanation": "In English-speaking cultures, it's polite to ask before helping. '我来帮你吧' is a polite offer, while the other options are rude or inappropriate.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "判断题",
        "question": "在中国文化中，主动帮同事分担任务通常被视为团队凝聚力的表现。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "对",
        "explanation": "In Chinese culture, proactive help is often seen as a sign of care and group harmony, not interference.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "如果你的帮助被拒绝了，你可以说：“好的，有需要＿＿找我。”（提示：表示任何时候）",
        "options": [],
        "correct_answer": "随时",
        "explanation": "The phrase '有需要随时找我' means 'feel free to find me anytime if needed', showing respect and keeping the door open.",
        "dimension": "grammar"
      },
      {
        "type": "选择题",
        "question": "在英语文化中，未经请求就主动帮同事做工作，可能会被怎样理解？",
        "options": [
          "这是友好的表现。",
          "这是越界或质疑对方能力。",
          "这是团队合作。",
          "这是礼貌的行为。"
        ],
        "correct_answer": "B",
        "explanation": "In English-speaking cultures, unsolicited help can be perceived as overstepping boundaries or questioning the person's competence.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "用中文向你的英国朋友介绍：在你们文化中，如果同事很忙，你通常会怎么做？请用中文写一句话，包含“帮忙”或“问”。",
        "options": [],
        "correct_answer": "我会问：“需要帮忙吗？”",
        "explanation": "This is a reverse expression task. The learner should produce a sentence using '帮忙' or '问' to describe their own cultural practice, such as asking before helping.",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "76a1233e-21f8-4ea2-bfc9-e40b1f6a3140",
  "quality_warning": null,
  "quality_gate": "needs_review",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "daily",
    "lang": "英语",
    "hsk": 3,
    "label": "日常社交 · 英语 HSK3",
    "key": "daily_en_hsk3",
    "generated_at": "2026-08-30T16:10:21.478Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "food_en_hsk3": {
  "learner": {
    "id": "4b6e44ef-a8a1-4c08-85d1-2b2f43888821",
    "uid": "fix-1ba3de84-046e-4a92-9c7b-7d8be8d1afff",
    "native_language": "英语",
    "hsk_level": 3,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:10:52.330Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "food_manners_chopsticks",
    "hsk_level": 3,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "food_manners_chopsticks",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:10:52.330Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"Chopstick etiquette (筷子礼仪, kuàizi lǐyí) refers to the set of unspoken rules for using chopsticks at the dining table in China. It includes how to hold them, where to place them, and what actions to avoid, as these behaviors reflect respect and social awareness.\",\"scene_introduction\":\"You are invited to a family dinner in China. As you sit down, you notice the chopsticks are placed on a chopstick rest (筷架, kuàijià). During the meal, you want to stick your chopsticks upright into your rice bowl, but your Chinese friend gently stops you. This gesture is considered taboo because it resembles incense sticks burned at funerals.\",\"pragmatic_rules\":[\"When proposing a new idea to a Chinese team, first cite successful cases\",\"When using chopsticks, never stick them upright into a bowl of rice, as t\",\"Do not point at people or food with your chopsticks; instead, use them on\"],\"examples\":[{\"chinese\":\"不要把筷子插在饭里。\",\"pinyin\":\"Bú yào bǎ kuàizi chā zài fàn lǐ.\",\"translation\":\"Don't stick chopsticks into the rice.\",\"notes\":\"This is a common warning at Chinese dinner tables. The action resembles incense sticks at a funeral, so it's a major taboo.\"},{\"chinese\":\"你给中国客户推荐新的合作模式，先介绍其他同行使用后的效果数据，再讲具体方案，不要上来就说这个模式非常新颖前卫。\",\"pinyin\":\"Nǐ gěi Zhōngguó kèhù tuījiàn xīn de hézuò móshì, xiān jièshào qítā tóngháng shǐyòng hòu de xiàoguǒ shùjù, zài jiǎng jùtǐ fāng'àn, bú yào shànglái jiù shuō zhège móshì fēicháng xīnyǐng qiánwèi.\",\"translation\":\"When recommending a new cooperation model to a Chinese client, first present data on results from other peers, then explain the specific plan. Don't start by saying the model is very novel and avant-garde.\",\"notes\":\"This example illustrates the cultural preference for proven success over novelty. In China, stability and past results build trust.\"}],\"taboo_warnings\":[\"Chinese culture tends to favor stability and prefers solutions with proven exper\",\"Never use your chopsticks to tap on the bowl or plate, as this is associated with begging in traditional Chinese culture.\"],\"difficulty_notes\":\"For English speakers, the biggest challenge is understanding that chopstick etiquette is not just about table manners but reflects deep cultural value\",\"key_terms\":[{\"chinese\":\"筷子\",\"pinyin\":\"kuàizi\",\"explanation\":\"Chopsticks, the primary eating utensils in China. They come in various materials like wood, bamboo, or plastic.\"},{\"chinese\":\"礼仪\",\"pinyin\":\"lǐyí\",\"explanation\":\"Etiquette or proper manners. In this context, it refers to the social rules governing chopstick use.\"},{\"chinese\":\"插\",\"pinyin\":\"chā\",\"explanation\":\"To stick or insert. Used here to describe the forbidden action of sticking chopsticks upright into rice.\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.89,\"after\":0.86,\"deviation_before\":0.39,\"deviation_after\":0.36,\"trimmed_fields\":[\"pragmatic_rules\",\"taboo_warnings\",\"difficulty_notes\"],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"Hofstede's Cultural Dimensions (Uncertainty Avoidance) & Hall's High vs Low Context Communication\",\"chinese_perspective\":\"在中国餐桌文化中，筷子使用规则高度明确且严格（如不可插饭、不可指人），体现了高不确定性规避——通过成文或不成文的规范消除用餐中的模糊性。同时，夹菜给客人、推让等行为依赖语境理解，属典型高语境沟通，信息隐含于关系和情境中。\",\"target_culture_perspective\":\"In English-speaking cultures, dining etiquette is more flexible and rule-light; using a fork to point or switching utensils is tolerated as long as the meal proceeds. Low uncertainty avoidance means fewer rigid prescriptions—improvisation is acceptable. Communication is low-context: preferences are stated directly (e.g., \\\"I don't eat that\\\"), rather than inferred from gestures or social hierarchy.\",\"learning_pitfall\":\"学习者常将中国筷子禁忌视为\\\"绝对法律\\\"，一旦违反便过度焦虑，却忽略了其本质是低风险的社会信号——过度拘谨反而破坏了高语境下自然的人际互动。\",\"key_terms\":[{\"chinese\":\"禁忌\",\"pinyin\":\"jìn jì\",\"explanation\":\"A culturally enforced prohibition or taboo; in dining context, actions to avoid (e.g., sticking chopsticks upright in rice) that signal disrespect or bad luck.\"},{\"chinese\":\"礼让\",\"pinyin\":\"lǐ ràng\",\"explanation\":\"The act of yielding or deferring to others out of politeness; in Chinese dining, it involves offering food or the best portions to guests, a high-context gesture of respect.\"}],\"cultural_dimension\":\"Hofstede's Cultural Dimensions (Uncertainty Avoidance) & Hall's High vs Low Context Communication\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"在中国餐桌文化中，筷子使用规则高度明确且严格（如不可插饭、不可指人），体现了高不确定性规避——通过成文或不成文的规范消除用餐中的模糊性。同时，夹菜给客人、推让等行为依赖语境理解，属典型高语境沟通，信息隐含于关系和情境中。\",\"target_practice\":\"In English-speaking cultures, dining etiquette is more flexible and rule-light; using a fork to point or switching utensils is tolerated as long as the meal proceeds. Low uncertainty avoidance means fewer rigid prescriptions—improvisation is acceptable. Communication is low-context: preferences are stated directly (e.g., \\\"I don't eat that\\\"), rather than inferred from gestures or social hierarchy.\",\"description\":\"学习者常将中国筷子禁忌视为\\\"绝对法律\\\"，一旦违反便过度焦虑，却忽略了其本质是低风险的社会信号——过度拘谨反而破坏了高语境下自然的人际互动。\"}],\"pragmatic_hints\":[\"学习者常将中国筷子禁忌视为\\\"绝对法律\\\"，一旦违反便过度焦虑，却忽略了其本质是低风险的社会信号——过度拘谨反而破坏了高语境下自然的人际互动。\"]}",
  "learning_content": {
    "scene_title": "In China, chopsticks",
    "cultural_background": "In China, chopsticks are more than just eating tools; they carry deep cultural meaning. Proper chopstick etiquette (筷子礼仪, kuàizi lǐyí) shows respect and social awareness. Key rules include never sticking chopsticks upright into a bowl of rice, as this resembles incense sticks burned at funerals, and never pointing at people or food with chopsticks. These rules reflect a cultural preference for harmony and avoiding actions that might bring bad luck or offend others. Understanding these customs helps you navigate Chinese dining situations with confidence and respect.",
    "core_language_points": [
      "不要把筷子插在饭里。",
      "不要用筷子指着别人。",
      "把筷子放在筷架上。"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "在中国吃饭时，下面哪个做法是不对的？",
        "translation": "Sticking chopsticks upright in rice is taboo in China because it resembles incense at funerals. The other options are acceptable.",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "在中国，用筷子指着别人是不礼貌的。",
        "translation": "Pointing at people with chopsticks is considered rude in Chinese dining etiquette.",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "服务员，这个菜＿＿？我想先看看价格。（问价格）",
        "translation": "The context '我想先看看价格' indicates asking for the price, so '多少钱' is the correct phrase.",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "在中国吃饭时，下面哪个做法是不对的？",
        "options": [
          "把筷子放在筷架上",
          "把筷子插在饭里",
          "用筷子夹菜",
          "把筷子放在碗旁边"
        ],
        "correct_answer": "B",
        "explanation": "Sticking chopsticks upright in rice is taboo in China because it resembles incense at funerals. The other options are acceptable.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "判断题",
        "question": "在中国，用筷子指着别人是不礼貌的。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "对",
        "explanation": "Pointing at people with chopsticks is considered rude in Chinese dining etiquette.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "服务员，这个菜＿＿？我想先看看价格。（问价格）",
        "options": [],
        "correct_answer": "多少钱",
        "explanation": "The context '我想先看看价格' indicates asking for the price, so '多少钱' is the correct phrase.",
        "dimension": "grammar"
      },
      {
        "type": "选择题",
        "question": "下面哪句话是告诉朋友不要做某事？",
        "options": [
          "不要把筷子插在饭里。",
          "把筷子放在筷架上。",
          "请给我一双筷子。",
          "筷子很好吃。"
        ],
        "correct_answer": "A",
        "explanation": "Option A uses '不要' to express prohibition, meaning 'Don't stick chopsticks into the rice.' The others are not prohibitions.",
        "dimension": "grammar"
      },
      {
        "type": "填空题",
        "question": "用中文告诉你的朋友：在你们国家，吃饭时用叉子指着人通常是可以的，但在中国，用筷子指着人是不礼貌的。请写出中文句子：＿＿＿＿＿＿。",
        "options": [],
        "correct_answer": "在我们国家，用叉子指着人可以，但在中国，用筷子指着人不礼貌。",
        "explanation": "This is a reverse expression task. The learner should produce a sentence comparing the two cultures, using the given structure.",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "3c1f161f-8f58-431b-8573-65f198ac35e0",
  "quality_warning": "质量提示：a4_solver:1 道题 Solver 盲解不一致",
  "quality_gate": "rejected",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "food",
    "lang": "英语",
    "hsk": 3,
    "label": "筷子文化 · 英语 HSK3",
    "key": "food_en_hsk3",
    "generated_at": "2026-08-30T16:10:52.335Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "family_en_hsk3": {
  "learner": {
    "id": "f75965e9-161f-4089-a371-b4b9b309d47e",
    "uid": "fix-6561cba0-2085-4de5-871c-ba28e52f6fed",
    "native_language": "英语",
    "hsk_level": 3,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:11:24.007Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "family_kinship_social",
    "hsk_level": 3,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "family_kinship_social",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:11:24.007Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"Family kinship terms in Chinese (亲属称谓 qīnshǔ chēngwèi) are specific labels for relatives that encode age, paternal/maternal side, and generation. Unlike English's broad terms like 'uncle' or 'cousin', Chinese uses distinct words, reflecting the importance of hierarchy and family structure in Chinese culture.\",\"scene_introduction\":\"When meeting a Chinese friend's family for the first time, you'll hear specific terms like 叔叔 (shūshu, father's younger brother) and 阿姨 (āyí, aunt). For example, your friend might say: 这是我叔叔 (Zhè shì wǒ shūshu, This is my uncle). Using the correct term shows respect and understanding of family roles.\",\"pragmatic_rules\":[\"When communicating with English speakers, express your true thoughts dire\",\"Use 叔叔 (shūshu) for father's younger brother and 伯伯 (bóbo) for father's o\",\"For your own family, you can use general terms like 爸爸 (bàba, dad) and 妈妈\"],\"examples\":[{\"chinese\":\"这是我叔叔。\",\"pinyin\":\"Zhè shì wǒ shūshu.\",\"translation\":\"This is my uncle (father's younger brother).\",\"notes\":\"In Chinese, 'uncle' is not generic; 叔叔 specifically means father's younger brother. Using the precise term shows you respect the family structure.\"},{\"chinese\":\"她是我阿姨。\",\"pinyin\":\"Tā shì wǒ āyí.\",\"translation\":\"She is my aunt (mother's sister).\",\"notes\":\"阿姨 can also be used for unrelated older women as a polite address, similar to 'ma'am' in English.\"}],\"taboo_warnings\":[\"与中国高语境沟通习惯冲突，中国人习惯用委婉暗示传递拒绝、不满等负面信息，常默认对方能读懂未明说的潜台词。\",\"Avoid using the wrong kinship term for older relatives, as it may be seen as disrespectful. When unsure, ask politely: 请问怎么称呼？\"],\"difficulty_notes\":\"The biggest challenge for English speakers is that Chinese kinship terms are more specific than English. For example, 'cousin' has eight different Chi\",\"key_terms\":[{\"chinese\":\"叔叔\",\"pinyin\":\"shūshu\",\"explanation\":\"Father's younger brother; also used as a polite term for unrelated middle-aged men.\"},{\"chinese\":\"阿姨\",\"pinyin\":\"āyí\",\"explanation\":\"Mother's sister; also used for unrelated older women as a respectful address.\"},{\"chinese\":\"伯伯\",\"pinyin\":\"bóbo\",\"explanation\":\"Father's older brother; a more formal term than 叔叔.\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.93,\"after\":0.91,\"deviation_before\":0.43,\"deviation_after\":0.41,\"trimmed_fields\":[\"pragmatic_rules\",\"taboo_warnings\",\"difficulty_notes\"],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"Hall's High vs Low Context Communication; Custom_TCSL Face and Dignity Concern\",\"chinese_perspective\":\"在中国，家庭亲属关系延伸至社会交往，形成以“自己人”为核心的差序格局。沟通依赖高语境，重面子，负面信息常以委婉暗示传递，默认对方能解读潜台词，以维护双方颜面与关系和谐。\",\"target_culture_perspective\":\"In English-speaking cultures, social interactions are typically low-context and direct. Communication is explicit, with clear verbal statements of intent, and refusal is expressed plainly (e.g., \\\"No\\\"). Face is maintained through individual dignity and honesty, not through implied messages or unspoken expectations.\",\"learning_pitfall\":\"学习者易将中文的委婉拒绝（如“我们尽量协调”）直译为英语，导致英语母语者误判为同意，引发合作误解。\",\"key_terms\":[{\"chinese\":\"自己人\",\"pinyin\":\"zìjǐ rén\",\"explanation\":\"In-group members (family, close friends) treated with high trust and implicit understanding, contrasting with out-group 'outsiders'.\"},{\"chinese\":\"委婉\",\"pinyin\":\"wěiwǎn\",\"explanation\":\"Euphemistic or indirect expression used to soften negative messages and preserve face in high-context communication.\"}],\"cultural_dimension\":\"Hall's High vs Low Context Communication; Custom_TCSL Face and Dignity Concern\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"在中国，家庭亲属关系延伸至社会交往，形成以“自己人”为核心的差序格局。沟通依赖高语境，重面子，负面信息常以委婉暗示传递，默认对方能解读潜台词，以维护双方颜面与关系和谐。\",\"target_practice\":\"In English-speaking cultures, social interactions are typically low-context and direct. Communication is explicit, with clear verbal statements of intent, and refusal is expressed plainly (e.g., \\\"No\\\"). Face is maintained through individual dignity and honesty, not through implied messages or unspoken expectations.\",\"description\":\"学习者易将中文的委婉拒绝（如“我们尽量协调”）直译为英语，导致英语母语者误判为同意，引发合作误解。\"}],\"pragmatic_hints\":[\"学习者易将中文的委婉拒绝（如“我们尽量协调”）直译为英语，导致英语母语者误判为同意，引发合作误解。\"]}",
  "learning_content": {
    "scene_title": "In Chinese, family k",
    "cultural_background": "In Chinese, family kinship terms are very specific. Unlike English, where 'uncle' can mean many different people, Chinese has separate words for each relative based on age and which side of the family they come from. For example, 叔叔 (shūshu) means father's younger brother, while 伯伯 (bóbo) means father's older brother. Using the correct term shows respect and understanding of family roles. When meeting a Chinese friend's family, it is polite to use these specific terms. If you are not sure what to call someone, you can ask politely: 请问怎么称呼？(Qǐngwèn zěnme chēnghu?) This helps avoid mistakes and shows that you care about their culture.",
    "core_language_points": [
      "这是我叔叔。",
      "她是我阿姨。",
      "请问怎么称呼？"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "你朋友的爸爸的弟弟，你应该叫他什么？",
        "translation": "In Chinese, 叔叔 (shūshu) specifically means father's younger brother. 伯伯 (bóbo) is father's older brother, 阿姨 (āyí) is aunt, and 妈妈 (māma) is mother.",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "在中文里，'uncle' 可以翻译成很多词。下面哪个词是“爸爸的哥哥”？",
        "translation": "伯伯 (bóbo) means father's older brother. 叔叔 (shūshu) is father's younger brother, 阿姨 (āyí) is aunt, and 哥哥 (gēge) is older brother.",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "在中国，你可以用“阿姨”来称呼不认识的中年女性。",
        "translation": "Yes, 阿姨 (āyí) can be used as a polite term for unrelated middle-aged women, similar to 'ma'am' in English.",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "你朋友的爸爸的弟弟，你应该叫他什么？",
        "options": [
          "叔叔",
          "阿姨",
          "伯伯",
          "妈妈"
        ],
        "correct_answer": "A",
        "explanation": "In Chinese, 叔叔 (shūshu) specifically means father's younger brother. 伯伯 (bóbo) is father's older brother, 阿姨 (āyí) is aunt, and 妈妈 (māma) is mother.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "在中文里，'uncle' 可以翻译成很多词。下面哪个词是“爸爸的哥哥”？",
        "options": [
          "叔叔",
          "伯伯",
          "阿姨",
          "哥哥"
        ],
        "correct_answer": "B",
        "explanation": "伯伯 (bóbo) means father's older brother. 叔叔 (shūshu) is father's younger brother, 阿姨 (āyí) is aunt, and 哥哥 (gēge) is older brother.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "判断题",
        "question": "在中国，你可以用“阿姨”来称呼不认识的中年女性。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "对",
        "explanation": "Yes, 阿姨 (āyí) can be used as a polite term for unrelated middle-aged women, similar to 'ma'am' in English.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "当你不知道应该怎么称呼对方时，你可以问：请问怎么＿＿？",
        "options": [],
        "correct_answer": "称呼",
        "explanation": "The phrase 请问怎么称呼？(Qǐngwèn zěnme chēnghu?) means 'May I ask how to address you?' It is a polite way to ask for the correct term.",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "用中文向你的朋友介绍：在英语文化中，人们通常怎么称呼爸爸的弟弟？",
        "options": [
          "也叫“叔叔”",
          "也叫“uncle”",
          "也叫“伯伯”",
          "也叫“哥哥”"
        ],
        "correct_answer": "B",
        "explanation": "In English, both father's younger brother and older brother are called 'uncle'. There is no specific term for each. This is a reverse expression question to help you describe your own culture in Chinese.",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "0616e50a-c481-425a-8406-8237bf0bfc22",
  "quality_warning": null,
  "quality_gate": "passed",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "family",
    "lang": "英语",
    "hsk": 3,
    "label": "亲属称谓 · 英语 HSK3",
    "key": "family_en_hsk3",
    "generated_at": "2026-08-30T16:11:24.011Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "festival_en_hsk4": {
  "learner": {
    "id": "40297bdc-939a-4406-8aeb-76732c16bbd9",
    "uid": "fix-b1b63fcc-5569-4867-92cd-980c87c26291",
    "native_language": "英语",
    "hsk_level": 4,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:11:55.168Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "family_newyear_hongbao",
    "hsk_level": 4,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "family_newyear_hongbao",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:11:55.168Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"Hongbao (红包, red envelope) is a gift of money in a red envelope, given during Chinese New Year and other celebrations. It symbolizes good luck and blessings, and the act of giving is governed by reciprocity norms.\",\"scene_introduction\":\"During Chinese New Year, married adults give hongbao to children and unmarried young people. For example, a married colleague might say: 新年快乐，给你红包！(Xīnnián kuàilè, gěi nǐ hóngbāo! - Happy New Year, here's a red envelope for you!) The recipient usually thanks them and may decline politely at first.\",\"pragmatic_rules\":[\"Give hongbao in even amounts, avoiding the number 4, which sounds like 'death' (sì).\",\"Use new, crisp bills; old or wrinkled money is considered unlucky.\",\"When receiving, accept with both hands and thank the giver; it's polite to initially decline before accepting.\"],\"examples\":[{\"chinese\":\"你搬家中国同事来帮你忙活了一天，你不要转钱给他，过两天请他吃顿饭，说‘上次搬家多亏你帮忙，今天我请客你想吃什么随便点’。\",\"pinyin\":\"Nǐ bānjiā Zhōngguó tóngshì lái bāng nǐ máng huó le yī tiān, nǐ bùyào zhuǎn qián gěi tā, guò liǎng tiān qǐng tā chī dùn fàn, shuō 'Shàng cì bānjiā duōkuī nǐ bāngmáng, jīntiān wǒ qǐngkè, nǐ xiǎng chī shénme suíbiàn diǎn'.\",\"translation\":\"When you move, a Chinese colleague helps you all day. Don't transfer money to him; a couple of days later, treat him to a meal and say, 'Last time, thanks to your help with the move. Today, I'm treating; order whatever you like.'\",\"notes\":\"This example illustrates the Chinese reciprocity norm: repaying a favor with a meal or gift, not direct payment, which would be seen as transactional and impersonal.\"},{\"chinese\":\"新年快乐，给你红包！\",\"pinyin\":\"Xīnnián kuàilè, gěi nǐ hóngbāo!\",\"translation\":\"Happy New Year, here's a red envelope for you!\",\"notes\":\"Said by married adults to children or unmarried younger people during Chinese New Year. The amount is symbolic, often 8, 6, or 9, for luck.\"}],\"taboo_warnings\":[\"中国是人情文化，互相帮忙、送礼还礼是维持关系的核心，人情账要记在心里，对方帮了忙下次一定要找机会还回去。\",\"Never give hongbao with the number 4, as it sounds like 'death' (sì). Also, avoi\"],\"difficulty_notes\":\"For English speakers, the biggest challenge is understanding that hongbao is not a payment but a symbolic gesture of goodwill. The reciprocity norm means you should reciprocate, but not immediately or with equal monetary value.\",\"key_terms\":[{\"chinese\":\"红包\",\"pinyin\":\"hóngbāo\",\"explanation\":\"Red envelope with money, given on special occasions like New Year, weddings, and birthdays. Symbolizes luck and blessings.\"},{\"chinese\":\"人情\",\"pinyin\":\"rénqíng\",\"explanation\":\"Favor or human relationship; the social debt created by receiving help or gifts. In Chinese culture, it's important to repay rénqíng to maintain harmony.\"},{\"chinese\":\"还礼\",\"pinyin\":\"huánlǐ\",\"explanation\":\"To return a gift or favor. This is a key practice in maintaining reciprocal relationships in Chinese culture.\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.83,\"after\":0.83,\"deviation_before\":0.33,\"deviation_after\":0.33,\"trimmed_fields\":[\"taboo_warnings\"],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"Custom_TCSL框架：互惠与人情规范 (Reciprocity Norm / Renqing) 与 面子与尊严 (Face and Dignity Concern)\",\"chinese_perspective\":\"在中国文化中，春节红包（压岁钱）是典型的互惠与人情实践。长辈给晚辈红包，传递祝福与关爱，同时隐含“养育与期望”的回报义务；平辈或亲友间互赠红包则构成人情账，需在日后以同等或更高价值回礼，以维护双方“面子”。红包金额讲究吉利数字（如8、6），避免单数，体现对受赠者尊严的尊重。底层逻辑是关系网络的长期维系与情感-资源交换的平衡。\",\"target_culture_perspective\":\"In English-speaking cultures, gift-giving during festive seasons (e.g., Christmas) is more expressive than reciprocal. Gifts are given to convey affection or gratitude, without an explicit expectation of equivalent return. Monetary gifts (e.g., checks) are acceptable but often framed as practical; the relationship is maintained through verbal appreciation rather than a mental ledger of debts. Reciprocity is typically immediate and explicit (e.g., \\\"thank you\\\" notes), and the concept of \\\"owing\\\" someone is minimized to preserve individual autonomy and dignity.\",\"learning_pitfall\":\"学习者容易将红包视为“有偿劳动报酬”或“债务”，直接计算金额并试图立即等值返还，从而忽略其作为情感纽带和面子维护的象征意义，导致关系疏远。\",\"key_terms\":[{\"chinese\":\"压岁钱\",\"pinyin\":\"yā suì qián\",\"explanation\":\"Money given to children during Chinese New Year, symbolizing warding off evil spirits and conveying blessings; it is a form of intergenerational care, not a payment.\"},{\"chinese\":\"人情\",\"pinyin\":\"rén qíng\",\"explanation\":\"A social debt or favor that must be reciprocated to maintain harmony and face in relationships; it is a core mechanism of Chinese social exchange.\"}],\"cultural_dimension\":\"Custom_TCSL框架：互惠与人情规范 (Reciprocity Norm / Renqing) 与 面子与尊严 (Face and Dignity Concern)\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"在中国文化中，春节红包（压岁钱）是典型的互惠与人情实践。长辈给晚辈红包，传递祝福与关爱，同时隐含“养育与期望”的回报义务；平辈或亲友间互赠红包则构成人情账，需在日后以同等或更高价值回礼，以维护双方“面子”。红包金额讲究吉利数字（如8、6），避免单数，体现对受赠者尊严的尊重。底层逻辑是关系网络的长期维系与情感-资源交换的平衡。\",\"target_practice\":\"In English-speaking cultures, gift-giving during festive seasons (e.g., Christmas) is more expressive than reciprocal. Gifts are given to convey affection or gratitude, without an explicit expectation of equivalent return. Monetary gifts (e.g., checks) are acceptable but often framed as practical; the relationship is maintained through verbal appreciation rather than a mental ledger of debts. Reciprocity is typically immediate and explicit (e.g., \\\"thank you\\\" notes), and the concept of \\\"owing\\\" someone is minimized to preserve individual autonomy and dignity.\",\"description\":\"学习者容易将红包视为“有偿劳动报酬”或“债务”，直接计算金额并试图立即等值返还，从而忽略其作为情感纽带和面子维护的象征意义，导致关系疏远。\"}],\"pragmatic_hints\":[\"学习者容易将红包视为“有偿劳动报酬”或“债务”，直接计算金额并试图立即等值返还，从而忽略其作为情感纽带和面子维护的象征意义，导致关系疏远。\"]}",
  "learning_content": {
    "scene_title": "In China, the red en",
    "cultural_background": "In China, the red envelope (红包, hóngbāo) is a traditional gift of money given during Chinese New Year and other celebrations such as weddings or birthdays. It symbolizes good luck, blessings, and the giver's care. The act of giving and receiving follows important social rules: the amount should be an even number, avoiding 4 (which sounds like 'death'), and new, crisp bills are preferred. When receiving, it is polite to accept with both hands and to thank the giver, sometimes after a polite initial refusal. The exchange is part of a broader system of reciprocity (人情, rénqíng), where favors and gifts create social bonds that are remembered and returned over time.",
    "core_language_points": [
      "红包",
      "压岁钱",
      "人情",
      "吉利",
      "回礼"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "在中国，春节时长辈给晚辈红包，主要表示什么？",
        "translation": "红包象征祝福和关爱，不是工资或还人情。",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "给红包时，应该避免哪个数字？",
        "translation": "数字4听起来像'死'，不吉利，所以避免。",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "在中国，收到红包时，应该用双手接，并说谢谢。",
        "translation": "用双手接和说谢谢是礼貌的做法。",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "在中国，春节时长辈给晚辈红包，主要表示什么？",
        "options": [
          "付工资",
          "祝福和关爱",
          "还人情",
          "买礼物"
        ],
        "correct_answer": "B",
        "explanation": "红包象征祝福和关爱，不是工资或还人情。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "给红包时，应该避免哪个数字？",
        "options": [
          "6",
          "8",
          "4",
          "9"
        ],
        "correct_answer": "C",
        "explanation": "数字4听起来像'死'，不吉利，所以避免。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "判断题",
        "question": "在中国，收到红包时，应该用双手接，并说谢谢。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "对",
        "explanation": "用双手接和说谢谢是礼貌的做法。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "在中国，朋友帮你搬家，你最好不要直接给钱，可以过两天请他吃顿饭，说：'上次搬家多亏你帮忙，今天我请客，你想吃什么随便点。' 这种互相帮助、以后找机会还的做法，叫做＿＿。（提示：两个字的词，意思是社会债务或人情）",
        "options": [],
        "correct_answer": "人情",
        "explanation": "人情指社会债务或人情，需要日后回报。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "用中文向你的朋友介绍，在英语文化中，圣诞节送礼通常更注重什么？",
        "options": [
          "表达感情",
          "还人情",
          "避免数字4",
          "用双手接"
        ],
        "correct_answer": "A",
        "explanation": "英语文化中送礼更注重表达感情，而不是还人情。",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "49a76e78-7253-4e86-a436-3128df9993be",
  "quality_warning": null,
  "quality_gate": "needs_review",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "family",
    "lang": "英语",
    "hsk": 4,
    "label": "春节红包 · 英语 HSK4",
    "key": "festival_en_hsk4",
    "generated_at": "2026-08-30T16:11:55.171Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "daily_jp_hsk3": {
  "learner": {
    "id": "023cbf02-000f-4286-bf15-ff24e3989ad9",
    "uid": "fix-e7796c09-f488-4f7d-a46d-5164ea1b4301",
    "native_language": "日语",
    "hsk_level": 3,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:12:30.206Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "daily_intro_self",
    "hsk_level": 3,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "daily_intro_self",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:12:30.206Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"自我介绍（zìwǒ jièshào）は、中国で初対面の人と知り合う際に、自分の名前・出身・仕事などを伝える基本的なコミュニケーション行為です。日本語の「自己紹介」とほぼ同じですが、中国ではより簡潔で、相手に好印象を与えるための「謙虚さ」と「自信」のバランスが重視されます。\",\"scene_introduction\":\"中国の職場や学校で初めて会う人に自己紹介する場面を想像してください。例えば、新しいプロジェクトの初回ミーティングで、あなたは「大家好，我叫田中，来自日本，请多关照。」（Dàjiā hǎo, wǒ jiào Tiánzhōng, láizì Rìběn, qǐng duō guānzhào.）と言います。日本語の「よろしくお願いします」に当たる「请多关照」は、中国でも丁寧な印象を与える便利な表現です。\",\"pragmatic_rules\":[\"你应该在和日语圈同事共事时，汇报工作先提团队成果再讲个人付出，避免在公开场合单独突出自己的功绩抢了集体的风头。\",\"中国では、自己紹介の後に相手の名前を復唱して覚えていることを示すと、親しみやすさが伝わります。例えば、「田中さんですね、よろしくお願いします」のように。\",\"初対面では、年齢や家族構成などプライベートな質問は避け、仕事や出身地など共通の話題を見つけるのが無難です。\"],\"examples\":[{\"chinese\":\"大家好，我叫田中，来自日本，请多关照。\",\"pinyin\":\"Dàjiā hǎo, wǒ jiào Tiánzhōng, láizì Rìběn, qǐng duō guānzhào.\",\"translation\":\"皆さん、こんにちは。田中と申します。日本から来ました。よろしくお願いします。\",\"notes\":\"中国のフォーマルな場での自己紹介の基本形。日本語の「よろしくお願いします」に相当する「请多关照」は、相手に好印象を与える定番表現です。\"},{\"chinese\":\"在东京的跨国项目复盘会上，日本团队负责人佐藤说'本次成果是全体成员共同努力的结果'，你不要接'我负责的模块贡献最大'，应说'非常感谢大家的配合'。\",\"pinyin\":\"Zài Dōngjīng de kuàguó xiàngmù fùpán huì shàng, Rìběn tuánduì fùzérén Zuǒténg shuō 'běncì chéngguǒ shì quántǐ chéngyuán gòngtóng nǔlì de jiéguǒ', nǐ búyào jiē 'wǒ fùzé de mókuài gòngxiàn zuìdà', yīng shuō 'fēicháng gǎnxiè dàjiā de pèihé'.\",\"translation\":\"東京の国際プロジェクト振り返り会議で、日本側チームリーダーの佐藤氏が「今回の成果は全員の共同努力の結果です」と言ったら、「私が担当したモジュールの貢献が一番大きい」と返さず、「皆さんのご協力に感謝します」と言うべきです。\",\"notes\":\"この例は、日本の集団主義文化と中国の個人実績を重視する傾向の違いを示しています。中国では個人の貢献を強調しても問題ない場面がありますが、日本の文脈ではチーム全体の功績として捉えるのが適切です。\"}],\"taboo_warnings\":[\"与中国兼顾集体与个人的习惯冲突——中国允许员工主动争取个人表彰，个人表现突出可单独获得晋升，无需特意谦让团队其他成员。\",\"中国では、目上の人や初対面の相手に「さん」付けのような敬称を使う習慣がなく、基本的に「姓＋職位」で呼びます。例えば「王经理（王マネージャー）」のように。間違えて「王さん」と呼ぶと失礼にあたる場合があるので注意しましょう。\"],\"difficulty_notes\":\"日本語母語話者にとって最大の難点は、中国の自己紹介における「謙虚さ」と「自信」のバランスです。日本では謙遜が美徳とされますが、中国では適度な自己主張が求められます。また、中国語の「请多关照」は日本語の「よろしくお願いします」と似ていますが、使用頻度やニュアンスが異なるため、場面に応じた使い分けが必要です。\",\"key_terms\":[{\"chinese\":\"自我介绍\",\"pinyin\":\"zìwǒ jièshào\",\"explanation\":\"自己紹介。中国では初対面の場で必ずと言っていいほど行われる基本的なコミュニケーション行為です。\"},{\"chinese\":\"请多关照\",\"pinyin\":\"qǐng duō guānzhào\",\"explanation\":\"「よろしくお願いします」に相当する表現。自己紹介の最後に添えると丁寧な印象を与えます。\"},{\"chinese\":\"团队\",\"pinyin\":\"tuánduì\",\"explanation\":\"チーム。中国の職場では「团队精神（チームワーク）」が重視され、自己紹介でも自分の所属チームを紹介することがあります。\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.39,\"after\":0.37,\"deviation_before\":0.11,\"deviation_after\":0.13,\"trimmed_fields\":[\"pragmatic_rules\",\"taboo_warnings\"],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"霍夫斯泰德文化维度理论（个人主义/集体主义维度）与面子与尊严理论（Custom_TCSL）\",\"chinese_perspective\":\"在中国文化中，日常自我介绍（daily_intro_self）常兼顾集体归属与个人成就。个人主义维度上，中国介于个体与集体之间，个体在强调团队身份（如单位、籍贯）的同时，也允许适度突出个人能力与贡献，以维护“面子”并争取晋升机会，无需过度谦让。\",\"target_culture_perspective\":\"日本語文化圏では、自己紹介は集団の一員としての立場を優先します。個人の成果や能力を前面に出すことは「和を乱す」行為と見なされ、面子を損なう恐れがあります。そのため、所属チームや会社の成果を先に述べ、個人の貢献は控えめに表現するのが礼儀とされます。\",\"learning_pitfall\":\"学習者は、日本語圏の自己紹介で個人の功績を強調すると「出しゃばり」と見なされ、集団の信頼を失うリスクがある一方、中国式の自己主張をそのまま適用してしまうことです。\",\"key_terms\":[{\"chinese\":\"集体主义\",\"pinyin\":\"jítǐ zhǔyì\",\"explanation\":\"集団主義。個人より集団の利益や調和を優先する価値観。日本語圏では「和」を重んじる行動規範として現れる。\"},{\"chinese\":\"面子\",\"pinyin\":\"miànzi\",\"explanation\":\"メンツ。社会的な評価や尊厳を指す。中国では個人の面子を保つために成果を主張することが許容されるが、日本語圏では集団の面子を優先し、個人の面子を控えることが求められる。\"}],\"cultural_dimension\":\"霍夫斯泰德文化维度理论（个人主义/集体主义维度）与面子与尊严理论（Custom_TCSL）\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"在中国文化中，日常自我介绍（daily_intro_self）常兼顾集体归属与个人成就。个人主义维度上，中国介于个体与集体之间，个体在强调团队身份（如单位、籍贯）的同时，也允许适度突出个人能力与贡献，以维护“面子”并争取晋升机会，无需过度谦让。\",\"target_practice\":\"日本語文化圏では、自己紹介は集団の一員としての立場を優先します。個人の成果や能力を前面に出すことは「和を乱す」行為と見なされ、面子を損なう恐れがあります。そのため、所属チームや会社の成果を先に述べ、個人の貢献は控えめに表現するのが礼儀とされます。\",\"description\":\"学習者は、日本語圏の自己紹介で個人の功績を強調すると「出しゃばり」と見なされ、集団の信頼を失うリスクがある一方、中国式の自己主張をそのまま適用してしまうことです。\"}],\"pragmatic_hints\":[\"学習者は、日本語圏の自己紹介で個人の功績を強調すると「出しゃばり」と見なされ、集団の信頼を失うリスクがある一方、中国式の自己主張をそのまま適用してしまうことです。\"]}",
  "learning_content": {
    "scene_title": "中国では、初対面の場で自己紹介（zìwǒ",
    "cultural_background": "中国では、初対面の場で自己紹介（zìwǒ jièshào）をする際、名前・出身・仕事などを簡潔に伝えることが基本です。日本語の「自己紹介」と似ていますが、中国では「謙虚さ」と「自信」のバランスが重視され、適度に自己主張をすることが好印象につながります。また、相手の名前を復唱して覚えていることを示すと親しみやすさが伝わります。目上の人には「さん」ではなく「姓＋職位」（例：王经理）で呼ぶのが一般的です。",
    "core_language_points": [
      "大家好，我叫田中，来自日本，请多关照。",
      "请多关照",
      "王经理",
      "非常感谢大家的配合"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "在中国，初次见面时，你应该怎么称呼一位姓王的经理？",
        "translation": "中国では目上の人や初対面の相手には「姓＋職位」で呼ぶのが一般的です。「王さん」は日本語の習慣で、中国では失礼にあたる場合があります。",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "在日本的团队会议上，当领导说“这次成果是全体成员共同努力的结果”时，你应该怎么说？",
        "translation": "日本では集団の成果を重視するため、個人の功績を強調せず、チーム全体への感謝を述べるのが適切です。",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "在中国，自我介绍时，你可以说：“大家好，我＿＿田中，来自日本。”（提示：用“叫”或“是”）",
        "translation": "自己紹介で名前を言うときは「我叫～」が一般的です。「我是」も使えますが、ここでは「叫」が自然です。",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "在中国，初次见面时，你应该怎么称呼一位姓王的经理？",
        "options": [
          "王さん",
          "王经理",
          "经理王",
          "王先生"
        ],
        "correct_answer": "B",
        "explanation": "中国では目上の人や初対面の相手には「姓＋職位」で呼ぶのが一般的です。「王さん」は日本語の習慣で、中国では失礼にあたる場合があります。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "在日本的团队会议上，当领导说“这次成果是全体成员共同努力的结果”时，你应该怎么说？",
        "options": [
          "我负责的模块贡献最大",
          "非常感谢大家的配合",
          "这是我的功劳",
          "大家做得不好"
        ],
        "correct_answer": "B",
        "explanation": "日本では集団の成果を重視するため、個人の功績を強調せず、チーム全体への感謝を述べるのが適切です。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "在中国，自我介绍时，你可以说：“大家好，我＿＿田中，来自日本。”（提示：用“叫”或“是”）",
        "options": [],
        "correct_answer": "叫",
        "explanation": "自己紹介で名前を言うときは「我叫～」が一般的です。「我是」も使えますが、ここでは「叫」が自然です。",
        "dimension": "grammar"
      },
      {
        "type": "判断题",
        "question": "在中国，自我介绍时，应该尽量谦虚，不要提到自己的工作成绩。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "错",
        "explanation": "中国では適度な自己主張が求められ、個人の成果を述べることは許容されます。過度な謙遜はかえって印象を悪くすることがあります。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "用中文向你的日本朋友介绍，在日本文化中，自我介绍时通常怎样提到自己的公司或团队？",
        "options": [
          "先说自己个人的成绩",
          "先说自己公司的名字和团队",
          "不说公司和团队",
          "只说自己的名字"
        ],
        "correct_answer": "B",
        "explanation": "日本では自己紹介の際、所属する会社やチームを先に述べ、個人の成果は控えめにします。これは集団主義の文化を反映しています。",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "832bf0ba-1db4-42e2-9d03-22f6c1fc40fc",
  "quality_warning": null,
  "quality_gate": "needs_review",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "daily",
    "lang": "日语",
    "hsk": 3,
    "label": "日常寒暄 · 日语 HSK3",
    "key": "daily_jp_hsk3",
    "generated_at": "2026-08-30T16:12:30.215Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "food_jp_hsk3": {
  "learner": {
    "id": "8b15cf4b-6df3-49d4-bb78-4f1715fdd8d2",
    "uid": "fix-07197bf3-9e17-40f9-8371-59609a4242c9",
    "native_language": "日语",
    "hsk_level": 3,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:13:03.297Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "food_treat_invite",
    "hsk_level": 3,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "food_treat_invite",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:13:03.297Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"「请客」は、中国で食事やお茶などを自分がおごる行為を指し、親しさや敬意を示す大切な習慣です。日本語の「おごる」に似ていますが、中国ではより頻繁に、そして相手への重視の気持ちを込めて行われます。\",\"scene_introduction\":\"同僚や友人と昼食に行ったとき、中国の人はよく「我请你吃饭吧」(wǒ qǐng nǐ chīfàn ba) と言います。これは「ご飯をおごるよ」という意味で、親しさの表現です。\",\"pragmatic_rules\":[\"中国では、食事のとき「我请你」(wǒ qǐng nǐ) と言っておごる申し出をすることがよくあります。これは親しさや好意の表現なので、遠慮せずに受け取るのが自然です。\",\"おごってもらったら、次は自分がおごり返すのが中国の習慣です。ただし、相手が年上や目上の場合は、無理に払おうとせず、感謝の気持ちを伝えることが大切です。\",\"給日本同事或者客户送礼，不要送太贵的礼物，选价格适中的实用小礼物就可以，避免让对方觉得有还礼的压力。\"],\"examples\":[{\"chinese\":\"我请你吃饭吧。\",\"pinyin\":\"Wǒ qǐng nǐ chīfàn ba.\",\"translation\":\"ご飯をおごるよ。\",\"notes\":\"親しい友人や同僚に使う自然な誘い文句です。中国ではこの言葉を聞いたら、遠慮しすぎずに「好啊」(hǎo a) と喜んで受けるのが良いとされています。\"},{\"chinese\":\"这次我来付钱。\",\"pinyin\":\"Zhè cì wǒ lái fù qián.\",\"translation\":\"今回は私が払うよ。\",\"notes\":\"レストランで会計のときに使う表現です。中国では、おごる側が積極的に払うことで好意を示します。\"}],\"taboo_warnings\":[\"中国人情往来常送超过对方价值的礼物表示重视，日方收到重礼会觉得有很大心理负担，不知道该怎么还人情。そのため、中国の習慣に従って高価な贈り物をすると、日本人の相手に負担をかけてしまうことがあります。\",\"中国では、おごる側が「我来付钱」と言ったら、あまり激しく争わずに一度は遠慮しつつも、最終的には受け入れるのがスマートです。ただし、目上の人に対しては、おごってもらうことが失礼になる場合もあるので注意が必要です。\"],\"difficulty_notes\":\"日本語では「おごる」は比較的軽い意味合いですが、中国の「请客」はもっと重い「義理」や「関係性」を含みます。そのため、おごる・おごられる関係を軽く考えすぎると、相手に失礼になることがあります。\",\"key_terms\":[{\"chinese\":\"请客\",\"pinyin\":\"qǐngkè\",\"explanation\":\"人を招いて食事などをおごること。日本語の「おごる」に近いが、中国ではよりフォーマルな場面でも使われ、関係を築く重要な行為です。\"},{\"chinese\":\"付钱\",\"pinyin\":\"fù qián\",\"explanation\":\"お金を払うこと。レストランで「我来付钱」と言えば、自分が払うという意思表示になります。\"},{\"chinese\":\"人情\",\"pinyin\":\"rénqíng\",\"explanation\":\"人間関係における義理や情け。中国では「人情」を大切にすることが重視され、おごることもその一環です。\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.5,\"after\":0.5,\"deviation_before\":0,\"deviation_after\":0,\"trimmed_fields\":[],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"采用霍夫斯泰德文化维度理论中的个人主义/集体主义维度，并结合互惠与人情规范（Renqing）及面子与尊严（Face）的跨文化比较框架。\",\"chinese_perspective\":\"在中国文化中，请客吃饭是建立和维系人际关系（关系）的核心手段。其底层逻辑是“礼尚往来”的互惠规范，通过主动付出（如宴请、送礼）来积累人情债，并以此表达对对方的重视和尊重（给面子）。在集体主义导向下，这种互动往往超出实际价值，以彰显慷慨和诚意，从而巩固社会网络。\",\"target_culture_perspective\":\"日本文化同样重视互惠（お返し），但遵循严格的“等价交换”原则。收到他人款待或礼物后，必须尽快以价值相当的物品或行为回报，以避免形成心理负担（負い目）。在集体主义背景下，过度厚重的馈赠会被视为失礼，因为它打破了平衡，让对方陷入“欠人情”的焦虑中。因此，日式请客送礼更注重形式恰当与心意，而非价值高低。\",\"learning_pitfall\":\"学习者最容易犯的误区是：在中国式“热情”的驱动下，为表达感谢而赠送贵重礼物或过度宴请，结果反而让日本对方感到沉重的心理压力，甚至因无法对等回报而疏远关系。\",\"key_terms\":[{\"chinese\":\"人情\",\"pinyin\":\"rénqíng\",\"explanation\":\"人間関係における互恵的な恩義や義理のネットワーク。中国社会では、贈与や援助を通じて「人情」を蓄積し、将来の関係維持に活用する重要な社会的資源である。\"},{\"chinese\":\"面子\",\"pinyin\":\"miànzi\",\"explanation\":\"社会的な評価や尊厳を指す概念。中国では、他人に「面子」を与える（例：豪華な接待）ことが関係構築に不可欠であり、失うと関係が損なわれる。\"}],\"cultural_dimension\":\"采用霍夫斯泰德文化维度理论中的个人主义/集体主义维度，并结合互惠与人情规范（Renqing）及面子与尊严（Face）的跨文化比较框架。\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"在中国文化中，请客吃饭是建立和维系人际关系（关系）的核心手段。其底层逻辑是“礼尚往来”的互惠规范，通过主动付出（如宴请、送礼）来积累人情债，并以此表达对对方的重视和尊重（给面子）。在集体主义导向下，这种互动往往超出实际价值，以彰显慷慨和诚意，从而巩固社会网络。\",\"target_practice\":\"日本文化同样重视互惠（お返し），但遵循严格的“等价交换”原则。收到他人款待或礼物后，必须尽快以价值相当的物品或行为回报，以避免形成心理负担（負い目）。在集体主义背景下，过度厚重的馈赠会被视为失礼，因为它打破了平衡，让对方陷入“欠人情”的焦虑中。因此，日式请客送礼更注重形式恰当与心意，而非价值高低。\",\"description\":\"学习者最容易犯的误区是：在中国式“热情”的驱动下，为表达感谢而赠送贵重礼物或过度宴请，结果反而让日本对方感到沉重的心理压力，甚至因无法对等回报而疏远关系。\"}],\"pragmatic_hints\":[\"学习者最容易犯的误区是：在中国式“热情”的驱动下，为表达感谢而赠送贵重礼物或过度宴请，结果反而让日本对方感到沉重的心理压力，甚至因无法对等回报而疏远关系。\"]}",
  "learning_content": {
    "scene_title": "「请客」は、中国で食事やお茶などを自分が",
    "cultural_background": "「请客」は、中国で食事やお茶などを自分がおごる行為を指し、親しさや敬意を示す大切な習慣です。日本語の「おごる」に似ていますが、中国ではより頻繁に、そして相手への重視の気持ちを込めて行われます。同僚や友人と昼食に行ったとき、中国の人はよく「我请你吃饭吧」と言います。これは「ご飯をおごるよ」という意味で、親しさの表現です。おごってもらったら、次は自分がおごり返すのが中国の習慣です。ただし、相手が年上や目上の場合は、無理に払おうとせず、感謝の気持ちを伝えることが大切です。",
    "core_language_points": [
      "我请你吃饭吧。",
      "这次我来付钱。",
      "谢谢你的请客。",
      "下次我请你。"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "朋友说“我请你吃饭吧”，你应该怎么说？",
        "translation": "中国では、おごりの申し出を受けるときは「好啊，谢谢你！」と喜んで受けるのが自然です。他の選択肢は失礼または不自然です。",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "在中国，朋友请你吃饭后，你应该怎么做？",
        "translation": "中国では、おごってもらったら次は自分がおごり返すのが習慣です。",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "在餐厅，你想付钱，可以说：“这次我来＿＿。”（提示：付钱）",
        "translation": "「付钱」は「お金を払う」という意味で、「这次我来付钱」は「今回は私が払うよ」という表現です。",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "朋友说“我请你吃饭吧”，你应该怎么说？",
        "options": [
          "好啊，谢谢你！",
          "不行，我不去。",
          "你请我，我不高兴。",
          "我请你，你付钱。"
        ],
        "correct_answer": "A",
        "explanation": "中国では、おごりの申し出を受けるときは「好啊，谢谢你！」と喜んで受けるのが自然です。他の選択肢は失礼または不自然です。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "在中国，朋友请你吃饭后，你应该怎么做？",
        "options": [
          "什么都不用做。",
          "下次也请他吃饭。",
          "马上给他很多钱。",
          "以后不和他一起吃饭。"
        ],
        "correct_answer": "B",
        "explanation": "中国では、おごってもらったら次は自分がおごり返すのが習慣です。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "在餐厅，你想付钱，可以说：“这次我来＿＿。”（提示：付钱）",
        "options": [],
        "correct_answer": "付钱",
        "explanation": "「付钱」は「お金を払う」という意味で、「这次我来付钱」は「今回は私が払うよ」という表現です。",
        "dimension": "grammar"
      },
      {
        "type": "判断题",
        "question": "在中国，朋友请你吃饭，你应该马上送他一个很贵的礼物。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "错",
        "explanation": "中国では、おごり返しは「次にご飯をおごる」などで行うのが一般的で、高価な贈り物をすぐに送ることは期待されていません。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "选择题",
        "question": "用中文向你的日本朋友介绍，在日本，如果别人请你吃饭，你通常会怎么做？",
        "options": [
          "马上送很贵的礼物。",
          "下次请对方吃饭，或者送价值差不多的礼物。",
          "什么都不用做。",
          "以后不和他一起吃饭。"
        ],
        "correct_answer": "B",
        "explanation": "日本では、おごってもらったら、次に相手をおごるか、価値が同等の贈り物をして返すのが一般的です。",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "6b16c015-9c6a-46a2-b346-15521aab916e",
  "quality_warning": "质量提示：a4_solver:1 道题 Solver 盲解不一致",
  "quality_gate": "rejected",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "food",
    "lang": "日语",
    "hsk": 3,
    "label": "饮食文化 · 日语 HSK3",
    "key": "food_jp_hsk3",
    "generated_at": "2026-08-30T16:13:03.299Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "workplace_jp_hsk4": {
  "learner": {
    "id": "51dfd703-121a-49d6-885f-18ce2cfdea06",
    "uid": "fix-6537e90a-0731-4f5e-ae2e-3577df7cd71f",
    "native_language": "日语",
    "hsk_level": 4,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T16:13:41.421Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "workplace_meeting_speak",
    "hsk_level": 4,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "workplace_meeting_speak",
        "examples": [],
        "objectives": ""
      }
    },
    "created_at": "2026-08-30T16:13:41.421Z"
  },
  "cultural_explanation": "{\"precise_definition\":\"会議での発言ルール（huìyì shàng de fāyán guīzé）は、中国の職場で上司や同僚と意見を交換する際の暗黙のマナーです。日本語圏の絶対服従とは異なり、中国では「情理（qínglǐ、人情と道理）」を重視し、場面や関係性に応じて発言の仕方を柔軟に変えます。\",\"scene_introduction\":\"中国のプロジェクト会議で、あなたは日本の協力会社の担当者と一緒に参加しています。中国側の上司が提案したスケジュールに無理があると感じた場面を想像してください。日本語圏では上司の前で反対意見を言うのは難しいですが、中国では「私下（sīxià、内々に）」ではなく、会議中でも「委婉（wěiwǎn、遠回しに）」に意見を言うことがあります。例えば、\\n「王总，这个时间是不是有点紧？我们是不是可以再商量一下？」\\n（王社長、このスケジュールは少し厳しいでしょうか？もう一度相談できませんか？）\",\"pragmatic_rules\":[\"和日本同事交流时，不要直接催促对方上级的决策问题，若要提不同意见先找对应层级的对接人沟通，不要越级反馈。\",\"中国では、会議中に「我觉得（wǒ juéde、私は思う）」を使って自分の意見を述べるのは普通ですが、上司の決定を完全に否定するのは避けます。\",\"意見を言う時は、まず相手の立場を認めてから「不过（búguò、ただし）」で提案すると、角が立ちません。\"],\"examples\":[{\"chinese\":\"你和日本合作方的基层员工对接项目，发现他们部门经理的方案有疏漏，不要直接当着员工的面指出来，可单独和对方经理私下沟通。\",\"pinyin\":\"Nǐ hé Rìběn hézuòfāng de jīcéng yuángōng duìjiē xiàngmù, fāxiàn tāmen bùmén jīnglǐ de fāng'àn yǒu shūlòu, búyào zhíjiē dāngzhe yuángōng de miàn zhǐ chūlái, kě dāndú hé duìfāng jīnglǐ sīxià gōutōng.\",\"translation\":\"あなたは日本の協力会社の現場社員とプロジェクトを進めていて、彼らの部長の案に不備を見つけた場合、社員の前で直接指摘せず、部長と個別に内々に話し合うべきです。\",\"notes\":\"日本語圏の厳格な階層意識を反映した例です。中国では「私下沟通（sīxià gōutōng、内々に話し合う）」が円滑な関係維持に有効です。\"},{\"chinese\":\"会上，小李先肯定了大家的努力，然后说：“不过，我觉得这个方案可以再优化一下。”\",\"pinyin\":\"Huì shàng, Xiǎo Lǐ xiān kěndìng le dàjiā de nǔlì, ránhòu shuō: “Búguò, wǒ juéde zhège fāng'àn kěyǐ zài yōuhuà yíxià.”\",\"translation\":\"会議で、李さんはまず皆の努力を認め、それから「ただ、この案はもう少し改善できると思います」と言いました。\",\"notes\":\"「先肯定、后建议（xiān kěndìng, hòu jiànyì、まず肯定してから提案する）」は中国の会議でよく使われるテクニックです。\"}],\"taboo_warnings\":[\"中国虽也看重等级但更倾向情理弹性，若上级有误下属可私下委婉提建议，日语圈的绝对服从模式易让中方觉得过于僵化缺乏主动性。\",\"会議中に上司の決定を「絶対に間違っている」と断言するのはタブーです。「我觉得」や「是不是」を使って柔らかく表現しましょう。\"],\"difficulty_notes\":\"日本語母語者にとって最大の難関は、中国の「情理（qínglǐ）」の概念です。日本語圏の「建前（たてまえ）」と似ていますが、中国ではより直接的に意見を言うことが期待される場面もあります。場面に応じた使い分けを学ぶ必要があります。\",\"key_terms\":[{\"chinese\":\"委婉\",\"pinyin\":\"wěiwǎn\",\"explanation\":\"遠回しで角の立たない言い方。日本語の「婉曲（えんきょく）」に近いが、中国ではより頻繁に使われる。\"},{\"chinese\":\"私下\",\"pinyin\":\"sīxià\",\"explanation\":\"内々に、公の場を避けて。日本語の「内々（ないない）」に相当するが、中国では重要なビジネスマナーとして機能する。\"},{\"chinese\":\"越级\",\"pinyin\":\"yuèjí\",\"explanation\":\"中間の階層を飛ばして上位に直接報告・相談すること。日本語圏でも避けられるが、中国では特に「越级汇报（yuèjí huìbào）」はタブーとされる。\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.36,\"after\":0.36,\"deviation_before\":0.14,\"deviation_after\":0.14,\"trimmed_fields\":[],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"霍夫斯泰德文化维度理论（权力距离）与爱德华·霍尔高低语境文化理论\",\"chinese_perspective\":\"中国职场会议中，权力距离虽高但具弹性。下级通常不公开反驳上级，但可在会后或私下以委婉方式提出异议，强调“给面子”与情理兼顾。沟通偏向中高语境，依赖言外之意与关系亲疏，会议发言常留有余地，避免直接冲突。\",\"target_culture_perspective\":\"日本の職場会議では、権力距離が極めて高く、発言は階層順に厳格に制御される。部下は上司の決定に異議を唱えることはまずなく、会議中の自発的発言も控えめである。また、高文脈文化のため、明確な反対意見よりも「空気を読む」ことが重視され、沈黙や曖昧な表現が意思表示となる。\",\"learning_pitfall\":\"最も陥りやすい誤解は、日本の同僚の沈黙や曖昧な返答を「同意」と解釈し、実際には反対や懸念が表明されていないことに気づかず、後日になって方針変更や遅延が発生することである。\",\"key_terms\":[{\"chinese\":\"给面子\",\"pinyin\":\"gěi miànzi\",\"explanation\":\"相手の尊厳や立場を尊重し、公の場での批判や否定を避ける中国式コミュニケーションの核心概念。会議では直接的な反論を控え、間接的に配慮を示すことを指す。\"},{\"chinese\":\"空気を読む\",\"pinyin\":\"kōngqì wò dú\",\"explanation\":\"（日本語由来の概念）場の雰囲気や暗黙の了解を察知し、明示的な発言を避けて行動する日本的コミュニケーション様式。中国の「给面子」と類似するが、より集団的・状況依存的である。\"}],\"cultural_dimension\":\"霍夫斯泰德文化维度理论（权力距离）与爱德华·霍尔高低语境文化理论\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"中国职场会议中，权力距离虽高但具弹性。下级通常不公开反驳上级，但可在会后或私下以委婉方式提出异议，强调“给面子”与情理兼顾。沟通偏向中高语境，依赖言外之意与关系亲疏，会议发言常留有余地，避免直接冲突。\",\"target_practice\":\"日本の職場会議では、権力距離が極めて高く、発言は階層順に厳格に制御される。部下は上司の決定に異議を唱えることはまずなく、会議中の自発的発言も控えめである。また、高文脈文化のため、明確な反対意見よりも「空気を読む」ことが重視され、沈黙や曖昧な表現が意思表示となる。\",\"description\":\"最も陥りやすい誤解は、日本の同僚の沈黙や曖昧な返答を「同意」と解釈し、実際には反対や懸念が表明されていないことに気づかず、後日になって方針変更や遅延が発生することである。\"}],\"pragmatic_hints\":[\"最も陥りやすい誤解は、日本の同僚の沈黙や曖昧な返答を「同意」と解釈し、実際には反対や懸念が表明されていないことに気づかず、後日になって方針変更や遅延が発生することである。\"]}",
  "learning_content": {
    "scene_title": "中国の職場会議では、上司の前でも「委婉（",
    "cultural_background": "中国の職場会議では、上司の前でも「委婉（wěiwǎn）」な言い方で意見を述べることがあります。これは「情理（qínglǐ）」、つまり人情と道理を重んじる考え方に基づいています。日本語圏の厳格な上下関係とは異なり、中国では場面や関係性に応じて発言の仕方を柔軟に変えます。例えば、上司の提案に無理がある場合、「王总，这个时间是不是有点紧？」のように「是不是」を使って遠回しに疑問を呈します。また、会議中に直接反対するのではなく、後で「私下（sīxià）」に話し合うことも一般的です。このような間接的な表現は、相手の「面子（miànzi）」を保つために重要です。",
    "core_language_points": [
      "是不是有点……？",
      "我觉得……",
      "不过……",
      "私下沟通"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "会上，王总说：“这个项目下个月完成。”你觉得时间不够，想委婉地提出意见，下面哪种说法最合适？",
        "translation": "Aは「是不是」を使って遠回しに疑問を呈し、上司の面子を保ちながら意見を述べる適切な表現です。BとCは直接的に否定しており、タブーとされます。Dは意見を述べていないため不適切です。",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "在中国职场会议中，如果不同意上司的意见，可以直接说“你错了”。",
        "translation": "中国では上司の決定を直接否定することはタブーであり、「我觉得」や「是不是」を使って婉曲に表現するのが一般的です。",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "会上，小李先肯定了大家的努力，然后说：“＿＿，我觉得这个方案可以再优化一下。”（提示：表示转折的词）",
        "translation": "「不过」は「ただし」という意味で、まず肯定してから提案する際に使われます。",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "会上，王总说：“这个项目下个月完成。”你觉得时间不够，想委婉地提出意见，下面哪种说法最合适？",
        "options": [
          "王总，这个时间是不是有点紧？我们是不是可以再商量一下？",
          "王总，你错了，这个时间不够。",
          "王总，这个时间太紧了，必须改。",
          "王总，我觉得这个时间没问题。"
        ],
        "correct_answer": "A",
        "explanation": "Aは「是不是」を使って遠回しに疑問を呈し、上司の面子を保ちながら意見を述べる適切な表現です。BとCは直接的に否定しており、タブーとされます。Dは意見を述べていないため不適切です。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "判断题",
        "question": "在中国职场会议中，如果不同意上司的意见，可以直接说“你错了”。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "错",
        "explanation": "中国では上司の決定を直接否定することはタブーであり、「我觉得」や「是不是」を使って婉曲に表現するのが一般的です。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "会上，小李先肯定了大家的努力，然后说：“＿＿，我觉得这个方案可以再优化一下。”（提示：表示转折的词）",
        "options": [],
        "correct_answer": "不过",
        "explanation": "「不过」は「ただし」という意味で、まず肯定してから提案する際に使われます。",
        "dimension": "grammar"
      },
      {
        "type": "选择题",
        "question": "你发现日本合作方的部门经理的方案有疏漏，但对方基层员工在场。按照中国职场习惯，你应该怎么做？",
        "options": [
          "当着员工的面直接指出问题。",
          "会后单独和部门经理私下沟通。",
          "不提出任何意见。",
          "直接向对方的上司报告。"
        ],
        "correct_answer": "B",
        "explanation": "中国では「私下沟通」が重要で、相手の面子を保つために公の場での指摘を避けます。Aは失礼、Cは問題解決にならない、Dは越級にあたるため不適切です。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "用中文向你的日本朋友介绍：在日本文化中，开会时如果不同意上司的意见，通常会怎么做？（提示：用「空気を読む」对应的中文表达，或描述沉默、暧昧等行为）",
        "options": [],
        "correct_answer": "在日本，开会时如果不同意上司的意见，通常会保持沉默，或者用暧昧的说法，比如“再考虑一下”。",
        "explanation": "这是一个开放性问题，但答案应体现日本文化中避免直接反对、重视氛围的特点。",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "learning_record_id": "0038af71-77df-4364-9d45-b3a5ade013d7",
  "quality_warning": null,
  "quality_gate": "needs_review",
  "from_cache": false,
  "is_fallback": false,
  "_demo_meta": {
    "scene": "workplace",
    "lang": "日语",
    "hsk": 4,
    "label": "职场敬语 · 日语 HSK4",
    "key": "workplace_jp_hsk4",
    "generated_at": "2026-08-30T16:13:41.425Z",
    "regen_note": "修复：补全 cultural_explanation/cross_cultural_comparison/learning_record_id",
    "api_from_cache_before": false,
    "exercises_n": 5,
    "source": "LLM"
  }
},
  "travel_en_hsk5": {
  "learner": {
    "id": "314a9089-1011-4efa-a617-52de4e49757d",
    "uid": "learner_1788104012835",
    "native_language": "英语",
    "hsk_level": 5,
    "learning_motivation": "interest",
    "cultural_anxiety_score": 50,
    "ability_vector": [
      50,
      50,
      50,
      50,
      50
    ],
    "created_at": "2026-08-30T15:34:14.487Z",
    "updated_at": null
  },
  "knowledge_point": {
    "id": "673156ec-53c1-41c1-8284-41a267354407",
    "hsk_level": 5,
    "layer": 1,
    "language_binding_points": [],
    "content_json": {
      "zh": {
        "topic": "长城",
        "examples": [
          "长城很长，有一万多里。",
          "山海关是长城的起点。"
        ],
        "objectives": "了解长城的位置和特点，理解长城的价值",
        "cultural_points": [
          "长城",
          "山海关",
          "八达岭"
        ]
      },
      "category": "traditional_culture",
      "subcategory": "cultural_heritage",
      "language_bindings": [
        "长城",
        "山海关",
        "八达岭",
        "万里长城"
      ]
    },
    "created_at": "2026-08-30T15:34:14.487Z"
  },
  "learning_record_id": "9323e585-159e-4f8d-9540-f63f36bbb3bc",
  "cultural_explanation": "{\"precise_definition\":\"The Great Wall (长城, Chángchéng) is a series of fortifications built across northern China to protect against invasions. Key sections include 山海关 (Shānhǎiguān), the eastern starting point, and 八达岭 (Bād\",\"scene_introduction\":\"Imagine you're planning a trip to Beijing with an English-speaking friend. You suggest visiting 八达岭 (Bādálǐng), the most accessible section of the Great Wall. Your friend asks, 'Is it worth it?' You reply, '当然值得，不到长城非好汉！' (Dāngrán zhídé, bú dào Chángchéng fēi hǎohàn! - Of course it's worth it; you're not a true hero until you've climbed the Wall!) This saying reflects the cultural pride and challenge associated with the Wall.\",\"pragmatic_rules\":[\"When discussing the Great Wall with English speakers, be direct about pra\",\"Use the phrase 不到长城非好汉 (bú dào Chángchéng fēi hǎohàn) to express determin\",\"When talking about the Wall's history, avoid exaggerating claims like 'vi\"],\"examples\":[{\"chinese\":\"我们打算去八达岭长城，听说那里风景很好。\",\"pinyin\":\"Wǒmen dǎsuàn qù Bādálǐng Chángchéng, tīngshuō nàlǐ fēngjǐng hěn hǎo.\",\"translation\":\"We plan to go to the Badaling section of the Great Wall; I heard the scenery there is beautiful.\",\"notes\":\"This is a common way to share travel plans. '八达岭' is the most popular section, so mentioning it shows you know practical details.\"},{\"chinese\":\"山海关是长城的起点，被称为'天下第一关'。\",\"pinyin\":\"Shānhǎiguān shì Chángchéng de qǐdiǎn, bèi chēngwéi 'Tiānxià Dìyī Guān'.\",\"translation\":\"Shanhaiguan is the starting point of the Great Wall, known as 'The First Pass Under Heaven.'\",\"notes\":\"This example highlights a key cultural point. '天下第一关' (Tiānxià Dìyī Guān) is a title that reflects the pass's historical importance.\"}],\"taboo_warnings\":[\"与中国高语境沟通习惯冲突，中国人习惯用委婉暗示传递拒绝、不满等负面信息，常默认对方能读懂未明说的潜台词。\",\"Avoid making jokes about the Wall being 'just a pile of stones' or questioning i\"],\"difficulty_notes\":\"The main challenge for English speakers is understanding the cultural weight of the Great Wall as a symbol of national identity and perseverance. The\",\"key_terms\":[{\"chinese\":\"长城\",\"pinyin\":\"Chángchéng\",\"explanation\":\"The Great Wall; a series of fortifications built over centuries to protect China's northern borders.\"},{\"chinese\":\"山海关\",\"pinyin\":\"Shānhǎiguān\",\"explanation\":\"Shanhaiguan, the eastern end of the Great Wall, known as 'The First Pass Under Heaven' (天下第一关).\"},{\"chinese\":\"八达岭\",\"pinyin\":\"Bādálǐng\",\"explanation\":\"Badaling, the most visited section of the Great Wall near Beijing, famous for its restoration and accessibility.\"},{\"chinese\":\"万里长城\",\"pinyin\":\"Wànlǐ Chángchéng\",\"explanation\":\"The Ten-Thousand-Li Wall; a poetic name for the Great Wall, emphasizing its\"}],\"_ratio_calibration\":{\"enabled\":true,\"tier\":\"medium\",\"target_ratio\":0.5,\"before\":0.89,\"after\":0.85,\"deviation_before\":0.39,\"deviation_after\":0.35,\"trimmed_fields\":[\"precise_definition\",\"pragmatic_rules\",\"taboo_warnings\",\"difficulty_notes\",\"key_terms\"],\"expansion_triggered\":false,\"expansion_succeeded\":false}}",
  "cross_cultural_comparison": "{\"_mock_fixture\":false,\"framework_used\":\"[B] 爱德华·霍尔的高低语境文化理论 (Edward T. Hall's High/Low Context Culture Theory) — 聚焦于沟通中信息编码方式与语境依赖程度的差异。\",\"chinese_perspective\":\"中国属典型高语境文化，沟通高度依赖共享语境与关系背景。负面信息（如拒绝、不满）极少直接言明，而通过委婉暗示、沉默或“尽量协调”等模糊表述传递，以维护对方面子与关系和谐。信息的真正含义需听者结合语境“意会”，而非依赖字面。\",\"target_culture_perspective\":\"English-speaking cultures (e.g., UK, US) are typically low-context. Communication is explicit, direct, and message-centered. A \\\"No\\\" is stated clearly, and intentions are verbalized rather than implied. In business, all rights and obligations are codified in written contracts, and ambiguity is avoided to prevent misunderstanding. The burden of clarity lies with the speaker, not the listener.\",\"learning_pitfall\":\"The most common pitfall is misinterpreting a Chinese speaker's polite ambiguity (e.g., \\\"we'll try our best\\\") as a commitment, when it often signals reluctance or refusal—leading to broken agreements and damaged trust.\",\"key_terms\":[{\"chinese\":\"委婉\",\"pinyin\":\"wěiwǎn\",\"explanation\":\"Tactful or euphemistic; a communication style that softens negative messages to preserve harmony and save face, often at the expense of directness.\"},{\"chinese\":\"意会\",\"pinyin\":\"yìhuì\",\"explanation\":\"To understand implicitly or intuitively; the act of grasping unspoken meaning through context and shared background, a key skill in high-context communication.\"}],\"cultural_dimension\":\"[B] 爱德华·霍尔的高低语境文化理论 (Edward T. Hall's High/Low Context Culture Theory) — 聚焦于沟通中信息编码方式与语境依赖程度的差异。\",\"similarities\":[],\"differences\":[{\"chinese_practice\":\"中国属典型高语境文化，沟通高度依赖共享语境与关系背景。负面信息（如拒绝、不满）极少直接言明，而通过委婉暗示、沉默或“尽量协调”等模糊表述传递，以维护对方面子与关系和谐。信息的真正含义需听者结合语境“意会”，而非依赖字面。\",\"target_practice\":\"English-speaking cultures (e.g., UK, US) are typically low-context. Communication is explicit, direct, and message-centered. A \\\"No\\\" is stated clearly, and intentions are verbalized rather than implied. In business, all rights and obligations are codified in written contracts, and ambiguity is avoided to prevent misunderstanding. The burden of clarity lies with the speaker, not the listener.\",\"description\":\"The most common pitfall is misinterpreting a Chinese speaker's polite ambiguity (e.g., \\\"we'll try our best\\\") as a commitment, when it often signals reluctance or refusal—leading to broken agreements and damaged trust.\"}],\"pragmatic_hints\":[\"The most common pitfall is misinterpreting a Chinese speaker's polite ambiguity (e.g., \\\"we'll try our best\\\") as a commitment, when it often signals reluctance or refusal—leading to broken agreements and damaged trust.\"]}",
  "quality_warning": null,
  "cache_status": "hot",
  "learning_content": {
    "scene_title": "The Great Wall (长城, ",
    "cultural_background": "The Great Wall (长城, Chángchéng) is a series of fortifications built across northern China to protect against invasions. Key sections include 山海关 (Shānhǎiguān), the eastern starting point, and 八达岭 (Bādálǐng), the most accessible and popular section near Beijing. The saying '不到长城非好汉' (bú dào Chángchéng fēi hǎohàn) means 'You're not a true hero until you've climbed the Wall,' reflecting the cultural pride and challenge associated with it. For HSK 5 learners, understanding this phrase and the significance of these sections helps in travel conversations and cultural appreciation.",
    "core_language_points": [
      "不到长城非好汉",
      "天下第一关",
      "八达岭"
    ],
    "dialogues": [
      {
        "speaker": "老师",
        "chinese": "八达岭是长城的哪个部分？",
        "translation": "八达岭是长城最受欢迎、最容易到达的部分，位于北京附近。",
        "cultural_notes": ""
      },
      {
        "speaker": "学生",
        "chinese": "山海关被称为'天下第一关'。",
        "translation": "山海关是长城的起点，被称为'天下第一关'。",
        "cultural_notes": ""
      },
      {
        "speaker": "老师",
        "chinese": "我们打算去＿＿长城，听说那里风景很好。（提示：最受欢迎的部分）",
        "translation": "八达岭是长城最受欢迎的部分，常用于旅行计划。",
        "cultural_notes": ""
      }
    ],
    "exercises": [
      {
        "type": "选择题",
        "question": "八达岭是长城的哪个部分？",
        "options": [
          "起点",
          "最受欢迎的部分",
          "终点",
          "最危险的部分"
        ],
        "correct_answer": "B",
        "explanation": "八达岭是长城最受欢迎、最容易到达的部分，位于北京附近。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "判断题",
        "question": "山海关被称为'天下第一关'。",
        "options": [
          "对",
          "错"
        ],
        "correct_answer": "对",
        "explanation": "山海关是长城的起点，被称为'天下第一关'。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "我们打算去＿＿长城，听说那里风景很好。（提示：最受欢迎的部分）",
        "options": [],
        "correct_answer": "八达岭",
        "explanation": "八达岭是长城最受欢迎的部分，常用于旅行计划。",
        "dimension": "reading"
      },
      {
        "type": "选择题",
        "question": "朋友说'不到长城非好汉'，他的意思是什么？",
        "options": [
          "长城很难爬",
          "不爬长城就不是英雄",
          "长城很危险",
          "长城很漂亮"
        ],
        "correct_answer": "B",
        "explanation": "这句话的意思是：不登上长城就不算真正的英雄，强调挑战和成就。",
        "dimension": "cultural_pragmatic"
      },
      {
        "type": "填空题",
        "question": "用中文向你的朋友介绍，在英语文化中，类似长城的历史遗迹是什么？请写出一个例子。（提示：如Hadrian's Wall）",
        "options": [],
        "correct_answer": "哈德良长城",
        "explanation": "哈德良长城是英国的历史遗迹，类似于中国的长城，但通常没有同样的英雄主义口号。",
        "dimension": "cultural_pragmatic"
      }
    ],
    "cultural_assessment": {
      "criterion": "能准确使用相关语言点",
      "questions": [
        "这个表达在中国文化中有什么含义？"
      ]
    }
  },
  "status": "pending_review",
  "quality_gate": "passed",
  "from_cache": true,
  "anxiety_level": "medium",
  "cultural_anxiety_score_used": 50,
  "engine": "legacy",
  "guardrail": {
    "a2_translation": {
      "passed": true,
      "action": "PASS",
      "confidence": 1,
      "detail": {
        "judge_result": "True",
        "back_translation": "长城是中国北方为抵御入侵而修建的一系列防御工事。主要段落包括东端起点山海关和八达岭。",
        "elapsed_ms": 1591
      },
      "error": null
    },
    "a3_comparison": {
      "passed": true,
      "action": "PASS",
      "confidence": 1,
      "detail": {
        "judge_result": "True",
        "concept": "长城",
        "target_culture": "英语",
        "elapsed_ms": 1684
      },
      "error": null
    },
    "a4_solver": {
      "passed": true,
      "action": "PASS",
      "confidence": 1,
      "detail": {
        "exercises_checked": 5,
        "flagged": 0,
        "results": [
          {
            "passed": true,
            "action": "PASS",
            "confidence": 1,
            "detail": {
              "exercise_type": "multiple_choice",
              "solver_answer": "B",
              "expected_answer": "B",
              "solver_raw": "B",
              "elapsed_ms": 896
            },
            "error": null
          },
          {
            "passed": true,
            "action": "PASS",
            "confidence": 1,
            "detail": {
              "exercise_type": "true_false",
              "solver_answer": "对",
              "expected_answer": "对",
              "solver_raw": "对",
              "elapsed_ms": 860
            },
            "error": null
          },
          {
            "passed": true,
            "action": "PASS",
            "confidence": 1,
            "detail": {
              "exercise_type": "fill_blank",
              "solver_answer": "八达岭",
              "expected_answer": "八达岭",
              "solver_raw": "八达岭",
              "elapsed_ms": 941
            },
            "error": null
          },
          {
            "passed": true,
            "action": "PASS",
            "confidence": 1,
            "detail": {
              "exercise_type": "multiple_choice",
              "solver_answer": "B",
              "expected_answer": "B",
              "solver_raw": "B",
              "elapsed_ms": 684
            },
            "error": null
          },
          {
            "passed": true,
            "action": "PASS",
            "confidence": 1,
            "detail": {
              "exercise_type": "fill_blank",
              "solver_answer": "哈德良长城",
              "expected_answer": "哈德良长城",
              "solver_raw": "哈德良长城",
              "elapsed_ms": 728
            },
            "error": null
          }
        ]
      },
      "error": null
    },
    "a4_hard_rules": {
      "passed": true,
      "action": "PASS",
      "confidence": 1,
      "detail": {
        "checked": 5,
        "flagged": 0
      },
      "error": null
    },
    "a4_grounding": {
      "passed": true,
      "action": "PASS",
      "confidence": 1,
      "detail": {
        "judge_result": "True",
        "exercises_checked": 5,
        "elapsed_ms": 1231
      },
      "error": null
    },
    "a5_joint": {
      "passed": true,
      "action": "PASS",
      "confidence": 0.85,
      "detail": {
        "stage": "final_adjudication",
        "local_issues": [
          "question",
          "correct_answer",
          "explanation",
          "dimension"
        ],
        "model": "deepseek-chat",
        "scores": {
          "pinyin_accuracy": 0.9,
          "distractor_quality": 0.7,
          "cultural_compliance": 1,
          "level_appropriateness": 0.8,
          "overall_score": 0.85,
          "is_qualified": true
        },
        "elapsed_ms": 1026
      },
      "error": null
    }
  },
  "pipeline_metadata": {
    "requires_human_review": false,
    "confidence_warning": null,
    "overall_confidence": 1,
    "guardrail_count": 6,
    "guardrail_flagged": 0,
    "decay_log": []
  },
  "cultural_explanation_obj": {
    "precise_definition": "The Great Wall (长城, Chángchéng) is a series of fortifications built across northern China to protect against invasions. Key sections include 山海关 (Shānhǎiguān), the eastern starting point, and 八达岭 (Bād",
    "scene_introduction": "Imagine you're planning a trip to Beijing with an English-speaking friend. You suggest visiting 八达岭 (Bādálǐng), the most accessible section of the Great Wall. Your friend asks, 'Is it worth it?' You reply, '当然值得，不到长城非好汉！' (Dāngrán zhídé, bú dào Chángchéng fēi hǎohàn! - Of course it's worth it; you're not a true hero until you've climbed the Wall!) This saying reflects the cultural pride and challenge associated with the Wall.",
    "pragmatic_rules": [
      "When discussing the Great Wall with English speakers, be direct about pra",
      "Use the phrase 不到长城非好汉 (bú dào Chángchéng fēi hǎohàn) to express determin",
      "When talking about the Wall's history, avoid exaggerating claims like 'vi"
    ],
    "examples": [
      {
        "chinese": "我们打算去八达岭长城，听说那里风景很好。",
        "pinyin": "Wǒmen dǎsuàn qù Bādálǐng Chángchéng, tīngshuō nàlǐ fēngjǐng hěn hǎo.",
        "translation": "We plan to go to the Badaling section of the Great Wall; I heard the scenery there is beautiful.",
        "notes": "This is a common way to share travel plans. '八达岭' is the most popular section, so mentioning it shows you know practical details."
      },
      {
        "chinese": "山海关是长城的起点，被称为'天下第一关'。",
        "pinyin": "Shānhǎiguān shì Chángchéng de qǐdiǎn, bèi chēngwéi 'Tiānxià Dìyī Guān'.",
        "translation": "Shanhaiguan is the starting point of the Great Wall, known as 'The First Pass Under Heaven.'",
        "notes": "This example highlights a key cultural point. '天下第一关' (Tiānxià Dìyī Guān) is a title that reflects the pass's historical importance."
      }
    ],
    "taboo_warnings": [
      "与中国高语境沟通习惯冲突，中国人习惯用委婉暗示传递拒绝、不满等负面信息，常默认对方能读懂未明说的潜台词。",
      "Avoid making jokes about the Wall being 'just a pile of stones' or questioning i"
    ],
    "difficulty_notes": "The main challenge for English speakers is understanding the cultural weight of the Great Wall as a symbol of national identity and perseverance. The",
    "key_terms": [
      {
        "chinese": "长城",
        "pinyin": "Chángchéng",
        "explanation": "The Great Wall; a series of fortifications built over centuries to protect China's northern borders."
      },
      {
        "chinese": "山海关",
        "pinyin": "Shānhǎiguān",
        "explanation": "Shanhaiguan, the eastern end of the Great Wall, known as 'The First Pass Under Heaven' (天下第一关)."
      },
      {
        "chinese": "八达岭",
        "pinyin": "Bādálǐng",
        "explanation": "Badaling, the most visited section of the Great Wall near Beijing, famous for its restoration and accessibility."
      },
      {
        "chinese": "万里长城",
        "pinyin": "Wànlǐ Chángchéng",
        "explanation": "The Ten-Thousand-Li Wall; a poetic name for the Great Wall, emphasizing its"
      }
    ],
    "_ratio_calibration": {
      "enabled": true,
      "tier": "medium",
      "target_ratio": 0.5,
      "before": 0.89,
      "after": 0.85,
      "deviation_before": 0.39,
      "deviation_after": 0.35,
      "trimmed_fields": [
        "precise_definition",
        "pragmatic_rules",
        "taboo_warnings",
        "difficulty_notes",
        "key_terms"
      ],
      "expansion_triggered": false,
      "expansion_succeeded": false
    }
  },
  "cross_cultural_comparison_obj": {
    "_mock_fixture": false,
    "framework_used": "[B] 爱德华·霍尔的高低语境文化理论 (Edward T. Hall's High/Low Context Culture Theory) — 聚焦于沟通中信息编码方式与语境依赖程度的差异。",
    "chinese_perspective": "中国属典型高语境文化，沟通高度依赖共享语境与关系背景。负面信息（如拒绝、不满）极少直接言明，而通过委婉暗示、沉默或“尽量协调”等模糊表述传递，以维护对方面子与关系和谐。信息的真正含义需听者结合语境“意会”，而非依赖字面。",
    "target_culture_perspective": "English-speaking cultures (e.g., UK, US) are typically low-context. Communication is explicit, direct, and message-centered. A \"No\" is stated clearly, and intentions are verbalized rather than implied. In business, all rights and obligations are codified in written contracts, and ambiguity is avoided to prevent misunderstanding. The burden of clarity lies with the speaker, not the listener.",
    "learning_pitfall": "The most common pitfall is misinterpreting a Chinese speaker's polite ambiguity (e.g., \"we'll try our best\") as a commitment, when it often signals reluctance or refusal—leading to broken agreements and damaged trust.",
    "key_terms": [
      {
        "chinese": "委婉",
        "pinyin": "wěiwǎn",
        "explanation": "Tactful or euphemistic; a communication style that softens negative messages to preserve harmony and save face, often at the expense of directness."
      },
      {
        "chinese": "意会",
        "pinyin": "yìhuì",
        "explanation": "To understand implicitly or intuitively; the act of grasping unspoken meaning through context and shared background, a key skill in high-context communication."
      }
    ],
    "cultural_dimension": "[B] 爱德华·霍尔的高低语境文化理论 (Edward T. Hall's High/Low Context Culture Theory) — 聚焦于沟通中信息编码方式与语境依赖程度的差异。",
    "similarities": [],
    "differences": [
      {
        "chinese_practice": "中国属典型高语境文化，沟通高度依赖共享语境与关系背景。负面信息（如拒绝、不满）极少直接言明，而通过委婉暗示、沉默或“尽量协调”等模糊表述传递，以维护对方面子与关系和谐。信息的真正含义需听者结合语境“意会”，而非依赖字面。",
        "target_practice": "English-speaking cultures (e.g., UK, US) are typically low-context. Communication is explicit, direct, and message-centered. A \"No\" is stated clearly, and intentions are verbalized rather than implied. In business, all rights and obligations are codified in written contracts, and ambiguity is avoided to prevent misunderstanding. The burden of clarity lies with the speaker, not the listener.",
        "description": "The most common pitfall is misinterpreting a Chinese speaker's polite ambiguity (e.g., \"we'll try our best\") as a commitment, when it often signals reluctance or refusal—leading to broken agreements and damaged trust."
      }
    ],
    "pragmatic_hints": [
      "The most common pitfall is misinterpreting a Chinese speaker's polite ambiguity (e.g., \"we'll try our best\") as a commitment, when it often signals reluctance or refusal—leading to broken agreements and damaged trust."
    ]
  },
  "is_fallback": false,
  "_demo_meta": {
    "scene": "travel",
    "lang": "英语",
    "hsk": 5,
    "label": "长城故宫 · 英语 HSK5",
    "key": "travel_en_hsk5",
    "generated_at": "2026-08-30T15:34:14.530Z",
    "fallback_used": false,
    "source": "LLM",
    "llm_fail_reason": null,
    "quality_gate": "passed",
    "quality_warning": null,
    "api_from_cache_before": false,
    "exercises_n": 5,
    "regen_note": "重新生成：用知识点 UUID 直接传 knowledge_point_id 替代 scene=travel 模糊匹配，避免跑偏"
  }
}
};

export const DEMO_KEY_BY_PARAM: Record<string, string> = {
  "daily|英语|3": "daily_en_hsk3",
  "food|英语|3": "food_en_hsk3",
  "family|英语|3": "family_en_hsk3",
  "festival|英语|4": "festival_en_hsk4",
  "daily|日语|3": "daily_jp_hsk3",
  "food|日语|3": "food_jp_hsk3",
  "workplace|日语|4": "workplace_jp_hsk4",
  "travel|英语|5": "travel_en_hsk5",
};

export function resolveDemoKey(params: { scene?: string | null; lang?: string | null; hsk?: string | number | null | undefined }): string | null {
  if (!params || !params.scene || !params.lang || params.hsk == null) return null;
  const k = `${params.scene}|${params.lang}|${String(params.hsk).trim()}`;
  return DEMO_KEY_BY_PARAM[k] || null;
}
export function allDemoCaseKeys(): string[] { return ["daily_en_hsk3","food_en_hsk3","family_en_hsk3","festival_en_hsk4","daily_jp_hsk3","food_jp_hsk3","workplace_jp_hsk4","travel_en_hsk5"]; }
