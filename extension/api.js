import { APP_ORIGIN } from "./config.js";

let unauthorized = () => {};
// 세션이 끝났을 때(401) 할 일을 정한다.
export const onUnauthorized = (fn) => (unauthorized = fn);

// 웹앱 API를 사이트 로그인 쿠키로 부른다. 상태와 JSON 본문을 돌려준다.
export async function call(path, { method = "GET", body } = {}) {
  const r = await fetch(`${APP_ORIGIN}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// 로그인이 필요한 API. 401이면 로그인 화면으로 보내고 null을 돌려준다.
export async function authed(path, options) {
  const res = await call(path, options);
  if (res.status !== 401) return res;
  unauthorized();
  return null;
}
