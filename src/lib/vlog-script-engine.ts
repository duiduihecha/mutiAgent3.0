/**
 * Vlog 脚本引擎 — "中文学习日记" AI Vlog 模板
 * 
 * 将多智能体系统的学习内容自动转化为短视频脚本，支持 TTS 语音 + FFmpeg 合成
 * 
 * 依赖：A2 (母语阐释) + A4 (内容生成) 的输出
 */

// ─── 类型定义 ───

export interface VlogScene {
  /** 口播文案（学习者母语） */
  narration: string;
  /** 中文例句（显示在字幕） */
  chinese_sample: string;
  /** 拼音 */
  pinyin?: string;
  /** 场景时长（秒） */
  duration_sec: number;
  /** 背景类型 */
  bg_type: 'opening' | 'culture' | 'comparison' | 'practice' | 'closing';
  /** 镜头提示 */
  visual_hint?: string;
}

export interface VlogScript {
  /** 唯一标识 */
  id: string;
  /** 学习者母语 */
  native_language: string;
  /** HSK 等级 */
  hsk_level: number;
  /** 场景名称 */
  scene_name: string;
  /** 知识点 ID */
  knowledge_point_id: string;
  /** 标题 */
  title: string;
  /** 分镜列表 */
  scenes: VlogScene[];
  /** 总时长（秒） */
  total_duration_sec: number;
  /** 话题标签 */
  hashtags: string[];
  /** 封面文字 */
  cover_text: string;
  /** 生成时间 */
  generated_at: string;
}

export interface LearningContent {
  /** 文化背景介绍（来自 A2） */
  cultural_explanation: string;
  /** 语言点（来自 A2） */
  language_points: string[];
  /** 跨文化对比（来自 A3） */
  cultural_comparison?: string;
  /** 练习题（来自 A4） */
  exercises: Array<{
    type: string;
    question: string;
    options?: string[];
    answer: string;
    chinese_sample?: string;
  }>;
  /** 母语 */
  native_language: string;
  /** HSK 等级 */
  hsk_level: number;
  /** 场景名称 */
  scene_name: string;
  /** 知识点 ID */
  knowledge_point_id: string;
}

// ─── 场景化背景模板 ───

const BG_TEMPLATES: Record<string, { color: string; name_cn: string; icon: string }> = {
  opening:     { color: '#ff2a4b', name_cn: '开场', icon: '🌟' },
  culture:     { color: '#6c5ce7', name_cn: '文化讲解', icon: '🏯' },
  comparison:  { color: '#00b894', name_cn: '文化对比', icon: '🌏' },
  practice:    { color: '#fdcb6e', name_cn: '实战练习', icon: '📝' },
  closing:     { color: '#0984e3', name_cn: '结尾', icon: '✨' },
};

// ─── 各母语的预设文案模板 ───

const NARRATION_TEMPLATES: Record<string, {
  opening: string;
  closing: string;
  culture_intro: (concept: string) => string;
  comparison_intro: (home: string, china: string) => string;
  practice_intro: string;
}> = {
  '英语': {
    opening: "Today I learned something fascinating about Chinese culture! 🎬",
    closing: "That's it for today's Chinese learning diary. See you next time! 再见! 👋",
    culture_intro: (c: string) => `Let me tell you about "${c}" in Chinese culture.`,
    comparison_intro: (h: string, c: string) => `Here's an interesting comparison: in ${h}, we do it this way, but in China, ${c}.`,
    practice_intro: "Now let me practice what I learned!",
  },
  '日语': {
    opening: "今日は中国文化について面白いことを学びました！🎬",
    closing: "今日の中国語学習日記はここまで。またね！再见! 👋",
    culture_intro: (c: string) => `中国文化の「${c}」について紹介します。`,
    comparison_intro: (h: string, c: string) => `面白い比較です：${h}ではこうですが、中国では${c}です。`,
    practice_intro: "では、学んだことを練習してみましょう！",
  },
  '韩语': {
    opening: "오늘 중국 문화에 대해 재미있는 것을 배웠어요! 🎬",
    closing: "오늘의 중국어 학습 일기는 여기까지! 다음에 또 만나요! 再见! 👋",
    culture_intro: (c: string) => `중국 문화의 "${c}"에 대해 소개할게요.`,
    comparison_intro: (h: string, c: string) => `재미있는 비교: ${h}에서는 이렇지만, 중국에서는 ${c}.`,
    practice_intro: "자, 배운 것을 연습해 볼까요!",
  },
};

// ─── 默认英文模板（未匹配语言的回退） ───

const DEFAULT_TEMPLATES = NARRATION_TEMPLATES['英语'];

// ─── 话题标签生成 ───

const HASHTAG_POOL: Record<string, string[]> = {
  '日常社交': ['#学中文', '#中文学习日记', '#中国文化', '#DailyChinese'],
  '餐饮美食': ['#学中文', '#中国美食', '#中文学习日记', '#ChineseFood'],
  '出行交通': ['#学中文', '#中国旅行', '#中文学习日记', '#TravelChina'],
  '购物消费': ['#学中文', '#中国生活', '#中文学习日记', '#ShoppingInChina'],
  '节日庆典': ['#学中文', '#中国传统节日', '#中文学习日记', '#ChineseFestival'],
  '医疗健康': ['#学中文', '#中国生活', '#中文学习日记', '#HealthInChina'],
  '校园学习': ['#学中文', '#留学中国', '#中文学习日记', '#CampusLife'],
  '工作职场': ['#学中文', '#中国职场', '#中文学习日记', '#WorkInChina'],
};

const DEFAULT_HASHTAGS = ['#学中文', '#中文学习日记', '#中国文化', '#LearnChinese'];

// ─── 核心引擎函数 ───

/**
 * 从学习内容生成 Vlog 脚本
 */
export function generateVlogScript(content: LearningContent): VlogScript {
  const lang = content.native_language;
  const templates = NARRATION_TEMPLATES[lang] || DEFAULT_TEMPLATES;
  const scenes: VlogScene[] = [];

  // Scene 0: 开场
  scenes.push({
    narration: templates.opening,
    chinese_sample: `今天的学习主题：${content.scene_name}`,
    pinyin: getPinyinPlaceholder(`jīntiān de xuéxí zhǔtí: ${content.scene_name}`),
    duration_sec: 4,
    bg_type: 'opening',
    visual_hint: '渐变背景 + 标题文字入场 + 学习者头像',
  });

  // Scene 1: 文化讲解
  const cultureConcept = extractMainConcept(content.cultural_explanation);
  scenes.push({
    narration: templates.culture_intro(cultureConcept),
    chinese_sample: truncateChineseSentence(content.cultural_explanation, 50),
    duration_sec: 7,
    bg_type: 'culture',
    visual_hint: '中国传统文化元素图片 + 关键概念浮层文字',
  });

  // Scene 2: 文化对比（如果有的话）
  if (content.cultural_comparison) {
    const comparison = extractComparison(content.cultural_comparison);
    scenes.push({
      narration: templates.comparison_intro(comparison.home, comparison.china),
      chinese_sample: `中国：${comparison.china} | ${lang}：${comparison.home}`,
      duration_sec: 6,
      bg_type: 'comparison',
      visual_hint: '分屏画面：左为母语文化，右为中国文化',
    });
  }

  // Scene 3: 实战练习
  if (content.exercises.length > 0) {
    const exercise = content.exercises[0];
    scenes.push({
      narration: templates.practice_intro,
      chinese_sample: exercise.chinese_sample || exercise.question,
      duration_sec: 5,
      bg_type: 'practice',
      visual_hint: '练习题卡片 + 打字效果答案揭示',
    });
  }

  // Scene 4: 结尾
  scenes.push({
    narration: templates.closing,
    chinese_sample: '我们下次再见！',
    pinyin: 'wǒmen xiàcì zàijiàn',
    duration_sec: 3,
    bg_type: 'closing',
    visual_hint: '渐出画面 + 关注引导 + 话题标签展示',
  });

  // 计算总时长
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration_sec, 0);

  // 生成话题标签
  const sceneHashtags = HASHTAG_POOL[content.scene_name] || DEFAULT_HASHTAGS;

  // 生成标题
  const concept = extractMainConcept(content.cultural_explanation);
  const title = `中文学习日记 | ${content.scene_name}：${concept}`;

  return {
    id: `vlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    native_language: lang,
    hsk_level: content.hsk_level,
    scene_name: content.scene_name,
    knowledge_point_id: content.knowledge_point_id,
    title,
    scenes,
    total_duration_sec: totalDuration,
    hashtags: sceneHashtags,
    cover_text: `${concept}\nHSK${content.hsk_level} · ${lang}`,
    generated_at: new Date().toISOString(),
  };
}

/**
 * 生成 TTS 字幕文件 (SRT 格式)
 */
export function generateSRTSubtitles(script: VlogScript): string {
  let srt = '';
  let globalTime = 0;

  // SRT for native language narration
  script.scenes.forEach((scene, si) => {
    if (scene.narration) {
      const start = formatSRTTime(globalTime);
      globalTime += scene.duration_sec;
      const end = formatSRTTime(globalTime);
      srt += `${si * 2 + 1}\n${start} --> ${end}\n[${getBgLabel(scene.bg_type)}] ${scene.narration}\n\n`;
    }

    // Chinese subtitle
    if (scene.chinese_sample) {
      const cStart = formatSRTTime(globalTime - scene.duration_sec);
      const cEnd = formatSRTTime(globalTime);
      srt += `${si * 2 + 2}\n${cStart} --> ${cEnd}\n${scene.chinese_sample}${scene.pinyin ? ' (' + scene.pinyin + ')' : ''}\n\n`;
    }
  });

  return srt;
}

/**
 * 将脚本转为 TTS 命令行脚本
 */
export function generateTTSScript(script: VlogScript): string[] {
  const lines: string[] = [];

  script.scenes.forEach((scene, si) => {
    if (scene.narration) {
      const lang = script.native_language;
      const voice = getVoiceForLanguage(lang);
      const outFile = `/tmp/vlog_scene_${si}.mp3`;
      // edge-tts requires escaped text
      const escaped = scene.narration.replace(/"/g, '\\"').replace(/'/g, "\\'");
      lines.push(`edge-tts --voice ${voice} --text "${escaped}" --write-media ${outFile}`);
    }
  });

  return lines;
}

/**
 * 生成 FFmpeg 合成命令
 */
export function generateFFmpegCommand(script: VlogScript, outputPath: string): string {
  const sceneCount = script.scenes.length;
  
  // 构建输入参数
  const inputs: string[] = [];
  const filterParts: string[] = [];
  let audioMix = '';
  let totalDuration = 0;

  script.scenes.forEach((scene, i) => {
    if (scene.narration) {
      inputs.push(`-i /tmp/vlog_scene_${i}.mp3`);
      audioMix += `[${inputs.length - 1}:a]`;
    }
    totalDuration += scene.duration_sec;
  });

  // 构建滤镜链：纯色背景 + 文字叠加
  const bgColor = BG_TEMPLATES['opening']?.color || '0B192C';
  const filterComplex = buildFilterComplex(script, inputs.length);

  const cmd = [
    'ffmpeg',
    // 生成纯色背景
    `-f lavfi -i color=c=0x${bgColor.replace('#', '')}:s=1080x1920:r=30:d=${totalDuration}`,
    ...inputs,
    '-filter_complex', `"${filterComplex}"`,
    '-map', '"[vout]"',
    '-map', `"[aout]"`, 
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    '-y',
    outputPath,
  ];

  return cmd.join(' ');
}

// ─── 辅助函数 ───

function extractMainConcept(explanation: string): string {
  // 取第一句或前20个字符作为核心概念
  const firstSentence = explanation.split(/[。.!！?？\n]/)[0];
  return firstSentence.length > 20 ? firstSentence.slice(0, 20) + '...' : firstSentence || '中国文化';
}

function extractComparison(comparison: string): { home: string; china: string } {
  // 简单提取对比信息
  const parts = comparison.split(/[；;]/);
  return {
    home: parts[1]?.slice(0, 15) || '我家乡的文化',
    china: parts[0]?.slice(0, 15) || '中国文化',
  };
}

function truncateChineseSentence(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function getPinyinPlaceholder(text: string): string {
  // 简化版拼音占位 — 实际项目应该用 pinyin 库
  return '';
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function getBgLabel(bgType: string): string {
  return BG_TEMPLATES[bgType]?.name_cn || '';
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

function buildFilterComplex(script: VlogScript, audioInputCount: number): string {
  // 生成 ASS 字幕文件
  const assPath = '/tmp/vlog_subtitles.ass';
  const assContent = generateASSContent(script);
  writeTempText(assPath, assContent);
  
  // 视频滤镜链（逗号分隔，顺序执行）
  const videoFilter = `[0:v]scale=1080:1920,setsar=1,format=yuv420p,subtitles=${assPath}[vout]`;

  // 音频混合
  const audioInputs: string[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    if (script.scenes[i].narration) {
      audioInputs.push(`[${i + 1}:a]`);
    }
  }
  let audioFilter = '';
  if (audioInputs.length > 0) {
    audioFilter = `;${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first[aout]`;
  }

  return videoFilter + audioFilter;
}

/** 生成 ASS 格式字幕文件，包含所有场景文字 */
function generateASSContent(script: VlogScript): string {
  let ass = `[Script Info]
Title: 中文学习日记 Vlog
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,1,2,60,60,60,1
Style: Narration,Arial,34,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,1,2,60,60,60,1
Style: Chinese,Arial,32,&H0000D4FF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,2,2,60,60,60,1
Style: Hashtag,Arial,26,&H0040C0FF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,1,2,60,60,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const BG_COLORS: Record<string, string> = {
    opening: '&H00FF2A4B', culture: '&H006C5CE7',
    comparison: '&H0000B894', practice: '&H00FDCB6E', closing: '&H000984E3',
  };

  let t = 0;
  script.scenes.forEach((scene, i) => {
    const start = fmtASS(t);
    const titleEnd = fmtASS(t + scene.duration_sec);
    t += scene.duration_sec;

    if (scene.narration) {
      const safeNarration = scene.narration.replace(/\n/g, '\\N').replace(/,/g, '，');
      ass += `Dialogue: 0,${start},${titleEnd},Narration,,0,0,0,,${safeNarration}\n`;
    }
    if (scene.chinese_sample) {
      const safeChinese = scene.chinese_sample.replace(/\n/g, '\\N').replace(/,/g, '，');
      ass += `Dialogue: 0,${start},${titleEnd},Chinese,,0,0,120,,${safeChinese}\n`;
    }
  });

  // 结尾话题标签
  const hashEnd = script.total_duration_sec;
  const hashStart = Math.max(0, hashEnd - 4);
  ass += `Dialogue: 0,${fmtASS(hashStart)},${fmtASS(hashEnd)},Hashtag,,0,0,0,,${script.hashtags.join('  ')}\n`;

  return ass;
}

function fmtASS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;
}

import { writeFileSync } from 'fs';
function writeTempText(path: string, text: string) {
  writeFileSync(path, text, 'utf-8');
}

// ─── 导出工具 ───

export { BG_TEMPLATES, NARRATION_TEMPLATES, HASHTAG_POOL, DEFAULT_HASHTAGS };
