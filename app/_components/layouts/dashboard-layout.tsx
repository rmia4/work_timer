"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import MemoBoard from "../memo-board";
import DailyActivityClock from "../daily-activity-clock";
import { duration, statusLabel } from "../use-workspace";
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

// 대시보드: 메인(타이머·일지) + 사이드바(요약·활동 시계·메모) · 새 작업은 모달 팝업
export default function DashboardLayout(props: LayoutProps) {
  const { ws } = props;
  const { active } = ws;
  const [open, setOpen] = useState(false);
  const [memoTab, setMemoTab] = useState<"daily" | "pinned">("daily");
  const dialogOpen = open || !!ws.edit;
  function close() {
    setOpen(false);
    if (ws.edit) ws.clearForm();
  }
  return (
    <div className="lay lay-dashboard">
      <header className="lay-top">
        <div className="lay-brand">
          <img src="/favicon.svg" alt="" width="20" height="20" />
          <strong>업무 기록</strong>
        </div>
        <div className="lay-top-right">
          <button type="button" className="primary" disabled={ws.busy} onClick={() => setOpen(true)}>
            <Plus size={16} /> 새 작업
          </button>
          <HeaderActions {...props} />
        </div>
      </header>
      <div className="lay-dashboard-grid">
        <main>
          <ErrorNotice ws={ws} />
          <section className="lay-dashboard-timer">
            <div>
              <span className="lay-muted">
                {active && <span className={`lay-dot ${active.status}`} aria-hidden="true" />}
                {active ? statusLabel(active.status) : "준비"}
              </span>
              <h2>{active?.title || "지금 집중할 작업"}</h2>
              <span className="lay-muted">
                {active && active.target > 0 ? `목표 ${duration(active.target)} · ` : ""}
                {active ? activeNote(ws) : "‘새 작업’으로 측정을 시작하세요."}
              </span>
            </div>
            <div className="lay-dashboard-timer-right">
              <div className="lay-dashboard-clock" role="timer">
                {duration(active ? ws.elapsed(active) : 0)}
              </div>
              <div className="lay-buttons">
                <TimerButtons ws={ws} classes={["", ""]} />
              </div>
            </div>
          </section>
          <section className="lay-card">
            <div className="lay-head">
              <h2>업무 일지</h2>
              <div className="lay-date">
                <DateNav ws={ws} />
                <CalendarButton ws={ws} label={false} />
              </div>
            </div>
            <RecordList ws={ws} variant="row" />
          </section>
        </main>
        <aside className="lay-dashboard-side">
          <div className="lay-dashboard-stats">
            <div>
              <span className="lay-muted">완료한 시간</span>
              <strong>{duration(ws.total)}</strong>
            </div>
            <div>
              <span className="lay-muted">기록</span>
              <strong>{ws.daily.length}개</strong>
            </div>
          </div>
          <DailyActivityClock tasks={ws.daily} day={ws.day} now={ws.now + ws.offset} />
          <div className="lay-card lay-memo-tabs">
            <div className="lay-underline-tabs" role="tablist" aria-label="메모 종류">
              <button type="button" role="tab" aria-selected={memoTab === "daily"} className={memoTab === "daily" ? "on" : ""} onClick={() => setMemoTab("daily")}>
                일일 메모
              </button>
              <button type="button" role="tab" aria-selected={memoTab === "pinned"} className={memoTab === "pinned" ? "on" : ""} onClick={() => setMemoTab("pinned")}>
                메모장
              </button>
            </div>
            {memoTab === "daily" ? (
              <MemoBoard key={`${ws.day}:${ws.dailyMemoReset}`} day={ws.day} />
            ) : (
              <MemoBoard key={ws.memoReset} />
            )}
          </div>
        </aside>
      </div>
      <Dialog open={dialogOpen} onOpenChange={(value) => !value && !ws.busy && close()}>
        <DialogContent className="lay-task-dialog">
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
