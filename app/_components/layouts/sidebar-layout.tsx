"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import MemoBoard from "../memo-board";
import WorkCalendar from "../work-calendar";
import DailyActivityClock from "../daily-activity-clock";
import { duration, weekday } from "../use-workspace";
import {
  DateNav,
  ErrorNotice,
  HeaderActions,
  QuickStart,
  RecordList,
  TaskForm,
  TimerPanel,
  type LayoutProps,
} from "../workspace-parts";

// 사이드바: 기존 스타일 유지 · 캘린더·요약·메모장을 왼쪽에 상시 표시 · 새 작업은 일지 맨 위 인라인 행
export default function SidebarLayout(props: LayoutProps) {
  const { ws } = props;
  const [more, setMore] = useState(false);
  const expanded = more || !!ws.edit;
  return (
    <div className="shell lay-sidebar">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
        <HeaderActions {...props} />
      </header>
      <div className="lay-sidebar-grid">
        <aside className="lay-sidebar-side">
          <section className="lay-sidebar-card lay-sidebar-calendar">
            <WorkCalendar
              day={ws.day}
              onSelect={ws.chooseDay}
              refresh={ws.calendarRefresh}
              now={ws.now + ws.offset}
            />
          </section>
          <section className="lay-sidebar-card lay-sidebar-summary">
            <span className="lay-muted">
              {ws.day} ({weekday(ws.day)}) 완료
            </span>
            <strong>{duration(ws.total)}</strong>
            <span className="lay-muted">기록한 작업 {ws.daily.length}개</span>
            <DateNav ws={ws} />
          </section>
          <MemoBoard key={ws.memoReset} />
        </aside>
        <main className="lay-sidebar-main">
          <ErrorNotice ws={ws} />
          <div className="lay-sidebar-row">
            <TimerPanel ws={ws} />
            <DailyActivityClock tasks={ws.daily} day={ws.day} now={ws.now + ws.offset} />
          </div>
          <section className="lay-sidebar-card">
            <div className="section-title">
              <h2>업무 일지</h2>
            </div>
            {ws.edit ? (
              <div className="lay-sidebar-form">
                <h3>기록 수정</h3>
                <TaskForm ws={ws} />
              </div>
            ) : (
              <>
                <div className="lay-sidebar-addrow">
                  <QuickStart ws={ws} placeholder="새 작업 입력 — Enter로 측정 시작" />
                  <button type="button" aria-expanded={expanded} onClick={() => setMore(!more)}>
                    상세 {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
                {expanded && (
                  <div className="lay-sidebar-form">
                    <TaskForm ws={ws} onDone={() => setMore(false)} />
                  </div>
                )}
              </>
            )}
            <RecordList ws={ws} />
          </section>
          <MemoBoard key={`${ws.day}:${ws.dailyMemoReset}`} day={ws.day} />
        </main>
      </div>
    </div>
  );
}
