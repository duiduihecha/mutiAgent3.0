'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLearner } from '@/lib/learner-context';
import { useAuth } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ProgressiveDisclosure } from '@/components/learning/progressive-disclosure';
import { UserAuthBadge } from '@/components/auth/user-auth-badge';

// 母语文化圈选项
const NATIVE_LANGUAGES = [
  { value: '英语', label: 'English (英语圈)' },
  { value: '日语', label: '日本語 (日语圈)' },
  { value: '韩语', label: '한국어 (韩语圈)' },
  { value: '西班牙语', label: 'Español (西班牙语圈)' },
  { value: '阿拉伯语', label: 'العربية (阿拉伯语圈)' },
  { value: '俄语', label: 'Русский (俄语圈)' },
  { value: '法语', label: 'Français (法语圈)' },
  { value: '东南亚语系', label: 'Southeast Asian (东南亚语系)' }
];

// HSK等级选项
const HSK_LEVELS = [
  { value: '1', label: 'HSK 1 (初级)' },
  { value: '2', label: 'HSK 2 (初级)' },
  { value: '3', label: 'HSK 3 (初级)' },
  { value: '4', label: 'HSK 4 (中级)' },
  { value: '5', label: 'HSK 5 (中级)' },
  { value: '6', label: 'HSK 6 (中级)' },
  { value: '7', label: 'HSK 7-9 (高级)' }
];

const MOTIVATION_OPTIONS = [
  { value: 'interest', label: '兴趣探索', icon: '🎯' },
  { value: 'tourism', label: '旅游出行', icon: '✈️' },
  { value: 'study_abroad', label: '留学生活', icon: '🎓' },
  { value: 'work', label: '职场工作', icon: '💼' },
  { value: 'exam', label: '考试备考', icon: '📝' },
];


export default function HomePage() {
  const auth = useAuth();
  const { learner: currentLearner, setLearner: setCurrentLearner, fetchLearner } = useLearner();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedMotivation, setSelectedMotivation] = useState<string>('interest');
  const [_isLearning, setIsLearning] = useState(false);
  const [learningContent, setLearningContent] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const router = useRouter();

  // 刷新推荐（DB 写入后调用，可选传 learnerId 避免闭包过期）
  const refreshRecommendations = (learnerId?: string) => {
    const id = learnerId || currentLearner?.id;
    if (!id) return;
    fetch(`/api/learners/${id}/recommendations?limit=5`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setRecommendations(json.data || []);
      })
      .catch(() => {});
  };

  // learner 首次加载时拉取推荐
  useEffect(() => {
    refreshRecommendations();
  }, [currentLearner?.id]);

  // 从 LearnerContext 同步 UI 选择器状态
  // context 中的 learner 变化时（比如 learning 页 saveResults 后），选择器自动同步
  useEffect(() => {
    if (currentLearner) {
      setSelectedLanguage(currentLearner.native_language);
      setSelectedLevel(String(currentLearner.hsk_level || 1));
    }
  }, [currentLearner]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-slate-900/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌏</span>
            <span className="text-xl font-bold">跨文化中文学习系统</span>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#learning-center" className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors">学习中心</a>
            <a href="#my-progress" className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors">我的进度</a>
          </nav>
          <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-700">
            <UserAuthBadge />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section - 学习中心 */}
        <section id="learning-center" className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            母语驱动的跨文化对比式中文学习
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            基于动态混合知识底座 + 多智能体网状协同，为全球8大主流母语文化圈学习者提供个性化的中文学习体验
          </p>
          
          {/* 选择器 */}
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-4">
            <div className="w-64">
              <Select value={selectedLanguage} onValueChange={(val) => {
                setSelectedLanguage(val);
                // 换母语 → 重置能力向量和焦虑度（不同母语背景，学习画像不同）
                setCurrentLearner(prev => prev ? { ...prev, native_language: val, cultural_anxiety_score: 50, ability_vector: [50,50,50,50,50] } : { id: '', native_language: val, hsk_level: parseInt(selectedLevel || '1'), cultural_anxiety_score: 50, ability_vector: [50,50,50,50,50] });
                if (currentLearner?.id) {
                  const lid = currentLearner.id;
                  fetch(`/api/learners/${lid}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ native_language: val, cultural_anxiety_score: 50, ability_vector: [50,50,50,50,50] })
                  }).then(() => refreshRecommendations(lid))
                    .catch(e => console.error('更新学习者母语失败:', e));
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="选择您的母语" />
                </SelectTrigger>
                <SelectContent>
                  {NATIVE_LANGUAGES.map(lang => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Select value={selectedLevel} onValueChange={(val) => {
                setSelectedLevel(val);
                // 同步更新 LearnerContext + 写入数据库
                setCurrentLearner(prev => prev ? { ...prev, hsk_level: parseInt(val) } : { id: '', native_language: selectedLanguage || '英语', hsk_level: parseInt(val), cultural_anxiety_score: 50, ability_vector: [50,50,50,50,50] });
                if (currentLearner?.id) {
                  const lid = currentLearner.id;
                  fetch(`/api/learners/${lid}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hsk_level: parseInt(val) })
                  }).then(() => refreshRecommendations(lid))
                    .catch(e => console.error('更新学习者HSK等级失败:', e));
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="选择HSK等级" />
                </SelectTrigger>
                <SelectContent>
                  {HSK_LEVELS.map(level => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Select value={selectedMotivation} onValueChange={(val) => {
                setSelectedMotivation(val);
                setCurrentLearner(prev => prev ? { ...prev, learning_motivation: val } : null);
                if (currentLearner?.id) {
                  const lid = currentLearner.id;
                  fetch(`/api/learners/${lid}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ learning_motivation: val })
                  }).then(() => refreshRecommendations(lid))
                    .catch(e => console.error('更新学习动机失败:', e));
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="学习目的" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </section>

        {/* 学习者画像 */}
        {currentLearner && (() => {
          const learner = currentLearner as any;
          const anxiety = learner.cultural_anxiety_score || 50;
          const anxietyLevel = anxiety > 80 ? '高' : anxiety > 40 ? '中' : '低';
          const anxietyColor = anxiety > 80 ? 'text-red-600 bg-red-50' : anxiety > 40 ? 'text-yellow-600 bg-yellow-50' : 'text-green-600 bg-green-50';
          
          return (
            <section id="my-progress" className="mb-8">
              <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-purple-200 flex items-center justify-center text-2xl">
                        👤
                      </div>
                      <div>
                        <div>
                        <CardTitle className="text-lg">学习者画像</CardTitle>
                        <CardDescription>UID: {learner.uid}</CardDescription>
                      </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const lid = currentLearner?.id;
                          if (!lid) { alert('未找到学习者，请先开始学习'); return; }
                          try {
                            const res = await fetch(`/api/learners/${lid}`, { cache: 'no-store' });
                            const json = await res.json();
                            if (json.success && json.data) {
                              const oldAnxiety = (currentLearner as any)?.cultural_anxiety_score;
                              const newAnxiety = json.data.cultural_anxiety_score;
                              const oldVector = (currentLearner as any)?.ability_vector;
                              const newVector = json.data.ability_vector;
                              setCurrentLearner(json.data);
                              alert(`刷新成功！\n\nanxiety: ${oldAnxiety} → ${newAnxiety}\nvector: ${JSON.stringify(oldVector)} → ${JSON.stringify(newVector)}`);
                            } else {
                              alert('刷新失败：API 返回异常 - ' + JSON.stringify(json).slice(0, 200));
                            }
                          } catch (err) {
                            alert('刷新失败：' + String(err));
                          }
                        }}
                        className="text-xs px-3 py-1 rounded-md bg-white border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors"
                      >
                        刷新画像
                      </button>
                      {auth.user ? (
                        <Badge className="bg-emerald-100 text-emerald-800">
                          🔓 已登录 · {auth.user.nickname || auth.user.email.split('@')[0]}
                          {auth.user.learner_id ? ' · 进度已绑定账号' : ''}
                        </Badge>
                      ) : (
                        <Badge className="bg-purple-100 text-purple-800">游客模式 · 建议登录保留进度</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* 母语 */}
                    <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                      <div className="text-2xl mb-1">🌍</div>
                      <div className="text-xs text-slate-500">母语</div>
                      <div className="font-semibold text-purple-700">{learner.native_language}</div>
                    </div>
                    
                    {/* HSK等级 */}
                    <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                      <div className="text-2xl mb-1">📚</div>
                      <div className="text-xs text-slate-500">HSK等级</div>
                      <div className="font-semibold text-blue-700">HSK {learner.hsk_level}</div>
                    </div>
                    
                    {/* 学习风格 */}
                    {/* 文化焦虑度 */}
                    <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                      <div className="text-2xl mb-1">😰</div>
                      <div className="text-xs text-slate-500">文化焦虑度</div>
                      <div className={`font-semibold rounded px-2 py-1 inline-block ${anxietyColor}`}>
                        {anxietyLevel} ({anxiety}分)
                      </div>
                    </div>
                  </div>
                  
                  {/* 能力向量 */}
                  <div className="mt-4 p-4 bg-white rounded-lg">
                    <h4 className="text-sm font-medium text-slate-700 mb-3">📊 能力评估向量</h4>
                    <div className="grid grid-cols-5 gap-2">
                      {['语法', '听力', '口语', '文化', '阅读'].map((skill, i) => {
                        const value = learner.ability_vector?.[i] || 50;
                        return (
                          <div key={i} className="text-center">
                            <div className="relative pt-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-slate-500">{skill}</span>
                                <span className="text-xs font-medium">{value}</span>
                              </div>
                              <div className="overflow-hidden h-2 text-xs rounded bg-slate-200">
                                <div 
                                  className="h-2 rounded transition-all duration-500"
                                  style={{ 
                                    width: `${value}%`,
                                    backgroundColor: value > 80 ? '#22c55e' : value > 50 ? '#3b82f6' : '#f59e0b'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* 焦虑度调节提示 */}
                  <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-800">
                      💡 <strong>智能调节：</strong>根据您的文化焦虑度（{anxiety}分），系统将提供
                      {anxiety > 80 ? '70-80%' : anxiety > 40 ? '40-60%' : '20-30%'}的母语阐释比例，
                      帮助您更高效地学习。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
          );
        })()}

        {/* 为你推荐 */}
        {recommendations.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4">为你推荐</h2>
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-2" style={{ scrollSnapType: "x mandatory" }}>
                {recommendations.map((rec: any, i: number) => (
                  <div
                    key={rec.kp_id || i}
                    className="flex-shrink-0 w-64 rounded-xl border-2 border-purple-200 bg-white p-4 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer"
                    style={{ scrollSnapAlign: "start" }}
                    onClick={() => {
                      localStorage.setItem("native_language", selectedLanguage);
                      localStorage.setItem("hsk_level", selectedLevel);
                      localStorage.setItem("selected_motivation", selectedMotivation);
                      localStorage.setItem("learner_id", currentLearner?.id || "");
                      localStorage.setItem("last_kp", rec.kp_id);
                      router.push(`/learning?learner=${currentLearner?.id}&kp=${rec.kp_id}&level=${selectedLevel}&lang=${selectedLanguage}&motivation=${selectedMotivation}`);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{rec.domain_icon || "📖"}</span>
                      <span className="text-xs text-slate-500">{rec.domain_name}</span>
                    </div>
                    <h3 className="font-semibold text-sm mb-1 line-clamp-2">{rec.kp_name}</h3>
                    <p className="text-xs text-slate-400 mb-2 line-clamp-1">{rec.pragmatic_intent}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">HSK {rec.hsk_level}</Badge>
                      {rec.is_unlocked && (
                        <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">可解锁</Badge>
                      )}
                    </div>
                    {rec.reasons.length > 0 && (
                      <div className="text-xs text-slate-500 space-y-0.5">
                        {rec.reasons.slice(0, 2).map((reason: string, ri: number) => (
                          <div key={ri} className="flex items-center gap-1">
                            <span className="text-purple-400">•</span>
                            {reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 导师演示 · 快捷入口（一键直达已预热好的缓存学习内容） */}
        <section className="mb-10 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 dark:border-emerald-900 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/30">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">缓存已预热</Badge>
              <Badge variant="outline">8 个典型案例</Badge>
              <Badge variant="outline">2 种母语 · 3 个 HSK 档位</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              // [icon, 标题(展示用), scene_id, 母语, HSK, 一句话亮点（告诉导师这个卡片体现什么创新）]
              ["🍜","日常社交 · 英语 HSK3","daily","英语",3,'母语英语：如何从「吃了吗？」切入，对比 How are you 寒暄范式差异'],
              ["🥢","筷子文化 · 英语 HSK3","food","英语",3,'对比刀叉/分餐 vs 筷子/合餐 + 把筷子插饭上=大忌（禁忌语义）'],
              ["👨‍👩‍👧","亲属称谓 · 英语 HSK3","family","英语",3,'英文 3 个词 vs 中文 20+ 精确称谓：体现文化编码差异'],
              ["🧧","春节红包 · 英语 HSK4","festival","英语",4,'红包数字禁忌/红色语义 vs 圣诞礼物：跨文化价值观对比'],
              ["🙇","日常寒暄 · 日语 HSK3","daily","日语",3,'对比「よろしく」 vs 「请多关照」：敬语迁移 + 拒绝的间接表达'],
              ["🍱","饮食文化 · 日语 HSK3","food","日语",3,'日本「すみません」买单 vs 中国「服务员！买单！」：权力距离差异'],
              ["💼","职场敬语 · 日语 HSK4","workplace","日语",4,'日文敬语三层 vs 中文「您/你」二级：敬语系统迁移点'],
              ["🏯","长城故宫 · 英语 HSK5","travel","英语",5,'展示 HSK 高级分层：语域、四字格、文化典故深度讲解'],
            ].map(([icon, title, scene, lang, hsk, highlight]) => {
              const hskNum = hsk as number;
              const langStr = lang as string;
              const sceneStr = scene as string;
              return (
                <button
                  key={`${sceneStr}-${langStr}-${hskNum}`}
                  type="button"
                  onClick={() => {
                    // 写 localStorage + 跳学习页（和推荐卡片保持同样行为）
                    // + 加 demo=<key> 触发 /learning 页的「极速离线模式」：先 0ms 渲染已预热好的离线数据包
                    const langNormForDemo = (langStr === "英语" ? "en" : langStr === "日语" ? "jp" : langStr.replace(/\s+/g,""));
                    const demoKey = `${sceneStr}_${langNormForDemo}_hsk${hskNum}`;
                    localStorage.setItem("native_language", langStr);
                    localStorage.setItem("hsk_level", String(hskNum));
                    localStorage.setItem("selected_motivation", "interest");
                    const demoLid = currentLearner?.id || `demo-${sceneStr}-${langStr}-${hskNum}`;
                    localStorage.setItem("learner_id", demoLid);
                    localStorage.setItem("last_kp", sceneStr);
                    const qs = new URLSearchParams({
                      learner: demoLid,
                      kp: sceneStr,
                      level: String(hskNum),
                      lang: langStr,
                      motivation: "interest",
                      demo: demoKey,
                    }).toString();
                    router.push(`/learning?${qs}`);
                  }}
                  className="group flex flex-col rounded-xl border border-emerald-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg dark:border-emerald-800 dark:bg-slate-900 hover:dark:border-emerald-500"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{icon}</span>
                      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{langStr}</Badge>
                    <Badge variant="outline" className="text-[10px]">HSK {hskNum}</Badge>
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">缓存</Badge>
                    <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">⚡ 0 等待</Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    💡 {highlight}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700">
                    一键进入学习页 →
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* System Architecture Preview */}
        <section className="mb-12">
          <Card>
            <CardHeader>
              <CardTitle>系统架构预览</CardTitle>
              <CardDescription>基于多智能体网状协同的智能学习系统</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                {/* 知识底座 */}
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <h3 className="mb-2 font-semibold text-blue-700 dark:text-blue-300">📚 动态混合知识底座</h3>
                  <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    <li>• 核心知识图谱</li>
                    <li>• 大模型知识库</li>
                    <li>• 人类专家知识库</li>
                  </ul>
                </div>

                {/* 智能体 */}
                <div className="space-y-2">
                  {['A1: 学习者建模', 'A2: 母语阐释', 'A3: 文化对比', 'A4: 内容生成', 'A5: 质量管控'].map((agent, i) => (
                    <div key={i} className="rounded-lg border bg-white p-2 text-center text-xs dark:bg-slate-800">
                      {agent}
                    </div>
                  ))}
                </div>

                {/* 核心流程 */}
                <div className="col-span-3 rounded-lg border bg-slate-50 p-4 dark:bg-slate-800">
                  <h3 className="mb-2 font-semibold">核心学习流程</h3>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-center">
                      <div className="text-2xl">🎯</div>
                      <div>学习者画像</div>
                    </div>
                    <div className="text-slate-400">→</div>
                    <div className="text-center">
                      <div className="text-2xl">🌏</div>
                      <div>母语阐释</div>
                    </div>
                    <div className="text-slate-400">→</div>
                    <div className="text-center">
                      <div className="text-2xl">⚖️</div>
                      <div>文化对比</div>
                    </div>
                    <div className="text-slate-400">→</div>
                    <div className="text-center">
                      <div className="text-2xl">📖</div>
                      <div>场景内容</div>
                    </div>
                    <div className="text-slate-400">→</div>
                    <div className="text-center">
                      <div className="text-2xl">✅</div>
                      <div>质量审核</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Learning Scenes — 三级渐进式钻取 */}
        <section className="mb-12">
          <ProgressiveDisclosure
            selectedLanguage={selectedLanguage}
            selectedLevel={selectedLevel}
            selectedMotivation={selectedMotivation}
            learnerId={currentLearner?.id}
            onError={setError}
          />
        </section>

        {/* Multi-Agent Details */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">多智能体协同机制</h2>
          <Tabs defaultValue="a1" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="a1">A1 学习者建模</TabsTrigger>
              <TabsTrigger value="a2">A2 母语阐释</TabsTrigger>
              <TabsTrigger value="a3">A3 文化对比</TabsTrigger>
              <TabsTrigger value="a4">A4 内容生成</TabsTrigger>
              <TabsTrigger value="a5">A5 质量管控</TabsTrigger>
            </TabsList>
            
            <TabsContent value="a1">
              <Card>
                <CardHeader>
                  <CardTitle>学习者建模智能体 (A1)</CardTitle>
                  <CardDescription>实时更新学习者画像，追踪学习进度</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold">核心功能</h4>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>• 实时更新学习者画像</li>
                        <li>• 计算文化焦虑度 (a = 0.4e_c + 0.3t_c_ratio + 0.2f_c + 0.1n_c)</li>
                        <li>• 追踪能力短板向量 [语法, 听力, 口语, 文化语用, 阅读]</li>
                        <li>• 贝叶斯知识追踪更新</li>
                      </ul>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold">焦虑度调节</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        根据文化焦虑度自动调节母语占比：高焦虑(70-80%) → 中焦虑(40-60%) → 低焦虑(20-30%)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="a2">
              <Card>
                <CardHeader>
                  <CardTitle>母语阐释智能体 (A2)</CardTitle>
                  <CardDescription>生成多语言文化阐释内容</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold">核心原则</h4>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>• 严格遵循HSK等级难度</li>
                        <li>• 文化阐释必须与语言点绑定</li>
                        <li>• 避免文化偏见和刻板印象</li>
                        <li>• 用学习者母语消解文化陌生感</li>
                      </ul>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold">分层标准</h4>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="outline">基础层(HSK1-3)</Badge>
                        <Badge variant="outline">进阶层(HSK4-6)</Badge>
                        <Badge variant="outline">高阶层(HSK7-9)</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="a3">
              <Card>
                <CardHeader>
                  <CardTitle>文化对比智能体 (A3)</CardTitle>
                  <CardDescription>生成结构化跨文化对比内容</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold">核心原则</h4>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>• <strong>中立性</strong>：只陈述客观事实差异，不评判文化优劣</li>
                        <li>• <strong>边界性</strong>：明确标注&ldquo;普遍现象&rdquo;与&ldquo;地域/代际差异&rdquo;</li>
                        <li>• <strong>实用性</strong>：对比内容必须对应中文语用表达点</li>
                        <li>• <strong>渐进性</strong>：对比深度严格匹配HSK等级</li>
                      </ul>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold">12个核心文化维度</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {['时间观念', '空间观念', '集体vs个人', '权力距离', '不确定性规避', '长期导向', '面子与尊严', '送礼文化', '饮食文化', '人际距离', '称呼礼仪', '宗教影响'].map(d => (
                          <Badge key={d} variant="secondary">{d}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="a4">
              <Card>
                <CardHeader>
                  <CardTitle>内容生成智能体 (A4)</CardTitle>
                  <CardDescription>生成场景化学习内容</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold">核心流程</h4>
                      <p className="mt-2 text-sm text-slate-600">
                        &ldquo;文化背景(母语) → 核心语言点 → 跨文化对比 → 场景化练习&rdquo;
                      </p>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold">输出内容类型</h4>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>• 对话场景 (Dialogues)</li>
                        <li>• 多模态练习 (Exercises)</li>
                        <li>• 跨文化评估 (Cultural Assessment)</li>
                        <li>• 语用规则提示 (Pragmatic Hints)</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="a5">
              <Card>
                <CardHeader>
                  <CardTitle>质量管控智能体 (A5)</CardTitle>
                  <CardDescription>审核生成内容，检测偏见</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold">审核标准</h4>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        <li>• 准确率 ≥ 98%</li>
                        <li>• 偏见度 θ &lt; 0.7</li>
                        <li>• 无宗教/政治敏感内容</li>
                        <li>• 语言点与文化点绑定准确</li>
                      </ul>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold">偏见检测算法</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        B(x) = max(sim(x, k_b)) + max(sim(x, t_s))
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>


      </main>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-slate-500">
            <p>母语驱动的跨文化对比式中文学习系统 | 基于多智能体网状协同架构</p>
            <p className="mt-2">技术栈: Next.js 16 + React 19 + TypeScript + Supabase + LLM</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
