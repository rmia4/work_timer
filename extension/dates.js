// 웹앱 use-workspace.ts·lib/work-dates.ts의 날짜·시간 함수를 그대로 옮겼다.

// 한국 시간 기준 오늘 날짜(YYYY-MM-DD).
export const today = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86400000));

export const duration = (ms) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

export const statusLabel = (status) => (status === "done" ? "완료" : status === "running" ? "측정 중" : "일시정지");

export const timestampLabel = (t) =>
  t == null
    ? "미기록"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(t));

export const shiftDay = (value, offset) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" });
export const weekday = (value) => weekdayFormatter.format(new Date(`${value}T00:00:00+09:00`));

export const clockDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

export const timeLabel = (t) =>
  t == null
    ? "미기록"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(t));

// 수정 폼에 담아 두는 시작·종료 시각(한국 시간 문자열)과 그 역변환.
export const timeInput = (t) => (t == null ? "" : new Date(t + 9 * 3600000).toISOString().slice(0, 19));
export const parseTimeInput = (t) => (t ? Date.parse(t + "+09:00") : null);
