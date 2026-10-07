"use client";

import { useState, type PointerEvent } from "react";

type ActivityTask = {
  id: string;
  title: string;
  status: string;
  elapsed: number;
  started: number | null;
  started_at: number | null;
  ended_at: number | null;
  sessions?: { start_at: number; end_at: number | null }[];
};

type Segment = ActivityTask & {
  key: string;
  color: string;
  open: boolean;
  spanCount: number;
  start: number;
  end: number;
  startRatio: number;
  durationRatio: number;
  lane: number;
};

type Tooltip = {
  segment: Segment;
  x: number;
  y: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HAND_UPDATE_MS = 5 * 60 * 1000;
const RADIUS = 98;
const LANE_GAP = 15;
const GUIDE_RADIUS = RADIUS - LANE_GAP * 2;
const LABEL_RADIUS = RADIUS - LANE_GAP * 3;
const NEARBY_GAP_MS = 40 * 60 * 1000;
const GOLDEN_ANGLE = 137.508;
const THREE_HOUR_MARKS = Array.from({ length: 8 }, (_, index) => {
  const hour = index * 3;
  const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
  return { hour, angle };
});

const firstStart = (task: ActivityTask) => task.sessions?.[0]?.start_at ?? task.started_at ?? 0;

function idHue(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 360;
}

// 업무 id로 정한 무작위 색상(hue)을 쓰되, 먼저 시작한 업무의 색과 가까우면 황금각만큼 옮겨 겹치지 않게 한다.
// 시작 순서대로 배정하므로 나중에 업무가 추가되어도 기존 업무의 색은 바뀌지 않는다.
function taskColors(tasks: ActivityTask[]) {
  const minGap = Math.min(30, 360 / Math.max(1, tasks.length) / 1.5);
  const used: number[] = [];
  const colors = new Map<string, string>();
  for (const task of [...tasks].sort((a, b) => firstStart(a) - firstStart(b) || a.id.localeCompare(b.id))) {
    let hue = idHue(task.id);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (used.every((other) => Math.min(Math.abs(hue - other), 360 - Math.abs(hue - other)) >= minGap)) break;
      hue = (hue + GOLDEN_ANGLE) % 360;
    }
    used.push(hue);
    colors.set(task.id, `hsl(${Math.round(hue)} 62% 76%)`);
  }
  return colors;
}

function activitySegments(tasks: ActivityTask[], day: string, now: number) {
  const dayStart = Date.parse(`${day}T00:00:00+09:00`);
  const dayEnd = dayStart + DAY_MS;
  const colors = taskColors(tasks);

  const segments = tasks.flatMap<Omit<Segment, "lane">>((task) => {
    // 구간 기록이 없는 기존 업무는 처음 시작부터 마지막 종료까지를 한 구간으로 본다.
    const spans = task.sessions?.length
      ? task.sessions.map((session) => ({ start: session.start_at, end: session.end_at }))
      : task.started_at === null
        ? []
        : [{ start: task.started_at, end: task.ended_at ?? (task.status === "done" ? task.started_at : null) }];

    return spans.flatMap((span, spanIndex) => {
      const start = Math.max(dayStart, span.start);
      const clippedEnd = Math.min(dayEnd, span.end ?? now);
      if (clippedEnd <= start) return [];

      return [{
        ...task,
        key: `${task.id}-${spanIndex}`,
        color: colors.get(task.id) ?? "",
        open: span.end === null,
        spanCount: spans.length,
        start,
        end: clippedEnd,
        startRatio: (start - dayStart) / DAY_MS,
        durationRatio: (clippedEnd - start) / DAY_MS,
      }];
    });
  });

  return segments
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .reduce<Segment[]>((positioned, segment) => {
      const previous = positioned.at(-1);
      const nearby = previous && segment.start - previous.end <= NEARBY_GAP_MS;
      const lane = nearby && previous.lane === 0 ? 1 : 0;
      positioned.push({ ...segment, lane });
      return positioned;
    }, []);
}

const segmentRadius = (lane: number) => Math.max(44, RADIUS - lane * LANE_GAP);

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function durationLabel(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}분`;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function recordedDuration(task: ActivityTask, now: number) {
  return task.elapsed + (task.started === null ? 0 : Math.max(0, now - task.started));
}

export default function DailyActivityClock({
  tasks,
  day,
  now,
}: {
  tasks: ActivityTask[];
  day: string;
  now: number;
}) {
  const segments = activitySegments(tasks, day, now);
  const [, month, date] = day.split("-");
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const handNow = Math.floor(now / HAND_UPDATE_MS) * HAND_UPDATE_MS;
  const handRatio = ((handNow + KST_OFFSET_MS) % DAY_MS) / DAY_MS;
  const handAngle = handRatio * Math.PI * 2 - Math.PI / 2;
  const handLength = RADIUS;
  const handX = 120 + Math.cos(handAngle) * handLength;
  const handY = 120 + Math.sin(handAngle) * handLength;

  function showPointerTooltip(event: PointerEvent<SVGCircleElement>, segment: Segment) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    setTooltip({
      segment,
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    });
  }

  function showFocusedTooltip(segment: Segment) {
    const angle = (segment.startRatio + segment.durationRatio / 2) * Math.PI * 2 - Math.PI / 2;
    const radius = segmentRadius(segment.lane);
    setTooltip({
      segment,
      x: (120 + Math.cos(angle) * radius) / 240,
      y: (120 + Math.sin(angle) * radius) / 240,
    });
  }

  return (
    <section className="day-timeline-panel" aria-label={`${day} 하루 활동 시계`}>
      <div className="day-clock-heading">
        <div className="day-clock-heading-left">
          <span className="day-clock-date">{month}.{date}</span>
          <strong>하루 요약</strong>
        </div>
        <button>통계</button>
        {/* 통계는 추후 기능 추가 */}
      </div>
      <div className="day-clock-wrap">
        <svg className="day-clock" viewBox="0 0 240 240" role="img">
          <circle className="day-clock-track" cx="120" cy="120" r={RADIUS} />
          {segments.map((segment) => {
            const radius = segmentRadius(segment.lane);
            const circumference = 2 * Math.PI * radius;
            return (
              <circle
                key={segment.key}
                className={tooltip?.segment.id === segment.id ? "day-clock-segment is-related" : "day-clock-segment"}
                cx="120"
                cy="120"
                r={radius}
                pathLength={circumference}
                stroke={segment.color}
                strokeDasharray={`${segment.durationRatio * circumference} ${circumference}`}
                strokeDashoffset={-segment.startRatio * circumference}
                data-task-id={segment.id}
                tabIndex={0}
                aria-label={`${segment.title}, ${timeFormatter.format(segment.start)}부터 ${timeFormatter.format(segment.end)}까지`}
                onPointerEnter={(event) => showPointerTooltip(event, segment)}
                onPointerMove={(event) => showPointerTooltip(event, segment)}
                onPointerLeave={() => setTooltip(null)}
                onFocus={() => showFocusedTooltip(segment)}
                onBlur={() => setTooltip(null)}
              />
            );
          })}
          <g className="day-clock-guide" aria-hidden="true">
            <circle className="day-clock-guide-track" cx="120" cy="120" r={GUIDE_RADIUS} />
            {THREE_HOUR_MARKS.map(({ hour, angle }) => (
              <circle
                key={hour}
                cx={120 + Math.cos(angle) * GUIDE_RADIUS}
                cy={120 + Math.sin(angle) * GUIDE_RADIUS}
                r="3"
              />
            ))}
          </g>
          <g className="day-clock-hand" aria-hidden="true">
            <line x1="120" y1="120" x2={handX} y2={handY} />
            <circle cx="120" cy="120" r="5" />
          </g>
          <g className="day-clock-marks" aria-hidden="true">
            {THREE_HOUR_MARKS.map(({ hour, angle }) => (
              <text
                key={hour}
                x={120 + Math.cos(angle) * LABEL_RADIUS}
                y={120 + Math.sin(angle) * LABEL_RADIUS}
              >
                {hour}
              </text>
            ))}
          </g>
        </svg>
        <div className="day-clock-center" aria-hidden="true">
        
        </div>
        {tooltip && (
          <div
            className="day-clock-tooltip"
            role="tooltip"
            style={{ left: `${tooltip.x * 100}%`, top: `${tooltip.y * 100}%` }}
          >
            <strong>{tooltip.segment.title}</strong>
            <span>
              {timeFormatter.format(tooltip.segment.start)}–{tooltip.segment.open
                ? "진행 중"
                : timeFormatter.format(tooltip.segment.end)}
            </span>
            <small>
              {tooltip.segment.spanCount > 1
                ? `${durationLabel(tooltip.segment.end - tooltip.segment.start)} · 누적 ${durationLabel(recordedDuration(tooltip.segment, now))}`
                : durationLabel(recordedDuration(tooltip.segment, now))}
            </small>
          </div>
        )}
      </div>
    </section>
  );
}
