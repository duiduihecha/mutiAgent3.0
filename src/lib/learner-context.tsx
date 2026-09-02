/**
 * LearnerContext — 前端唯一 learner 状态源（扩展兼容账号登录）
 *
 * 扩展点（2025-06 方案 C 认证）：
 *   1. 若 AuthProvider 已经检测到登录态且 user.learner_id 非空 → 优先用该 learner
 *      （localStorage.learner_id 只作为游客兜底，不再覆盖登录账号的 learner）
 *   2. initLearner 创建 learner 之后，如果当前已登录且 user 还没绑定 learner_id
 *      → 自动调 POST /api/auth/link-learner 把新 learner 归到账号下
 */
"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useAuth } from "@/lib/auth-client";

export interface Learner {
  id: string;
  native_language: string;
  hsk_level: number;
  cultural_anxiety_score: number;
  ability_vector: number[];
  [key: string]: unknown;
}

interface LearnerContextValue {
  learner: Learner | null;
  setLearner: (value: Learner | null | ((prev: Learner | null) => Learner | null)) => void;
  fetchLearner: (learnerId: string) => Promise<Learner | null>;
  initLearner: (learnerId: string, nativeLanguage: string, hskLevel: number, motivation?: string) => Promise<Learner | null>;
  loading: boolean;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [learner, setLearnerInternal] = useState<Learner | null>(null);
  const [loading, setLoading] = useState(false);
  // 注意：LearnerProvider 在 AuthProvider 内层（见 layout.tsx），这里可安全使用 useAuth
  const auth = useAuth();

  const setLearner = useCallback((value: Learner | null | ((prev: Learner | null) => Learner | null)) => {
    if (typeof value === "function") {
      setLearnerInternal(prev => (value as (prev: Learner | null) => Learner | null)(prev));
    } else {
      setLearnerInternal(value);
    }
  }, []);

  const fetchLearner = useCallback(async (learnerId: string): Promise<Learner | null> => {
    try {
      const res = await fetch(`/api/learners/${learnerId}`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (data.success && data.data) {
        const l = data.data as Learner;
        setLearner(l);
        return l;
      }
      if (res.status === 404) {
        console.warn("[LearnerContext] learner not found, clearing stale localStorage");
        if (typeof window !== "undefined") localStorage.removeItem("learner_id");
        setLearner(null);
      }
    } catch (err) {
      console.error("[LearnerContext] fetchLearner failed:", err);
    }
    return null;
  }, []);

  // 把新创建的 learner 关联到当前账号（避免"登出前创建 learner → 登录后进度不挂在账号下"）
  const linkLearnerToAccount = useCallback(async (newLearnerId: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/link-learner", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learner_id: newLearnerId }),
      });
      return res.ok;
    } catch (e) {
      console.warn("[LearnerContext] link failed:", e);
      return false;
    }
  }, []);

  const initLearner = useCallback(async (learnerId: string, nativeLanguage: string, hskLevel: number, motivation?: string): Promise<Learner | null> => {
    setLoading(true);
    try {
      // 【已登录且账号有 learner_id → 用账号自己的 learner，跳过创建】
      if (auth.user?.learner_id && (!learnerId || learnerId === "new")) {
        console.log(`[LearnerContext] 账号已绑定 learner=${auth.user.learner_id.slice(0, 8)}，跳过新建`);
        const l = await fetchLearner(auth.user.learner_id);
        return l;
      }

      if (learnerId && learnerId !== "new") {
        const l = await fetchLearner(learnerId);
        if (l) return l;
      }

      // 创建新 learner
      const res = await fetch("/api/learners", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          native_language: nativeLanguage,
          hsk_level: hskLevel,
          learning_motivation: motivation || "interest",
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const l = data.data as Learner;
        setLearner(l);
        if (typeof window !== "undefined") {
          localStorage.setItem("learner_id", l.id);
          localStorage.setItem("native_language", l.native_language);
          localStorage.setItem("hsk_level", String(l.hsk_level));
        }
        // 已登录但账号还没 learner → 把新 learner 挂到账号下
        if (auth.user && !auth.user.learner_id) {
          const ok = await linkLearnerToAccount(l.id);
          if (ok) {
            auth.user.learner_id = l.id;
            console.log(`[LearnerContext] learner 已挂到账号 user=${auth.user.user_id.slice(0, 8)}`);
            // 刷新 AuthProvider 的 user + learner 快照
            auth.refresh();
          }
        }
        return l;
      }
    } catch (err) {
      console.error("[LearnerContext] initLearner failed:", err);
    } finally {
      setLoading(false);
    }
    return null;
  }, [auth, fetchLearner, linkLearnerToAccount]);

  // 首次挂载 + 登录态变化：优先恢复「账号已绑定的 learner」
  useEffect(() => {
    if (typeof window === "undefined") return;
    const authLearnerId = auth.user?.learner_id;
    const savedId = localStorage.getItem("learner_id");

    if (authLearnerId) {
      if (learner?.id !== authLearnerId) fetchLearner(authLearnerId);
      return;
    }
    // 未登录：老逻辑，localStorage 恢复
    if (savedId && (!learner || learner.id !== savedId)) {
      fetchLearner(savedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.user_id, auth.user?.learner_id]);

  return (
    <LearnerContext.Provider value={{ learner, setLearner, fetchLearner, initLearner, loading }}>
      {children}
    </LearnerContext.Provider>
  );
}

export function useLearner(): LearnerContextValue {
  const ctx = useContext(LearnerContext);
  if (!ctx) throw new Error("useLearner must be used within a LearnerProvider");
  return ctx;
}
