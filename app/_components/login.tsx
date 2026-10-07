"use client";
import { useState } from "react";
import { LockKeyhole, Timer, Clock3, CalendarDays, StickyNote } from "lucide-react";

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
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
      </header>

      <main className="login-wrap">
        <div className="login-container">
          {/* 상단 영역: 좌측 모던 대형 타이틀 + 우측 로그인 박스 */}
          
          <div className="login-hero-row">
            <section className="login-hero">
              {/* <span className="login-eyebrow">DAILY WORKSPACE</span>
              <h1 className="login-main-title">
                하루의 작업을<br />
                <span>기록하고 확인하세요</span>
              </h1>
              <p className="login-subtitle">
                스톱워치로 작업 시간을 재고, 24시간 활동 시계와<br />
                날짜별 업무 일지에서 하루의 기록을 확인할 수 있습니다.
              </p> */}
            </section>

            {/* 우측 상단: 로그인 박스 */}
            <section className="entry login-card">
              <LockKeyhole size={26} />
              <h1>{mode === "login" ? "로그인" : "회원가입"}</h1>
              <p>
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
                <button
                  type="button"
                  className="signup-button"
                  disabled={busy}
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setPassword("");
                    setConfirmation("");
                    setError("");
                  }}
                >
                  {mode === "login" ? "회원가입" : "로그인으로 돌아가기"}
                </button>
                {error && (
                  <p role="alert" className="notice error">
                    {error}
                  </p>
                )}
              </form>
            </section>
          </div>

          {/* 중앙 / 하단 영역: 웹페이지 설명글 */}
          <section className="login-features-section" aria-label="기능 소개">
            <div className="features-section-header">
              <span className="features-badge">FEATURES</span>
              <h2>주요 기능 둘러보기</h2>
            </div>
            <div className="login-feature-grid">
              <article className="login-feature-card">
                <div className="feature-icon">
                  <Timer size={22} />
                </div>
                <h3>작업 스톱워치</h3>
                <p>
                  브라우저를 닫아도 타이머가 안전하게 유지되어 몰입한 작업 시간을 정확히 측정합니다.
                </p>
              </article>
              <article className="login-feature-card">
                <div className="feature-icon">
                  <Clock3 size={22} />
                </div>
                <h3>24시간 활동 시계</h3>
                <p>
                  하루 동안의 업무 흐름과 집중 시간대를 원형 타임라인으로 한눈에 시각화합니다.
                </p>
              </article>
              <article className="login-feature-card">
                <div className="feature-icon">
                  <CalendarDays size={22} />
                </div>
                <h3>업무 일지 &amp; 캘린더</h3>
                <p>
                  날짜별 작업 내역을 체계적으로 관리하고 캘린더로 지난 기록을 쉽게 확인합니다.
                </p>
              </article>
              <article className="login-feature-card">
                <div className="feature-icon">
                  <StickyNote size={22} />
                </div>
                <h3>일일 &amp; 고정 메모</h3>
                <p>
                  선택한 날짜별 업무 메모와 언제든 바로 꺼내보는 상시 고정 메모장을 제공합니다.
                </p>
              </article>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
