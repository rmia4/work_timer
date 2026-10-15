"use client";
import { useState } from "react";
import Login from "../../_components/login";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
      </header>
      <main className="oauth-page">
        <section className="login-card oauth-card">{children}</section>
      </main>
    </div>
  );
}

export function ConsentError({ message }: { message: string }) {
  return (
    <Frame>
      <h1>앱을 연결할 수 없습니다</h1>
      <p role="alert" className="notice error">
        {message}
      </p>
    </Frame>
  );
}

export default function Consent({
  signedIn,
  query,
  clientName,
  clientHost,
  redirectHost,
  loopback,
  scopes,
}: {
  signedIn: boolean;
  query: string;
  clientName: string;
  clientHost: string | null;
  redirectHost: string;
  loopback: boolean;
  scopes: string[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!signedIn) return <Login onSuccess={async () => location.reload()} />;
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/oauth/authorize/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, approve }),
      });
      const data = (await r.json()) as { redirect?: string; error?: string };
      if (!r.ok || !data.redirect) throw Error(data.error || "처리하지 못했습니다.");
      location.assign(data.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
      setBusy(false);
    }
  }
  return (
    <Frame>
      <h1>
        <strong>{clientName}</strong> 앱이 계정 연결을 요청합니다
      </h1>
      <p className="oauth-muted">앱 이름은 앱이 스스로 밝힌 값입니다. 직접 시작한 연결인지 확인해 주세요.</p>
      <dl className="oauth-facts">
        {clientHost && (
          <>
            <dt>앱 정보 제공 도메인</dt>
            <dd>{clientHost}</dd>
          </>
        )}
        <dt>허용할 권한</dt>
        <dd>
          <ul>
            {scopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </dd>
        <dt>연결 후 이동할 주소</dt>
        <dd>{redirectHost}</dd>
      </dl>
      {loopback && (
        <p className="notice">
          이 컴퓨터에서 실행 중인 프로그램(예: Claude Code)으로 돌아갑니다. 직접 요청한 연결이 아니면 거부해 주세요.
        </p>
      )}
      <p className="notice">
        허용한 뒤 연결한 앱(예: Claude 데스크톱 앱)을 재시작해야 커넥터가 보일 수 있습니다.
      </p>
      <p className="oauth-muted">연결은 설정에서 언제든 해제할 수 있습니다. 삭제와 계정 관련 기능은 허용되지 않습니다.</p>
      <div className="form-actions">
        <button type="button" disabled={busy} onClick={() => decide(false)}>
          거부
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => decide(true)}>
          허용
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </Frame>
  );
}
