"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import MemoBoard from "../memo-board";
import DailyActivityClock from "../daily-activity-clock";
import { duration, statusLabel, weekday } from "../use-workspace";
import {
  CalendarButton,
  DateNav,
  ErrorNotice,
  HeaderActions,
  RecordList,
  TaskForm,
  TimerButtons,
  activeNote,
  type LayoutProps,
} from "../workspace-parts";

// 탭: 오늘 / 업무 일지 / 메모를 나눠 한 번에 하나만 · 새 작업은 오른쪽 서랍
const TABS = ["오늘", "업무 일지", "메모"] as const;

export default function TabsLayout(props: LayoutProps) {
  const { ws } = props;
  const { active } = ws;
  const [tab, setTab] = useState<(typeof TABS)[number]>("오늘");
  const [open, setOpen] = useState(false);
  const drawerOpen = open || !!ws.edit;
  const progress =
    active && active.target > 0 ? Math.min(100, (ws.elapsed(active) / active.target) * 100) : null;
  function close() {
    setOpen(false);
    if (ws.edit) ws.clearForm();
  }
  return (
    <div className="lay lay-tabs">
      <header className="lay-top">
        <div className="lay-brand">
          <img src="/favicon.svg" alt="" width="20" height="20" />
          <strong>업무 기록</strong>
        </div>
        <nav className="lay-tabs-nav" role="tablist" aria-label="화면">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "on" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <HeaderActions {...props} />
      </header>
      <main className="lay-tabs-main">
        <ErrorNotice ws={ws} />
        <div className="lay-tabs-greet">
          <div>
            <DateNav ws={ws} />
            <h1>
              {Number(ws.day.slice(5, 7))}월 {Number(ws.day.slice(8))}일 {weekday(ws.day)}요일
            </h1>
          </div>
          <button type="button" className="primary lay-tabs-new" disabled={ws.busy} onClick={() => setOpen(true)}>
            <Plus size={16} /> 새 작업
          </button>
        </div>

        {tab === "오늘" && (
          <div className="lay-tabs-today">
            <section className="lay-tabs-timer">
              <span className="lay-chip">{active ? statusLabel(active.status) : "준비"}</span>
              <h2>{active?.title || "지금 집중할 작업"}</h2>
              <div className="lay-tabs-clock" role="timer">
                {duration(active ? ws.elapsed(active) : 0)}
              </div>
              {progress !== null && (
                <div
                  className="lay-progress"
                  role="progressbar"
                  aria-label="목표 대비 진행"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              )}
              <span className="lay-muted">
                {active && active.target > 0 ? `목표 ${duration(active.target)} · ` : ""}
                {active ? activeNote(ws) : "‘새 작업’으로 측정을 시작하세요."}
              </span>
              <div className="lay-buttons">
                <TimerButtons ws={ws} classes={["", ""]} />
              </div>
            </section>
            <section className="lay-tabs-card lay-tabs-sum">
              <span className="lay-muted">완료한 작업 시간</span>
              <strong>{duration(ws.total)}</strong>
              <span className="lay-muted">기록 {ws.daily.length}개</span>
            </section>
            <DailyActivityClock tasks={ws.daily} day={ws.day} now={ws.now + ws.offset} />
          </div>
        )}
        {tab === "업무 일지" && (
          <section className="lay-tabs-card">
            <div className="lay-head">
              <h2>업무 일지</h2>
              <CalendarButton ws={ws} />
            </div>
            <RecordList ws={ws} variant="row" />
          </section>
        )}
        {tab === "메모" && (
          <div className="lay-tabs-memos">
            <MemoBoard key={`${ws.day}:${ws.dailyMemoReset}`} day={ws.day} />
            <MemoBoard key={ws.memoReset} />
          </div>
        )}
      </main>
      <Dialog open={drawerOpen} onOpenChange={(value) => !value && !ws.busy && close()}>
        <DialogContent className="lay-drawer top-0 right-0 left-auto h-dvh max-h-dvh w-[440px] max-w-full translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none rounded-l-2xl sm:max-w-[440px] data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-right-8 data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-right-8">
          <DialogHeader>
            <DialogTitle>{ws.edit ? "기록 수정" : "새 작업"}</DialogTitle>
            <DialogDescription>바로 측정을 시작하거나 기록만 저장할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <TaskForm ws={ws} autoFocus onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
