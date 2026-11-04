import type { database } from "@/server/db/raw";
// MCP 연동용 OAuth 2.1 인가 서버. Work Timer가 인가 서버와 리소스 서버(/api/mcp)를 겸한다.
// 클라이언트는 공개 클라이언트만 받고 PKCE(S256)를 반드시 요구한다. 클라이언트 식별은 두 방식을 지원한다.
// - Client ID Metadata Document(CIMD): https URL이 곧 client_id. 문서를 가져와 oauth_clients에 캐시한다.
// - 동적 등록(RFC 7591, DCR): /oauth/register가 UUID client_id를 발급한다. CIMD를 모르는 클라이언트용.
export type Db = ReturnType<typeof database>;
export const SCOPES = ["tasks:read", "tasks:write"];
export const SCOPE_LABELS: Record<string, string> = {
  "tasks:read": "업무 기록·메모·통계 보기",
  "tasks:write": "타이머 시작·종료와 업무 기록 수정",
};
export const ACCESS_SECONDS = 60 * 60,
  REFRESH_MS = 30 * 24 * 60 * 60 * 1000,
  CODE_MS = 60 * 1000;
export function appOrigin() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Error("APP_ORIGIN is not set");
  return origin.replace(/\/$/, "");
}
// 발급한 토큰은 이 MCP 엔드포인트 전용이다(RFC 8707 audience).
export const resourceUrl = () => appOrigin() + "/api/mcp";
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

// OAuth·MCP 엔드포인트는 쿠키를 받지 않으므로 브라우저 기반 클라이언트를 위해 모든 출처를 허용한다(credentials 불허).
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};
export const oauthJson = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...CORS },
  });
export const oauthError = (error: string, description: string, status = 400) =>
  oauthJson({ error, error_description: description }, status);
export const corsPreflight = () => new Response(null, { status: 204, headers: CORS });
// 크기를 제한해 본문을 읽는다. 너무 크면 null.
export async function readBody(req: Request, limit = 16 * 1024) {
  if (Number(req.headers.get("content-length") || 0) > limit) return null;
  const text = await req.text();
  return text.length > limit || new TextEncoder().encode(text).length > limit ? null : text;
}
