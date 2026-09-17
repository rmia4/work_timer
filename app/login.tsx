"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
export default function Login({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) {
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login-wrap">
      <section className="entry login-card">
        <LockKeyhole size={28} />
        <h1>업무 기록</h1>
        <p>접속 코드를 입력해 주세요.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
              });
              const data = (await r.json()) as { error?: string };
              if (!r.ok) throw Error(data.error || "접속하지 못했습니다.");
              setCode("");
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
          <label htmlFor="access-code">
            접속 코드
            <input
              id="access-code"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {busy ? "확인 중…" : "들어가기"}
          </button>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
