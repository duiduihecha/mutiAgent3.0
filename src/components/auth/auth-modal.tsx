"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth-client";

type Tab = "login" | "register" | "forgot";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: Tab;
}

/** 注册/登录/忘记密码三合一 Modal */
export function AuthModal({ open, onOpenChange, defaultTab = "login" }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const auth = useAuth();

  // 登录表单
  const [liEmail, setLiEmail] = useState("");
  const [liPw, setLiPw] = useState("");
  const [liRemember, setLiRemember] = useState(true);
  const [liBusy, setLiBusy] = useState(false);
  const [liMsg, setLiMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 注册表单
  const [reEmail, setReEmail] = useState("");
  const [rePw, setRePw] = useState("");
  const [rePw2, setRePw2] = useState("");
  const [reNick, setReNick] = useState("");
  const [reRemember, setReRemember] = useState(true);
  const [reBusy, setReBusy] = useState(false);
  const [reMsg, setReMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 忘记密码表单
  const [fgEmail, setFgEmail] = useState("");
  const [fgStep, setFgStep] = useState<1 | 2>(1); // 1: 发验证码 2: 校验+重设
  const [fgCode, setFgCode] = useState("");
  const [fgNewPw, setFgNewPw] = useState("");
  const [fgBusy, setFgBusy] = useState(false);
  const [fgMsg, setFgMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [fgDevHint, setFgDevHint] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // 打开时清空错误态
      setLiMsg(null); setReMsg(null); setFgMsg(null); setFgStep(1); setFgDevHint(null);
    }
  }, [open]);

  useEffect(() => {
    // 登录/注册成功后自动关 Modal
    if (open && auth.user) onOpenChange(false);
  }, [auth.user, open, onOpenChange]);

  const loginDisabled = useMemo(() => !/^\S+@\S+\.\S+$/.test(liEmail.trim()) || liPw.length < 8, [liEmail, liPw]);
  const registerDisabled = useMemo(() => !/^\S+@\S+\.\S+$/.test(reEmail.trim()) || rePw.length < 8 || rePw !== rePw2, [reEmail, rePw, rePw2]);
  const resetDisabled = useMemo(() => !/^\S+@\S+\.\S+$/.test(fgEmail.trim()) || !/^\d{6}$/.test(fgCode.trim()) || fgNewPw.length < 8, [fgEmail, fgCode, fgNewPw]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLiMsg(null); setLiBusy(true);
    try {
      const r = await auth.login({ email: liEmail, password: liPw, rememberMe: liRemember });
      if (r.ok) {
        setLiMsg({ type: "ok", text: `登录成功${r.migrated && r.migrated !== "NO_GUEST" && r.migrated !== "HAS_OWN_LEARNER" ? "（游客进度已自动迁移到账号下）" : ""}！正在刷新学习画像…` });
      } else {
        const msg = r.message || "登录失败";
        const lock = (r as any).lockout;
        setLiMsg({ type: "err", text: lock?.locked ? `账号已临时锁定，${Math.ceil((lock.retryAfterSec ?? 0)/60)} 分钟后再试` : msg });
      }
    } finally { setLiBusy(false); }
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setReMsg(null); setReBusy(true);
    try {
      const r = await auth.register({ email: reEmail, password: rePw, nickname: reNick || undefined, rememberMe: reRemember });
      if (r.ok) {
        setReMsg({ type: "ok", text: `注册成功！${r.migrated === "REGISTER_BIND" ? "你之前的游客学习进度已自动迁移到本账号下。" : ""}即将刷新学习画像…` });
      } else {
        const msg = r.message || "注册失败";
        setReMsg({ type: "err", text: /EMAIL_TAKEN|邮箱已注册/.test(r.code || "") ? "该邮箱已被注册，请直接登录" : msg });
      }
    } finally { setReBusy(false); }
  };

  const onForgotSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFgMsg(null); setFgBusy(true); setFgDevHint(null);
    try {
      const r = await auth.forgot(fgEmail);
      if (r.ok) {
        setFgMsg({ type: "ok", text: r.message || "验证码已发送" });
        if (r.dev_only_hint) setFgDevHint(r.dev_only_hint);
        setFgStep(2);
      } else {
        setFgMsg({ type: "err", text: r.message || "发送失败" });
      }
    } finally { setFgBusy(false); }
  };

  const onForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFgMsg(null); setFgBusy(true);
    try {
      const r = await auth.reset({ email: fgEmail, code: fgCode.trim(), new_password: fgNewPw });
      if (r.ok) {
        setFgMsg({ type: "ok", text: "密码已重置！请切回「登录」Tab 用新密码登录" });
        setTimeout(() => { setTab("login"); setLiEmail(fgEmail); }, 900);
      } else {
        setFgMsg({ type: "err", text: r.message || "重置失败" });
      }
    } finally { setFgBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <span>🌏</span>
            <span>跨文化中文学习 · 账号</span>
          </DialogTitle>
          <DialogDescription>
            登录后你的学习者画像、文化焦虑度、做题历史和推荐结果都会自动保留，跨设备不丢失。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
            <TabsTrigger value="forgot">忘记密码</TabsTrigger>
          </TabsList>

          {/* ==== LOGIN TAB ==== */}
          <TabsContent value="login" asChild>
            <form onSubmit={onLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="li-email">邮箱</Label>
                <Input id="li-email" type="email" autoComplete="email" required placeholder="you@example.com"
                  value={liEmail} onChange={(e) => setLiEmail(e.target.value)} disabled={liBusy} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="li-pw">密码（至少 8 位）</Label>
                <Input id="li-pw" type="password" autoComplete="current-password" required
                  placeholder="••••••••" minLength={8}
                  value={liPw} onChange={(e) => setLiPw(e.target.value)} disabled={liBusy} />
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="size-4 accent-indigo-600"
                    checked={liRemember} onChange={(e) => setLiRemember(e.target.checked)} />
                  <span>记住我（7 天免登录）</span>
                </label>
                <button type="button" className="text-indigo-600 hover:underline"
                  onClick={() => { setTab("forgot"); setFgEmail(liEmail); }}>
                  忘记密码？
                </button>
              </div>

              {liMsg && (
                <Alert variant={liMsg.type === "ok" ? "default" : "destructive"}>
                  <AlertDescription>{liMsg.type === "ok" ? "✅ " : "❌ "}{liMsg.text}</AlertDescription>
                </Alert>
              )}

              <DialogFooter className="flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2 pt-1">
                <Button type="submit" disabled={loginDisabled || liBusy} className="sm:min-w-[120px]">
                  {liBusy ? "登录中…" : "登录"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setTab("register")}
                  disabled={liBusy}>还没有账号？去注册</Button>
                <DialogClose asChild><Button type="button" variant="secondary" disabled={liBusy}>取消</Button></DialogClose>
              </DialogFooter>
              <p className="text-xs text-slate-500 leading-relaxed pt-1 border-t pt-3">
                🔒 密码使用 bcrypt-12 加盐哈希存储，后端无法看到明文。连续失败 5 次将锁定 15 分钟（可通过忘记密码重置解锁）。
                注册时会自动把当前浏览器里的 <Badge variant="outline" className="align-middle text-[10px] px-1 py-0">游客 learner_id</Badge> 迁移归到新账号。
              </p>
            </form>
          </TabsContent>

          {/* ==== REGISTER TAB ==== */}
          <TabsContent value="register" asChild>
            <form onSubmit={onRegister} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="re-email">邮箱 *</Label>
                <Input id="re-email" type="email" autoComplete="email" required placeholder="you@example.com"
                  value={reEmail} onChange={(e) => setReEmail(e.target.value)} disabled={reBusy} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="re-pw">密码 *（至少 8 位）</Label>
                  <Input id="re-pw" type="password" autoComplete="new-password" required minLength={8}
                    placeholder="••••••••"
                    value={rePw} onChange={(e) => setRePw(e.target.value)} disabled={reBusy} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="re-pw2">确认密码 *</Label>
                  <Input id="re-pw2" type="password" autoComplete="new-password" required minLength={8}
                    placeholder="再次输入"
                    value={rePw2} onChange={(e) => setRePw2(e.target.value)} disabled={reBusy} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="re-nick">昵称（可选，显示在右上角）</Label>
                <Input id="re-nick" type="text" placeholder="比如：小明" maxLength={32}
                  value={reNick} onChange={(e) => setReNick(e.target.value)} disabled={reBusy} />
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="size-4 accent-indigo-600"
                  checked={reRemember} onChange={(e) => setReRemember(e.target.checked)} />
                <span>记住我（7 天免登录）</span>
              </label>

              {reMsg && (
                <Alert variant={reMsg.type === "ok" ? "default" : "destructive"}>
                  <AlertDescription>{reMsg.type === "ok" ? "🎉 " : "❌ "}{reMsg.text}</AlertDescription>
                </Alert>
              )}

              <DialogFooter className="flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2 pt-1">
                <Button type="submit" disabled={registerDisabled || reBusy} className="sm:min-w-[120px]">
                  {reBusy ? "创建中…" : "创建账号"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setTab("login")} disabled={reBusy}>
                  已有账号？去登录
                </Button>
                <DialogClose asChild><Button type="button" variant="secondary" disabled={reBusy}>取消</Button></DialogClose>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* ==== FORGOT TAB ==== */}
          <TabsContent value="forgot" className="pt-4">
            {fgStep === 1 ? (
              <form onSubmit={onForgotSend} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fg-email">注册邮箱</Label>
                  <Input id="fg-email" type="email" required placeholder="you@example.com"
                    value={fgEmail} onChange={(e) => setFgEmail(e.target.value)} disabled={fgBusy} />
                </div>
                {fgMsg && (
                  <Alert variant={fgMsg.type === "ok" ? "default" : "destructive"}>
                    <AlertDescription>{(fgMsg.type === "ok" ? "📧 " : "❌ ") + fgMsg.text}</AlertDescription>
                  </Alert>
                )}
                {fgDevHint && (
                  <Alert variant="default">
                    <AlertDescription className="font-mono text-[12px] leading-5 whitespace-pre-wrap break-words">
                      🧪 开发环境验证码（生产环境将发送到真实邮箱）：
                      <br />{fgDevHint}
                    </AlertDescription>
                  </Alert>
                )}
                <DialogFooter className="flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2 pt-1">
                  <Button type="submit" disabled={!/^\S+@\S+\.\S+$/.test(fgEmail.trim()) || fgBusy} className="sm:min-w-[160px]">
                    {fgBusy ? "发送中…" : "发送 6 位验证码"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setTab("login")} disabled={fgBusy}>
                    想起密码？返回登录
                  </Button>
                  <DialogClose asChild><Button type="button" variant="secondary" disabled={fgBusy}>取消</Button></DialogClose>
                </DialogFooter>
                <p className="text-xs text-slate-500 pt-2 border-t">
                  开发环境：验证码会打印到服务端 app.log，并通过 dev_only_hint 返回给 Modal（仅 dev）。
                  生产环境接入 Resend/SMTP 即可真实发信。
                </p>
              </form>
            ) : (
              <form onSubmit={onForgotReset} className="space-y-4">
                <Alert variant="default">
                  <AlertDescription>📧 已向 <b>{fgEmail}</b> 发送 6 位数字验证码（10 分钟内有效）。输入验证码与新密码即可重置。</AlertDescription>
                </Alert>
                <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
                  <Label htmlFor="fg-code">验证码</Label>
                  <Input id="fg-code" required inputMode="numeric" maxLength={6} placeholder="6 位数字"
                    value={fgCode} onChange={(e) => setFgCode(e.target.value.replace(/\D/g, ''))} disabled={fgBusy} />
                  <Label htmlFor="fg-np">新密码</Label>
                  <Input id="fg-np" type="password" required minLength={8} placeholder="至少 8 位"
                    value={fgNewPw} onChange={(e) => setFgNewPw(e.target.value)} disabled={fgBusy} />
                </div>

                {fgMsg && (
                  <Alert variant={fgMsg.type === "ok" ? "default" : "destructive"}>
                    <AlertDescription>{(fgMsg.type === "ok" ? "✅ " : "❌ ") + fgMsg.text}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter className="flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2 pt-1">
                  <Button type="submit" disabled={resetDisabled || fgBusy} className="sm:min-w-[120px]">
                    {fgBusy ? "重置中…" : "确认重置密码"}
                  </Button>
                  <Button type="button" variant="ghost" disabled={fgBusy}
                    onClick={() => { setFgStep(1); setFgMsg(null); setFgCode(""); setFgDevHint(null); }}>
                    没收到验证码？重新发送
                  </Button>
                  <DialogClose asChild><Button type="button" variant="secondary" disabled={fgBusy}>取消</Button></DialogClose>
                </DialogFooter>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
