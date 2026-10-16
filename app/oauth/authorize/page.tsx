import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCodeUser } from "../../_auth/code-auth";
import { clientAddress } from "../../../lib/auth";
import { database } from "../../../db/raw";
import { appOrigin, checkAuthorizeRequest, isLoopback, SCOPE_LABELS } from "../../../lib/oauth";
import Consent, { ConsentError } from "./consent";

export const metadata: Metadata = { title: "앱 연결 · Work Timer" };

// 인가 요청을 검증하고 로그인 여부를 확인한다. 렌더 밖에서 현재 시각을 읽도록 컴포넌트와 분리한다.
async function loadRequest(params: URLSearchParams) {
  const req = new Request(appOrigin() + "/oauth/authorize", { headers: await headers() });
  const check = await checkAuthorizeRequest(database(), params, Date.now(), clientAddress(req));
  return { check, signedIn: !!(await getCodeUser(req)) };
}

// OAuth 인가 요청: 로그인(필요 시) 후 사용자가 연결을 허용하거나 거부한다.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    if (typeof value === "string") params.set(key, value);
  let check, signedIn;
  try {
    ({ check, signedIn } = await loadRequest(params));
  } catch (e) {
    console.error("OAuth authorize page failed", e);
    return <ConsentError message="요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." />;
  }
  if (!check.ok) {
    if (check.redirect) redirect(check.redirect);
    return <ConsentError message={check.message} />;
  }
  const r = check.request;
  return (
    <Consent
      signedIn={signedIn}
      query={params.toString()}
      clientName={r.clientName}
      clientHost={r.clientHost}
      redirectHost={new URL(r.redirectUri).host || new URL(r.redirectUri).protocol.slice(0, -1)}
      loopback={isLoopback(r.redirectUri)}
      scopes={r.scope.split(" ").map((s) => SCOPE_LABELS[s])}
    />
  );
}
