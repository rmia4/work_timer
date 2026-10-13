import { APP_ORIGIN } from "./config.js";

const $ = (id) => document.getElementById(id);
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

function show(section) {
  for (const id of ["loading", "login", "active", "start"]) $(id).hidden = id !== section;
}

function render() {
  if (!task) {
    show("start");
    return;
  }
  show("active");
  $("state").textContent = task.status === "running" ? "측정 중" : "일시정지";
  $("title").textContent = task.title;
  $("clock").textContent = clock(elapsed(task));
  $("toggle").textContent = task.status === "running" ? "일시정지" : "다시 시작";
}

async function load() {
  try {
    const r = await fetch(`${APP_ORIGIN}/api/tasks?day=${today()}`, { credentials: "include" });
    if (r.status === 401) {
      show("login");
      return;
    }
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    task = data.tasks.find((t) => t.status !== "done") || null;
    offset = data.now - Date.now();
    render();
  } catch (e) {
    $("error").textContent = e instanceof Error && e.message ? e.message : "연결을 확인해 주세요.";
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
}, 1000);
load();
