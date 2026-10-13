import { authed, call, onUnauthorized } from "./api.js";
import { activitySegments, drawClock } from "./activity-clock.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["timer", "summary", "log", "memo"];
let status = "loading"; // loading | login | ready
let view = "timer";
let tasks = [];
let memos = null; // 메모 화면을 처음 열 때 불러온다.
let task = null;
let offset = 0;
let busy = false;
let mode = "login"; // login | signup

// 웹앱 use-workspace.ts의 today()와 같다(한국 시간 기준 날짜).
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const elapsed = (t) =>
  t.elapsed + (t.started === null ? 0 : Math.max(0, Date.now() + offset - t.started));

const stateLabel = (t) => (t.status === "running" ? "측정 중" : t.status === "done" ? "완료" : "일시정지");

function item(title, sub, text) {
  const li = document.createElement("li");
  const h = document.createElement("strong");
  h.textContent = title;
  const p = document.createElement("span");
  p.textContent = sub;
  li.append(h, p);
  if (text) {
    const body = document.createElement("p");
    body.textContent = text;
    li.append(body);
  }
  return li;
}

function renderLog() {
  $("log-list").replaceChildren(
    ...(tasks.length
      ? tasks.map((t) => item(t.title, `${stateLabel(t)} · ${clock(elapsed(t))}`))
      : [item("오늘 기록이 없습니다.", "")]),
  );
}

// 시계 바늘과 진행 중 구간은 1분마다 다시 그린다(매초 그리면 구간 위 툴팁이 사라진다).
function renderSummary() {
  const now = Date.now() + offset;
  const segments = activitySegments(tasks, today(), now);
  const todays = tasks.filter((t) => t.day === today());
  $("sum-total").textContent = clock(segments.reduce((sum, s) => sum + s.end - s.start, 0));
  $("sum-count").textContent =
    `오늘 측정 시간 · 작업 ${todays.length}개 · 완료 ${todays.filter((t) => t.status === "done").length}개`;
  drawClock($("day-clock"), segments, now);
}

function renderMemo() {
  if (!memos) {
    $("memo-list").replaceChildren(item("불러오는 중…", ""));
    return;
  }
  $("memo-list").replaceChildren(
    ...(memos.length ? memos.map((m) => item(m.title || "제목 없음", "", m.body)) : [item("메모가 없습니다.", "")]),
  );
}

// 웹앱 login.tsx의 로그인·회원가입 화면과 같은 규칙이다.
function renderLogin() {
  const signup = mode === "signup";
  for (const b of document.querySelectorAll("[data-mode]")) b.setAttribute("aria-selected", b.dataset.mode === mode);
  $("login-hint").textContent = signup
    ? "아이디는 영문 소문자·숫자·밑줄 4~20자, 비밀번호는 8자 이상 입력해 주세요."
    : "아이디와 비밀번호를 입력해 주세요.";
  for (const el of document.querySelectorAll(".signup-only")) el.hidden = !signup;
  $("confirmation").required = signup;
  for (const [name, value] of [["minlength", "4"], ["pattern", "[A-Za-z0-9_]{4,20}"]])
    if (signup) $("username").setAttribute(name, value);
    else $("username").removeAttribute(name);
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("login-submit").textContent = signup ? "가입하기" : "로그인";
}

function render() {
  $("loading").hidden = status !== "loading";
  $("login").hidden = status !== "login";
  document.querySelector("nav").hidden = status !== "ready";
  for (const v of VIEWS) $(`view-${v}`).hidden = status !== "ready" || v !== view;
  for (const b of document.querySelectorAll("nav button[data-view]")) b.setAttribute("aria-current", b.dataset.view === view);
  if (status === "login") renderLogin();
  if (status !== "ready") return;
  if (view === "summary") renderSummary();
  if (view === "log") renderLog();
  if (view === "memo") renderMemo();
  $("active").hidden = !task;
  $("start").hidden = !!task;
  if (!task) return;
  $("state").textContent = stateLabel(task);
  $("title").textContent = task.title;
  $("clock").textContent = clock(elapsed(task));
  $("toggle").textContent = task.status === "running" ? "일시정지" : "다시 시작";
}

// 로그아웃되면 이전 계정의 데이터를 비우고 로그인 화면을 보여 준다.
function showLogin() {
  status = "login";
  tasks = [];
  memos = null;
  task = null;
  view = "timer";
  render();
  $("username").focus();
}
onUnauthorized(showLogin);

async function get(path) {
  const res = await authed(path);
  if (!res) return null;
  if (!res.ok) throw Error(res.data.error);
  return res.data;
}

const showError = (e) =>
  ($("error").textContent = e instanceof Error && e.message ? e.message : "연결을 확인해 주세요.");

async function load() {
  try {
    const data = await get(`/api/tasks?day=${today()}`);
    if (!data) return;
    tasks = data.tasks;
    task = tasks.find((t) => t.status !== "done") || null;
    offset = data.now - Date.now();
    status = "ready";
    render();
  } catch (e) {
    showError(e);
  }
}

async function loadMemos() {
  try {
    const data = await get("/api/memos");
    if (!data) return;
    memos = data.memos;
    render();
  } catch (e) {
    showError(e);
  }
}

async function act(body) {
  if (busy) return;
  busy = true;
  for (const b of document.querySelectorAll("button")) b.disabled = true;
  $("error").textContent = "";
  try {
    const r = await authed("/api/tasks", { method: "POST", body });
    if (!r) return false;
    if (!r.ok) $("error").textContent = r.data.error || "저장에 실패했습니다.";
    await load();
    return r.ok;
  } catch {
    $("error").textContent = "연결을 확인해 주세요.";
  } finally {
    busy = false;
    for (const b of document.querySelectorAll("button")) b.disabled = false;
  }
}

for (const b of document.querySelectorAll("nav button[data-view]"))
  b.addEventListener("click", () => {
    view = b.dataset.view;
    if (view === "memo" && !memos) loadMemos();
    render();
  });
for (const b of document.querySelectorAll("[data-mode]"))
  b.addEventListener("click", () => {
    if (b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    $("password").value = "";
    $("confirmation").value = "";
    $("error").textContent = "";
    render();
  });
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $("login-submit").disabled = true;
  $("error").textContent = "";
  try {
    const r = await call(mode === "login" ? "/api/auth" : "/api/auth/signup", {
      method: "POST",
      body: { username: $("username").value, password: $("password").value, confirmation: $("confirmation").value },
    });
    if (!r.ok) throw Error(r.data.error || (mode === "login" ? "로그인하지 못했습니다." : "가입하지 못했습니다."));
    $("password").value = "";
    $("confirmation").value = "";
    status = "loading";
    render();
    await load();
    // 로그인은 됐는데 바로 401이면 브라우저가 로그인 쿠키를 저장하지 않은 것이다.
    if (status === "login") $("error").textContent = "로그인 정보를 저장하지 못했습니다. 사이트에서 로그인해 주세요.";
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
    $("login-submit").disabled = false;
  }
});
$("logout").addEventListener("click", async () => {
  $("error").textContent = "";
  try {
    const r = await call("/api/auth", { method: "DELETE" });
    if (!r.ok) throw Error("로그아웃하지 못했습니다.");
    showLogin();
  } catch (e) {
    showError(e);
  }
});
$("toggle").addEventListener("click", () =>
  act({ action: task.status === "running" ? "pause" : "resume", id: task.id, version: task.version }),
);
$("finish").addEventListener("click", () =>
  act({ action: "finish", id: task.id, version: task.version, result: task.result }),
);
$("start").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("new-title").value.trim();
  if (!title) return;
  const ok = await act({ action: "create", run: true, title, day: today(), note: "", result: "", target: 0, elapsed: 0 });
  if (ok) $("new-title").value = "";
});

setInterval(() => {
  if (task) $("clock").textContent = clock(elapsed(task));
  if (status === "ready" && view === "log") renderLog();
}, 1000);
setInterval(() => {
  if (status === "ready" && view === "summary") renderSummary();
}, 60000);
render();
load();
