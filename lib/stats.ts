import { validDay } from "./work-dates";

export type DayStat = { day: string; count: number; total: number };
export type ExportRow = {
  day: string;
  title: string;
  note: string;
  result: string;
  target: number;
  elapsed: number;
  started_at: number | null;
  ended_at: number | null;
  status: string;
};

const HOUR_MS = 3600000;
const KST_OFFSET_MS = 9 * HOUR_MS;

export function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// 0=월 … 6=일
export function weekdayIndex(day: string) {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function weekStart(day: string) {
  return addDays(day, -weekdayIndex(day));
}

export function weekDays(day: string) {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthRange(day: string) {
  const [year, month] = day.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = day.slice(0, 8);
  return { from: `${prefix}01`, to: `${prefix}${String(last).padStart(2, "0")}` };
}

export function shiftMonth(day: string, offset: number) {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

// 월요일 시작 주차로 나누되, 그 달에 속한 날만 포함한다.
export function monthWeeks(day: string) {
  const { from, to } = monthRange(day);
  const weeks: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to) {
    const sunday = addDays(start, 6 - weekdayIndex(start));
    const end = sunday < to ? sunday : to;
    weeks.push({ from: start, to: end });
    start = addDays(end, 1);
  }
  return weeks;
}

// 오늘이 들어 있는 주를 마지막 열로 하는 53주 격자. GitHub처럼 일요일에 시작한다.
export function heatmapWeeks(today: string, count = 53) {
  const sunday = addDays(today, -((weekdayIndex(today) + 1) % 7));
  const first = addDays(sunday, -(count - 1) * 7);
  return Array.from({ length: count }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
  );
}

// 0h / ~3h / ~6h / ~9h / 9h 이상
export function heatLevel(ms: number) {
  if (ms <= 0) return 0;
  if (ms < 3 * HOUR_MS) return 1;
  if (ms < 6 * HOUR_MS) return 2;
  if (ms < 9 * HOUR_MS) return 3;
  return 4;
}

export function dayCount(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

export function validRange(from: unknown, to: unknown, maxDays: number): from is string {
  return validDay(from) && validDay(to) && from <= to && dayCount(from, to) <= maxDays;
}

export function hoursLabel(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

function kstTime(t: number | null) {
  return t == null ? "" : new Date(t + KST_OFFSET_MS).toISOString().slice(11, 16);
}

export function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const statusLabels: Record<string, string> = { done: "완료", running: "진행 중", paused: "일시정지" };

export function tasksCsv(rows: ExportRow[]) {
  const header = ["날짜", "제목", "메모", "결과", "목표(분)", "소요(분)", "시작 시각", "종료 시각", "상태"];
  const lines = rows.map((row) =>
    [
      row.day,
      row.title,
      row.note,
      row.result,
      row.target ? Math.round(row.target / 60000) : "",
      Math.round(row.elapsed / 60000),
      kstTime(row.started_at),
      kstTime(row.ended_at),
      statusLabels[row.status] ?? row.status,
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}
