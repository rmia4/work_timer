"use client";
import { useState } from "react";
import {
  Play,
  Pause,
  Square,
  Plus,
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
  Clock3,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import WorkCalendar from "./work-calendar";
import SettingsDialog from "./settings-dialog";
import { timestampLabel, timeLabel } from "../../lib/work-dates";
import type { LayoutId } from "../../lib/layouts";
import {
  duration,
  shiftDay,
  statusLabel,
  today,
  weekday,
  type Task,
  type Workspace,
} from "./use-workspace";

export type LayoutProps = {
  ws: Workspace;
  layout: LayoutId;
  onLayoutChange: (layout: LayoutId) => Promise<boolean>;
};

export function HeaderActions({ ws, layout, onLayoutChange }: LayoutProps) {
  return (
    <div className="top-actions">
      <SettingsDialog
        disabled={ws.busy}
        onDeleted={ws.resetDeleted}
        layout={layout}
        onLayoutChange={onLayoutChange}
      />
      <button onClick={ws.logout} disabled={ws.busy}>
        로그아웃
      </button>
    </div>
  );
}

export function ErrorNotice({ ws }: { ws: Workspace }) {
  if (!ws.error) return null;
  return (
    <div className="notice error" role="alert">
      {ws.error}{" "}
      <button onClick={() => void ws.load()}>
        <RefreshCw size={16} />
        다시 불러오기
      </button>
    </div>
  );
}

export function DateNav({ ws }: { ws: Workspace }) {
  return (
    <div className="date-nav">
      <button type="button" aria-label="이전 날" onClick={() => ws.chooseDay(shiftDay(ws.day, -1))}>
        <ChevronLeft size={16} />
      </button>
      <span>
        {ws.day} ({weekday(ws.day)})
      </span>
      <button type="button" aria-label="다음 날" onClick={() => ws.chooseDay(shiftDay(ws.day, 1))}>
        <ChevronRight size={16} />
      </button>
      <button type="button" className="date-nav-today" onClick={() => ws.chooseDay(today())}>
        오늘
      </button>
    </div>
  );
}

export function CalendarButton({ ws, label = true }: { ws: Workspace; label?: boolean }) {
  const [open, setOpen] = useState(false),
    [selection, setSelection] = useState(ws.day);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setSelection(ws.day);
        setOpen(value);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" aria-label="캘린더 열기 또는 닫기">
          <CalendarDays size={18} />
          {label && <span>캘린더</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="calendar-popup">
        <WorkCalendar
          day={selection}
          onSelect={(value) => {
            if (value === selection) {
              ws.chooseDay(value);
              setOpen(false);
            } else setSelection(value);
          }}
          refresh={ws.calendarRefresh}
          now={ws.now + ws.offset}
        />
      </PopoverContent>
    </Popover>
  );
}

// 타이머 일시정지·재개 / 종료·저장 버튼
export function TimerButtons({ ws, classes = ["light", "outline"] }: { ws: Workspace; classes?: [string, string] | string[] }) {
  const active = ws.active;
  if (!active) return null;
  return (
    <>
      <button className={classes[0]} disabled={ws.busy} onClick={ws.toggleActive}>
        {active.status === "running" ? <Pause size={18} /> : <Play size={18} />}{" "}
        {active.status === "running" ? "일시정지" : "다시 시작"}
      </button>
      <button className={classes[1]} disabled={ws.busy} onClick={ws.askFinish}>
        <Square size={16} />
        종료·저장
      </button>
    </>
  );
}

// 새 작업 / 기록 수정 폼 (모든 레이아웃 공용)
export function TaskForm({
  ws,
  onDone,
  autoFocus,
}: {
  ws: Workspace;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const disabledStart = ws.busy || ws.auth || ws.loading || !!ws.active || !ws.title.trim();
  async function submit(run: boolean) {
    if (await ws.save(run)) onDone?.();
  }
  return (
    <form
      className="task-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <label>
        작업명
        <input
          required
          autoFocus={autoFocus}
          maxLength={200}
          value={ws.title}
          onChange={(e) => ws.setTitle(e.target.value)}
          placeholder="목표 작업 적기"
        />
      </label>
      <Tabs defaultValue="details" className="work-tabs">
        <TabsList>
          <TabsTrigger value="details">업무 내용</TabsTrigger>
          <TabsTrigger value="result">업무 결과</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <label>
            업무 내용
            <textarea
              maxLength={20000}
              value={ws.note}
              onChange={(e) => ws.setNote(e.target.value)}
              placeholder="작업 세부사항, 목표 적기"
              rows={5}
            />
          </label>
        </TabsContent>
        <TabsContent value="result">
          <label>
            업무 결과
            <textarea
              maxLength={20000}
              value={ws.result}
              onChange={(e) => ws.setResult(e.target.value)}
              placeholder="결과, 산출물, 추후 확인 사항 적기"
              rows={5}
            />
          </label>
        </TabsContent>
      </Tabs>
      <label>
        목표 시간 (분)
        <input
          type="number"
          min="0"
          max="525600"
          step="0.01"
          value={ws.targetMinutes}
          onChange={(e) => ws.setTargetMinutes(e.target.value)}
          placeholder="선택 입력"
        />
      </label>
      <p className="hint">입력하지 않으면 목표 시간이 표시되지 않습니다.</p>
      <details className="manual-times">
        <summary>소요 시간 직접 입력 (선택)</summary>
        <label>
          소요 시간 (분)
          <input
            type="number"
            min="0"
            max="525600"
            step="0.01"
            required
            value={ws.minutes}
            onChange={(e) => ws.setMinutes(e.target.value)}
          />
        </label>
        <p className="hint">
          직접 기록할 때 입력하세요. 측정 시작 시에는 0부터 시작합니다.
        </p>
      </details>
      <div className="form-actions">
        <button className="primary" type="button" disabled={disabledStart} onClick={() => void submit(true)}>
          <Play size={16} />
          {ws.edit ? "수정 후 측정 재개" : "측정 시작"}
        </button>
        <button disabled={ws.busy || ws.auth || ws.loading} type="submit">
          <Plus size={16} />
          {ws.edit ? "수정 저장" : "기록 저장"}
        </button>
        {ws.edit && (
          <button
            type="button"
            onClick={() => {
              ws.clearForm();
              onDone?.();
            }}
          >
            취소
          </button>
        )}
      </div>
      <p role="status" className="saved">
        {ws.message}
      </p>
    </form>
  );
}

// 작업명만 입력해 바로 측정을 시작하는 한 줄 입력
export function QuickStart({
  ws,
  placeholder = "다음 작업 입력 후 Enter로 측정 시작",
  onDone,
  autoFocus,
}: {
  ws: Workspace;
  placeholder?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <form
      className="quick-start"
      onSubmit={async (e) => {
        e.preventDefault();
        if (ws.title.trim() && !ws.active && !ws.busy && (await ws.save(true))) onDone?.();
      }}
    >
      <input
        aria-label="작업명"
        autoFocus={autoFocus}
        maxLength={200}
        value={ws.title}
        onChange={(e) => ws.setTitle(e.target.value)}
        placeholder={ws.active ? "측정 중인 작업을 종료하면 새 작업을 시작할 수 있습니다." : placeholder}
      />
      <button
        className="primary"
        type="submit"
        disabled={ws.busy || ws.loading || !!ws.active || !ws.title.trim()}
      >
        <Play size={15} /> 측정 시작
      </button>
    </form>
  );
}

function RecordActions({ ws, t }: { ws: Workspace; t: Task }) {
  if (t.status !== "done") return null;
  return (
    <div className="record-actions">
      <button disabled={ws.busy} onClick={() => ws.startEdit(t)}>
        수정
      </button>
      <button disabled={ws.busy} onClick={() => ws.setRemove(t)}>
        삭제
      </button>
    </div>
  );
}

// 업무 일지 목록. card: 기존 카드형, row: 한 줄형 (레이아웃 CSS로 모양 조정)
export function RecordList({ ws, variant = "card" }: { ws: Workspace; variant?: "card" | "row" }) {
  if (ws.loading) return <p className="empty">기록을 불러오는 중입니다.</p>;
  if (ws.daily.length === 0)
    return (
      <div className="empty">
        <NotebookPen size={32} />
        <h3>아직 기록이 없습니다.</h3>
        <p>작업을 시작하거나 완료한 업무를 남겨보세요.</p>
      </div>
    );
  if (variant === "row")
    return (
      <ul className="record-rows">
        {ws.daily.map((t) => (
          <li key={t.id} className={`record-row ${t.status}`}>
            <div className="record-row-main">
              <span className="record-row-status">{statusLabel(t.status)}</span>
              <strong>{t.title}</strong>
              {t.note && <p className="note">{t.note}</p>}
              {t.result && <p className="note record-row-result">→ {t.result}</p>}
              <RecordActions ws={ws} t={t} />
            </div>
            <div className="record-row-side">
              <span className="record-row-time">{duration(ws.elapsed(t))}</span>
              <span className="record-row-range">
                {timeLabel(t.started_at)} – {t.status === "done" ? timeLabel(t.ended_at) : "진행 중"}
                {t.target > 0 && ` · 목표 ${duration(t.target)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  return (
    <>
      {ws.daily.map((t) => (
        <article className="record" key={t.id}>
          <div className="record-head">
            <h3>{t.title}</h3>
            <div className="record-times">
              {t.target > 0 && (
                <span>
                  <small>목표</small>
                  <strong>{duration(t.target)}</strong>
                </span>
              )}
              <span>
                <small>소요</small>
                <strong>{duration(ws.elapsed(t))}</strong>
              </span>
            </div>
          </div>
          <span className="status">{statusLabel(t.status)}</span>
          <dl className="task-times">
            <div>
              <dt>시작</dt>
              <dd>{timeLabel(t.started_at)}</dd>
            </div>
            <div>
              <dt>종료</dt>
              <dd>{t.status === "done" ? timeLabel(t.ended_at) : "진행 중"}</dd>
            </div>
          </dl>
          {t.note && (
            <div className="journal-block">
              <strong>업무 내용</strong>
              <p className="note">{t.note}</p>
            </div>
          )}
          {t.result && (
            <div className="journal-block result-block">
              <strong>업무 결과</strong>
              <p className="note">{t.result}</p>
            </div>
          )}
          <RecordActions ws={ws} t={t} />
        </article>
      ))}
    </>
  );
}

// 집중 레이아웃용 가로 24시간 타임라인
const DAY_MS = 86400000;
export function ActivityStrip({ ws }: { ws: Workspace }) {
  const dayStart = Date.parse(`${ws.day}T00:00:00+09:00`),
    current = ws.now + ws.offset;
  const ratio = (value: number) =>
    Math.min(1, Math.max(0, (value - dayStart) / DAY_MS)) * 100;
  const spans = ws.daily.flatMap((t) => {
    const sessions =
      t.sessions && t.sessions.length
        ? t.sessions
        : t.started_at !== null
          ? [{ start_at: t.started_at, end_at: t.ended_at }]
          : [];
    return sessions.map((s, i) => ({
      key: `${t.id}:${i}`,
      title: t.title,
      status: t.status,
      left: ratio(s.start_at),
      right: ratio(s.end_at ?? current),
    }));
  });
  const showNow = current >= dayStart && current < dayStart + DAY_MS;
  return (
    <section className="activity-strip" aria-label={`${ws.day} 24시간 타임라인`}>
      <div className="activity-strip-track">
        {spans
          .filter((s) => s.right > s.left)
          .map((s) => (
            <span
              key={s.key}
              className={s.status}
              title={s.title}
              style={{ left: `${s.left}%`, width: `${s.right - s.left}%` }}
            />
          ))}
        {showNow && <i style={{ left: `${ratio(current)}%` }} />}
      </div>
      <div className="activity-strip-hours" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </section>
  );
}

// 종료·저장 다이얼로그와 삭제 확인 (모든 레이아웃 공용)
export function WorkspaceDialogs({ ws }: { ws: Workspace }) {
  const { finishTask, finishResult, busy } = ws;
  return (
    <>
      <Dialog
        open={!!finishTask}
        onOpenChange={(open) => {
          if (!open && !busy) {
            ws.setFinishTask(null);
            ws.setFinishResult("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>업무 결과 저장</DialogTitle>
            <DialogDescription>
              “{finishTask?.title}” 작업을 종료합니다. 완료한 결과를 기록해
              주세요.
            </DialogDescription>
          </DialogHeader>
          <label className="dialog-label">
            업무 결과
            <textarea
              autoFocus
              maxLength={20000}
              value={finishResult}
              onChange={(e) => ws.setFinishResult(e.target.value)}
              placeholder="완료 결과, 산출물, 확인 사항을 입력하세요."
              rows={7}
            />
          </label>
          <div className="result-counter">
            {finishResult.length.toLocaleString()} / 20,000
          </div>
          <DialogFooter>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                ws.setFinishTask(null);
                ws.setFinishResult("");
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !finishTask}
              onClick={async () => {
                if (!finishTask) return;
                const ok = await ws.act({
                  action: "finish",
                  id: finishTask.id,
                  version: finishTask.version,
                  result: finishResult,
                });
                if (ok) {
                  ws.setFinishTask(null);
                  ws.setFinishResult("");
                }
              }}
            >
              {busy ? "저장 중…" : "종료하고 저장"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!ws.remove}
        onOpenChange={(open) => {
          if (!open) ws.setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>이 기록을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            “{ws.remove?.title}”의 업무 내용과 측정 시간이 삭제됩니다.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ws.remove)
                  void ws.act({
                    action: "delete",
                    id: ws.remove.id,
                    version: ws.remove.version,
                  });
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// 기존 짙은 타이머 패널 (기본·사이드바 레이아웃)
export function TimerPanel({ ws }: { ws: Workspace }) {
  const { active } = ws;
  return (
    <section className="timer-panel">
      <div className="panel-label">
        <Clock3 size={18} />
        <span>작업 스톱워치</span>
        <span className="badge">
          {active ? (active.status === "running" ? "측정 중" : "일시정지") : "준비"}
        </span>
      </div>
      <h2>{active?.title || "지금 집중할 작업"}</h2>
      <div className="target-time">
        {active && active.target > 0 ? `목표 ${duration(active.target)}` : ""}
      </div>
      <div className="clock" role="timer">
        {duration(active ? ws.elapsed(active) : 0)}
      </div>
      <p className="timer-note">
        {active ? ` ${activeNote(ws)}` : "아래에 작업을 입력하고 측정을 시작하세요."}
      </p>
      <div className="timer-actions">
        {active ? <TimerButtons ws={ws} /> : <span>한 번에 하나의 작업을 측정합니다.</span>}
      </div>
    </section>
  );
}

export function activeNote(ws: Workspace) {
  return ws.active
    ? `${timestampLabel(ws.active.started_at)} 시작 · 브라우저를 닫아도 기록이 유지됩니다.`
    : "작업을 입력하고 측정을 시작하세요.";
}
