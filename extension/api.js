import { APP_ORIGIN } from "./config.js";

let unauthorized = () => {};
// 세션이 끝났을 때(401) 할 일을 정한다.
export const onUnauthorized = (fn) => (unauthorized = fn);

// 브라우저는 keepalive 요청 본문을 64KB로 제한한다.
const KEEPALIVE_LIMIT = 64 * 1024;

// 웹앱 API를 사이트 로그인 쿠키로 부른다. 상태와 JSON 본문을 돌려준다.
// keepalive는 팝업이 닫혀도 요청을 끝까지 보내게 한다.
export async function call(path, { method = "GET", body, keepalive = false } = {}) {
  const json = body === undefined ? undefined : JSON.stringify(body);
  const r = await fetch(`${APP_ORIGIN}${path}`, {
    method,
    credentials: "include",
    headers: json === undefined ? undefined : { "Content-Type": "application/json" },
    body: json,
    keepalive: keepalive && json !== undefined && new TextEncoder().encode(json).length <= KEEPALIVE_LIMIT,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// 로그인이 필요한 파일 받기(GET). 401이면 로그인 화면으로 보내고 null, 실패하면 서버 오류 문구로 던진다.
export async function download(path) {
  const r = await fetch(`${APP_ORIGIN}${path}`, { credentials: "include" });
  if (r.status === 401) {
    unauthorized();
    return null;
  }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Error(data.error || "데이터를 내보내지 못했습니다.");
  }
  return r.blob();
}

// 로그인이 필요한 API. 401이면 로그인 화면으로 보내고 null을 돌려준다.
export async function authed(path, options) {
  const res = await call(path, options);
  if (res.status !== 401) return res;
  unauthorized();
  return null;
}
