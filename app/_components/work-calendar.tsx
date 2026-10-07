"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ComponentProps,
} from "react";
import type { DayButton } from "react-day-picker";
import { ko } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { localDay, clockDuration } from "../../lib/work-dates";
type Summary = { day: string; count: number; total: number; running: number };
type CachedMonth = { days: Record<string, Summary>; now: number };
const monthCache = new Map<string, CachedMonth>();

export function invalidateCalendarCache(day?: string) {
  if (day) monthCache.delete(day.slice(0, 7));
  else monthCache.clear();
}

const summaryDuration = (ms: number) =>
  clockDuration(ms).split(":").slice(0, 2).join(":");
const Context = createContext<{
  days: Record<string, Summary>;
  now: number;
  loadedAt: number;
  ready: boolean;
}>({ days: {}, now: 0, loadedAt: 0, ready: false });
function SummaryDay({
  day,
  modifiers,
  className,
  onMouseEnter,
  onMouseLeave,
  onMouseOver,
  onMouseOut,
  onPointerEnter,
  onPointerLeave,
  onPointerOver,
  onPointerOut,
  ...props
}: ComponentProps<typeof DayButton>) {
  const { days, now, loadedAt, ready } = useContext(Context),
    key = localDay(day.date),
    data = days[key];
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  const count = data?.count || 0,
    total =
      (data?.total || 0) + (data?.running || 0) * Math.max(0, now - loadedAt);
  const text = ready
    ? `작업 ${count}개 · 총 ${clockDuration(total)}`
    : "기록 확인 중";
  return (
    <button
      {...props}
      ref={ref}
      className={`calendar-day ${modifiers.selected ? "selected" : ""} ${modifiers.today ? "is-today" : ""}`}
      aria-label={`${key}, ${text}`}
    >
      <span
        className={
          day.date.getDay() === 0
            ? "day-sunday"
            : day.date.getDay() === 6
              ? "day-saturday"
              : undefined
        }
      >
        {day.date.getDate()}
      </span>
      {ready && count > 0 && <span className="day-count">{count}개</span>}
    </button>
  );
}
export default function WorkCalendar({
  day,
  onSelect,
  refresh,
  now,
}: {
  day: string;
  onSelect: (day: string) => void;
  refresh: number;
  now: number;
}) {
  const [month, setMonth] = useState(() => new Date(day + "T12:00:00")),
    [days, setDays] = useState<Record<string, Summary>>({}),
    [loadedAt, setLoadedAt] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const monthKey = localDay(month).slice(0, 7);
  useEffect(() => {
    setMonth(new Date(day + "T12:00:00"));
  }, [day]);
  useEffect(() => {
    let cancelled = false;
    setError("");
    const cached = monthCache.get(monthKey);
    if (cached) {
      setDays(cached.days);
      setLoadedAt(cached.now);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    setReady(false);
    const load = async () => {
      try {
        const r = await fetch("/api/calendar?month=" + monthKey);
        const data = (await r.json()) as {
          days: Summary[];
          now: number;
          error?: string;
        };
        if (!r.ok) throw Error(data.error);
        const nextDays = Object.fromEntries(data.days.map((d) => [d.day, d]));
        monthCache.set(monthKey, { days: nextDays, now: data.now });
        if (!cancelled) {
          setDays(nextDays);
          setLoadedAt(data.now);
          setReady(true);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setReady(false);
          setError(
            e instanceof Error ? e.message : "캘린더를 불러오지 못했습니다.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [monthKey, refresh]);
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const selected = days[day],
    selectedInMonth = day.slice(0, 7) === monthKey;
  return (
    <section className="calendar-panel">
      <div className="section-title">
        <h2>작업 캘린더</h2>
        <button
          onClick={() => {
            setMonth(new Date(todayKey + "T12:00:00"));
            onSelect(todayKey);
          }}
        >
          오늘
        </button>
      </div>
      <Context.Provider value={{ days, now, loadedAt, ready }}>
        <Calendar
          mode="single"
          required
          locale={ko}
          selected={new Date(day + "T12:00:00")}
          month={month}
          onMonthChange={setMonth}
          onDayClick={(date) => onSelect(localDay(date))}
          showOutsideDays={false}
          startMonth={new Date(1900, 0)}
          endMonth={new Date(9998, 11)}
          components={{ DayButton: SummaryDay }}
          className="work-calendar"
        />
      </Context.Provider>
      {error ? (
        <p role="alert" className="calendar-error">
          {error}
        </p>
      ) : (
        <p className="calendar-selection" aria-live="polite">
          {ready && selectedInMonth
            ? `작업 ${selected?.count || 0}개, ${summaryDuration((selected?.total || 0) + (selected?.running || 0) * Math.max(0, now - loadedAt))}`
            : ready
              ? "날짜를 선택해 주세요."
              : "기록을 불러오는 중입니다."}
        </p>
      )}
    </section>
  );
}
