// 前端 auth 客户端：封装 register/login/logout/me 请求，useAuth() 暴露 user/loading + 操作
"use client";
import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, ReactNode } from "react";
import type { AuthenticatedUser } from "@/lib/auth/types";

export interface AuthMeResponse {
  ok: true;
  user: AuthenticatedUser;
  learner: any | null;
  recent_records: any[];
  assessments: any[];
}

export interface AuthState {
  user: AuthenticatedUser | null;
  /** /api/auth/me 返回的 learner 快照（已绑 learner 时非空） */
  learnerSnapshot: any | null;
  recentRecords: any[];
  assessments: any[];
  loading: boolean;
  /** 最近一次操作的错误信息（组件可展示） */
  lastError: string | null;
}

interface AuthContextValue extends AuthState {
  register: (input: { email: string; password: string; nickname?: string; rememberMe?: boolean; guest_learner_id?: string }) => Promise<{ ok: boolean; code?: string; message?: string; user?: AuthenticatedUser; migrated?: string | null }>;
  login:    (input: { email: string; password: string; rememberMe?: boolean; guest_learner_id?: string }) => Promise<{ ok: boolean; code?: string; message?: string; user?: AuthenticatedUser; migrated?: string | null; lockout?: any }>;
  logout:   () => Promise<void>;
  refresh:  () => Promise<AuthenticatedUser | null>;
  forgot:   (email: string) => Promise<{ ok: boolean; code?: string; message?: string; dev_only_hint?: string; expires_in_sec?: number }>;
  reset:    (input: { email: string; code: string; new_password: string }) => Promise<{ ok: boolean; code?: string; message?: string }>;
  clearError: () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

function readGuestLearnerId(): string | null {
  try { return localStorage.getItem("learner_id"); } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [learnerSnapshot, setLearnerSnapshot] = useState<any | null>(null);
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const clearError = useCallback(() => setLastError(null), []);

  const refresh = useCallback(async (): Promise<AuthenticatedUser | null> => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (res.status === 401) { setUser(null); setLearnerSnapshot(null); setRecentRecords([]); setAssessments([]); return null; }
      const data = await res.json();
      if (data?.ok && data.user) {
        setUser(data.user);
        setLearnerSnapshot(data.learner ?? null);
        setRecentRecords(data.recent_records ?? []);
        setAssessments(data.assessments ?? []);
        // 关键：如果账号已绑定 learner_id，但当前 localStorage 里的 learner_id 不一样 → 替换为账号里的
        if (data.user.learner_id && typeof window !== "undefined") {
          try {
            const cur = localStorage.getItem("learner_id");
            if (cur !== data.user.learner_id) {
              localStorage.setItem("learner_id", data.user.learner_id);
              console.log(`[AuthProvider] 从登录态恢复 learner_id: ${data.user.learner_id.slice(0,8)}`);
            }
          } catch { /* noop */ }
        }
        return data.user;
      }
      setUser(null);
    } catch (e) {
      console.error("[AuthProvider] refresh error:", e);
    }
    return null;
  }, []);

  // 首次挂载：尝试拉 /api/auth/me
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const commonFetchJson = async (url: string, method: string, body?: any) => {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, code: "BAD_JSON", message: "响应解析失败" }));
    return { res, json };
  };

  const register = useCallback<AuthContextValue["register"]>(async (input) => {
    setLastError(null);
    try {
      const payload = { ...input };
      if (input.guest_learner_id === undefined) payload.guest_learner_id = readGuestLearnerId() || undefined;
      const { res, json } = await commonFetchJson("/api/auth/register", "POST", payload);
      if (res.ok && json.ok) {
        setUser(json.user);
        // 迁移成功：learner 已在账号下；调用 refresh 可再完整拉 learner 快照
        await refresh();
        return { ok: true, user: json.user, migrated: json.migrated };
      }
      setLastError(json?.message || "注册失败");
      return { ok: false, code: json?.code, message: json?.message };
    } catch (err: any) {
      setLastError(err?.message || "注册异常");
      return { ok: false, message: err?.message || "注册异常" };
    }
  }, [refresh]);

  const login = useCallback<AuthContextValue["login"]>(async (input) => {
    setLastError(null);
    try {
      const payload = { ...input };
      if (input.guest_learner_id === undefined) payload.guest_learner_id = readGuestLearnerId() || undefined;
      const { res, json } = await commonFetchJson("/api/auth/login", "POST", payload);
      if (res.ok && json.ok) {
        setUser(json.user);
        await refresh();
        return { ok: true, user: json.user, migrated: json.migrated };
      }
      setLastError(json?.message || "登录失败");
      return { ok: false, code: json?.code, message: json?.message, lockout: json?.details?.lockout };
    } catch (err: any) {
      setLastError(err?.message || "登录异常");
      return { ok: false, message: err?.message || "登录异常" };
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await commonFetchJson("/api/auth/logout", "POST");
    } catch (e) { console.error(e); }
    setUser(null);
    setLearnerSnapshot(null);
    setRecentRecords([]);
    setAssessments([]);
    // 退出登录后：不清 learner_id（保持游客态数据不丢，下次再登录还能继续迁移）。
    // 若用户明确需要"登出切号"，可手动清 localStorage。
  }, []);

  const forgot = useCallback<AuthContextValue["forgot"]>(async (email) => {
    setLastError(null);
    try {
      const { res, json } = await commonFetchJson("/api/auth/forgot", "POST", { email });
      if (res.ok && json.ok) return { ok: true, message: json.message, dev_only_hint: json.dev_only_hint, expires_in_sec: json.expires_in_sec };
      setLastError(json?.message || "发送失败");
      return { ok: false, code: json?.code, message: json?.message };
    } catch (err: any) {
      setLastError(err?.message || "发送异常");
      return { ok: false, message: err?.message };
    }
  }, []);

  const reset = useCallback<AuthContextValue["reset"]>(async (input) => {
    setLastError(null);
    try {
      const { res, json } = await commonFetchJson("/api/auth/reset", "POST", input);
      if (res.ok && json.ok) return { ok: true, message: json.message };
      setLastError(json?.message || "重置失败");
      return { ok: false, code: json?.code, message: json?.message };
    } catch (err: any) {
      setLastError(err?.message || "重置异常");
      return { ok: false, message: err?.message };
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, learnerSnapshot, recentRecords, assessments, loading, lastError,
    register, login, logout, refresh, forgot, reset, clearError,
  }), [user, learnerSnapshot, recentRecords, assessments, loading, lastError, register, login, logout, refresh, forgot, reset, clearError]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth 必须在 <AuthProvider> 内使用");
  return ctx;
}
