/**
 * 学习页面 - 完整学习流程 v2
 * 包含：母语阐释 → 跨文化对比 → 学习对话 → 答题练习
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLearner } from "@/lib/learner-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, 
  XCircle, 
  ChevronRight, 
  ChevronLeft,
  Trophy,
  ArrowLeft,
  BookOpen,
  Globe,
  MessageSquare,
  Target
} from "lucide-react";

// 导师演示 · 0 等待离线极速数据包（与首页 8 张 demo 卡片一一对应）
import { DEMO_CASES, resolveDemoKey, type DemoCase } from "@/lib/demo-data-cases";

// ==================== 类型定义 ====================

interface Exercise {
  type: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  dimension?: string;
}

interface Dialogue {
  speaker: string;
  chinese: string;
  translation: string;
  cultural_notes?: string;
}

interface LearningData {
  learner: {
    id: string;
    native_language: string;
    hsk_level: number;
    ability_vector: number[];
  };
  knowledge_point: {
    id: string;
    content_json: {
      zh: {
        topic: string;
      };
    };
  };
  cultural_explanation: string;
  cross_cultural_comparison: string;
  learning_content: {
    scene_title: string;
    dialogues: Dialogue[];
    core_language_points: string[];
    cultural_background: string;
    exercises: Exercise[];
  };
  learning_record_id: string;
  is_fallback?: boolean;
}

type TabValue = "explanation" | "comparison" | "dialogue" | "exercise";

// ==================== 统一答案验证函数 ====================

/**
 * 选项/答案文本清洗：去掉 LLM 脏输出前缀 "A. / B: / C、/ 对．" 等
 * —— options 渲染、判分、正确答案文本 三处共用，保证前后一致
 */
function cleanOptionText(raw: string): string {
  return String(raw ?? "")
    .replace(/^\s*[A-H][\s]*[．.、:：]\s*/i, "")
    .replace(/^\s*[对错][\s]*[．.、:：]\s*/, "")
    .trim();
}

/**
 * 把 correct_answer 各种脏写法统一成：选择题 → 单字母，判断题 → 对/错，填空 → 纯文本
 * 兼容 LLM 直接返回 "A. xxx" / "A：xxx" / "A. 对" / "true" 等。
 */
function normalizeCorrectAnswer(exercise: { correct_answer: string; type?: string; options?: string[] }): string {
  const ca = String(exercise.correct_answer ?? "").trim();
  const type = (exercise.type ?? "").toLowerCase();
  const isChoice = type.includes("choice") || /选择题?/.test(exercise.type ?? "");
  const isTF = type.includes("true_false") || /判断题?/.test(exercise.type ?? "");

  if (isChoice) {
    const m = ca.match(/^([A-H])[．.\s、:：]/i);
    if (m) return m[1].toUpperCase();
    if (/^[A-H]$/i.test(ca)) return ca.toUpperCase();
  }
  if (isTF) {
    const c = ca.toLowerCase();
    if (["对","正确","是","true","t","yes","y"].includes(c) || /^\s*A[．.\s、:：]/.test(ca) || ca === "A") return "对";
    if (["错","错误","否","false","f","no","n"].includes(c) || /^\s*B[．.\s、:：]/.test(ca) || ca === "B") return "错";
    if (ca === "对" || ca === "错") return ca;
  }
  return ca
    .replace(/^["''「「『\s]+|["''」」』\s]+$/g, "")
    .replace(/^\s*[A-H][\s]*[．.、:：]\s*/i, "")
    .trim();
}

/**
 * 验证用户答案是否正确（全链路统一规范化）
 */
function validateAnswer(exercise: Exercise, userAnswer: string): boolean {
  if (!userAnswer) return false;

  const correct = normalizeCorrectAnswer(exercise);
  const answer = userAnswer.trim();

  // 选择题：字母比较
  if (/^[A-D]$/i.test(correct)) {
    return answer.toUpperCase() === correct.toUpperCase();
  }

  // 判断题：correct 是 对/错，但用户答案可能传 A/B → 先映射
  if (correct === "对" || correct === "错") {
    const letterToChinese: Record<string, string> = { A: "对", B: "错" };
    const mappedAnswer = letterToChinese[answer.toUpperCase()] || answer;
    return mappedAnswer === correct;
  }

  // 填空：精确比较（填空答案已在 normalize 里去字母/引号）
  return answer === correct;
}

/**
 * 获取题目的正确答案显示文本（彻底解决 "A. A. 谢谢" 重复字母问题）
 */
function getCorrectAnswerText(exercise: Exercise): string {
  const cleanedOptions = (exercise.options || []).map(cleanOptionText);
  const correct = normalizeCorrectAnswer(exercise);
  if (/^[A-D]$/i.test(correct)) {
    const idx = correct.toUpperCase().charCodeAt(0) - 65;
    const optionText = cleanedOptions[idx];
    if (optionText) return `${correct}. ${optionText}`;
    // 兜底：从原 correct_answer 剥前缀
    const raw = String(exercise.correct_answer ?? "").trim();
    const fallback = raw.replace(/^["''「「『\s]+|["''」」』\s]+$/g, '').replace(/^\s*[A-D][\s]*[．.、:：]\s*/i, '').trim();
    if (fallback) return `${correct}. ${fallback}`;
    return correct;
  }
  return correct;
}

/**
 * 获取判断题的正确选项字母（兼容 options 被 LLM 写成 "A. 对 / A.对 / 对"）
 */
function getTrueFalseCorrectLetter(options: string[]): string {
  const cleaned = (options || []).map(cleanOptionText);
  if (cleaned[0] === "对") return "A";
  return "B";
}

// ==================== 组件定义 ====================

export default function LearningPage() {
  const router = useRouter();
  const { setLearner } = useLearner();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LearningData | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("explanation");
  
  // 答题状态
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [emotionResult, setEmotionResult] = useState<{
    state: string;
    intervention: { learner_message: string; suggested_action: string; tier: string } | null;
  } | null>(null);

  // [P0 修复 2026-08-05] 防止 React StrictMode 开发模式下 effect 双挂载导致
  // /api/learning 被请求两次（后台跑两条完整多智能体链路、约 40 次 LLM 调用，双倍成本）。
  // useRef 在两次挂载间保持不变，因此第二次执行会被拦下。
  const hasRequestedRef = useRef(false);

  // 加载学习数据
  useEffect(() => {
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;

    const loadData = async () => {
      try {
        const learnerId = localStorage.getItem("learner_id") || "new";
        const nativeLang = localStorage.getItem("native_language") || "英语";
        const kpId = localStorage.getItem("last_kp") || "daily";
        const hskLevel = parseInt(localStorage.getItem("hsk_level") || "2", 10);
        const motivation = localStorage.getItem("selected_motivation") || "interest";

        // -------------------------------------------------------------------------
        // 🚀 导师演示 · 极速离线模式（0 等待，不依赖 LLM/Supabase/网络）
        // 如果 URL 有 ?demo=<key> 或 ?scene=&lang=&hsk= 组合能解析到 demo case，
        // 立即 setData(离线数据包) + setLoading(false) → 用户 1 帧 (<16ms) 看内容。
        // 后台仍正常跑 jobs 轮询获取"实时最新版本"，如果回来了就 setData 覆盖升级。
        // -------------------------------------------------------------------------
        let spDemoKey: string | null = null;
        try {
          const sp = new URLSearchParams(window.location.search);
          const explicit = sp.get("demo");
          if (explicit && DEMO_CASES[explicit]) spDemoKey = explicit;
          if (!spDemoKey) {
            const scene = sp.get("kp") || sp.get("scene") || kpId;
            const lang  = sp.get("lang") || nativeLang;
            const hsk   = sp.get("level") || sp.get("hsk") || String(hskLevel);
            const resolved = resolveDemoKey({ scene, lang, hsk });
            if (resolved && DEMO_CASES[resolved]) spDemoKey = resolved;
          }
          if (spDemoKey && DEMO_CASES[spDemoKey]) {
            const instantCase: DemoCase = DEMO_CASES[spDemoKey];
            // 兜底：防止 learner.id 没注入导致 saveResults 后续空字段
            const patched = JSON.parse(JSON.stringify(instantCase)) as DemoCase;
            if (!patched.learner?.id) patched.learner = {
              ...(patched.learner || {} as any),
              id: learnerId !== "new" ? learnerId : ("demo-guest-" + spDemoKey),
              native_language: nativeLang,
              hsk_level: hskLevel,
              ability_vector: (patched.learner as any)?.ability_vector || [50,50,50,50,50]
            };
            patched.is_fallback = patched.is_fallback ?? false;
            patched.from_cache = true;
            patched._demo_meta = (patched as any)._demo_meta || { scene: kpId, lang: nativeLang, hsk: hskLevel, label: "demo", key: spDemoKey, generated_at: new Date().toISOString() };
            setData(patched as any);
            setLoading(false);
            if (patched.learner?.id) localStorage.setItem("learner_id", patched.learner.id);
            console.log(`[DEMO 极速模式] 命中离线 case = ${spDemoKey}（后台继续拉实时数据，拿到了会自动升级）`);
          }
        } catch (e) {
          console.warn("[DEMO 极速模式] 解析失败（非阻塞，降级走正常轮询）:", e);
        }

        // 异步任务模式：POST 秒级返回 task_id，前端轮询进度/结果
        // （同步长请求会撞 Cloudflare 隧道/代理 ~100s 响应超时，故改为轮询）
        let response: Response;
        try {
          response = await fetch("/api/learning/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              learner_id: learnerId,
              knowledge_point_id: kpId,
              hsk_level: hskLevel,
              native_language: nativeLang,
              learning_motivation: motivation
            })
          });
        } catch (fetchErr) {
          // 演示模式下后台 fetch 失败（服务重启/代理临时不可达）→ 如果 setData 已经命中离线 case，直接返回；否则 setError
          if (spDemoKey && DEMO_CASES[spDemoKey]) {
            console.warn("[DEMO 极速模式] 后台 fetch 失败，保留离线 case 继续使用：", (fetchErr as Error).message);
            setLoading(false);
            return;
          }
          throw fetchErr;
        }

        const result = await response.json();

        if (!result.success) {
          // 如果已命中演示 case，静默忽略本次 jobs 失败 → 用户继续看离线内容
          if (spDemoKey && DEMO_CASES[spDemoKey]) {
            console.warn("[DEMO 极速模式] jobs 失败，保留离线 case：", result.error || result.message || "");
            setLoading(false);
            return;
          }
          // 如果学习者ID不存在，清除localStorage中的过期数据
          if (result.error && result.error.includes("不存在")) {
            localStorage.removeItem("learner_id");
          }
          setError(result.error || "加载失败");
          setLoading(false);
          return;
        }

        // 轮询任务状态（每 3 秒），直到 completed / failed
        // 故意：网络临时不可达（服务重启/代理抖动）时不立即报错，
        // 继续下一轮重试，避免一次 fetch 失败就让用户看到「网络错误」
        const taskId: string = result.task_id;
        const MAX_CONSECUTIVE_FAILURES = 6; // 连续 6 次失败（约 18s）才认输
        let consecutiveFailures = 0;
        for (;;) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const taskRes = await fetch(`/api/learning/jobs/${taskId}`);
            const taskJson = await taskRes.json();
            consecutiveFailures = 0; // 任意一次成功重置计数
            if (!taskJson.success) {
              console.warn("查询任务未成功，继续轮询:", taskJson.error);
              continue;
            }
            const taskStatus: string = taskJson.task.status;
            if (taskStatus === "completed") {
              setData(taskJson.task.result);
              if (taskJson.task.result?.learner?.id) {
                localStorage.setItem("learner_id", taskJson.task.result.learner.id);
              }
              break;
            }
            if (taskStatus === "failed") {
              setError(taskJson.task.error || "生成失败");
              break;
            }
            // queued / running → 继续轮询
          } catch (err) {
            consecutiveFailures += 1;
            console.warn(`轮询失败 ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}:`, err);
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              setError("暂时无法连接到服务，请刷新页面或稍后重试");
              break;
            }
            // 否则继续下一轮重试
          }
        }
        setLoading(false);
      } catch (err) {
        setError("网络错误");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // 完成页加载推荐
  useEffect(() => {
    if (!showResult || !data?.learner?.id) return;
    fetch(`/api/learners/${data.learner.id}/recommendations?limit=3`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setRecommendations(json.data || []);
      })
      .catch(() => {});
  }, [showResult, data?.learner?.id]);

  // 提交答案
  const handleSubmit = () => {
    if (!selected || !data) return;
    
    const exercise = data.learning_content.exercises[currentQ];
    const isCorrect = validateAnswer(exercise, selected);
    
    setSubmitted(true);
    setResults(prev => [...prev, isCorrect ? "correct" : "wrong"]);
    
    if (isCorrect) {
      setTotalCorrect(prev => prev + 1);
    }
  };

  // 下一题
  const handleNext = () => {
    if (!data) return;

    const isLast = currentQ >= data.learning_content.exercises.length - 1;

    // [修复] 最后一题：必须先提交才能保存，防止 results 缺最后一题
    if (isLast) {
      if (!submitted) return; // 最后一题还没提交，不响应

      // 乐观更新：立即显示结果页，后台异步保存
      setShowResult(true);
      // fire-and-forget：不 await，保存成败不影响用户看结果
      saveResults().catch(err => console.error("[saveResults] 后台保存失败（非阻塞）:", err));
      return;
    }

    // 非最后一题：直接跳下一题
    setCurrentQ(prev => prev + 1);
    setSelected("");
    setSubmitted(false);
  };

  // 保存学习结果（后台异步，不阻塞UI）
  const saveResults = async () => {
    if (!data) return;

    try {
      const res = await fetch("/api/learning/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learner_id: data.learner.id,
          knowledge_point_id: data.knowledge_point.id,
          learning_record_id: data.learning_record_id || "",
          exercises: data.learning_content.exercises,
          results: results,
          score: Math.round((totalCorrect / data.learning_content.exercises.length) * 100),
          correct_answers: totalCorrect,
          wrong_answers: data.learning_content.exercises.length - totalCorrect,
          ability_vector: data.learner?.ability_vector || [50, 50, 50, 50, 50]
        })
      });

      if (!res.ok) {
        console.error(`[saveResults] HTTP ${res.status}`);
        return;
      }

      const result = await res.json();
      if (result.success && result.data?.updated_learner) {
        // 后端权威：静默更新全局状态源
        setLearner(result.data.updated_learner);
        console.log("[saveResults] 画像已更新:", {
          anxiety: result.data.updated_learner.cultural_anxiety_score,
          vector: result.data.updated_learner.ability_vector
        });
      }
      if (result.success && result.data?.emotion) {
        setEmotionResult(result.data.emotion);
        console.log("[saveResults] 情感检测:", result.data.emotion);
      }
    } catch (err) {
      console.error("[saveResults] 保存失败（非阻塞）:", err);
    }
  };

  // 返回首页
  const handleBack = () => {
    router.push("/");
  };

  // 清除过期数据并重新开始
  const handleRestart = () => {
    localStorage.removeItem("learner_id");
    localStorage.removeItem("last_kp");
    router.push("/");
  };

  // 递归解析嵌套JSON字符串（A2槽位生成可能返回 '{"precise_definition": "..."}' 而非纯文本）
  const deepParseJsonStrings = (obj: unknown, depth = 0): unknown => {
    if (depth > 3 || obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => deepParseJsonStrings(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.trimStart().startsWith('{')) {
        try {
          const parsed = JSON.parse(v);
          // 单键对象展平为值（LLM常返回 '{"key": "text"}'）
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length === 1) {
            const soleValue = Object.values(parsed)[0];
            result[k] = typeof soleValue === 'string' ? soleValue : deepParseJsonStrings(soleValue, depth + 1);
          } else {
            result[k] = deepParseJsonStrings(parsed, depth + 1);
          }
        } catch { result[k] = v; }
      } else {
        result[k] = deepParseJsonStrings(v, depth + 1);
      }
    }
    return result;
  };

  /** 安全提取文本：确保渲染时不会传入对象给 React */
  const safeText = (val: unknown): string => {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val); // 兜底：对象/数组转字符串
  };

  // 安全解析JSON
  const parseJsonContent = (jsonStr: string | null | undefined) => {
    if (!jsonStr) return null;
    try {
      const parsed = JSON.parse(jsonStr);
      return deepParseJsonStrings(parsed);
    } catch {
      return null;
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center">
            <div className="animate-pulse">
              <div className="h-8 bg-slate-200 rounded mb-4 w-48 mx-auto"></div>
              <div className="h-4 bg-slate-200 rounded w-32 mx-auto"></div>
            </div>
            <p className="mt-4 text-slate-500">正在生成学习内容...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 错误状态
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">加载失败</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-4">{error || "未知错误"}</p>
            <div className="flex flex-col gap-2">
              {error && error.includes("不存在") && (
                <Button onClick={handleRestart} variant="default">
                  重新开始学习
                </Button>
              )}
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回首页
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { exercises, dialogues, core_language_points } = data.learning_content;
  const currentExercise = exercises[currentQ];
  const isCorrectSubmitted = submitted && validateAnswer(currentExercise, selected);
  const finalScore = Math.round(totalCorrect / exercises.length * 100);

  // 实时连续错误计数（尾部扫描，与服务端 EmotionCheck 一致）
  let consecutiveErrors = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === "wrong") consecutiveErrors++;
    else break;
  }

  // 完成结果页
  if (showResult) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Trophy className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
            <CardTitle className="text-2xl">学习完成！</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-6xl font-bold text-blue-600 mb-2">{finalScore}%</div>
            <p className="text-slate-500 mb-2">
              答对 {totalCorrect} / {exercises.length} 题
            </p>
            {data.is_fallback && (
              <Badge variant="outline" className="mb-4 text-amber-600">
                使用备用内容
              </Badge>
            )}
            {/* 情感检测反馈 */}
            {emotionResult && (
              <div className={`mt-6 p-4 rounded-lg text-left ${
                emotionResult.state === "red" ? "bg-red-50 border border-red-200" :
                emotionResult.state === "yellow" ? "bg-amber-50 border border-amber-200" :
                "bg-emerald-50 border border-emerald-200"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">
                    {emotionResult.state === "red" ? "🔴" : emotionResult.state === "yellow" ? "🟡" : "🟢"}
                  </span>
                  <span className={`font-semibold text-sm ${
                    emotionResult.state === "red" ? "text-red-700" :
                    emotionResult.state === "yellow" ? "text-amber-700" :
                    "text-emerald-700"
                  }`}>
                    {emotionResult.state === "red" ? "需要关注" :
                     emotionResult.state === "yellow" ? "温馨提示" : "状态良好"}
                  </span>
                </div>
                {emotionResult.intervention?.learner_message && (
                  <p className={`text-sm ${
                    emotionResult.state === "red" ? "text-red-600" :
                    emotionResult.state === "yellow" ? "text-amber-600" :
                    "text-emerald-600"
                  }`}>
                    {emotionResult.intervention.learner_message}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-6">
              <Button onClick={() => {
                setCurrentQ(0);
                setSelected("");
                setSubmitted(false);
                setResults([]);
                setTotalCorrect(0);
                setShowResult(false);
                setEmotionResult(null);
                setActiveTab("explanation");
              }}>
                再学一遍
              </Button>
              <Button variant="outline" onClick={handleBack}>
                返回首页
              </Button>
            </div>

            {/* 下一步推荐 */}
            {recommendations.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-200">
                <p className="text-sm font-medium text-slate-500 mb-3">下一步推荐</p>
                <div className="space-y-2">
                  {recommendations.map((rec: any, i: number) => (
                    <div
                      key={rec.kp_id || i}
                      className="flex items-center gap-3 p-3 rounded-lg border border-purple-100 bg-purple-50/50 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-all"
                      onClick={() => {
                        localStorage.setItem("last_kp", rec.kp_id);
                        localStorage.setItem("native_language", localStorage.getItem("native_language") || data.learner.native_language);
                        localStorage.setItem("hsk_level", localStorage.getItem("hsk_level") || String(data.learner.hsk_level));
                        localStorage.setItem("learner_id", data.learner.id);
                        localStorage.setItem("selected_motivation", localStorage.getItem("selected_motivation") || "interest");
                        router.push(`/learning?kp=${rec.kp_id}&learner=${data.learner.id}&level=${localStorage.getItem("hsk_level") || data.learner.hsk_level}&lang=${localStorage.getItem("native_language") || data.learner.native_language}&motivation=${localStorage.getItem("selected_motivation") || "interest"}`);
                      }}
                    >
                      <span className="text-xl">{rec.domain_icon || "📖"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{rec.kp_name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {rec.reasons?.[0] || rec.scene_name}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">HSK {rec.hsk_level}</Badge>
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
          <Badge variant="outline">{data.knowledge_point.content_json.zh.topic}</Badge>
          <span className="text-sm text-slate-500">
            {data.learner.native_language}
          </span>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-3xl mx-auto p-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="explanation" className="flex items-center gap-1">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">母语阐释</span>
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex items-center gap-1">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">跨文化对比</span>
            </TabsTrigger>
            <TabsTrigger value="dialogue" className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">学习对话</span>
            </TabsTrigger>
            <TabsTrigger value="exercise" className="flex items-center gap-1">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">答题练习</span>
            </TabsTrigger>
          </TabsList>

          {/* 母语阐释 Tab */}
          <TabsContent value="explanation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  文化概念详解
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const exp = parseJsonContent(data.cultural_explanation);
                  if (!exp) {
                    return <p className="text-slate-600">{data.cultural_explanation}</p>;
                  }
                  return (
                    <>
                      {exp.precise_definition && (
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <h4 className="font-medium text-blue-800 mb-2">精准定义</h4>
                          <p className="text-blue-700">{safeText(exp.precise_definition)}</p>
                        </div>
                      )}

                      {exp.scene_introduction && (
                        <div className="bg-green-50 p-4 rounded-lg">
                          <h4 className="font-medium text-green-800 mb-2">典型场景</h4>
                          <p className="text-green-700">{safeText(exp.scene_introduction)}</p>
                        </div>
                      )}

                      {exp.pragmatic_rules && Array.isArray(exp.pragmatic_rules) && (
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <h4 className="font-medium text-purple-800 mb-2">核心规则</h4>
                          <ul className="list-disc list-inside text-purple-700 space-y-1">
                            {exp.pragmatic_rules.map((rule: unknown, i: number) => (
                              <li key={i}>{safeText(rule)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {exp.examples && Array.isArray(exp.examples) && (
                        <div className="bg-amber-50 p-4 rounded-lg">
                          <h4 className="font-medium text-amber-800 mb-2">例句</h4>
                          {exp.examples.map((ex: Record<string, unknown>, i: number) => (
                            <div key={i} className="mb-3 last:mb-0">
                              <p className="text-amber-900 font-medium">{safeText(ex.chinese)}</p>
                              <p className="text-amber-700 text-sm">{safeText(ex.translation)}</p>
                              {ex.notes && <p className="text-amber-600 text-xs mt-1">{safeText(ex.notes)}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {exp.taboo_warnings && Array.isArray(exp.taboo_warnings) && (
                        <div className="bg-red-50 p-4 rounded-lg">
                          <h4 className="font-medium text-red-800 mb-2">注意事项</h4>
                          <ul className="list-disc list-inside text-red-700 space-y-1">
                            {exp.taboo_warnings.map((warning: unknown, i: number) => (
                              <li key={i}>{safeText(warning)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {exp.key_terms && Array.isArray(exp.key_terms) && exp.key_terms.length > 0 && (
                        <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                          <h4 className="font-medium text-teal-800 mb-3 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            重点词汇
                          </h4>
                          <div className="space-y-2">
                            {exp.key_terms.map((term: Record<string, unknown>, i: number) => (
                              <div key={i} className="flex items-start gap-3 bg-white p-2 rounded">
                                <span className="text-teal-800 font-bold text-lg min-w-[2rem]">{safeText(term.chinese)}</span>
                                <div>
                                  <span className="text-teal-600 text-sm">{safeText(term.pinyin)}</span>
                                  <p className="text-slate-600 text-sm">{safeText(term.explanation)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <Button onClick={() => setActiveTab("comparison")} className="w-full">
              下一步：跨文化对比
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </TabsContent>

          {/* 跨文化对比 Tab */}
          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5 text-green-500" />
                  跨文化对比分析
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const comp = parseJsonContent(data.cross_cultural_comparison);
                  if (!comp) {
                    return <p className="text-slate-600">{data.cross_cultural_comparison}</p>;
                  }
                  return (
                    <>
                      {comp.cultural_dimension && (
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <h4 className="font-medium text-blue-800 mb-2">文化维度</h4>
                          <Badge variant="outline">{comp.cultural_dimension}</Badge>
                        </div>
                      )}
                      
                      {comp.similarities && Array.isArray(comp.similarities) && (
                        <div className="bg-green-50 p-4 rounded-lg">
                          <h4 className="font-medium text-green-800 mb-2">相同之处</h4>
                          <ul className="list-disc list-inside text-green-700 space-y-1">
                            {comp.similarities.map((sim: unknown, i: number) => (
                              <li key={i}>{safeText(sim)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {comp.differences && Array.isArray(comp.differences) && (
                        <div className="bg-amber-50 p-4 rounded-lg">
                          <h4 className="font-medium text-amber-800 mb-2">不同之处</h4>
                          <div className="space-y-3">
                            {comp.differences.map((diff: Record<string, unknown>, i: number) => (
                              <div key={i} className="border-l-4 border-amber-300 pl-3">
                                <p className="text-amber-800 text-sm mb-1">{safeText(diff.description)}</p>
                                <p className="text-red-700 text-sm"><strong>中国：</strong>{safeText(diff.chinese_practice)}</p>
                                <p className="text-blue-700 text-sm"><strong>{data.learner.native_language}：</strong>{safeText(diff.target_practice)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {comp.pragmatic_hints && Array.isArray(comp.pragmatic_hints) && (
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <h4 className="font-medium text-purple-800 mb-2">实用提示</h4>
                          <ul className="list-disc list-inside text-purple-700 space-y-1">
                            {comp.pragmatic_hints.map((hint: unknown, i: number) => (
                              <li key={i}>{safeText(hint)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {comp.key_terms && Array.isArray(comp.key_terms) && comp.key_terms.length > 0 && (
                        <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                          <h4 className="font-medium text-teal-800 mb-3 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            对比中的重难点词
                          </h4>
                          <div className="space-y-2">
                            {comp.key_terms.map((term: Record<string, unknown>, i: number) => (
                              <div key={i} className="flex items-start gap-3 bg-white p-2 rounded">
                                <span className="text-teal-800 font-bold text-lg min-w-[2rem]">{safeText(term.chinese)}</span>
                                <div>
                                  <span className="text-teal-600 text-sm">{safeText(term.pinyin)}</span>
                                  <p className="text-slate-600 text-sm">{safeText(term.explanation)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <Button onClick={() => setActiveTab("dialogue")} className="w-full">
              下一步：学习对话
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </TabsContent>

          {/* 学习对话 Tab */}
          <TabsContent value="dialogue" className="space-y-4">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">核心语言点</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside text-slate-600 space-y-1">
                  {core_language_points.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-500" />
                  情景对话
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dialogues.map((d, i) => (
                  <div key={i} className={`p-4 rounded-lg ${i % 2 === 0 ? 'bg-slate-100' : 'bg-blue-50'}`}>
                    <p className="font-medium text-slate-800 mb-1">
                      <span className="text-blue-600">{d.speaker}:</span>
                    </p>
                    <p className="text-lg mb-1">{d.chinese}</p>
                    <p className="text-slate-500 text-sm mb-2">{d.translation}</p>
                    {d.cultural_notes && (
                      <p className="text-purple-600 text-xs bg-purple-50 p-2 rounded">
                        💡 {d.cultural_notes}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            
            <Button onClick={() => setActiveTab("exercise")} className="w-full">
              开始答题练习
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </TabsContent>

          {/* 答题练习 Tab */}
          <TabsContent value="exercise" className="space-y-4">
            {/* 进度条 */}
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>第 {currentQ + 1} / {exercises.length} 题</span>
              <span>正确率: {Math.round((totalCorrect / Math.max(1, currentQ + (submitted ? 0 : 1))) * 100)}%</span>
            </div>
            <Progress value={(currentQ / exercises.length) * 100} className="h-2" />

            {/* 实时情感反馈 */}
            {consecutiveErrors >= 3 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
                <span className="text-lg">🔴</span>
                <div>
                  <p className="text-sm font-medium text-red-700">连续答错 {consecutiveErrors} 题</p>
                  <p className="text-xs text-red-600">别着急，放慢节奏，仔细读题再作答</p>
                </div>
              </div>
            )}
            {consecutiveErrors === 2 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
                <span className="text-lg">🟡</span>
                <div>
                  <p className="text-sm font-medium text-amber-700">已经连续答错 2 题</p>
                  <p className="text-xs text-amber-600">深呼吸，慢慢来，你可以的</p>
                </div>
              </div>
            )}

            {/* 题目卡片 */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{currentExercise.type}</Badge>
                  {submitted && (
                    isCorrectSubmitted ? (
                      <Badge className="bg-green-500">✓ 正确</Badge>
                    ) : (
                      <Badge variant="destructive">✗ 错误</Badge>
                    )
                  )}
                </div>
                <CardTitle className="text-lg">{currentExercise.question}</CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {/* 题目类型判断：选择题 or 填空题 */}
                {currentExercise.type === "填空题" ? (
                  /* 填空题：输入框 */
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="fill-blank" className="text-lg">请填空：</Label>
                        <Input
                          id="fill-blank"
                          type="text"
                          placeholder="输入答案..."
                          value={selected}
                          onChange={(e) => !submitted && setSelected(e.target.value)}
                          disabled={submitted}
                          className={`max-w-xs text-lg ${submitted ? (
                            validateAnswer(currentExercise, selected) 
                              ? "border-green-500 bg-green-50" 
                              : "border-red-500 bg-red-50"
                          ) : ""}`}
                        />
                      </div>
                      {/* 提示 */}
                      {currentExercise.options?.length > 0 && !submitted && (
                        <p className="text-sm text-slate-500 mt-2">
                          提示：{currentExercise.options.join("、")}
                        </p>
                      )}
                    </div>
                    {submitted && !isCorrectSubmitted && (
                      <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                        <p className="text-green-700">
                          <strong>正确答案：</strong>{normalizeCorrectAnswer(currentExercise)}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 选择题/判断题：选项列表 */
                  <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
                    {currentExercise.options.map((option, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isThisSelected = selected === letter;
                      const correct = currentExercise.correct_answer;
                      
                      // 判断是否为正确答案（统一走 normalizeCorrectAnswer，兼容 "A. xxx" 等脏输出）
                      let isCorrectOption = false;
                      const nCorrect = normalizeCorrectAnswer(currentExercise);
                      if (/^[A-D]$/i.test(nCorrect)) {
                        isCorrectOption = letter === nCorrect;
                      } else if (nCorrect === "对" || nCorrect === "错") {
                        isCorrectOption = letter === getTrueFalseCorrectLetter(currentExercise.options);
                      }
                      
                      let className = "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ";
                      
                      if (submitted) {
                        if (isCorrectOption) {
                          className += "border-green-500 bg-green-50";
                        } else if (isThisSelected && !isCorrectSubmitted) {
                          className += "border-red-500 bg-red-50";
                        } else {
                          className += "border-slate-200 opacity-50";
                        }
                      } else {
                        className += isThisSelected 
                          ? "border-blue-500 bg-blue-50" 
                          : "border-slate-200 hover:bg-slate-50";
                      }
                      
                      return (
                        <div
                          key={idx}
                          className={className}
                          onClick={() => !submitted && setSelected(letter)}
                        >
                          <RadioGroupItem value={letter} id={`opt-${idx}`} />
                          <Label htmlFor={`opt-${idx}`} className="flex-1 cursor-pointer">
                            <span className="font-medium mr-2">{letter}.</span>
                            {cleanOptionText(option)}
                          </Label>
                          {submitted && isCorrectOption && (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          )}
                        </div>
                      );
                    })}
                  </RadioGroup>
                )}

                {/* 答案反馈 */}
                {submitted && (
                  <div className={`p-4 rounded-lg ${isCorrectSubmitted ? "bg-green-50" : "bg-red-50"}`}>
                    {!isCorrectSubmitted && (
                      <p className="text-red-700 mb-2">
                        正确答案：{getCorrectAnswerText(currentExercise)}
                      </p>
                    )}
                    {currentExercise.explanation && (
                      <p className="text-slate-600 text-sm">{currentExercise.explanation}</p>
                    )}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (currentQ > 0) {
                        setCurrentQ(prev => prev - 1);
                        setSelected("");
                        setSubmitted(false);
                      }
                    }}
                    disabled={currentQ === 0}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    上一题
                  </Button>
                  
                  {!submitted ? (
                    <Button onClick={handleSubmit} disabled={!selected}>
                      提交答案
                    </Button>
                  ) : currentQ < exercises.length - 1 ? (
                    <Button onClick={handleNext}>
                      下一题
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={handleNext}>
                      完成学习
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
