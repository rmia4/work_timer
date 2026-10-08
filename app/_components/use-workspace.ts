"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { invalidateCalendarCache } from "./work-calendar";
import { timeInput, parseTimeInput } from "../../lib/work-dates";
import type { DeleteKind } from "./settings-dialog";

export type Task = {
  id: string;
  day: string;
  title: string;
  note: string;
  result: string;
  target: number;
  elapsed: number;
  started: number | null;
  status: string;
  version: number;
  started_at: number | null;
  ended_at: number | null;
  sessions?: { start_at: number; end_at: number | null }[];
};

export const today = (offset = 0) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86400000));
};
export const shiftDay = (value: string, offset: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  weekday: "short",
});
export const weekday = (value: string) =>
  weekdayFormatter.format(new Date(`${value}T00:00:00+09:00`));

export const duration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

export const statusLabel = (status: string) =>
  status === "done" ? "완료" : status === "running" ? "측정 중" : "일시정지";

// 작업공간의 상태와 동작. 모든 레이아웃이 같은 값을 공유한다.
export function useWorkspace() {
  const [day, setDay] = useState(today),
    [tasks, setTasks] = useState<Task[]>([]),
    [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [auth, setAuth] = useState(true),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""),
    [note, setNote] = useState(""),
    [result, setResult] = useState(""),
    [targetMinutes, setTargetMinutes] = useState(""),
    [minutes, setMinutes] = useState("0"),
    [edit, setEdit] = useState<Task | null>(null),
    [remove, setRemove] = useState<Task | null>(null),
    [message, setMessage] = useState("");
  const [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [calendarRefresh, setCalendarRefresh] = useState(0),
    [memoReset, setMemoReset] = useState(0),
    [dailyMemoReset, setDailyMemoReset] = useState(0);
  const [finishTask, setFinishTask] = useState<Task | null>(null),
    [finishResult, setFinishResult] = useState("");
  const request = useRef(0),
    lock = useRef(false);
  function clearForm() {
    setTitle("");
    setNote("");
    setResult("");
    setTargetMinutes("");
    setMinutes("0");
    setFirst("");
    setLast("");
    setEdit(null);
  }
  function chooseDay(value: string) {
    if (value === day) return;
    request.current++;
    setLoading(true);
    setTasks([]);
    setDay(value);
    if (edit) clearForm();
    setMessage("");
  }
  const load = useCallback(async () => {
    const seq = ++request.current;
    try {
      const r = await fetch("/api/tasks?day=" + day);
      const data = (await r.json()) as {
        tasks: Task[];
        now: number;
        error: string;
      };
      if (seq !== request.current) return;
      if (r.status === 401) {
        setAuth(true);
        setTasks([]);
        return;
      }
      if (!r.ok) throw Error(data.error);
      setAuth(false);
      setTasks(data.tasks);
      setOffset(data.now - Date.now());
      setError("");
    } catch (e) {
      if (seq === request.current)
        setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }, [day]);
  // ctrl s 기능 방지
  useEffect(() => {
    const preventSave = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", preventSave, true);
    return () => window.removeEventListener("keydown", preventSave, true);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", focus);
      request.current++;
    };
  }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  async function act(body: object) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as {
        tasks: Task[];
        now: number;
        error: string;
      };
      if (!r.ok) {
        if (r.status === 409) await load();
        throw Error(data.error);
      }
      await load();
      invalidateCalendarCache(day);
      setCalendarRefresh((n) => n + 1);
      setMessage("저장되었습니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const active = tasks.find((t) => t.status !== "done");
  const elapsed = (t: Task) =>
    t.elapsed +
    (t.started === null ? 0 : Math.max(0, now + offset - t.started));
  const daily = tasks.filter((t) => t.day === day);
  const total = daily
    .filter((t) => t.status === "done")
    .reduce((s, t) => s + t.elapsed, 0);
  // 탭 제목에 타이머 상태와 기록 시간을 분 단위로 표시한다. 매초 렌더와 분리해 30초마다만 갱신한다.
  const activeStatus = active?.status,
    activeElapsed = active?.elapsed ?? 0,
    activeStarted = active?.started ?? null;
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    const base = "업무 기록 · Work Timer";
    if (auth || !activeStatus) {
      document.title = base;
      return;
    }
    const update = () => {
      const ms =
        activeElapsed +
        (activeStarted === null
          ? 0
          : Math.max(0, Date.now() + offsetRef.current - activeStarted));
      const icon = activeStatus === "running" ? "▶" : "❚❚";
      document.title = `${icon} ${duration(ms).slice(0, 5)} · 업무 기록`;
    };
    update();
    if (activeStarted === null) return () => void (document.title = base);
    const id = setInterval(update, 30000);
    return () => {
      clearInterval(id);
      document.title = base;
    };
  }, [auth, activeStatus, activeElapsed, activeStarted]);
  async function save(run: boolean) {
    const ok = await act({
      action: edit ? "edit" : "create",
      id: edit?.id,
      version: edit?.version,
      title,
      note,
      result,
      target:
        targetMinutes === "" ? 0 : Math.round(Number(targetMinutes) * 60000),
      day,
      elapsed: Math.round(Number(minutes) * 60000),
      started_at: parseTimeInput(first),
      ended_at: parseTimeInput(last),
      run,
    });
    if (ok) clearForm();
    return ok;
  }
  function startEdit(t: Task) {
    setEdit(t);
    setFirst(timeInput(t.started_at));
    setLast(timeInput(t.ended_at));
    setTitle(t.title);
    setNote(t.note);
    setResult(t.result || "");
    setTargetMinutes(
      t.target > 0 ? String(Math.round(t.target / 600) / 100) : "",
    );
    setMinutes(String(Math.round(t.elapsed / 600) / 100));
  }
  function toggleActive() {
    if (!active) return;
    void act({
      action: active.status === "running" ? "pause" : "resume",
      id: active.id,
      version: active.version,
    });
  }
  function askFinish() {
    if (!active) return;
    setFinishTask(active);
    setFinishResult(active.result || "");
  }
  async function logout() {
    try {
      const r = await fetch("/api/auth", { method: "DELETE" });
      if (!r.ok) throw Error("로그아웃하지 못했습니다.");
      request.current++;
      setTasks([]);
      setTitle("");
      setNote("");
      setResult("");
      setTargetMinutes("");
      setEdit(null);
      setRemove(null);
      setAuth(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그아웃하지 못했습니다.");
    }
  }
  function resetDeleted(kind: DeleteKind) {
    if (kind === "memos") return setMemoReset((n) => n + 1);
    if (kind === "daily-memos") return setDailyMemoReset((n) => n + 1);
    setFinishTask(null);
    setRemove(null);
    setEdit(null);
    invalidateCalendarCache();
    setCalendarRefresh((n) => n + 1);
    void load();
  }
  return {
    day, now, offset, error, auth, loading, busy, message,
    tasks, daily, active, total, elapsed,
    title, setTitle, note, setNote, result, setResult,
    targetMinutes, setTargetMinutes, minutes, setMinutes,
    edit, clearForm, startEdit, save,
    remove, setRemove, finishTask, setFinishTask, finishResult, setFinishResult,
    calendarRefresh, memoReset, dailyMemoReset,
    load, act, chooseDay, toggleActive, askFinish, logout, resetDeleted,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
