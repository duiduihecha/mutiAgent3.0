"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-client";
import { AuthModal } from "./auth-modal";

/**
 * Header 右上角的「登录/注册」按钮或已登录用户徽章
 * （挂在首页 header 右侧；后续可以抽成全局组件挂 layout header 里）
 */
export function UserAuthBadge({ size = "default" }: { size?: "default" | "sm" }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"login" | "register" | "forgot">("login");
  const [busy, setBusy] = useState(false);

  const btnClass = size === "sm" ? "text-xs px-3 py-1" : "px-4 py-2";

  if (auth.loading) {
    return (
      <span className={`inline-flex items-center gap-2 text-sm text-slate-500 ${btnClass} rounded-md border border-dashed border-slate-300`}>
        <span className="inline-block w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
        加载登录态…
      </span>
    );
  }

  if (auth.user) {
    const nick = auth.user.nickname || auth.user.email.split("@")[0];
    const total = (auth.recentRecords || []).reduce((sum: number, r: any) => sum + (r.total || 0), 0);
    const correct = (auth.recentRecords || []).reduce((sum: number, r: any) => sum + Math.round((r.correct_rate || 0) * (r.total || 0)), 0);
    const accText = total > 0 ? ` ${correct}/${total}题` : " 暂无练习记录";
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-gradient-to-r from-emerald-50 to-indigo-50 text-slate-700 border-slate-300 px-3 py-1">
          <span className="mr-1">🔓</span>
          <span className="font-semibold">{nick}</span>
          <span className="ml-2 hidden md:inline text-[11px] text-slate-500">{auth.user.email}</span>
          <span className="ml-2 text-[11px] text-slate-500">{accText}</span>
        </Badge>
        <Button
          variant="ghost"
          size={size === "sm" ? "sm" : "default"}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try { await auth.logout(); } finally { setBusy(false); }
          }}>
          {busy ? "退出中…" : "退出登录"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-white/60 text-slate-500 px-3 py-1 text-xs border-slate-300">
          <span className="mr-1">👤</span>游客模式（进度仅保存本浏览器）
        </Badge>
        <Button
          size={size === "sm" ? "sm" : "default"}
          onClick={() => { setTab("login"); setOpen(true); }}>
          登录
        </Button>
        <Button
          variant="outline"
          size={size === "sm" ? "sm" : "default"}
          onClick={() => { setTab("register"); setOpen(true); }}>
          注册
        </Button>
      </div>
      <AuthModal open={open} onOpenChange={setOpen} defaultTab={tab} />
    </>
  );
}
