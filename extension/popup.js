import { authed, call, onUnauthorized } from "./api.js";
import { activitySegments, drawClock } from "./activity-clock.js";
import { duration, statusLabel, timestampLabel, today } from "./dates.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["timer", "summary", "log", "memo"];
let status = "loading"; // loading | login | ready
let view = "timer";
let tasks = [];
let memos = null; // 메모 화면을 처음 열 때 불러온다.
let task = null;
let finishTask = null; // 종료·저장 대화상자를 열 때의 진행 작업
let offset = 0;
let busy = false;
let request = 0; // 늦게 온 이전 조회 응답을 버리기 위한 번호
let mode = "login"; // login | signup
const CACHE = "tasks-cache"; // 마지막으로 불러온 오늘 기록(로그아웃하면 지운다)

const elapsed = (t) =>
  t.elapsed + (t.started === null ? 0 : Math.max(0, Date.now() + offset - t.started));

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
      ? tasks.map((t) => item(t.title, `${statusLabel(t.status)} · ${duration(elapsed(t))}`))
      : [item("오늘 기록이 없습니다.", "")]),
  );
}

// 시계 바늘과 진행 중 구간은 1분마다 다시 그린다(매초 그리면 구간 위 툴팁이 사라진다).
function renderSummary() {
  const now = Date.now() + offset;
  const segments = activitySegments(tasks, today(), now);
  const todays = tasks.filter((t) => t.day === today());
  $("sum-total").textContent = duration(segments.reduce((sum, s) => sum + s.end - s.start, 0));
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
  renderTimer();
}

// 웹앱 TimerPanel·TaskForm과 같은 문구와 버튼 규칙이다.
function renderTimer() {
  $("state").textContent = task ? statusLabel(task.status) : "준비";
  $("title").textContent = task?.title || "지금 집중할 작업";
  $("target").textContent = task && task.target > 0 ? `목표 ${duration(task.target)}` : "";
  $("clock").textContent = duration(task ? elapsed(task) : 0);
  $("active-note").textContent = task
    ? `${timestampLabel(task.started_at)} 시작 · 브라우저를 닫아도 기록이 유지됩니다.`
    : "아래에 작업을 입력하고 측정을 시작하세요.";
  $("timer-buttons").hidden = !task;
  $("toggle").textContent = task?.status === "running" ? "일시정지" : "다시 시작";
  for (const id of ["toggle", "finish", "f-save", "logout"]) $(id).disabled = busy;
  $("f-start").disabled = busy || !!task || !$("f-title").value.trim();
  $("finish-submit").disabled = busy || !finishTask;
  $("finish-submit").textContent = busy ? "저장 중…" : "종료하고 저장";
  $("finish-cancel").disabled = busy;
}

// 로그아웃되면 이전 계정의 데이터를 비우고 로그인 화면을 보여 준다.
function showLogin() {
  localStorage.removeItem(CACHE);
  status = "login";
  tasks = [];
  memos = null;
  task = null;
  view = "timer";
  request++;
  clearForm();
  if (finishTask) closeFinish();
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
  const seq = ++request;
  try {
    const data = await get(`/api/tasks?day=${today()}`);
    if (seq !== request || !data) return;
    tasks = data.tasks;
    task = tasks.find((t) => t.status !== "done") || null;
    offset = data.now - Date.now();
    localStorage.setItem(CACHE, JSON.stringify({ day: today(), tasks, offset }));
    status = "ready";
    $("error").textContent = "";
    render();
  } catch (e) {
    if (seq === request) showError(e);
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

// 웹앱 use-workspace.ts의 act와 같다. 409면 최신 상태를 다시 불러온다.
async function act(body) {
  if (busy) return false;
  busy = true;
  $("error").textContent = "";
  $("finish-error").textContent = "";
  $("message").textContent = "";
  render();
  try {
    const r = await authed("/api/tasks", { method: "POST", body });
    if (!r) return false;
    if (!r.ok) {
      if (r.status === 409) await load();
      throw Error(r.data.error);
    }
    await load();
    $("message").textContent = "저장되었습니다.";
    return true;
  } catch (e) {
    // 대화상자가 열려 있으면 오류를 대화상자 안에 보여 준다.
    $(finishTask ? "finish-error" : "error").textContent =
      e instanceof Error && e.message ? e.message : "저장에 실패했습니다.";
    return false;
  } finally {
    busy = false;
    render();
  }
}

function showWork(name) {
  for (const b of document.querySelectorAll("[data-work]")) b.setAttribute("aria-selected", b.dataset.work === name);
  $("f-note").hidden = name !== "note";
  $("f-result").hidden = name !== "result";
}

function clearForm() {
  $("task-form").reset();
  showWork("note");
}

function closeFinish() {
  finishTask = null;
  $("finish-dialog").close();
}

// 웹앱 save(): 목표·소요 시간은 분 단위 입력을 밀리초로 바꾼다.
async function save(run) {
  const ok = await act({
    action: "create",
    title: $("f-title").value,
    note: $("f-note").value,
    result: $("f-result").value,
    target: $("f-target").value === "" ? 0 : Math.round(Number($("f-target").value) * 60000),
    day: today(),
    elapsed: Math.round(Number($("f-minutes").value) * 60000),
    started_at: null,
    ended_at: null,
    run,
  });
  if (ok) clearForm();
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
$("finish").addEventListener("click", () => {
  finishTask = task;
  $("finish-desc").textContent = `“${task.title}” 작업을 종료합니다. 완료한 결과를 기록해 주세요.`;
  $("finish-result").value = task.result || "";
  countResult();
  $("finish-error").textContent = "";
  render();
  $("finish-dialog").showModal();
});
const countResult = () =>
  ($("finish-count").textContent = `${$("finish-result").value.length.toLocaleString()} / 20,000`);
$("finish-result").addEventListener("input", countResult);
$("finish-cancel").addEventListener("click", closeFinish);
// Esc로 닫을 때도 저장 중이면 닫지 않는다.
$("finish-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!busy) closeFinish();
});
$("finish-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!finishTask) return;
  const ok = await act({
    action: "finish",
    id: finishTask.id,
    version: finishTask.version,
    result: $("finish-result").value,
  });
  if (ok) closeFinish();
});
for (const b of document.querySelectorAll("[data-work]")) b.addEventListener("click", () => showWork(b.dataset.work));
$("f-title").addEventListener("input", renderTimer);
$("f-start").addEventListener("click", () => {
  if ($("task-form").reportValidity()) save(true);
});
$("task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  save(false);
});

setInterval(() => {
  if (task) $("clock").textContent = duration(elapsed(task));
  if (status === "ready" && view === "log") renderLog();
}, 1000);
setInterval(() => {
  if (status === "ready" && view === "summary") renderSummary();
}, 60000);
// 웹앱처럼 10초마다 다시 불러와 다른 기기의 변경을 반영한다.
setInterval(() => {
  if (status === "ready" && !busy) load();
}, 10000);
// 팝업을 열 때마다 기다리지 않도록 마지막으로 불러온 오늘 기록을 먼저 보여 주고 뒤에서 새로 불러온다.
try {
  const cached = JSON.parse(localStorage.getItem(CACHE));
  if (cached?.day === today()) {
    ({ tasks, offset } = cached);
    task = tasks.find((t) => t.status !== "done") || null;
    status = "ready";
  }
} catch {}
render();
load();
