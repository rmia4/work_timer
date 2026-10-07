"use client";
import Login from "./login";
import WorkCalendar, { invalidateCalendarCache } from "./work-calendar";
import MemoBoard from "./memo-board";
import DailyActivityClock from "./daily-activity-clock";
import SettingsDialog, { type DeleteKind } from "./settings-dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
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
  timestampLabel,
  timeLabel,
  timeInput,
  parseTimeInput,
} from "../../lib/work-dates";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Clock3,
  NotebookPen,
  Plus,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
type Task = {
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
const today = (offset = 0) =>{
  return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + offset * 86400000));
}
const shiftDay = (value: string, offset: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  weekday: "short",
});
const weekday = (value: string) =>
  weekdayFormatter.format(new Date(`${value}T00:00:00+09:00`));

const duration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};
export default function Workspace() {
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
  const [calendarOpen, setCalendarOpen] = useState(false),
    [calendarSelection, setCalendarSelection] = useState(day),
    [finishTask, setFinishTask] = useState<Task | null>(null),
    [finishResult, setFinishResult] = useState("");
  const request = useRef(0),
    lock = useRef(false);
  function chooseDay(value: string) {
    if (value === day) return;
    request.current++;
    setLoading(true);
    setTasks([]);
    setDay(value);
    if (edit) {
      setEdit(null);
      setTitle("");
      setNote("");
      setResult("");
      setTargetMinutes("");
      setMinutes("0");
      setFirst("");
      setLast("");
    }
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
    if (ok) {
      setTitle("");
      setNote("");
      setResult("");
      setTargetMinutes("");
      setMinutes("0");
      setFirst("");
      setLast("");
      setEdit(null);
    }
  }
  if (auth) return <Login onSuccess={load} />;
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
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="24" height="24" />
          <strong>업무 기록</strong>
        </div>
        <div className="top-actions">
          <SettingsDialog disabled={busy} onDeleted={resetDeleted} />
          <button onClick={logout} disabled={busy}>
            로그아웃
          </button>
        </div>
      </header>
      <main>
        {error && (
          <div className="notice error" role="alert">
            {error}{" "}
            <button onClick={() => void load()}>
              <RefreshCw size={16} />
              다시 불러오기
            </button>
          </div>
        )}
        <div className="top-panels">
          <div className="columns">
            <section className="timer-panel">
              <div className="panel-label">
                <Clock3 size={18} />
                <span>작업 스톱워치</span>
                <span className="badge">
                  {active
                    ? active.status === "running"
                      ? "측정 중"
                      : "일시정지"
                    : "준비"}
                </span>
              </div>
              <h2>{active?.title || "지금 집중할 작업"}</h2>
              <div className="target-time">
                {active && active.target > 0
                  ? `목표 ${duration(active.target)}`
                  : ""}
              </div>
              <div className="clock" role="timer">
                {duration(active ? elapsed(active) : 0)}
              </div>
              <p className="timer-note">
                {active
                  ? ` ${timestampLabel(active.started_at)} 시작 · 브라우저를 닫아도 기록이 유지됩니다.`
                  : "아래에 작업을 입력하고 측정을 시작하세요."}
              </p>
              <div className="timer-actions">
                {active ? (
                  <>
                    <button
                      className="light"
                      disabled={busy}
                      onClick={() =>
                        act({
                          action:
                            active.status === "running" ? "pause" : "resume",
                          id: active.id,
                          version: active.version,
                        })
                      }
                    >
                      {active.status === "running" ? (
                        <Pause size={18} />
                      ) : (
                        <Play size={18} />
                      )}{" "}
                      {active.status === "running" ? "일시정지" : "다시 시작"}
                    </button>
                    <button
                      className="outline"
                      disabled={busy}
                      onClick={() => {
                        setFinishTask(active);
                        setFinishResult(active.result || "");
                      }}
                    >
                      <Square size={16} />
                      종료·저장
                    </button>
                  </>
                ) : (
                  <span>한 번에 하나의 작업을 측정합니다.</span>
                )}
              </div>
            </section>
            <section className="summary">
              <button
                className="summary-yesterday"
                onClick={() => chooseDay(shiftDay(day, -1))}
              >
                &lt;
              </button>
              <button
                className="summary-today"
                onClick={() => chooseDay(today())}
              >
                오늘
              </button>

              <button
                className="summary-nextday"
                onClick={() => chooseDay(shiftDay(day, 1))}
              >
                &gt;
              </button>

              <p className="summary-date">{day} ({weekday(day)})</p>
              <h2>완료한 작업 시간</h2>
              <strong className="total">{duration(total)}</strong>
              <div className="summary-bottom">
                <span>
                  기록한 작업 <b>{daily.length}개</b>
                </span>
              </div>
            </section>
            <DailyActivityClock tasks={daily} day={day} now={now + offset} />
          </div>
        </div>
        <div className="content-grid">
          <div className="left-panels">
          <div className="section-title-left">
            <NotebookPen size={20} />
            <h2>{edit ? "기록 수정" : "새 작업"}</h2>
          </div>
            <section className="entry">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(false);
                }}
              >
                <label>
                  작업명
                  <input
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
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
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
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
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
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
                    value={targetMinutes}
                    onChange={(e) => setTargetMinutes(e.target.value)}
                    placeholder="선택 입력"
                  />
                </label>
                <p className="hint">
                  입력하지 않으면 목표 시간이 표시되지 않습니다.
                </p>
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
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                    />
                  </label>
                  <p className="hint">
                    직접 기록할 때 입력하세요. 측정 시작 시에는 0부터
                    시작합니다.
                  </p>
                  {/* <label>
                    시작 시각 (한국 시간)
                    <input
                      type="datetime-local"
                      step="1"
                      value={first}
                      onChange={(e) => setFirst(e.target.value)}
                    />
                  </label>
                  <label>
                    종료 시각 (한국 시간)
                    <input
                      type="datetime-local"
                      step="1"
                      value={last}
                      onChange={(e) => setLast(e.target.value)}
                    />
                  </label>
                  <p className="hint">
                    일시정지 시간은 소요 시간에서 직접 제외하세요. 측정 시작
                    시에는 현재 시각을 자동 기록합니다.
                  </p> */}
                </details>
                <div className="form-actions">
                  {edit ? (
                    <button
                      className="primary"
                      type="button"
                      disabled={
                        busy || auth || loading || !!active || !title.trim()
                      }
                      onClick={() => save(true)}
                    >
                      <Play size={16} />
                      수정 후 측정 재개
                    </button>
                  ) : (
                    <button
                      className="primary"
                      type="button"
                      disabled={
                        busy || auth || loading || !!active || !title.trim()
                      }
                      onClick={() => save(true)}
                    >
                      <Play size={16} />
                      측정 시작
                    </button>
                  )}
                  <button disabled={busy || auth || loading} type="submit">
                    <Plus size={16} />
                    {edit ? "수정 저장" : "기록 저장"}
                  </button>
                  {edit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEdit(null);
                        setTitle("");
                        setNote("");
                        setResult("");
                        setTargetMinutes("");
                        setMinutes("0");
                        setFirst("");
                        setLast("");
                      }}
                    >
                      취소
                    </button>
                  )}
                </div>
                <p role="status" className="saved">
                  {message}
                </p>
              </form>
            </section>
            <MemoBoard key={`${day}:${dailyMemoReset}`} day={day} />
          </div>
          <section className="records">
            <div className="section-title">
              <h2>업무 일지</h2>
              <div className="date-controls">
            <Popover
              open={calendarOpen}
              onOpenChange={(open) => {
                if (open) {
                  setCalendarSelection(day);
                } else {
                  setCalendarSelection(day);
                }
                setCalendarOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <button type="button" aria-label="캘린더 열기 또는 닫기">
                  <CalendarDays size={18} />
                  <span>캘린더</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="calendar-popup">
                <WorkCalendar
                  day={calendarSelection}
                  onSelect={(value) => {
                    if (value === calendarSelection) {
                      chooseDay(value);
                      setCalendarOpen(false);
                    } else setCalendarSelection(value);
                  }}
                  refresh={calendarRefresh}
                  now={now + offset}
                />
              </PopoverContent>
            </Popover>
          </div>
              <span>{day}</span>
            </div>
            {loading ? (
              <p className="empty">기록을 불러오는 중입니다.</p>
            ) : daily.length === 0 ? (
              <div className="empty">
                <NotebookPen size={32} />
                <h3>아직 기록이 없습니다.</h3>
                <p>작업을 시작하거나 완료한 업무를 남겨보세요.</p>
              </div>
            ) : (
              daily.map((t) => (
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
                        <strong>{duration(elapsed(t))}</strong>
                      </span>
                    </div>
                  </div>
                  <span className="status">
                    {t.status === "done"
                      ? "완료"
                      : t.status === "running"
                        ? "측정 중"
                        : "일시정지"}
                  </span>
                  <dl className="task-times">
                    <div>
                      <dt>시작</dt>
                      <dd>{timeLabel(t.started_at)}</dd>
                    </div>
                    <div>
                      <dt>종료</dt>
                      <dd>
                        {t.status === "done"
                          ? timeLabel(t.ended_at)
                          : "진행 중"}
                      </dd>
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
                  {t.status === "done" && (
                    <div className="record-actions">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEdit(t);
                          setFirst(timeInput(t.started_at));
                          setLast(timeInput(t.ended_at));
                          setTitle(t.title);
                          setNote(t.note);
                          setResult(t.result || "");
                          setTargetMinutes(
                            t.target > 0
                              ? String(Math.round(t.target / 600) / 100)
                              : "",
                          );
                          setMinutes(String(Math.round(t.elapsed / 600) / 100));
                        }}
                      >
                        수정
                      </button>
                      <button disabled={busy} onClick={() => setRemove(t)}>
                        삭제
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
          <MemoBoard key={memoReset} />
        </div>
        <footer>한국 시간 기준 · 기록은 기기 간 자동 동기화됩니다.</footer>
      </main>
      <Dialog
        open={!!finishTask}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setFinishTask(null);
            setFinishResult("");
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
              onChange={(e) => setFinishResult(e.target.value)}
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
                setFinishTask(null);
                setFinishResult("");
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
                const ok = await act({
                  action: "finish",
                  id: finishTask.id,
                  version: finishTask.version,
                  result: finishResult,
                });
                if (ok) {
                  setFinishTask(null);
                  setFinishResult("");
                }
              }}
            >
              {busy ? "저장 중…" : "종료하고 저장"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>이 기록을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            “{remove?.title}”의 업무 내용과 측정 시간이 삭제됩니다.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (remove)
                  void act({
                    action: "delete",
                    id: remove.id,
                    version: remove.version,
                  });
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
