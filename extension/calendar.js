// 웹앱 work-calendar.tsx의 작업 캘린더. 달마다 날짜별 작업 수·시간을 불러와 캐시한다.
import { clockDuration, today } from "./dates.js";

const monthCache = new Map(); // "YYYY-MM" → { days: { [day]: {count,total,running} }, now }

export function invalidateCalendarCache(day) {
  if (day) monthCache.delete(day.slice(0, 7));
  else monthCache.clear();
}

const summaryDuration = (ms) => clockDuration(ms).split(":").slice(0, 2).join(":");
const shiftMonth = (key, n) => {
  const d = new Date(`${key}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

// el 안에 달력을 그린다. 웹앱처럼 날짜를 한 번 누르면 고르고, 고른 날짜를 다시 누르면 onChoose를 부른다.
export function createCalendar(el, { fetchMonth, onChoose }) {
  let selection = today(),
    month = selection.slice(0, 7),
    error = "",
    loading = null; // 불러오는 중인 달

  async function ensure() {
    const key = month;
    if (monthCache.has(key) || loading === key || error) return;
    loading = key;
    try {
      const data = await fetchMonth(key);
      if (!data) return;
      monthCache.set(key, { days: Object.fromEntries(data.days.map((d) => [d.day, d])), now: data.now });
    } catch (e) {
      if (key === month) error = e instanceof Error && e.message ? e.message : "캘린더를 불러오지 못했습니다.";
    } finally {
      if (loading === key) loading = null;
    }
    if (key === month) render();
  }

  function select(value) {
    if (value === selection) onChoose(value);
    else {
      selection = value;
      render();
    }
  }

  function button(text, label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (label) b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }

  // now: 서버 기준 현재 시각. 측정 중인 작업 시간을 더할 때 쓴다.
  function render(now = Date.now()) {
    if (el.hidden) return;
    const cached = monthCache.get(month),
      ready = !!cached,
      days = cached?.days || {},
      total = (d) => (d?.total || 0) + (d?.running || 0) * Math.max(0, now - cached.now),
      todayKey = today();

    const head = document.createElement("div");
    head.className = "cal-head";
    const h = document.createElement("h2");
    h.textContent = "작업 캘린더";
    head.append(
      h,
      button("오늘", "", () => {
        month = todayKey.slice(0, 7);
        error = "";
        select(todayKey);
        render();
      }),
    );

    const caption = document.createElement("div");
    caption.className = "cal-month";
    const title = document.createElement("strong");
    title.textContent = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
    const move = (n) => () => {
      month = shiftMonth(month, n);
      error = "";
      render();
    };
    caption.append(button("‹", "이전 달", move(-1)), title, button("›", "다음 달", move(1)));

    const grid = document.createElement("div");
    grid.className = "cal-grid";
    for (const w of "일월화수목금토") {
      const s = document.createElement("span");
      s.className = "cal-weekday";
      s.textContent = w;
      grid.append(s);
    }
    const first = new Date(`${month}-01T00:00:00Z`),
      count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    for (let i = 0; i < first.getUTCDay(); i++) grid.append(document.createElement("span"));
    for (let n = 1; n <= count; n++) {
      const key = `${month}-${String(n).padStart(2, "0")}`,
        d = days[key],
        weekdayIndex = (first.getUTCDay() + n - 1) % 7;
      const text = ready ? `작업 ${d?.count || 0}개 · 총 ${clockDuration(total(d))}` : "기록 확인 중";
      const b = button("", `${key}, ${text}`, () => select(key));
      b.className = `cal-day${key === selection ? " selected" : ""}${key === todayKey ? " is-today" : ""}`;
      const num = document.createElement("span");
      num.textContent = n;
      if (weekdayIndex === 0) num.className = "day-sunday";
      if (weekdayIndex === 6) num.className = "day-saturday";
      b.append(num);
      if (ready && d?.count > 0) {
        const c = document.createElement("span");
        c.className = "day-count";
        c.textContent = `${d.count}개`;
        b.append(c);
      }
      grid.append(b);
    }

    const status = document.createElement("p");
    if (error) {
      status.className = "error";
      status.setAttribute("role", "alert");
      status.textContent = error;
    } else {
      status.className = ready ? "hint" : "hint spinner";
      status.setAttribute("aria-live", "polite");
      const s = days[selection];
      status.textContent =
        ready && selection.slice(0, 7) === month
          ? `작업 ${s?.count || 0}개, ${summaryDuration(total(s))}`
          : ready
            ? "날짜를 선택해 주세요."
            : "기록을 불러오는 중입니다.";
    }

    el.replaceChildren(head, caption, grid, status);
    if (!ready) ensure();
  }

  return {
    // 선택한 날짜의 달을 보여 준다.
    open(day) {
      selection = day;
      month = day.slice(0, 7);
      error = "";
      render();
    },
    // 작업 저장 뒤 캐시가 지워졌으면 다시 불러온다.
    refresh() {
      error = "";
      render();
    },
    render,
  };
}
