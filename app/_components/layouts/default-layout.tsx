"use client";
import { NotebookPen } from "lucide-react";
import MemoBoard from "../memo-board";
import DailyActivityClock from "../daily-activity-clock";
import { duration, shiftDay, today, weekday } from "../use-workspace";
import {
  CalendarButton,
  ErrorNotice,
  HeaderActions,
  RecordList,
  TaskForm,
  TimerPanel,
  type LayoutProps,
} from "../workspace-parts";

// 기본: 기존 작업공간 화면
export default function DefaultLayout(props: LayoutProps) {
  const { ws } = props;
  const { day } = ws;
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
        <HeaderActions {...props} />
      </header>
      <main>
        <ErrorNotice ws={ws} />
        <div className="top-panels">
          <div className="columns">
            <TimerPanel ws={ws} />
            <section className="summary">
              <button className="summary-yesterday" onClick={() => ws.chooseDay(shiftDay(day, -1))}>
                &lt;
              </button>
              <button className="summary-today" onClick={() => ws.chooseDay(today())}>
                오늘
              </button>
              <button className="summary-nextday" onClick={() => ws.chooseDay(shiftDay(day, 1))}>
                &gt;
              </button>
              <p className="summary-date">
                {day} ({weekday(day)})
              </p>
              <h2>완료한 작업 시간</h2>
              <strong className="total">{duration(ws.total)}</strong>
              <div className="summary-bottom">
                <span>
                  기록한 작업 <b>{ws.daily.length}개</b>
                </span>
              </div>
            </section>
            <DailyActivityClock tasks={ws.daily} day={day} now={ws.now + ws.offset} />
          </div>
        </div>
        <div className="content-grid">
          <div className="left-panels">
            <div className="section-title-left">
              <NotebookPen size={20} />
              <h2>{ws.edit ? "기록 수정" : "새 작업"}</h2>
            </div>
            <section className="entry">
              <TaskForm ws={ws} />
            </section>
            <MemoBoard key={`${day}:${ws.dailyMemoReset}`} day={day} />
          </div>
          <section className="records">
            <div className="section-title">
              <h2>업무 일지</h2>
              <div className="date-controls">
                <CalendarButton ws={ws} />
              </div>
              <span>{day}</span>
            </div>
            <RecordList ws={ws} />
          </section>
          <MemoBoard key={ws.memoReset} />
        </div>
        <footer>한국 시간 기준 · 기록은 기기 간 자동 동기화됩니다.</footer>
      </main>
    </div>
  );
}
