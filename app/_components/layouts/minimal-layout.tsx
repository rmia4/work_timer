"use client";
import { useState } from "react";
import MemoBoard from "../memo-board";
import DailyActivityClock from "../daily-activity-clock";
import { duration, statusLabel } from "../use-workspace";
import {
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

// 미니멀: 한 열 집중 · 새 작업은 빠른 입력줄 + 펼쳐서 자세히 (인라인)
export default function MinimalLayout(props: LayoutProps) {
  const { ws } = props;
  const { active } = ws;
  const [more, setMore] = useState(false);
  const expanded = more || !!ws.edit;
  return (
    <div className="lay lay-minimal">
      <header className="lay-top">
        <div className="lay-brand">
          <img src="/favicon.svg" alt="" width="20" height="20" />
          <strong>업무 기록</strong>
        </div>
        <div className="lay-date">
          <DateNav ws={ws} />
          <CalendarButton ws={ws} />
        </div>
        <HeaderActions {...props} />
      </header>
      <main className="lay-minimal-main">
        <ErrorNotice ws={ws} />
        <section className="lay-minimal-hero">
          <div>
            <span className="lay-label">
              {active ? `${statusLabel(active.status)} · ${active.title}` : "준비"}
            </span>
            <div className="lay-minimal-clock" role="timer">
              {duration(active ? ws.elapsed(active) : 0)}
            </div>
            <span className="lay-muted">
              {active && active.target > 0 ? `목표 ${duration(active.target)} · ` : ""}
              {activeNote(ws)}
            </span>
            <div className="lay-buttons">
              <TimerButtons ws={ws} classes={["", ""]} />
            </div>
          </div>
          <DailyActivityClock tasks={ws.daily} day={ws.day} now={ws.now + ws.offset} />
        </section>

        <section className="lay-minimal-add" aria-label={ws.edit ? "기록 수정" : "새 작업"}>
          {!ws.edit && (
            <div className="lay-minimal-addbar">
              <QuickStart ws={ws} />
              <button
                type="button"
                className="lay-text"
                aria-expanded={expanded}
                onClick={() => setMore(!more)}
              >
                {more ? "접기" : "자세히"}
              </button>
            </div>
          )}
          {expanded && (
            <div className="lay-minimal-form">
              {ws.edit && <h2>기록 수정</h2>}
              <TaskForm ws={ws} onDone={() => setMore(false)} />
            </div>
          )}
        </section>

        <section>
          <div className="lay-head">
            <h2>업무 일지</h2>
            <span className="lay-muted">
              완료 {duration(ws.total)} · 기록 {ws.daily.length}개
            </span>
          </div>
          <RecordList ws={ws} variant="row" />
        </section>

        <section className="lay-minimal-memos">
          <MemoBoard key={`${ws.day}:${ws.dailyMemoReset}`} day={ws.day} />
          <MemoBoard key={ws.memoReset} />
        </section>
      </main>
    </div>
  );
}
