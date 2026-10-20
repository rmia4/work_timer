import { Clock3, Pause, Square } from "lucide-react";
import DailyActivityClock from "./daily-activity-clock";

// 로그인 화면 기능 미리보기: 실제 작업공간 마크업·클래스를 예시 데이터로 정적 재현
const previewDay = "2026-10-08";
const at = (h: number, m = 0) =>
  Date.parse(
    `${previewDay}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`,
  );
const session = (id: string, title: string, start: number, end: number) => ({
  id,
  title,
  status: "done",
  elapsed: end - start,
  started: null,
  started_at: start,
  ended_at: end,
  sessions: [{ start_at: start, end_at: end }],
});
const previewNow = at(17, 20);
const previewTasks = [
  session("t1", "주간 보고서 작성", at(9, 5), at(10, 47)),
  session("t2", "디자인 리뷰 미팅", at(11, 0), at(11, 48)),
  {
    ...session("t3", "API 응답 속도 개선", at(13, 30), at(15, 15)),
    status: "running",
    started: at(16, 30),
    ended_at: null,
    sessions: [
      { start_at: at(13, 30), end_at: at(15, 15) },
      { start_at: at(16, 30), end_at: null },
    ],
  },
];

export const features = [
  {
    title: "작업 스톱워치",
    body: "브라우저를 닫아도 타이머가 안전하게 유지되어 몰입한 작업 시간을 정확히 측정합니다.",
  },
  {
    title: "24시간 활동 시계",
    body: "하루 동안의 업무 흐름과 집중 시간대를 원형 타임라인으로 한눈에 시각화합니다.",
  },
  {
    title: "업무 일지 & 캘린더",
    body: "날짜별 작업 내역을 체계적으로 관리하고 캘린더로 지난 기록을 쉽게 확인합니다.",
  },
  {
    title: "일일 & 고정 메모",
    body: "선택한 날짜별 업무 메모와 언제든 바로 꺼내보는 상시 고정 메모장을 제공합니다.",
  },
];

export function TimerPreview() {
  return (
    <section className="timer-panel" aria-hidden="true">
      <div className="panel-label">
        <Clock3 size={18} />
        <span>작업 스톱워치</span>
        <span className="badge">측정 중</span>
      </div>
      <h2>API 응답 속도 개선</h2>
      <div className="target-time">목표 03:00:00</div>
      <div className="clock">02:35:12</div>
      <p className="timer-note"> 13:30 시작 · 브라우저를 닫아도 기록이 유지됩니다.</p>
      <div className="timer-actions">
        <button className="light" tabIndex={-1}>
          <Pause size={18} /> 일시정지
        </button>
        <button className="outline" tabIndex={-1}>
          <Square size={16} />
          종료·저장
        </button>
      </div>
    </section>
  );
}

export function ClockPreview() {
  return (
    <DailyActivityClock tasks={previewTasks} day={previewDay} now={previewNow} preview />
  );
}
