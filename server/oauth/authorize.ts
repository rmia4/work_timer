import { hashToken } from "@/server/auth/auth";
import { CODE_MS, SCOPES, appOrigin, randomToken, resourceUrl, type Db } from "./common";
import { findClient, redirectMatches } from "./clients";

// clientHost: CIMD 클라이언트의 문서 도메인. 앱 이름은 스스로 밝힌 값이므로 동의 화면에 함께 보여 준다.
export type AuthorizeRequest = {
  clientId: string;
  clientName: string;
  clientHost: string | null;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
  resource: string;
};
// redirect할 수 없는 오류(클라이언트·redirect_uri 불일치)는 화면에 보여 주고, 나머지는 redirect_uri로 돌려보낸다.
export type AuthorizeCheck =
  { ok: true; request: AuthorizeRequest } | { ok: false; redirect: string | null; message: string };
export async function checkAuthorizeRequest(
  db: Db,
  params: URLSearchParams,
  now: number,
  address: string,
): Promise<AuthorizeCheck> {
  const clientId = params.get("client_id"),
    redirectUri = params.get("redirect_uri"),
    state = params.get("state");
  const client = clientId ? await findClient(db, clientId, now, address) : null;
  if (!client)
    return {
      ok: false,
      redirect: null,
      message: "등록되지 않았거나 정보를 확인할 수 없는 앱입니다.",
    };
  if (!redirectUri || !redirectMatches(JSON.parse(client.redirect_uris), redirectUri))
    return { ok: false, redirect: null, message: "앱의 돌아갈 주소가 등록된 값과 다릅니다." };
  if (state !== null && state.length > 1000)
    return { ok: false, redirect: null, message: "요청이 너무 깁니다." };
  const fail = (error: string, message: string): AuthorizeCheck => ({
    ok: false,
    redirect: authorizeRedirect(redirectUri, { error, state }),
    message,
  });
  if (params.get("response_type") !== "code")
    return fail("unsupported_response_type", "지원하지 않는 응답 방식입니다.");
  const challenge = params.get("code_challenge");
  if (
    params.get("code_challenge_method") !== "S256" ||
    !challenge ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge)
  )
    return fail("invalid_request", "PKCE(S256)가 필요합니다.");
  const resource = params.get("resource") ?? resourceUrl();
  if (resource !== resourceUrl())
    return fail("invalid_target", "이 서버용이 아닌 권한 요청입니다.");
  const requested = (params.get("scope") || SCOPES.join(" ")).split(" ").filter(Boolean);
  if (!requested.length || !requested.every((s) => SCOPES.includes(s)))
    return fail("invalid_scope", "알 수 없는 권한을 요청했습니다.");
  const scope = SCOPES.filter((s) => requested.includes(s)).join(" ");
  return {
    ok: true,
    request: {
      clientId: client.id,
      clientName: client.name,
      clientHost: client.id.startsWith("https://") ? new URL(client.id).host : null,
      redirectUri,
      scope,
      state,
      codeChallenge: challenge,
      resource,
    },
  };
}
export function authorizeRedirect(redirectUri: string, values: Record<string, string | null>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries({ ...values, iss: appOrigin() }))
    if (value !== null) url.searchParams.set(key, value);
  return url.href;
}
// 사용자가 허용하면 연결(grant)을 만들거나 갱신하고 1회용 인가 코드를 발급한다.
export async function approve(db: Db, owner: string, r: AuthorizeRequest, now: number) {
  const existing = await db
    .prepare("SELECT id FROM oauth_grants WHERE owner=? AND client_id=? AND revoked IS NULL")
    .bind(owner, r.clientId)
    .first<{ id: string }>();
  const grantId = existing?.id || crypto.randomUUID(),
    code = randomToken();
  await db.batch([
    existing
      ? db.prepare("UPDATE oauth_grants SET scope=? WHERE id=?").bind(r.scope, grantId)
      : db
          .prepare("INSERT INTO oauth_grants (id,owner,client_id,scope,created) VALUES (?,?,?,?,?)")
          .bind(grantId, owner, r.clientId, r.scope, now),
    db
      .prepare(
        "INSERT INTO oauth_codes (code_hash,grant_id,code_challenge,redirect_uri,resource,expires) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        await hashToken(code),
        grantId,
        r.codeChallenge,
        r.redirectUri,
        r.resource,
        now + CODE_MS,
      ),
  ]);
  return authorizeRedirect(r.redirectUri, { code, state: r.state });
}
