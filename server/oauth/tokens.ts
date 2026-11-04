import { hashToken } from "@/server/auth/auth";
import { ACCESS_SECONDS, REFRESH_MS, randomToken, resourceUrl, type Db } from "./common";

async function s256(verifier: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
type Grant = { id: string; client_id: string; scope: string; revoked: number | null };
type TokenResult =
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string; description: string };
const tokenFail = (error: string, description: string): TokenResult => ({
  ok: false,
  error,
  description,
});
async function issueTokens(db: Db, grant: Grant, now: number): Promise<TokenResult> {
  const access = randomToken(),
    refresh = randomToken();
  await db.batch([
    db.prepare("DELETE FROM oauth_tokens WHERE grant_id=? AND expires<=?").bind(grant.id, now),
    db
      .prepare(
        "INSERT INTO oauth_tokens (token_hash,grant_id,kind,expires) VALUES (?,?,'access',?)",
      )
      .bind(await hashToken(access), grant.id, now + ACCESS_SECONDS * 1000),
    db
      .prepare(
        "INSERT INTO oauth_tokens (token_hash,grant_id,kind,expires) VALUES (?,?,'refresh',?)",
      )
      .bind(await hashToken(refresh), grant.id, now + REFRESH_MS),
  ]);
  return {
    ok: true,
    body: {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_SECONDS,
      refresh_token: refresh,
      scope: grant.scope,
    },
  };
}
// 연결을 폐기하고 딸린 토큰·코드를 지운다.
export function revokeGrant(db: Db, grantId: string, now: number) {
  return db.batch([
    db
      .prepare("UPDATE oauth_grants SET revoked=? WHERE id=? AND revoked IS NULL")
      .bind(now, grantId),
    db.prepare("DELETE FROM oauth_tokens WHERE grant_id=?").bind(grantId),
    db.prepare("DELETE FROM oauth_codes WHERE grant_id=?").bind(grantId),
  ]);
}
// 사용자의 모든 연결을 폐기하는 문장들. 비밀번호 변경과 한 batch로 묶어 쓴다.
export function revokeOwnerGrants(db: Db, owner: string, now: number) {
  const live = "SELECT id FROM oauth_grants WHERE owner=? AND revoked IS NULL";
  return [
    db.prepare(`DELETE FROM oauth_tokens WHERE grant_id IN (${live})`).bind(owner),
    db.prepare(`DELETE FROM oauth_codes WHERE grant_id IN (${live})`).bind(owner),
    db
      .prepare("UPDATE oauth_grants SET revoked=? WHERE owner=? AND revoked IS NULL")
      .bind(now, owner),
  ];
}
const grantOf = (db: Db, id: string) =>
  db
    .prepare("SELECT id,client_id,scope,revoked FROM oauth_grants WHERE id=?")
    .bind(id)
    .first<Grant>();
export async function exchangeToken(db: Db, p: URLSearchParams, now: number): Promise<TokenResult> {
  const clientId = p.get("client_id"),
    resource = p.get("resource");
  if (!clientId) return tokenFail("invalid_client", "client_id가 필요합니다.");
  if (resource !== null && resource !== resourceUrl())
    return tokenFail("invalid_target", "이 서버용이 아닌 토큰 요청입니다.");
  const type = p.get("grant_type");
  if (type === "authorization_code") {
    const code = p.get("code"),
      verifier = p.get("code_verifier"),
      redirectUri = p.get("redirect_uri");
    if (!code || !verifier || !redirectUri)
      return tokenFail("invalid_request", "code, code_verifier, redirect_uri가 필요합니다.");
    // 지우면서 읽어 코드를 한 번만 쓰게 한다.
    const row = await db
      .prepare(
        "DELETE FROM oauth_codes WHERE code_hash=? RETURNING grant_id,code_challenge,redirect_uri,expires",
      )
      .bind(await hashToken(code))
      .first<{ grant_id: string; code_challenge: string; redirect_uri: string; expires: number }>();
    if (!row || row.expires <= now)
      return tokenFail("invalid_grant", "인가 코드가 없거나 만료되었습니다.");
    const grant = await grantOf(db, row.grant_id);
    if (
      !grant ||
      grant.revoked !== null ||
      grant.client_id !== clientId ||
      row.redirect_uri !== redirectUri
    )
      return tokenFail("invalid_grant", "인가 코드가 이 요청과 맞지 않습니다.");
    if (
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      (await s256(verifier)) !== row.code_challenge
    )
      return tokenFail("invalid_grant", "PKCE 검증에 실패했습니다.");
    return issueTokens(db, grant, now);
  }
  if (type === "refresh_token") {
    const token = p.get("refresh_token");
    if (!token) return tokenFail("invalid_request", "refresh_token이 필요합니다.");
    const hash = await hashToken(token);
    const row = await db
      .prepare(
        "SELECT grant_id,expires,used FROM oauth_tokens WHERE token_hash=? AND kind='refresh'",
      )
      .bind(hash)
      .first<{ grant_id: string; expires: number; used: number | null }>();
    const grant = row && (await grantOf(db, row.grant_id));
    if (!row || !grant || grant.revoked !== null || grant.client_id !== clientId)
      return tokenFail("invalid_grant", "refresh 토큰이 유효하지 않습니다.");
    if (row.expires <= now) return tokenFail("invalid_grant", "refresh 토큰이 만료되었습니다.");
    // 이미 쓴 refresh 토큰이 다시 오면 탈취로 보고 연결 전체를 폐기한다.
    const marked =
      row.used === null &&
      (
        await db
          .prepare("UPDATE oauth_tokens SET used=? WHERE token_hash=? AND used IS NULL")
          .bind(now, hash)
          .run()
      ).meta.changes;
    if (!marked) {
      await revokeGrant(db, grant.id, now);
      return tokenFail("invalid_grant", "이미 사용한 refresh 토큰입니다. 다시 연결해 주세요.");
    }
    return issueTokens(db, grant, now);
  }
  return tokenFail("unsupported_grant_type", "authorization_code와 refresh_token만 지원합니다.");
}
// RFC 7009: 발급한 클라이언트만 폐기할 수 있고, 결과와 상관없이 성공으로 답한다. refresh 토큰을 폐기하면 연결 전체를 끊는다.
export async function revokeToken(db: Db, token: string, clientId: string, now: number) {
  const row = await db
    .prepare(
      "SELECT t.token_hash,t.kind,g.id AS grant_id FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=? AND g.client_id=?",
    )
    .bind(await hashToken(token), clientId)
    .first<{ token_hash: string; kind: string; grant_id: string }>();
  if (!row) return;
  if (row.kind === "refresh") await revokeGrant(db, row.grant_id, now);
  else await db.prepare("DELETE FROM oauth_tokens WHERE token_hash=?").bind(row.token_hash).run();
}
// MCP 요청의 Bearer 토큰을 확인한다. 만료·폐기된 토큰이면 null.
export async function verifyAccessToken(db: Db, token: string, now: number) {
  const row = await db
    .prepare(
      "SELECT g.id,g.owner,g.client_id,g.scope,g.last_used FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=? AND t.kind='access' AND t.expires>? AND g.revoked IS NULL",
    )
    .bind(await hashToken(token), now)
    .first<{
      id: string;
      owner: string;
      client_id: string;
      scope: string;
      last_used: number | null;
    }>();
  return row
    ? {
        grantId: row.id,
        owner: row.owner,
        clientId: row.client_id,
        scopes: row.scope.split(" "),
        lastUsed: row.last_used,
      }
    : null;
}
