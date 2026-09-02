/**
 * POST /api/vlog/generate
 * 从学习内容生成 Vlog 脚本 + 可选视频渲染
 */
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  generateVlogScript,
  generateSRTSubtitles,
  generateFFmpegCommand,
  type LearningContent,
  type VlogScript,
} from '@/lib/vlog-script-engine';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 两种模式：
    // 1) 直接传 LearningContent → 生成脚本
    // 2) 传 learner_id + scene → 先调用学习流程再生成脚本

    let content: LearningContent;

    if (body.content) {
      // 模式 1：直接传内容
      content = body.content;
    } else {
      // 模式 2：用学习内容占位（开发阶段）
      content = getMockContent(body.native_language || '英语', body.scene || '餐饮美食');
    }

    // 生成脚本
    const script = generateVlogScript(content);
    const srt = generateSRTSubtitles(script);

    // 是否需要渲染视频？
    if (body.render === true) {
      const videoResult = await renderVideo(script);
      return NextResponse.json({
        success: true,
        script,
        srt,
        video: videoResult,
      });
    }

    return NextResponse.json({
      success: true,
      script,
      srt,
    });
  } catch (error: any) {
    console.error('[Vlog] 生成失败:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/** GET：预览脚本结构 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang') || '英语';
  const scene = searchParams.get('scene') || '餐饮美食';
  const hsk = parseInt(searchParams.get('hsk') || '3');

  const content = getMockContent(lang, scene, hsk);
  const script = generateVlogScript(content);

  return NextResponse.json({ success: true, script });
}

// ─── 视频渲染（Python FFmpeg pipeline）───

async function renderVideo(script: VlogScript): Promise<{ path: string; url: string }> {
  const outputDir = path.join(process.cwd(), 'public', 'vlogs');
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const videoFileName = `${script.id}.mp4`;
  const videoPath = path.join(outputDir, videoFileName);
  const scriptPath = `/tmp/vlog_script_${script.id}.json`;

  // 写入脚本 JSON 供 Python 渲染器使用
  await writeFile(scriptPath, JSON.stringify(script), 'utf-8');

  try {
    await execAsync(
      `python3 scripts/vlog_renderer.py ${scriptPath} ${videoPath}`,
      { timeout: 120000, cwd: process.cwd() }
    );

    if (existsSync(videoPath)) {
      return { path: videoPath, url: `/vlogs/${videoFileName}` };
    }
  } catch (renderErr: any) {
    console.error('[Vlog] 渲染失败:', renderErr.stderr || renderErr.message);
  }

  // 降级：保存脚本 JSON
  const jsonPath = videoPath.replace('.mp4', '.json');
  await writeFile(jsonPath, JSON.stringify(script, null, 2));
  return { path: jsonPath, url: `/vlogs/${videoFileName.replace('.mp4', '.json')}` };
}

function getVoiceForLanguage(lang: string): string {
  const voices: Record<string, string> = {
    '英语': 'en-US-JennyNeural',
    '日语': 'ja-JP-NanamiNeural',
    '韩语': 'ko-KR-SunHiNeural',
    '法语': 'fr-FR-DeniseNeural',
    '西班牙语': 'es-ES-ElviraNeural',
    '泰语': 'th-TH-PremwadeeNeural',
    '阿拉伯语': 'ar-SA-ZariyahNeural',
    '俄语': 'ru-RU-SvetlanaNeural',
  };
  return voices[lang] || 'en-US-JennyNeural';
}

// ─── 开发阶段模拟数据 ───

function getMockContent(lang: string, scene: string, hskLevel: number = 3): LearningContent {
  const mockData: Record<string, LearningContent> = {
    '餐饮美食': {
      cultural_explanation: '在中国文化中，合餐制是非常重要的社交方式。家人和朋友围坐在一起，共享多道菜肴，体现了"团圆"和"分享"的文化价值观。',
      language_points: ['点菜 (diǎn cài)', '买单 (mǎi dān)', '打包 (dǎ bāo)', '随便 (suí biàn)'],
      cultural_comparison: '中国：合餐共享，体现集体主义；西方：分餐制，体现个人主义',
      exercises: [{
        type: 'choice',
        question: '在夜市，你想问价格，应该说：',
        options: ['这个多少钱？', '你要吃什么？', '今天天气很好', '我来自美国'],
        answer: '这个多少钱？',
        chinese_sample: '这个多少钱？(zhè ge duō shao qián?)',
      }],
      native_language: lang,
      hsk_level: hskLevel,
      scene_name: scene,
      knowledge_point_id: 'food_ordering',
    },
    '日常社交': {
      cultural_explanation: '中国人见面时常见的问候方式包括"你吃了吗？"这不仅是询问饮食，更是一种表达关心的社交礼仪。',
      language_points: ['你好 (nǐ hǎo)', '吃了吗 (chī le ma)', '最近怎么样 (zuì jìn zěn me yàng)'],
      cultural_comparison: '中国：间接问候，注重关系维护；西方：How are you? 直接但程式化',
      exercises: [{
        type: 'choice',
        question: '中国人说"吃了吗"的意思是：',
        options: ['真的想知道你吃了没', '一种问候方式', '邀请你吃饭', '批评你没吃饭'],
        answer: '一种问候方式',
        chinese_sample: '吃了吗？(chī le ma?) — 一种问候方式',
      }],
      native_language: lang,
      hsk_level: hskLevel,
      scene_name: scene,
      knowledge_point_id: 'social_greeting',
    },
    '出行交通': {
      cultural_explanation: '中国的高铁网络是世界上最大的。乘坐高铁时，乘客需要提前购票并通过安检，这是中国出行的独特体验。',
      language_points: ['高铁 (gāo tiě)', '地铁 (dì tiě)', '打车 (dǎ chē)', '导航 (dǎo háng)'],
      cultural_comparison: '中国：高铁 + 地铁为公共交通主体；美国：私家车为主',
      exercises: [{
        type: 'choice',
        question: '你想坐地铁去天安门，应该怎么说？',
        options: ['请问地铁站在哪？', '我要飞过去', '开车很快', '走路很远'],
        answer: '请问地铁站在哪？',
        chinese_sample: '请问地铁站在哪？(qǐng wèn dì tiě zhàn zài nǎ?)',
      }],
      native_language: lang,
      hsk_level: hskLevel,
      scene_name: scene,
      knowledge_point_id: 'transport_metro',
    },
  };

  return mockData[scene] || mockData['餐饮美食'];
}
