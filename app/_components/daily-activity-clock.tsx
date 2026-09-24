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
};

type Segment = ActivityTask & {
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
const COLORS = ["#86a8e7", "#79c7b7", "#f2b880", "#b69ce3", "#eb9aae"];
const THREE_HOUR_MARKS = Array.from({ length: 8 }, (_, index) => {
  const hour = index * 3;
  const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
  return { hour, angle };
});

function activitySegments(tasks: ActivityTask[], day: string, now: number) {
  const dayStart = Date.parse(`${day}T00:00:00+09:00`);
  const dayEnd = dayStart + DAY_MS;

  const segments = tasks.flatMap<Omit<Segment, "lane">>((task) => {
    if (task.started_at === null) return [];
    const end = task.ended_at ?? (task.status === "done" ? task.started_at : now);
    const start = Math.max(dayStart, task.started_at);
    const clippedEnd = Math.min(dayEnd, end);
    if (clippedEnd <= start) return [];

    return [{
      ...task,
      start,
      end: clippedEnd,
      startRatio: (start - dayStart) / DAY_MS,
      durationRatio: (clippedEnd - start) / DAY_MS,
    }];
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
        <span className="day-clock-date">{month}.{date}</span>
        <button>통계</button>
        {/* 통계는 추후 기능 추가 */}
      </div>
      <div className="day-clock-wrap">
        <svg className="day-clock" viewBox="0 0 240 240" role="img">
          <circle className="day-clock-track" cx="120" cy="120" r={RADIUS} />
          {segments.map((segment, index) => {
            const radius = segmentRadius(segment.lane);
            const circumference = 2 * Math.PI * radius;
            return (
              <circle
                key={segment.id}
                className="day-clock-segment"
                cx="120"
                cy="120"
                r={radius}
                pathLength={circumference}
                stroke={COLORS[index % COLORS.length]}
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
              {timeFormatter.format(tooltip.segment.start)}–{tooltip.segment.ended_at === null && tooltip.segment.status !== "done"
                ? "진행 중"
                : timeFormatter.format(tooltip.segment.end)}
            </span>
            <small>{durationLabel(recordedDuration(tooltip.segment, now))}</small>
          </div>
        )}
      </div>
    </section>
  );
}
