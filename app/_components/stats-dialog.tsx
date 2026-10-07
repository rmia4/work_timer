"use client";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  dayCount,
  heatLevel,
  heatmapWeeks,
  hoursLabel,
  monthRange,
  monthWeeks,
  shiftMonth,
  addDays,
  weekDays,
  weekdayIndex,
  type DayStat,
} from "../../lib/stats";

type Section = "summary" | "week" | "month" | "export";
const sections: { id: Section; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "week", label: "주간 요약" },
  { id: "month", label: "월간 요약" },
  { id: "export", label: "데이터 내보내기" },
];
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const HEAT_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const HOUR_MS = 3600000;

const todayKst = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dotted = (day: string) => day.replaceAll("-", ".");
const monthDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;

function useDayStats(from: string, to: string) {
  const key = `${from}_${to}`;
  const [state, setState] = useState<{
    key: string;
    days: Record<string, DayStat>;
    error: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/stats?from=${from}&to=${to}`);
        const data = (await r.json()) as { days?: DayStat[]; error?: string };
        if (!r.ok || !data.days) throw Error(data.error || "통계를 불러오지 못했습니다.");
        const days = Object.fromEntries(data.days.map((d) => [d.day, d]));
        if (!cancelled) setState({ key, days, error: "" });
      } catch (e) {
        if (!cancelled)
          setState({
            key,
            days: {},
            error: e instanceof Error ? e.message : "통계를 불러오지 못했습니다.",
          });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [key, from, to]);
  const current = state?.key === key ? state : null;
  return {
    days: current?.days ?? {},
    ready: !!current && !current.error,
    error: current?.error ?? "",
  };
}

function LoadState({ ready, error, children }: { ready: boolean; error: string; children: ReactNode }) {
  if (error) return <p className="stats-message stats-error" role="alert">{error}</p>;
  if (!ready) return <p className="stats-message">불러오는 중…</p>;
  return <>{children}</>;
}

function PeriodBar({ label, onMove }: { label: string; onMove: (offset: number) => void }) {
  return (
    <div className="stats-period">
      <button type="button" aria-label="이전 기간" onClick={() => onMove(-1)}>
        <ChevronLeft size={16} />
      </button>
      <strong>{label}</strong>
      <button type="button" aria-label="다음 기간" onClick={() => onMove(1)}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function BarChart({ bars, max }: { bars: { key: string; value: number; label: ReactNode }[]; max: number }) {
  return (
    <div className="stats-bars" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
      {bars.map((bar) => (
        <div key={bar.key} className="stats-bar">
          <span className="stats-bar-value">{bar.value > 0 ? hoursLabel(bar.value) : ""}</span>
          <div className="stats-bar-track">
            <div className="stats-bar-fill" style={{ height: `${Math.min(100, (bar.value / max) * 100)}%` }} />
          </div>
          <span className="stats-bar-label">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

function SummaryView() {
  const [today] = useState(todayKst);
  const weeks = heatmapWeeks(today);
  const { days, ready, error } = useDayStats(weeks[0][0], today);
  const [hover, setHover] = useState<{ day: string; x: number; y: number; below: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  function showTip(event: MouseEvent<HTMLSpanElement>, day: string) {
    if (!box.current) return;
    const outer = box.current.getBoundingClientRect();
    const cell = event.currentTarget.getBoundingClientRect();
    // 팝업이 잘리지 않도록 가로 위치를 영역 안으로 제한한다.
    const x = Math.min(Math.max(cell.left + cell.width / 2 - outer.left, 95), outer.width - 95);
    // 위쪽 행은 팝업이 영역 밖으로 나가므로 칸 아래에 띄운다.
    const below = cell.top - outer.top < 50;
    setHover({ day, x, y: (below ? cell.bottom : cell.top) - outer.top, below });
  }
  const label = (day: string) => {
    const stat = days[day];
    return `${dotted(day)} · ${hoursLabel(stat?.total ?? 0)} · 작업 ${stat?.count ?? 0}개`;
  };
  return (
    <>
      <h3 className="stats-heading">최근 1년 작업 기록</h3>
      <LoadState ready={ready} error={error}>
        <div className="heatmap" ref={box}>
          <div className="heatmap-weekdays" aria-hidden>
            {HEAT_WEEKDAYS.map((w, i) => (
              <span key={w}>{i % 2 === 1 ? w : ""}</span>
            ))}
          </div>
          <div className="heatmap-clip">
            <div>
              <div className="heatmap-months" aria-hidden>
                {weeks.map((week, i) => {
                  const first = week.find((d) => d.endsWith("-01"));
                  const month = first ?? (i === 0 ? week[0] : null);
                  return <span key={week[0]}>{month ? `${Number(month.slice(5, 7))}월` : ""}</span>;
                })}
              </div>
              <div className="heatmap-grid" onMouseLeave={() => setHover(null)}>
                {weeks.flat().map((day) =>
                  day > today ? (
                    <span key={day} className="heat-cell heat-empty" />
                  ) : (
                    <span
                      key={day}
                      className="heat-cell"
                      data-level={heatLevel(days[day]?.total ?? 0)}
                      aria-label={label(day)}
                      onMouseEnter={(e) => showTip(e, day)}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
          {hover && (
            <div className={hover.below ? "heat-tip below" : "heat-tip"} role="tooltip" style={{ left: hover.x, top: hover.y }}>
              <strong>{dotted(hover.day)} ({HEAT_WEEKDAYS[(weekdayIndex(hover.day) + 1) % 7]})</strong>
              <span>
                {hoursLabel(days[hover.day]?.total ?? 0)} · 작업 {days[hover.day]?.count ?? 0}개
              </span>
            </div>
          )}
        </div>
        <div className="heatmap-footer">
          <span className="heatmap-legend">
            적음
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className="heat-cell" data-level={level} />
            ))}
            많음
          </span>
        </div>
      </LoadState>
    </>
  );
}

function WeekView({ day }: { day: string }) {
  const [anchor, setAnchor] = useState(day);
  const days = weekDays(anchor);
  const { days: stats, ready, error } = useDayStats(days[0], days[6]);
  const totals = days.map((d) => stats[d]?.total ?? 0);
  const counts = days.map((d) => stats[d]?.count ?? 0);
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return (
    <>
      <PeriodBar
        label={`${dotted(days[0])} ~ ${days[6].slice(5).replace("-", ".")}`}
        onMove={(offset) => setAnchor(addDays(anchor, offset * 7))}
      />
      <LoadState ready={ready} error={error}>
        <BarChart
          max={Math.max(9 * HOUR_MS, ...totals)}
          bars={days.map((day, i) => ({
            key: day,
            value: totals[i],
            label: (
              <>
                {WEEKDAYS[i]}
                <small>{monthDay(day)}</small>
                <small className="stats-bar-count">{counts[i]}개</small>
              </>
            ),
          }))}
        />
        <p className="stats-total">
          합계 <strong>{hoursLabel(sum(totals))}</strong> · 작업 <strong>{sum(counts)}개</strong>
        </p>
      </LoadState>
    </>
  );
}

function MonthView({ day }: { day: string }) {
  const [anchor, setAnchor] = useState(day);
  const range = monthRange(anchor);
  const weeks = monthWeeks(anchor);
  const { days: stats, ready, error } = useDayStats(range.from, range.to);
  const sums = weeks.map((week) => {
    let total = 0, count = 0;
    for (let day = week.from; day <= week.to; day = addDays(day, 1)) {
      total += stats[day]?.total ?? 0;
      count += stats[day]?.count ?? 0;
    }
    return { total, count };
  });
  const totals = sums.map((s) => s.total);
  const counts = sums.map((s) => s.count);
  return (
    <>
      <PeriodBar
        label={`${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`}
        onMove={(offset) => setAnchor(shiftMonth(anchor, offset))}
      />
      <LoadState ready={ready} error={error}>
        <BarChart
          max={Math.max(HOUR_MS, ...totals)}
          bars={weeks.map((week, i) => ({
            key: week.from,
            value: totals[i],
            label: (
              <>
                {i + 1}주차
                <small>
                  {monthDay(week.from)}~{monthDay(week.to)}
                </small>
                <small className="stats-bar-count">{counts[i]}개</small>
              </>
            ),
          }))}
        />
        <p className="stats-total">
          월 합계 <strong>{hoursLabel(totals.reduce((a, b) => a + b, 0))}</strong> · 작업{" "}
          <strong>{counts.reduce((a, b) => a + b, 0)}개</strong>
        </p>
      </LoadState>
    </>
  );
}

function ExportView({ anchor }: { anchor: string }) {
  const [from, setFrom] = useState(() => monthRange(anchor).from),
    [to, setTo] = useState(() => monthRange(anchor).to),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const invalid = !from || !to || from > to || dayCount(from, to) > 366;
  async function download() {
    if (busy || invalid) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/export?from=${from}&to=${to}`);
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw Error(data.error || "데이터를 내보내지 못했습니다.");
      }
      const url = URL.createObjectURL(await r.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `work-timer_${from}_${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 내보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h3 className="stats-heading">데이터 내보내기</h3>
      <p className="stats-message">선택한 기간의 업무 기록을 CSV 파일로 저장합니다. (최대 366일)</p>
      <div className="stats-export">
        <label className="dialog-label">
          시작일
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="dialog-label">
          종료일
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="primary" disabled={busy || invalid} onClick={download}>
          {busy ? "내보내는 중…" : "CSV 다운로드"}
        </button>
      </div>
      {invalid && from && to && <p className="stats-message stats-error">기간을 확인해 주세요. (최대 366일)</p>}
      {error && <p className="stats-message stats-error" role="alert">{error}</p>}
    </>
  );
}

export default function StatsDialog({ day }: { day: string }) {
  const [open, setOpen] = useState(false),
    [section, setSection] = useState<Section>("summary");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSection("summary");
          setOpen(true);
        }}
      >
        통계
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="stats-dialog">
          <DialogHeader>
            <DialogTitle>통계</DialogTitle>
            <DialogDescription className="sr-only">작업 기록 통계와 데이터 내보내기</DialogDescription>
          </DialogHeader>
          <div className="stats-layout">
            <nav className="stats-nav" role="tablist" aria-orientation="vertical">
              {sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={section === item.id}
                  className={section === item.id ? "active" : ""}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="stats-body" role="tabpanel">
              {section === "summary" && <SummaryView />}
              {/* 항목을 바꾸면 다시 마운트되어 기간이 메인 화면 선택 날짜로 돌아간다. */}
              {section === "week" && <WeekView day={day} />}
              {section === "month" && <MonthView day={day} />}
              {section === "export" && <ExportView anchor={day} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
