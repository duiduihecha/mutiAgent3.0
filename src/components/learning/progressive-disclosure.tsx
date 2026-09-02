"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight,
  Loader2,
  Globe,
  AlertTriangle,
  Zap,
  ArrowLeft,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import {
  type Domain,
  type Scene,
  type PragmaticTask,
  type DomainSummary,
  type SceneSummary,
} from "@/types/pragmatic-task";

// ============================================================================
// 辅助函数
// ============================================================================

function complexityLabel(level: number): string {
  if (level <= 2) return "浅层礼仪";
  if (level <= 3) return "中等复杂度";
  if (level <= 4) return "较深文化差异";
  return "深层价值观冲突";
}

function complexityColor(level: number): string {
  if (level <= 2) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (level <= 3) return "bg-amber-50 text-amber-700 border-amber-200";
  if (level <= 4) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-red-50 text-red-700 border-red-200";
}

/** 解析 Neo4j 返回的 l1_conflict_points（可能是 JSON 字符串） */
function parseConflictPoints(raw: string | Record<string, string>): Record<string, string> {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

// ============================================================================
// Level 1: Domain 卡片网格
// ============================================================================

function DomainGrid({
  domains,
  selectedId,
  onSelect,
}: {
  domains: DomainSummary[];
  selectedId: string | null;
  onSelect: (domain: DomainSummary) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {domains.map((domain) => {
        const isSelected = selectedId === domain.id;
        return (
          <button
            key={domain.id}
            onClick={() => onSelect(domain)}
            className={`
              group relative flex flex-col items-center rounded-xl border-2 p-4 text-left
              transition-all duration-200 active:scale-[0.96]
              ${
                isSelected
                  ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5"
              }
            `}
          >
            <span className="mb-2 text-3xl transition-transform duration-200 group-hover:scale-110">
              {domain.icon}
            </span>
            <span className="text-sm font-semibold text-slate-800">{domain.name}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-slate-400">
              {domain.name_en}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Level 2: Scene 胶囊选择器
// ============================================================================

function ScenePills({
  scenes,
  selectedId,
  onSelect,
  onBack,
}: {
  scenes: SceneSummary[];
  selectedId: string | null;
  onSelect: (scene: SceneSummary) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回领域列表
      </button>

      <div className="flex flex-wrap gap-2">
        {scenes.map((scene) => {
          const isSelected = selectedId === scene.id;
          return (
            <button
              key={scene.id}
              onClick={() => onSelect(scene)}
              className={`
                inline-flex items-center gap-2 rounded-full border-2 px-4 py-2
                text-sm font-medium transition-all duration-200 active:scale-[0.95]
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-600 text-white shadow-md"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/50"
                }
              `}
            >
              <span>{scene.icon}</span>
              <span>{scene.name}</span>
              <span className="text-[11px] opacity-60">{scene.name_en}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Level 3: Pragmatic Task 详情卡片
// ============================================================================

function TaskCard({
  task,
  onStartLearning,
  isLoading,
}: {
  task: PragmaticTask;
  onStartLearning: (task: PragmaticTask) => void;
  isLoading: boolean;
}) {
  const conflictPoints = parseConflictPoints(task.l1_conflict_points);
  const conflictLanguages = Object.keys(conflictPoints);

  return (
    <Card className="overflow-hidden border-slate-200 transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        {/* 头部 */}
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div className="flex-1">
            <h4 className="mb-1 text-base font-semibold text-slate-900">{task.name}</h4>
            <p className="text-sm leading-relaxed text-slate-500">
              {task.pragmatic_intent}
            </p>
          </div>
        </div>

        {/* 徽章行 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <Badge variant="outline" className="gap-1 border-slate-200 text-xs">
            <Zap className="h-3 w-3" />
            HSK {task.hsk_level}
          </Badge>

          <Badge
            variant="outline"
            className={`gap-1 border text-xs ${complexityColor(task.cultural_complexity)}`}
          >
            <AlertTriangle className="h-3 w-3" />
            {complexityLabel(task.cultural_complexity)}
          </Badge>

          {task.high_context && (
            <Badge variant="outline" className="gap-1 border-purple-200 bg-purple-50 text-purple-700 text-xs">
              <Globe className="h-3 w-3" />
              高语境
            </Badge>
          )}
        </div>

        {/* L1 冲突点 */}
        {conflictLanguages.length > 0 && (
          <div className="px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              母语文化冲突点 ({conflictLanguages.length} 个语圈)
            </p>
            <div className="space-y-1.5">
              {conflictLanguages.slice(0, 3).map((lang) => (
                <div key={lang} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500">
                    {lang.toUpperCase()}
                  </span>
                  <span className="leading-relaxed">{conflictPoints[lang]}</span>
                </div>
              ))}
              {conflictLanguages.length > 3 && (
                <p className="text-[11px] text-slate-400">
                  +{conflictLanguages.length - 3} 个更多语圈…
                </p>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="border-t border-slate-100 p-4">
          <Button
            onClick={() => onStartLearning(task)}
            disabled={isLoading}
            className="w-full gap-2"
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成学习内容…
              </>
            ) : (
              <>
                开始学习
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 动画辅助：CSS slide-down 展开
// ============================================================================

function SlideDown({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`
        grid transition-all duration-300 ease-in-out
        ${show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}
      `}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// ============================================================================
// 动画辅助：CSS fade-up 入场
// ============================================================================

function FadeUp({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      {children}
    </div>
  );
}

// ============================================================================
// 加载骨架屏
// ============================================================================

function DomainGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center rounded-xl border-2 border-slate-100 p-4">
          <Skeleton className="mb-2 h-8 w-8 rounded-full" />
          <Skeleton className="mb-1 h-4 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 主容器：三级渐进式钻取（动态数据版）
// ============================================================================

interface ProgressiveDisclosureProps {
  /** 当前选中的语言（用于 learning API） */
  selectedLanguage: string;
  /** 当前 HSK 等级 */
  selectedLevel: string;
  /** 学习动机 */
  selectedMotivation?: string;
  /** 可选：学习者 ID */
  learnerId?: string;
  /** 错误回调 */
  onError?: (message: string) => void;
}

export function ProgressiveDisclosure({
  selectedLanguage,
  selectedLevel,
  selectedMotivation = "interest",
  learnerId,
  onError,
}: ProgressiveDisclosureProps) {
  const router = useRouter();

  // ---- 数据状态 ----
  const [domains, setDomains] = useState<DomainSummary[]>([]);
  const [isLoadingDomains, setIsLoadingDomains] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ---- 交互状态 ----
  const [activeDomain, setActiveDomain] = useState<DomainSummary | null>(null);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // ---- 初次加载：获取 Domain + Scene 列表 ----
  const fetchDomains = useCallback(async () => {
    setIsLoadingDomains(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/knowledge/graph?action=pragmatic_tree");
      const data = await res.json();
      if (data.success && Array.isArray(data.domains)) {
        setDomains(data.domains);
        if (data.domains.length === 0) {
          setFetchError("知识图谱中暂无数据，请先运行种子脚本导入数据。");
        }
      } else {
        setFetchError(data.error || "获取领域数据失败");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "网络请求失败";
      setFetchError(message);
      onError?.(message);
    } finally {
      setIsLoadingDomains(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // ---- 选择 Domain → 展开 Scene 列表（已在 domains 数据中） ----
  const handleDomainSelect = useCallback((domain: DomainSummary) => {
    if (activeDomain?.id === domain.id) {
      setActiveDomain(null);
      setActiveScene(null);
      return;
    }
    setActiveDomain(domain);
    setActiveScene(null);
  }, [activeDomain?.id]);

  // ---- 选择 Scene → 懒加载 Task 列表 ----
  const handleSceneSelect = useCallback(async (sceneSummary: SceneSummary) => {
    setIsLoadingTasks(true);
    setFetchError(null);

    try {
      const res = await fetch(
        `/api/knowledge/graph?action=scene_tasks&scene_id=${encodeURIComponent(sceneSummary.id)}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        const sceneWithTasks: Scene = {
          id: sceneSummary.id,
          name: sceneSummary.name,
          name_en: sceneSummary.name_en,
          icon: sceneSummary.icon,
          description: sceneSummary.description,
          tasks: data.tasks.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            name: t.name as string,
            pragmatic_intent: t.pragmatic_intent as string,
            cultural_complexity: t.cultural_complexity as number,
            high_context: Boolean(t.high_context),
            hsk_level: t.hsk_level as number,
            l1_conflict_points: (t.l1_conflict_points as string) || "{}",
          })),
        };
        setActiveScene(sceneWithTasks);
      } else {
        setFetchError(data.error || "获取任务列表失败");
        onError?.(data.error || "获取任务列表失败");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "网络请求失败";
      setFetchError(message);
      onError?.(message);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [onError]);

  // ---- 返回 Domain 列表 ----
  const handleBackToDomains = useCallback(() => {
    setActiveDomain(null);
    setActiveScene(null);
  }, []);

  // ---- 返回 Scene 列表 ----
  const handleBackToScenes = useCallback(() => {
    setActiveScene(null);
  }, []);

  // ---- 发起学习请求（调用现有 POST /api/learning） ----
  const handleStartLearning = useCallback(
    async (task: PragmaticTask) => {
      if (!selectedLanguage) {
        onError?.("请先选择您的母语");
        return;
      }

      setLoadingTaskId(task.id);

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("native_language", selectedLanguage);
          localStorage.setItem("hsk_level", selectedLevel || "1");
          localStorage.setItem("selected_motivation", selectedMotivation || "interest");
          if (learnerId) localStorage.setItem("learner_id", learnerId);
          localStorage.setItem("last_kp", task.id);
        }

        const params = new URLSearchParams({
          learner: learnerId || "new",
          kp: task.id,
          level: selectedLevel || "1",
          lang: selectedLanguage,
          motivation: selectedMotivation || "interest",
        });

        router.push(`/learning?${params.toString()}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        onError?.(message);
        setLoadingTaskId(null);
      }
    },
    [selectedLanguage, selectedLevel, selectedMotivation, learnerId, router, onError]
  );

  // ---- 从 DomainSummary 推导 SceneSummary 列表 ----
  const currentSceneSummaries: SceneSummary[] = activeDomain?.scenes ?? [];
  const currentTasks = activeScene?.tasks ?? [];

  // ---- 错误页面 ----
  if (fetchError && domains.length === 0 && !isLoadingDomains) {
    return (
      <div className="rounded-lg border border-dashed border-red-200 bg-red-50/50 px-6 py-12 text-center">
        <WifiOff className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="mb-2 text-sm font-medium text-red-700">数据加载失败</p>
        <p className="mb-4 text-sm text-red-500">{fetchError}</p>
        <Button variant="outline" size="sm" onClick={fetchDomains} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ==================== Header ==================== */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">选择学习场景</h2>
          <p className="mt-1 text-sm text-slate-500">
            {activeDomain
              ? activeScene
                ? `${activeDomain.icon} ${activeDomain.name} → ${activeScene.icon} ${activeScene.name}`
                : `${activeDomain.icon} ${activeDomain.name} — 请选择具体场景`
              : "选择您感兴趣的语用领域，逐级深入"}
          </p>
        </div>
        {/* 三级进度指示 */}
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <span className={activeDomain ? "font-semibold text-blue-600" : ""}>1. 领域</span>
          <ChevronRight className="h-3 w-3" />
          <span className={activeScene ? "font-semibold text-blue-600" : ""}>2. 场景</span>
          <ChevronRight className="h-3 w-3" />
          <span className={activeScene ? "font-semibold text-blue-600" : ""}>3. 任务</span>
        </div>
      </div>

      {/* 进度条 */}
      <Progress
        value={!activeDomain ? 33 : !activeScene ? 66 : 100}
        className="h-1"
      />

      {/* ==================== Level 1: Domain 卡片 ==================== */}
      {isLoadingDomains ? (
        <DomainGridSkeleton />
      ) : (
        <DomainGrid
          domains={domains}
          selectedId={activeDomain?.id ?? null}
          onSelect={handleDomainSelect}
        />
      )}

      {/* ==================== Level 2: Scene 胶囊（展开/收起） ==================== */}
      <SlideDown show={!!activeDomain}>
        {activeDomain && (
          <>
            <Separator className="my-4" />
            <ScenePills
              scenes={currentSceneSummaries}
              selectedId={activeScene?.id ?? null}
              onSelect={handleSceneSelect}
              onBack={handleBackToDomains}
            />
          </>
        )}
      </SlideDown>

      {/* ==================== Level 3: Task 卡片 ==================== */}
      <FadeUp show={!!activeScene}>
        {activeScene && (
          <>
            <Separator className="my-4" />

            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={handleBackToScenes}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回场景列表
              </button>
              <span className="text-sm text-slate-300">|</span>
              <span className="text-sm text-slate-500">
                {activeScene.name} — {currentTasks.length} 个语用任务
              </span>
            </div>

            {isLoadingTasks ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6 space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <div className="flex gap-2 pt-2">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {currentTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStartLearning={handleStartLearning}
                    isLoading={loadingTaskId === task.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </FadeUp>

      {/* ==================== 空状态提示 ==================== */}
      {activeDomain && !activeScene && currentSceneSummaries.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-6 py-8 text-center">
          <p className="text-sm text-slate-400">
            该领域暂无可用场景，请选择其他领域
          </p>
        </div>
      )}

      {activeDomain && !activeScene && currentSceneSummaries.length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-6 py-8 text-center">
          <p className="text-sm text-slate-400">
            请在上方选择一个场景胶囊，以查看具体的语用任务
          </p>
        </div>
      )}
    </div>
  );
}
