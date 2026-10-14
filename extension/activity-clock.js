// 웹앱 daily-activity-clock.tsx의 하루 활동 시계를 확장용으로 옮긴 것이다.
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const RADIUS = 98;
const LANE_GAP = 15;
const GUIDE_RADIUS = RADIUS - LANE_GAP * 2;
const LABEL_RADIUS = RADIUS - LANE_GAP * 3;
const NEARBY_GAP_MS = 40 * 60 * 1000;
const GOLDEN_ANGLE = 137.508;
const MARKS = Array.from({ length: 8 }, (_, i) => ({ hour: i * 3, angle: (i / 8) * Math.PI * 2 - Math.PI / 2 }));
const NS = "http://www.w3.org/2000/svg";

const firstStart = (t) => t.sessions?.[0]?.start_at ?? t.started_at ?? 0;

function idHue(id) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 360;
}

function taskColors(tasks) {
  const minGap = Math.min(30, 360 / Math.max(1, tasks.length) / 1.5);
  const used = [];
  const colors = new Map();
  for (const task of [...tasks].sort((a, b) => firstStart(a) - firstStart(b) || a.id.localeCompare(b.id))) {
    let hue = idHue(task.id);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (used.every((o) => Math.min(Math.abs(hue - o), 360 - Math.abs(hue - o)) >= minGap)) break;
      hue = (hue + GOLDEN_ANGLE) % 360;
    }
    used.push(hue);
    colors.set(task.id, `hsl(${Math.round(hue)} 62% 76%)`);
  }
  return colors;
}

// 하루(한국 시간) 안으로 자른 측정 구간. 가까운 구간은 안쪽 줄로 옮겨 겹치지 않게 한다.
export function activitySegments(tasks, day, now) {
  const dayStart = Date.parse(`${day}T00:00:00+09:00`);
  const dayEnd = dayStart + DAY_MS;
  const colors = taskColors(tasks);
  const segments = tasks.flatMap((task) => {
    const spans = task.sessions?.length
      ? task.sessions.map((s) => ({ start: s.start_at, end: s.end_at }))
      : task.started_at === null
        ? []
        : [{ start: task.started_at, end: task.ended_at ?? (task.status === "done" ? task.started_at : null) }];
    return spans.flatMap((span) => {
      const start = Math.max(dayStart, span.start);
      const end = Math.min(dayEnd, span.end ?? now);
      if (end <= start) return [];
      return [{ task, color: colors.get(task.id), start, end, startRatio: (start - dayStart) / DAY_MS, durationRatio: (end - start) / DAY_MS }];
    });
  });
  let previous = null;
  for (const s of segments.sort((a, b) => a.start - b.start || a.end - b.end)) {
    s.lane = previous && s.start - previous.end <= NEARBY_GAP_MS && previous.lane === 0 ? 1 : 0;
    previous = s;
  }
  return segments;
}

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.append(node);
  return node;
}

export function drawClock(svg, segments, now) {
  svg.replaceChildren();
  el("circle", { class: "clock-track", cx: 120, cy: 120, r: RADIUS }, svg);
  for (const s of segments) {
    const r = Math.max(44, RADIUS - s.lane * LANE_GAP);
    const c = 2 * Math.PI * r;
    const arc = el("circle", {
      class: "clock-segment",
      cx: 120,
      cy: 120,
      r,
      stroke: s.color,
      "stroke-dasharray": `${s.durationRatio * c} ${c}`,
      "stroke-dashoffset": -s.startRatio * c,
    }, svg);
    arc.dataset.tip =
      `${s.task.title}\n${timeFormatter.format(s.start)}–${timeFormatter.format(s.end)}`;
  }
  const guide = el("g", { class: "clock-guide", "aria-hidden": "true" }, svg);
  el("circle", { class: "clock-guide-track", cx: 120, cy: 120, r: GUIDE_RADIUS }, guide);
  for (const { angle } of MARKS)
    el("circle", { cx: 120 + Math.cos(angle) * GUIDE_RADIUS, cy: 120 + Math.sin(angle) * GUIDE_RADIUS, r: 3 }, guide);
  const angle = (((now + KST_OFFSET_MS) % DAY_MS) / DAY_MS) * Math.PI * 2 - Math.PI / 2;
  const hand = el("g", { class: "clock-hand", "aria-hidden": "true" }, svg);
  el("line", { x1: 120, y1: 120, x2: 120 + Math.cos(angle) * RADIUS, y2: 120 + Math.sin(angle) * RADIUS }, hand);
  el("circle", { cx: 120, cy: 120, r: 5 }, hand);
  const marks = el("g", { class: "clock-marks", "aria-hidden": "true" }, svg);
  for (const { hour, angle: a } of MARKS)
    el("text", { x: 120 + Math.cos(a) * LABEL_RADIUS, y: 120 + Math.sin(a) * LABEL_RADIUS }, marks).textContent = hour;
}

// 구간에 커서를 올리면 기본 <title> 대신 바로 뜨는 검정 툴팁을 커서 옆에 보여 준다.
// 시계는 1분마다 다시 그려지므로 svg 자체에 이벤트를 건다.
export function bindClockTooltip(svg, tip) {
  svg.addEventListener("pointermove", (e) => {
    const text = e.target.closest?.(".clock-segment")?.dataset.tip;
    tip.hidden = !text;
    if (!text) return;
    tip.textContent = text;
    const { innerWidth: w, innerHeight: h } = window;
    tip.style.left = `${Math.min(e.clientX + 12, w - tip.offsetWidth - 4)}px`;
    tip.style.top = `${Math.min(e.clientY + 12, h - tip.offsetHeight - 4)}px`;
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));
}
