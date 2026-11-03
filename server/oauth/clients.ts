import { hashToken } from "@/server/auth/auth";
import { fetchClientDocument, validClientIdUrl } from "./cimd";
import type { Db } from "./common";
const MAX_REDIRECTS = 10,
  MAX_URI = 2000,
  MAX_NAME = 100;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
// 모바일 앱의 비공개 스킴은 RFC 8252 7.1에 따라 역도메인 형식(예: io.github.rmia4.worktimer:/oauth)만 받는다.
const PRIVATE_SCHEME = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+:$/;
// https, 루프백 http(Claude Code 같은 네이티브 앱의 로컬 콜백), 모바일 앱의 비공개 스킴만 허용한다.
function validRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URI) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK.has(url.hostname)) ||
    PRIVATE_SCHEME.test(url.protocol)
  );
}
// 등록된 값과 정확히 일치해야 한다. 루프백 주소만 RFC 8252 7.3에 따라 포트를 무시한다.
export function redirectMatches(registered: string[], requested: string) {
  if (registered.includes(requested)) return true;
  let want: URL;
  try {
    want = new URL(requested);
  } catch {
    return false;
  }
  if (want.protocol !== "http:" || !LOOPBACK.has(want.hostname)) return false;
  return registered.some((value) => {
    const url = new URL(value);
    url.port = want.port;
    return url.href === want.href;
  });
}
export const isLoopback = (uri: string) => {
  try {
    return LOOPBACK.has(new URL(uri).hostname);
  } catch {
    return false;
  }
};

type Registration =
  { ok: true; client: Record<string, unknown> } | { ok: false; error: string; description: string };
export async function registerClient(
  db: Db,
  body: Record<string, unknown>,
  now: number,
): Promise<Registration> {
  const uris = body.redirect_uris;
  if (
    !Array.isArray(uris) ||
    !uris.length ||
    uris.length > MAX_REDIRECTS ||
    !uris.every(validRedirect)
  )
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description:
        "redirect_uris는 https, 루프백 http 또는 역도메인 형식의 앱 스킴 주소여야 합니다.",
    };
  if (
    body.client_name !== undefined &&
    (typeof body.client_name !== "string" || body.client_name.length > MAX_NAME)
  )
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: `client_name은 ${MAX_NAME}자 이하여야 합니다.`,
    };
  const grantTypes = body.grant_types ?? ["authorization_code"],
    responseTypes = body.response_types ?? ["code"];
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.every((g) => g === "authorization_code" || g === "refresh_token") ||
    !Array.isArray(responseTypes) ||
    !responseTypes.every((r) => r === "code")
  )
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: "authorization_code와 refresh_token만 지원합니다.",
    };
  const id = crypto.randomUUID(),
    name = (body.client_name as string | undefined)?.trim() || "이름 없는 앱";
  await db
    .prepare("INSERT INTO oauth_clients (id,name,redirect_uris,created) VALUES (?,?,?,?)")
    .bind(id, name, JSON.stringify(uris), now)
    .run();
  // 클라이언트 비밀값은 발급하지 않는다(공개 클라이언트). 요청한 인증 방식과 무관하게 none으로 답한다.
  return {
    ok: true,
    client: {
      client_id: id,
      client_id_issued_at: Math.floor(now / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

// 고정 시간 창 안의 요청 수를 code_limits에 센다. 이번 요청을 포함한 수를 돌려준다.
export async function countRequest(db: Db, id: string, now: number, windowMs = 3600000) {
  const row = await db
    .prepare(
      'INSERT INTO code_limits (id,"window",attempts) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN code_limits."window"<=? THEN 1 ELSE code_limits.attempts+1 END,"window"=CASE WHEN code_limits."window"<=? THEN ? ELSE code_limits."window" END RETURNING attempts',
    )
    .bind(id, now + windowMs, now, now, now + windowMs)
    .first<{ attempts: number }>();
  return Number(row?.attempts || 1);
}

const CIMD_FETCHES_PER_HOUR = 30,
  CIMD_MIN_CACHE = 5 * 60,
  CIMD_MAX_CACHE = 24 * 60 * 60,
  CIMD_DEFAULT_CACHE = 60 * 60;
// CIMD 문서를 검증한다. client_id가 문서 URL과 정확히 같아야 하고, 공개 클라이언트(none)만 받는다.
export function parseClientMetadata(url: string, body: string) {
  let doc;
  try {
    doc = JSON.parse(body);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || doc.client_id !== url) return null;
  if (
    typeof doc.client_name !== "string" ||
    !doc.client_name.trim() ||
    doc.client_name.length > MAX_NAME
  )
    return null;
  const uris = doc.redirect_uris;
  if (
    !Array.isArray(uris) ||
    !uris.length ||
    uris.length > MAX_REDIRECTS ||
    !uris.every(validRedirect)
  )
    return null;
  if (doc.token_endpoint_auth_method !== undefined && doc.token_endpoint_auth_method !== "none")
    return null;
  if (
    doc.grant_types !== undefined &&
    !(Array.isArray(doc.grant_types) && doc.grant_types.includes("authorization_code"))
  )
    return null;
  if (
    doc.response_types !== undefined &&
    !(Array.isArray(doc.response_types) && doc.response_types.includes("code"))
  )
    return null;
  return { name: doc.client_name.trim() as string, redirectUris: uris as string[] };
}
// Cache-Control의 max-age를 따르되 5분~24시간으로 제한한다. no-store·no-cache도 최소 5분은 캐시한다.
export function cacheSeconds(cacheControl: string) {
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
  const seconds = /no-store|no-cache/i.test(cacheControl)
    ? 0
    : maxAge
      ? Number(maxAge[1])
      : CIMD_DEFAULT_CACHE;
  return Math.min(CIMD_MAX_CACHE, Math.max(CIMD_MIN_CACHE, seconds));
}
type Client = { id: string; name: string; redirect_uris: string };
// DCR 클라이언트는 DB에서 찾고, CIMD 클라이언트는 캐시가 만료되었을 때만 문서를 다시 가져온다.
// 문서를 가져오는 횟수는 요청한 IP마다 시간당 30번으로 제한한다(외부 요청 증폭 방지).
export async function findClient(
  db: Db,
  clientId: string,
  now: number,
  address: string,
): Promise<Client | null> {
  const cimd = clientId.startsWith("https://");
  if (cimd ? !validClientIdUrl(clientId) : clientId.length > 64) return null;
  const cached = await db
    .prepare("SELECT id,name,redirect_uris,refresh_after FROM oauth_clients WHERE id=?")
    .bind(clientId)
    .first<Client & { refresh_after: number | null }>();
  if (!cimd || (cached && cached.refresh_after !== null && cached.refresh_after > now))
    return cached;
  if ((await countRequest(db, "cimd:" + (await hashToken(address)), now)) > CIMD_FETCHES_PER_HOUR)
    return null;
  let fetched;
  try {
    fetched = await fetchClientDocument(clientId);
  } catch (e) {
    console.warn("Client metadata fetch failed", clientId, (e as Error).message);
    return null;
  }
  const meta = parseClientMetadata(clientId, fetched.body);
  if (!meta) return null;
  const client = {
    id: clientId,
    name: meta.name,
    redirect_uris: JSON.stringify(meta.redirectUris),
  };
  await db
    .prepare(
      "INSERT INTO oauth_clients (id,name,redirect_uris,created,refresh_after) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,redirect_uris=excluded.redirect_uris,refresh_after=excluded.refresh_after",
    )
    .bind(
      client.id,
      client.name,
      client.redirect_uris,
      now,
      now + cacheSeconds(fetched.cacheControl) * 1000,
    )
    .run();
  return client;
}
