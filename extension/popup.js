import { APP_ORIGIN } from "./config.js";
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

function render() {
  $("loading").hidden = status !== "loading";
  $("login").hidden = status !== "login";
  for (const v of VIEWS) $(`view-${v}`).hidden = status !== "ready" || v !== view;
  for (const b of document.querySelectorAll("nav button")) b.setAttribute("aria-current", b.dataset.view === view);
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

async function get(path) {
  const r = await fetch(`${APP_ORIGIN}${path}`, { credentials: "include" });
  if (r.status === 401) {
    status = "login";
    render();
    return null;
  }
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
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
    const r = await fetch(`${APP_ORIGIN}/api/tasks`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) $("error").textContent = data.error || "저장에 실패했습니다.";
    await load();
    return r.ok;
  } catch {
    $("error").textContent = "연결을 확인해 주세요.";
  } finally {
    busy = false;
    for (const b of document.querySelectorAll("button")) b.disabled = false;
  }
}

for (const b of document.querySelectorAll("nav button"))
  b.addEventListener("click", () => {
    view = b.dataset.view;
    if (view === "memo" && !memos) loadMemos();
    render();
  });
$("open-site").addEventListener("click", () => chrome.tabs.create({ url: APP_ORIGIN }));
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
