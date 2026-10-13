import { authed, call, onUnauthorized } from "./api.js";
import { activitySegments, drawClock } from "./activity-clock.js";
import { createCalendar, invalidateCalendarCache } from "./calendar.js";
import { createMemoBoard } from "./memo-board.js";
import {
  duration,
  parseTimeInput,
  shiftDay,
  statusLabel,
  timeInput,
  timeLabel,
  timestampLabel,
  today,
  weekday,
} from "./dates.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["timer", "summary", "log", "memo"];
let status = "loading"; // loading | login | ready
let view = "timer";
let day = today(); // 일지에서 보는 날짜
let loading = false; // 날짜를 바꾼 뒤 그 날짜 기록을 아직 못 받았는지
let tasks = [];
let edit = null; // 수정 중인 기록
let editTimes = { first: "", last: "" }; // 수정 중인 기록의 시작·종료 시각(웹앱 first·last)
let remove = null; // 삭제 확인 중인 기록
let logMode = "records"; // 일지 화면에서 보는 것: records(업무 일지) | memos(일일 메모)
let task = null;
let finishTask = null; // 종료·저장 대화상자를 열 때의 진행 작업
let offset = 0;
let busy = false;
let request = 0; // 늦게 온 이전 조회 응답을 버리기 위한 번호
let mode = "login"; // login | signup
const CACHE = "tasks-cache"; // 마지막으로 불러온 오늘 기록(로그아웃하면 지운다)

const elapsed = (t) =>
  t.elapsed + (t.started === null ? 0 : Math.max(0, Date.now() + offset - t.started));

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, onClick) {
  const b = el("button", "outline", text);
  b.type = "button";
  b.disabled = busy;
  b.addEventListener("click", onClick);
  return b;
}

// 웹앱 RecordList(카드형)와 같은 내용이다. 소요 시간은 1초마다 data-elapsed만 갱신한다.
function record(t) {
  const card = el("article", "record");
  const head = el("div", "record-head");
  const times = el("div", "record-times");
  const time = (label, value) => {
    const s = el("span");
    const strong = el("strong", "", value);
    s.append(el("small", "", label), strong);
    times.append(s);
    return strong;
  };
  if (t.target > 0) time("목표", duration(t.target));
  time("소요", duration(elapsed(t))).dataset.elapsed = t.id;
  head.append(el("h3", "", t.title), times);
  const range = el("p", "state", `${statusLabel(t.status)} · 시작 ${timeLabel(t.started_at)} · 종료 ${
    t.status === "done" ? timeLabel(t.ended_at) : "진행 중"
  }`);
  card.append(head, range);
  for (const [label, text] of [["업무 내용", t.note], ["업무 결과", t.result]])
    if (text) {
      const block = el("div", "journal-block");
      block.append(el("strong", "", label), el("p", "note", text));
      card.append(block);
    }
  if (t.status === "done") {
    const actions = el("div", "row record-actions");
    actions.append(button("수정", () => startEdit(t)), button("삭제", () => askRemove(t)));
    card.append(actions);
  }
  return card;
}

const daily = () => tasks.filter((t) => t.day === day);

function renderLog() {
  $("day-label").textContent = `${day} (${weekday(day)})`;
  for (const id of ["day-prev", "day-next", "day-today"]) $(id).disabled = busy;
  for (const b of document.querySelectorAll("[data-log]")) b.setAttribute("aria-selected", b.dataset.log === logMode);
  $("log-list").hidden = logMode !== "records";
  $("daily-memo-board").hidden = logMode !== "memos";
  if (loading) return $("log-list").replaceChildren(el("p", "hint", "기록을 불러오는 중입니다."));
  const list = daily();
  if (!list.length) {
    const empty = el("div", "empty");
    empty.append(el("strong", "", "아직 기록이 없습니다."), el("p", "hint", "작업을 시작하거나 완료한 업무를 남겨보세요."));
    return $("log-list").replaceChildren(empty);
  }
  $("log-list").replaceChildren(...list.map(record));
}

function tickLog() {
  for (const s of document.querySelectorAll("[data-elapsed]")) {
    const t = tasks.find((x) => x.id === s.dataset.elapsed);
    if (t) s.textContent = duration(elapsed(t));
  }
}

// 시계 바늘과 진행 중 구간은 1분마다 다시 그린다(매초 그리면 구간 위 툴팁이 사라진다).
function renderSummary() {
  const now = Date.now() + offset;
  const segments = activitySegments(tasks, day, now);
  const list = daily();
  $("sum-total").textContent = duration(segments.reduce((sum, s) => sum + s.end - s.start, 0));
  $("sum-count").textContent =
    `${day === today() ? "오늘" : day} 측정 시간 · 작업 ${list.length}개 · 완료 ${list.filter((t) => t.status === "done").length}개`;
  drawClock($("day-clock"), segments, now);
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
  // 메모 보드는 처음 열 때와 날짜가 바뀔 때만 불러오고, 그 밖에는 다시 그리지 않는다(입력 중 포커스 유지).
  if (view === "memo") memoBoard.show();
  if (view === "log" && logMode === "memos") dailyBoard.show(day);
  renderTimer();
}

// 웹앱 TimerPanel·TaskForm과 같은 문구와 버튼 규칙이다.
function renderTimer() {
  $("state").textContent = task ? statusLabel(task.status) : "준비";
  $("title").textContent = task?.title || "지금 집중할 작업";
  $("target").textContent = task && task.target > 0 ? `목표 ${duration(task.target)}` : "";
  $("clock").textContent = duration(task ? elapsed(task) : 0);
  // 기록 중인 작업이 있으면 그 작업만, 없으면 새 기록 추가 폼만 보여 준다. 기록 수정 중에는 폼만 보여 준다.
  $("active").hidden = !task || !!edit;
  $("task-form").hidden = !!task && !edit;
  $("active-note").textContent = task
    ? `${timestampLabel(task.started_at)} 시작 · 브라우저를 닫아도 기록이 유지됩니다.`
    : "";
  $("toggle").textContent = task?.status === "running" ? "일시정지" : "다시 시작";
  for (const id of ["toggle", "finish", "f-save", "logout"]) $(id).disabled = busy;
  $("f-start").disabled = busy || !!task || !$("f-title").value.trim();
  $("form-title").textContent = edit ? "기록 수정" : "새 기록 추가";
  $("f-cancel").hidden = !edit;
  $("f-start").textContent = edit ? "수정 후 측정 재개" : "측정 시작";
  $("f-save").textContent = edit ? "수정 저장" : "기록 저장";
  $("finish-submit").disabled = busy || !finishTask;
  $("finish-submit").textContent = busy ? "저장 중…" : "종료하고 저장";
  $("finish-cancel").disabled = busy;
}

// 로그아웃되면 이전 계정의 데이터를 비우고 로그인 화면을 보여 준다.
function showLogin() {
  localStorage.removeItem(CACHE);
  invalidateCalendarCache();
  status = "login";
  tasks = [];
  memoBoard.reset();
  dailyBoard.reset();
  logMode = "records";
  if ($("memo-remove-dialog").open) $("memo-remove-dialog").close();
  task = null;
  view = "timer";
  day = today();
  loading = false;
  request++;
  clearForm();
  if (finishTask) closeFinish();
  if (remove) closeRemove();
  $("calendar").hidden = true;
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
    const data = await get(`/api/tasks?day=${day}`);
    if (seq !== request || !data) return;
    tasks = data.tasks;
    task = tasks.find((t) => t.status !== "done") || null;
    offset = data.now - Date.now();
    loading = false;
    if (day === today()) localStorage.setItem(CACHE, JSON.stringify({ day, tasks, offset }));
    status = "ready";
    $("error").textContent = "";
    render();
  } catch (e) {
    if (seq === request) showError(e);
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
    invalidateCalendarCache(day);
    if (typeof body.day === "string") invalidateCalendarCache(body.day);
    calendar.refresh();
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
  edit = null;
  editTimes = { first: "", last: "" };
}

// 웹앱 startEdit(): 완료 기록을 타이머 화면의 폼에 채운다.
function startEdit(t) {
  edit = t;
  editTimes = { first: timeInput(t.started_at), last: timeInput(t.ended_at) };
  $("f-title").value = t.title;
  $("f-note").value = t.note;
  $("f-result").value = t.result || "";
  $("f-target").value = t.target > 0 ? String(Math.round(t.target / 600) / 100) : "";
  $("f-minutes").value = String(Math.round(t.elapsed / 600) / 100);
  showWork("note");
  $("message").textContent = "";
  view = "timer";
  render();
  $("f-title").focus();
}

// 웹앱 chooseDay(): 다른 날짜를 고르면 그 날짜 기록을 새로 불러온다.
function chooseDay(value) {
  if (value === day) return;
  request++;
  loading = true;
  tasks = [];
  task = null;
  day = value;
  if (edit) clearForm();
  $("message").textContent = "";
  render();
  load();
}

function toggleCalendar(open) {
  $("calendar").hidden = !open;
  $("day-calendar").setAttribute("aria-expanded", open);
  if (open) calendar.open(day);
}

const calendar = createCalendar($("calendar"), {
  fetchMonth: (month) => get(`/api/calendar?month=${month}`),
  onChoose: (value) => {
    chooseDay(value);
    toggleCalendar(false);
  },
});

// 웹앱의 window.confirm 대신 팝업 안 대화상자로 묻는다(Esc·취소면 false).
function confirmMemoRemove() {
  const dialog = $("memo-remove-dialog");
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "remove"), { once: true }),
  );
}

const memoBoard = createMemoBoard($("memo-board"), {
  endpoint: "/api/memos",
  collapsible: true,
  emptyText: "항상 표시할 메모를 남겨보세요.",
  confirmRemove: confirmMemoRemove,
});
const dailyBoard = createMemoBoard($("daily-memo-board"), {
  endpoint: "/api/daily-memos",
  collapsible: false,
  emptyText: "선택한 날짜에 메모를 남겨보세요.",
  confirmRemove: confirmMemoRemove,
});
// 팝업이 닫힐 때 디바운스 중인 메모 입력을 바로 저장한다.
addEventListener("pagehide", () => {
  memoBoard.flush(true);
  dailyBoard.flush(true);
});

function askRemove(t) {
  remove = t;
  $("remove-desc").textContent = `“${t.title}”의 업무 내용과 측정 시간이 삭제됩니다.`;
  $("remove-dialog").showModal();
}

function closeRemove() {
  remove = null;
  $("remove-dialog").close();
}

function closeFinish() {
  finishTask = null;
  $("finish-dialog").close();
}

// 웹앱 save(): 목표·소요 시간은 분 단위 입력을 밀리초로 바꾼다.
async function save(run) {
  const ok = await act({
    action: edit ? "edit" : "create",
    id: edit?.id,
    version: edit?.version,
    title: $("f-title").value,
    note: $("f-note").value,
    result: $("f-result").value,
    target: $("f-target").value === "" ? 0 : Math.round(Number($("f-target").value) * 60000),
    // 바로 측정을 시작하면 보고 있는 날짜와 상관없이 오늘에 기록한다.
    day: run && !edit ? today() : day,
    elapsed: Math.round(Number($("f-minutes").value) * 60000),
    started_at: parseTimeInput(editTimes.first),
    ended_at: parseTimeInput(editTimes.last),
    run,
  });
  if (ok) clearForm();
}

for (const b of document.querySelectorAll("nav button[data-view]"))
  b.addEventListener("click", () => {
    view = b.dataset.view;
    render();
  });
for (const b of document.querySelectorAll("[data-log]"))
  b.addEventListener("click", () => {
    logMode = b.dataset.log;
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
$("f-cancel").addEventListener("click", () => {
  clearForm();
  render();
});
$("day-prev").addEventListener("click", () => chooseDay(shiftDay(day, -1)));
$("day-next").addEventListener("click", () => chooseDay(shiftDay(day, 1)));
$("day-today").addEventListener("click", () => chooseDay(today()));
$("day-calendar").addEventListener("click", () => toggleCalendar($("calendar").hidden));
$("remove-cancel").addEventListener("click", closeRemove);
$("remove-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeRemove();
});
// 웹앱처럼 확인하면 대화상자를 닫고 삭제한다. 오류는 화면 아래에 보여 준다.
$("remove-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const t = remove;
  closeRemove();
  if (t) act({ action: "delete", id: t.id, version: t.version });
});

setInterval(() => {
  if (task) $("clock").textContent = duration(elapsed(task));
  if (status === "ready" && view === "log") tickLog();
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
