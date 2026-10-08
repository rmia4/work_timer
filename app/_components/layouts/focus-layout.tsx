"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import MemoBoard from "../memo-board";
import { duration, statusLabel } from "../use-workspace";
import {
  ActivityStrip,
  CalendarButton,
  DateNav,
  ErrorNotice,
  HeaderActions,
  QuickStart,
  RecordList,
  TaskForm,
  TimerButtons,
  activeNote,
  type LayoutProps,
} from "../workspace-parts";

// 집중: 큰 타이머 + 가로 24시간 타임라인 · 새 작업은 명령 팔레트 (단축키 N)
export default function FocusLayout(props: LayoutProps) {
  const { ws } = props;
  const { active } = ws;
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const paletteOpen = open || !!ws.edit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;
      e.preventDefault();
      setMore(false);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function close() {
    setOpen(false);
    setMore(false);
    if (ws.edit) ws.clearForm();
  }
  return (
    <div className="lay lay-focus">
      <header className="lay-top">
        <div className="lay-brand">
          <img src="/favicon.svg" alt="" width="20" height="20" />
          <strong>업무 기록</strong>
        </div>
        <button type="button" className="lay-focus-cmd" disabled={ws.busy} onClick={() => setOpen(true)}>
          <Search size={15} /> 새 작업 시작하기 <kbd>N</kbd>
        </button>
        <HeaderActions {...props} />
      </header>
      <main className="lay-focus-main">
        <ErrorNotice ws={ws} />
        <section className="lay-focus-hero">
          <span className="lay-label">
            {active ? `${statusLabel(active.status)} — ${active.title}` : "준비 — N을 눌러 새 작업을 시작하세요"}
          </span>
          <div className="lay-focus-clock" role="timer">
            {duration(active ? ws.elapsed(active) : 0)}
          </div>
          {active && (
            <span className="lay-muted">
              {active.target > 0 ? `목표 ${duration(active.target)} · ` : ""}
              {activeNote(ws)}
            </span>
          )}
          <div className="lay-buttons">
            <TimerButtons ws={ws} classes={["", ""]} />
          </div>
        </section>

        <ActivityStrip ws={ws} />

        <section className="lay-focus-grid">
          <div>
            <div className="lay-head">
              <DateNav ws={ws} />
              <div className="lay-date">
                <span className="lay-muted">
                  완료 {duration(ws.total)} · {ws.daily.length}개
                </span>
                <CalendarButton ws={ws} label={false} />
              </div>
            </div>
            <RecordList ws={ws} variant="row" />
          </div>
          <div className="lay-focus-memos">
            <MemoBoard key={`${ws.day}:${ws.dailyMemoReset}`} day={ws.day} />
            <MemoBoard key={ws.memoReset} />
          </div>
        </section>
      </main>
      <Dialog open={paletteOpen} onOpenChange={(value) => !value && !ws.busy && close()}>
        <DialogContent
          showCloseButton={false}
          className="lay-palette top-[14vh] max-h-[76vh] translate-y-0 content-start gap-0 overflow-y-auto p-0 sm:max-w-[560px]"
        >
          <DialogTitle className="sr-only">{ws.edit ? "기록 수정" : "새 작업"}</DialogTitle>
          <DialogDescription className="sr-only">
            작업명을 입력하고 Enter로 측정을 시작합니다. Esc로 닫습니다.
          </DialogDescription>
          {ws.edit || more ? (
            <div className="lay-palette-form">
              <TaskForm ws={ws} autoFocus onDone={() => close()} />
            </div>
          ) : (
            <>
              <QuickStart ws={ws} autoFocus onDone={close} placeholder="무엇에 집중할까요? Enter로 측정 시작" />
              <div className="lay-palette-foot">
                <button type="button" onClick={() => setMore(true)}>
                  내용·목표 시간 추가
                </button>
                <span>Enter 측정 시작 · Esc 닫기</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
