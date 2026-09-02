/**
 * 多语言文化阐释生成服务
 * Mother-tongue Explanation Generation Service
 * 
 * 为68条知识点生成8种语言的文化阐释
 * 8种语言：英语、日语、韩语、西班牙语、阿拉伯语、俄语、法语、东南亚语(泰语)
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { UnifiedLLMService } from './unified-llm-service';

// ==================== 类型定义 ====================

export interface CulturalExplanationInput {
  precise_definition: string;
  scene_introduction: string;
  pragmatic_rules: string[];
  examples: string[];
  difficulty_notes: string;
  taboo_warnings: string[];
}

export interface KnowledgePointContent {
  hsk_level: number;
  layer: number;
  content_zh: string;
  content_json?: Record<string, string>;
}

export interface GenerationProgress {
  knowledge_point_id: string;
  knowledge_point_content: string;
  current_language: string;
  languages_completed: string[];
  languages_total: number;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
}

// ==================== 语言配置 ====================

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native_name: '英语', system_prompt: 'You are a professional Chinese language and culture educator specializing in teaching Chinese to English speakers.' },
  { code: 'ja', name: 'Japanese', native_name: '日本語', system_prompt: '你是一位专业的中文和中华文化教育专家，专注于面向日语母语者的中文教学。日本語で回答してください。' },
  { code: 'ko', name: 'Korean', native_name: '한국어', system_prompt: '당신은 한국어 사용자를 위한 중국어 및 중국 문화 교육 전문가입니다. 한국어로 답변해 주세요.' },
  { code: 'es', name: 'Spanish', native_name: 'Español', system_prompt: 'Eres un educador profesional de idioma chino y cultura china, especializado en enseñar chino a hispanohablantes. Responde en español.' },
  { code: 'ar', name: 'Arabic', native_name: 'العربية', system_prompt: 'أنت مدرس محترف للغة الصينية والثقافة الصينية، متخصص في تعليم الصينية للناطقين بالعربية. أجب بالعربية.' },
  { code: 'ru', name: 'Russian', native_name: 'Русский', system_prompt: 'Вы профессиональный преподаватель китайского языка и китайской культуры, специализирующийся на обучении китайскому языку носителей русского языка. Отвечайте на русском языке.' },
  { code: 'fr', name: 'French', native_name: 'Français', system_prompt: 'Vous êtes un éducateur professionnel de la langue chinoise et de la culture chinoise, spécialisé dans l\'enseignement du chinois aux francophones. Répondez en français.' },
  { code: 'th', name: 'Thai', native_name: 'ภาษาไทย', system_prompt: 'คุณเป็นครูภาษาจีนและวัฒนธรรมจีนมืออาชีพ ผู้เชี่ยวชาญด้านการสอนภาษาจีนให้แก่ผู้พูดภาษาไทย กรุณาตอบเป็นภาษาไทย' },
] as const;

// ==================== 生成提示词模板 ====================

function buildGenerationPrompt(
  knowledgePoint: KnowledgePointContent,
  language: typeof SUPPORTED_LANGUAGES[number]
): string {
  const { hsk_level, content_zh } = knowledgePoint;
  
  const layerText = {
    1: '基础级 (Basic)',
    2: '进阶级 (Intermediate)', 
    3: '高阶级 (Advanced)'
  }[knowledgePoint.layer] || '基础级';

  return `You are a professional Chinese language and culture educator.

## Task
Generate a comprehensive cultural explanation for the following Chinese cultural knowledge point for ${language.native_name} speakers (${language.name}).

## Knowledge Point Details
- HSK Level: ${hsk_level}
- Layer: ${layerText}
- Original Content (in Chinese):
${content_zh}

## Required Output Format (JSON)
Please provide a JSON object with the following structure:

{
  "precise_definition": "A precise academic definition of this cultural concept in ${language.native_name}, explaining its meaning, origin, and significance. Keep it academic but accessible for HSK ${hsk_level} learners.",
  "scene_introduction": "Describe 2-3 typical cultural scenarios where this concept is commonly used. Include context, participants, and appropriate usage situations. Write in ${language.native_name}.",
  "pragmatic_rules": ["Rule 1: Describe a key pragmatic rule for using this concept appropriately.", "Rule 2: Another important rule.", "Rule 3: A third rule if applicable."],
  "examples": ["Example 1: Show how this concept is used in a real conversation or context.", "Example 2: Another practical example.", "Example 3: A third example if helpful."],
  "difficulty_notes": "Explain the main difficulties ${language.name} speakers might face when learning this concept. Consider linguistic differences, cultural gaps, and common mistakes. Write in ${language.native_name}.",
  "taboo_warnings": ["Warning 1: Common mistakes or sensitive topics to avoid.", "Warning 2: Another important warning.", "Warning 3: A cultural taboo if relevant."]
}

## Guidelines
1. Language: All content MUST be in ${language.native_name} (${language.name})
2. HSK Appropriate: Content complexity should match HSK ${hsk_level} level
3. Cultural Sensitivity: Be respectful and accurate about Chinese culture
4. Practical: Focus on real-world usage and communication
5. Contrastive: When relevant, briefly mention similarities or differences with ${language.name} culture

Output ONLY the JSON object, no additional text.`;
}

// ==================== 多语言阐释服务 ====================

export class MultiLanguageExplanationService {
  private client = getSupabaseClient();
  private llmService = new UnifiedLLMService("generation");

  /**
   * 获取所有知识点
   */
  async getAllKnowledgePoints(): Promise<Array<KnowledgePointContent & { id: string }>> {
    const { data, error } = await this.client
      .from('cultural_knowledge_points')
      .select('id, hsk_level, layer, content_json')
      .order('hsk_level', { ascending: true });

    if (error) throw new Error(`获取知识点失败: ${error.message}`);

    return data.map(item => {
      const contentJson = item.content_json as Record<string, unknown>;
      // 处理不同的 content_json 结构
      let contentZh = '';
      
      if (typeof contentJson === 'object' && contentJson !== null) {
        // 可能的结构1: { zh: { topic: string, ... } }
        if ('zh' in contentJson && typeof (contentJson as Record<string, unknown>).zh === 'object') {
          const zhContent = (contentJson as Record<string, Record<string, unknown>>).zh;
          if ('topic' in zhContent) {
            contentZh = zhContent.topic as string;
          } else if ('examples' in zhContent) {
            // 尝试构建内容
            const examples = zhContent.examples as string[];
            contentZh = `Topic: ${zhContent.topic || 'Cultural Content'}\nExamples: ${examples?.slice(0, 2).join('; ') || 'N/A'}`;
          }
        }
        // 可能的结构2: 直接是 { topic: string, ... }
        else if ('topic' in contentJson) {
          contentZh = contentJson.topic as string;
        }
        // 可能的结构3: { content: string }
        else if ('content' in contentJson) {
          contentZh = contentJson.content as string;
        }
        // 可能的结构4: { zh: string } (简单字符串)
        else if ('zh' in contentJson && typeof (contentJson as Record<string, unknown>).zh === 'string') {
          contentZh = (contentJson as Record<string, string>).zh;
        }
      }
      
      // 如果都没找到，返回 JSON 字符串的前100个字符
      if (!contentZh) {
        contentZh = JSON.stringify(contentJson).substring(0, 100);
      }
      
      return {
        id: item.id,
        hsk_level: item.hsk_level,
        layer: item.layer,
        content_zh: contentZh,
      };
    });
  }

  /**
   * 检查知识点是否已有某种语言阐释
   */
  async hasExplanation(knowledgePointId: string, languageCode: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('cultural_explanations')
      .select('id')
      .eq('knowledge_point_id', knowledgePointId)
      .eq('language_code', languageCode)
      .maybeSingle();

    if (error) throw new Error(`检查阐释存在性失败: ${error.message}`);
    return !!data;
  }

  /**
   * 获取已有阐释统计
   */
  async getExplanationStats(): Promise<{
    total_knowledge_points: number;
    total_explanations: number;
    by_language: Record<string, number>;
    missing_count: number;
  }> {
    const knowledgePoints = await this.getAllKnowledgePoints();
    const totalKps = knowledgePoints.length;
    
    const { data: explanations, error } = await this.client
      .from('cultural_explanations')
      .select('knowledge_point_id, language_code');

    if (error) throw new Error(`获取阐释统计失败: ${error.message}`);

    const byLanguage: Record<string, number> = {};
    const byKp: Set<string> = new Set();
    
    explanations?.forEach(exp => {
      const lang = exp.language_code;
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      byKp.add(exp.knowledge_point_id);
    });

    const totalExpl = explanations?.length || 0;
    const existingCombinations = totalKps * SUPPORTED_LANGUAGES.length;
    const missingCount = existingCombinations - totalExpl;

    return {
      total_knowledge_points: totalKps,
      total_explanations: totalExpl,
      by_language: byLanguage,
      missing_count: missingCount,
    };
  }

  /**
   * 为单个知识点生成单种语言阐释
   */
  async generateSingleExplanation(
    knowledgePoint: KnowledgePointContent & { id: string },
    language: typeof SUPPORTED_LANGUAGES[number]
  ): Promise<CulturalExplanationInput> {
    const prompt = buildGenerationPrompt(knowledgePoint, language);
    
    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: language.system_prompt },
        { role: 'user', content: prompt }
      ];

      const response = await this.llmService.chat(messages, {
        temperature: 0.7,
      });

      // 解析JSON响应
      const content = response.content.trim();
      
      // 尝试提取JSON (处理可能的markdown代码块)
      let jsonStr = content;
      if (content.includes('```json')) {
        jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (content.includes('```')) {
        jsonStr = content.replace(/```\n?/g, '');
      }
      
      // 尝试修复常见的JSON问题
      let parsed: CulturalExplanationInput;
      try {
        parsed = JSON.parse(jsonStr) as CulturalExplanationInput;
      } catch {
        // 尝试提取JSON对象
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]) as CulturalExplanationInput;
          } catch {
            // 如果仍然失败，尝试修复常见问题
            const fixedJson = jsonMatch[0]
              .replace(/,(\s*[}\]])/g, '$1')  // 移除尾随逗号
              .replace(/([{,]\s*)'([^']+)':/g, '$1"$2":');  // 转换单引号为双引号
            parsed = JSON.parse(fixedJson) as CulturalExplanationInput;
          }
        } else {
          throw new Error('无法从响应中提取JSON');
        }
      }
      
      // 验证并补充字段
      return {
        precise_definition: parsed.precise_definition || '',
        scene_introduction: parsed.scene_introduction || '',
        pragmatic_rules: Array.isArray(parsed.pragmatic_rules) ? parsed.pragmatic_rules : [],
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
        difficulty_notes: parsed.difficulty_notes || '',
        taboo_warnings: Array.isArray(parsed.taboo_warnings) ? parsed.taboo_warnings : [],
      };
    } catch (err) {
      throw new Error(`生成 ${language.name} 阐释失败: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * 保存阐释到数据库
   */
  async saveExplanation(
    knowledgePointId: string,
    languageCode: string,
    explanation: CulturalExplanationInput
  ): Promise<void> {
    // 先检查是否已存在
    const exists = await this.hasExplanation(knowledgePointId, languageCode);

    if (exists) {
      // 更新
      const { error } = await this.client
        .from('cultural_explanations')
        .update({
          ...explanation,
          updated_at: new Date().toISOString(),
        })
        .eq('knowledge_point_id', knowledgePointId)
        .eq('language_code', languageCode);

      if (error) throw new Error(`更新阐释失败: ${error.message}`);
    } else {
      // 插入
      const { error } = await this.client
        .from('cultural_explanations')
        .insert({
          knowledge_point_id: knowledgePointId,
          language_code: languageCode,
          ...explanation,
        });

      if (error) throw new Error(`保存阐释失败: ${error.message}`);
    }
  }

  /**
   * 获取知识点所有语言的阐释
   */
  async getExplanationsByKnowledgePoint(knowledgePointId: string) {
    const { data, error } = await this.client
      .from('cultural_explanations')
      .select('*')
      .eq('knowledge_point_id', knowledgePointId);

    if (error) throw new Error(`获取阐释失败: ${error.message}`);
    return data;
  }

  /**
   * 生成流式输出（用于SSE）
   */
  async *generateExplanationsStream(): AsyncGenerator<{
    type: 'progress' | 'success' | 'error' | 'complete';
    data: GenerationProgress | string | number;
  }> {
    const knowledgePoints = await this.getAllKnowledgePoints();
    const totalKps = knowledgePoints.length;
    const totalLanguages = SUPPORTED_LANGUAGES.length;

    for (const kp of knowledgePoints) {
      const languagesCompleted: string[] = [];

      for (const lang of SUPPORTED_LANGUAGES) {
        yield {
          type: 'progress',
          data: {
            knowledge_point_id: kp.id,
            knowledge_point_content: kp.content_zh.substring(0, 100),
            current_language: lang.name,
            languages_completed: languagesCompleted,
            languages_total: totalLanguages,
            status: 'generating',
          } as GenerationProgress,
        };

        try {
          // 检查是否已有
          const exists = await this.hasExplanation(kp.id, lang.code);
          if (!exists) {
            const explanation = await this.generateSingleExplanation(kp, lang);
            await this.saveExplanation(kp.id, lang.code, explanation);
          }
          languagesCompleted.push(lang.name);

          yield {
            type: 'success',
            data: `✅ ${kp.content_zh.substring(0, 30)}... → ${lang.name}`,
          };
        } catch (err) {
          yield {
            type: 'error',
            data: `❌ ${kp.content_zh.substring(0, 30)}... → ${lang.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }

        // 短暂延迟避免API限流
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      yield {
        type: 'progress',
        data: {
          knowledge_point_id: kp.id,
          knowledge_point_content: kp.content_zh.substring(0, 100),
          current_language: 'completed',
          languages_completed: SUPPORTED_LANGUAGES.map(l => l.name),
          languages_total: totalLanguages,
          status: 'completed',
        } as GenerationProgress,
      };
    }

    const stats = await this.getExplanationStats();
    yield {
      type: 'complete',
      data: `🎉 完成！已生成 ${stats.total_explanations} 条多语言阐释 (${totalKps} 知识点 × ${totalLanguages} 语言)`,
    };
  }
}

// 导出单例
export const multiLanguageService = new MultiLanguageExplanationService();
