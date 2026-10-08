"use client";
import { useState } from "react";
import LoginPreview from "./login-preview";

export default function Login({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [mode, setMode] = useState<"login" | "signup">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const switchMode = (next: "login" | "signup") => {
    if (next === mode) return;
    setMode(next);
    setPassword("");
    setConfirmation("");
    setError("");
  };
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
      </header>

      <main className="login-page">
        <div className="login-wrap">
          <section className="login-intro" aria-label="기능 소개">
            <h1 className="login-title">작업 시간과 일지를 한곳에서.</h1>
            <LoginPreview />
          </section>

          <section className="login-card">
            <div className="login-mode-tabs" role="tablist" aria-label="로그인 또는 회원가입">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "on" : ""}
                disabled={busy}
                onClick={() => switchMode("login")}
              >
                로그인
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "on" : ""}
                disabled={busy}
                onClick={() => switchMode("signup")}
              >
                회원가입
              </button>
            </div>
            <p className="login-hint">
              {mode === "login"
                ? "아이디와 비밀번호를 입력해 주세요."
                : "아이디는 영문 소문자·숫자·밑줄 4~20자, 비밀번호는 8자 이상 입력해 주세요."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const r = await fetch(
                    mode === "login" ? "/api/auth" : "/api/auth/signup",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username, password, confirmation }),
                    },
                  );
                  const data = (await r.json()) as { error?: string };
                  if (!r.ok)
                    throw Error(
                      data.error ||
                        (mode === "login"
                          ? "로그인하지 못했습니다."
                          : "가입하지 못했습니다."),
                    );
                  setPassword("");
                  setConfirmation("");
                  await onSuccess();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "연결을 확인해 주세요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="username">
                아이디
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoFocus
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  minLength={mode === "signup" ? 4 : undefined}
                  maxLength={20}
                  pattern={mode === "signup" ? "[A-Za-z0-9_]{4,20}" : undefined}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label htmlFor="password">
                비밀번호
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {mode === "signup" && (
                <label htmlFor="password-confirmation">
                  비밀번호 확인
                  <input
                    id="password-confirmation"
                    name="password-confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
              )}
              <button className="primary" disabled={busy} type="submit">
                {busy
                  ? mode === "login"
                    ? "로그인 중…"
                    : "가입 중…"
                  : mode === "login"
                    ? "로그인"
                    : "가입하기"}
              </button>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
