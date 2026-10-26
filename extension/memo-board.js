// 웹앱 memo-board.tsx의 MemoBoard·MemoCard를 팝업용 DOM으로 옮긴 것이다.
// 카드는 메모마다 한 번 만들고 입력 칸은 다시 그리지 않는다(입력 중 포커스 유지).
import { authed } from "./api.js";

const SAVE_DELAY = 700;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, label, onClick) {
  const b = el("button", "", text);
  b.type = "button";
  if (label) {
    b.title = label;
    b.setAttribute("aria-label", label);
  }
  b.addEventListener("click", onClick);
  return b;
}

// 로그아웃(401)이면 authed가 로그인 화면으로 보내므로 signedOut 오류는 화면에 띄우지 않는다.
async function memoRequest(endpoint, body, keepalive = false) {
  const r = await authed(endpoint, { method: "POST", body, keepalive });
  if (!r) throw Object.assign(Error(""), { signedOut: true });
  if (!r.ok)
    throw Object.assign(Error(r.data.error || "메모를 저장하지 못했습니다."), {
      memo: r.status === 409 ? r.data.memo : undefined,
    });
  return r.data;
}

function createCard(memo, { request, collapsible, confirmRemove, onDeleted, onMove }) {
  let collapsed = memo.collapsed ?? false,
    version = memo.version,
    persisted = { title: memo.title, body: memo.body, collapsed },
    timer = null,
    saving = false,
    queued = false,
    conflict = null;

  const card = el("article", "memo-card");
  const status = el("span", "memo-status", "저장됨");
  const up = button("↑", "위로 이동", () => onMove("up"));
  const down = button("↓", "아래로 이동", () => onMove("down"));
  const fold = button("", "", toggleCollapsed);
  const actions = el("div", "memo-card-actions");
  actions.append(status, up, down);
  if (collapsible) actions.append(fold);
  actions.append(button("✕", "메모 삭제", remove));
  const title = el("input", "memo-title");
  Object.assign(title, { value: memo.title, placeholder: "제목", maxLength: 200 });
  title.setAttribute("aria-label", "메모 제목");
  const body = el("textarea", "memo-body");
  Object.assign(body, { value: memo.body, placeholder: "메모를 입력하세요.", maxLength: 20000, rows: 2 });
  body.setAttribute("aria-label", "메모 내용");
  const error = el("div", "memo-error");
  error.setAttribute("role", "alert");
  card.append(actions, title, body, error);
  for (const input of [title, body]) {
    input.addEventListener("input", schedule);
    input.addEventListener("blur", () => save());
  }
  showCollapsed();
  showState("saved");

  const current = () => ({ title: title.value, body: body.value, collapsed });
  const same = (a, b) => a.title === b.title && a.body === b.body && a.collapsed === b.collapsed;

  function showCollapsed() {
    card.classList.toggle("is-collapsed", collapsed);
    body.hidden = collapsed;
    fold.textContent = collapsed ? "▾" : "▴";
    fold.title = collapsed ? "메모 펼치기" : "메모 접기";
    fold.setAttribute("aria-label", fold.title);
    fold.setAttribute("aria-expanded", !collapsed);
  }

  // 오류가 있으면 충돌 해결 버튼이나 다시 저장 버튼을 함께 보여 준다.
  function showState(state, message = "") {
    status.textContent = state === "saving" ? "저장 중" : state === "error" ? "저장 실패" : "저장됨";
    error.hidden = !message;
    if (!message) return error.replaceChildren();
    const buttons = el("div", "memo-error-actions");
    if (conflict)
      buttons.append(button("최신 내용 불러오기", "", loadServerVersion), button("내 내용으로 덮어쓰기", "", keepMine));
    else buttons.append(button("다시 저장", "", () => save()));
    error.replaceChildren(el("span", "", message), buttons);
  }

  // 다른 기기의 변경을 덮어쓰지 않도록 충돌 해결 전에는 자동 저장을 멈춘다.
  function fail(reason) {
    if (reason.signedOut) return;
    if (reason.memo) conflict = reason.memo;
    showState("error", reason.message || "메모를 저장하지 못했습니다.");
  }

  function loadServerVersion() {
    if (!conflict) return;
    title.value = conflict.title;
    body.value = conflict.body;
    collapsed = conflict.collapsed ?? false;
    version = conflict.version;
    persisted = current();
    conflict = null;
    showCollapsed();
    showState("saved");
  }

  function keepMine() {
    if (!conflict) return;
    version = conflict.version;
    persisted = { title: conflict.title, body: conflict.body, collapsed: conflict.collapsed ?? false };
    conflict = null;
    showState("saved");
    save();
  }

  async function save(keepalive = false) {
    if (conflict) return;
    if (saving) {
      queued = true;
      return;
    }
    const snapshot = current();
    if (same(snapshot, persisted)) return;
    saving = true;
    queued = false;
    showState("saving");
    try {
      const data = await request({ action: "update", id: memo.id, version, ...snapshot }, keepalive);
      if (data.memo) {
        version = data.memo.version;
        persisted = snapshot;
      }
      showState("saved");
    } catch (reason) {
      fail(reason);
    } finally {
      saving = false;
      if (queued && !conflict && !same(current(), snapshot)) save();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      save();
    }, SAVE_DELAY);
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
    showCollapsed();
    clearTimeout(timer);
    timer = null;
    save();
  }

  async function remove() {
    if ((title.value.trim() || body.value.trim()) && !(await confirmRemove())) return;
    clearTimeout(timer);
    timer = null;
    try {
      await request({ action: "delete", id: memo.id, version });
      onDeleted();
    } catch (reason) {
      fail(reason);
    }
  }

  return {
    id: memo.id,
    el: card,
    focus: () => title.focus(),
    setMove(canUp, canDown) {
      up.disabled = !canUp;
      down.disabled = !canDown;
    },
    // 디바운스 중인 입력을 바로 저장한다(날짜 전환, 팝업 닫힘).
    flush(keepalive) {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      save(keepalive);
    },
  };
}

// endpoint: /api/memos(메모장) 또는 /api/daily-memos(일일 메모, show(day)로 날짜를 준다).
export function createMemoBoard(root, { endpoint, collapsible, emptyText, confirmRemove }) {
  let shown = false,
    day,
    cards = [],
    loading = false,
    moving = false,
    error = "",
    seq = 0; // 늦게 온 이전 날짜 응답을 버리기 위한 번호

  const requestFor = (memoDay) => (body, keepalive) =>
    memoRequest(endpoint, memoDay ? { ...body, day: memoDay } : body, keepalive);

  function makeCard(memo) {
    const card = createCard(memo, {
      request: requestFor(day),
      collapsible,
      confirmRemove,
      onDeleted: () => {
        cards = cards.filter((c) => c !== card);
        render();
      },
      onMove: (direction) => move(card, direction),
    });
    return card;
  }

  function addButton(text) {
    const b = el("button", "memo-add", text);
    b.type = "button";
    b.addEventListener("click", create);
    return b;
  }

  function render() {
    const parts = [];
    if (error) {
      const line = el("div", "memo-error");
      line.setAttribute("role", "alert");
      const retry = el("button", "", "다시 불러오기");
      retry.type = "button";
      retry.addEventListener("click", reload);
      line.append(el("span", "", error), retry);
      parts.push(line);
    }
    if (loading) parts.push(el("p", "hint spinner", "메모를 불러오는 중입니다."));
    else if (!cards.length) {
      const empty = el("div", "empty");
      empty.append(el("p", "hint", emptyText), addButton("+ 첫 메모 만들기"));
      parts.push(empty);
    } else {
      cards.forEach((c, i) => c.setMove(!moving && i > 0, !moving && i < cards.length - 1));
      parts.push(...cards.map((c) => c.el), addButton("+ 새 메모"));
    }
    root.replaceChildren(...parts);
  }

  async function reload() {
    for (const c of cards) c.flush(false);
    const n = ++seq;
    cards = [];
    loading = true;
    error = "";
    render();
    try {
      const r = await authed(day ? `${endpoint}?day=${day}` : endpoint);
      if (n !== seq || !r) return;
      if (!r.ok) throw Error(r.data.error);
      cards = r.data.memos.map(makeCard);
    } catch (e) {
      if (n !== seq) return;
      error = e.message || "메모를 불러오지 못했습니다.";
    }
    loading = false;
    render();
  }

  async function create() {
    const n = seq;
    error = "";
    try {
      const data = await requestFor(day)({ action: "create" });
      if (n !== seq || !data.memo) return;
      const card = makeCard(data.memo);
      cards.push(card);
      render();
      card.focus();
    } catch (e) {
      if (n !== seq || e.signedOut) return;
      error = e.message;
      render();
    }
  }

  async function move(card, direction) {
    if (moving) return;
    const index = cards.indexOf(card);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= cards.length) return;
    const swap = cards[swapIndex];
    const n = seq;
    cards[index] = swap;
    cards[swapIndex] = card;
    moving = true;
    error = "";
    render();
    try {
      await requestFor(day)({ action: "reorder", id: card.id, swapId: swap.id });
    } catch (e) {
      // 실패하면 서버 순서로 다시 불러온 뒤 오류를 보여 준다.
      if (n === seq && !e.signedOut) {
        moving = false;
        await reload();
        error = e.message;
      }
    }
    moving = false;
    if (shown) render();
  }

  return {
    // 처음 보거나 날짜가 바뀌었을 때만 불러온다.
    show(nextDay) {
      if (shown && nextDay === day) return;
      shown = true;
      day = nextDay;
      reload();
    },
    flush: (keepalive) => cards.forEach((c) => c.flush(keepalive)),
    // 로그아웃: 이전 계정의 메모를 비운다.
    reset() {
      seq++;
      shown = false;
      day = undefined;
      cards = [];
      loading = false;
      moving = false;
      error = "";
      root.replaceChildren();
    },
  };
}
