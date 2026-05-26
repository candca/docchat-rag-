import { useState } from "react";
import type { FormEvent } from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LoginScreenProps {
  onLogin: (
    username: string,
    password: string,
    mode: "login" | "register",
    inviteCode?: string,
  ) => Promise<void>;
  error?: unknown;
}

export function LoginScreen({ onLogin, error }: LoginScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin(username, password, mode, mode === "register" ? inviteCode : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background px-4 text-foreground">
      <form
        onSubmit={submit}
        className="w-full max-w-[360px] rounded-lg border border-border bg-card px-6 py-6 shadow-lg"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <MessageSquareText className="h-5 w-5" />
          <div>
            <h1 className="text-base font-semibold">DocChat</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "login" ? "登录后继续使用你的文档和对话" : "创建账号以保存文档和对话"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              autoComplete="username"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">密码</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          {mode === "register" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">邀请码</span>
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                autoComplete="off"
                placeholder="向管理员索取"
                required
              />
            </label>
          )}
        </div>

        {Boolean(error) && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {String(error)}
          </div>
        )}

        <Button type="submit" className="mt-5 w-full" disabled={submitting}>
          {submitting ? "处理中..." : mode === "login" ? "登录" : "注册并登录"}
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "没有账号？创建一个" : "已有账号？返回登录"}
        </button>
      </form>
    </div>
  );
}
