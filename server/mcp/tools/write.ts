import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { applyTaskAction } from "@/server/tasks/task-service";
import { validDay } from "@/shared/work-dates";
import {
  badDay,
  currentTask,
  dayInput,
  failed,
  kstToday,
  minutesInput,
  ok,
  taskById,
  taskView,
  toolError,
  write,
  type Ctx,
  type TaskRow,
} from "../views";
// 쓰기 도구. 검증과 상태 전이는 웹 API와 같은 applyTaskAction을 거친다. 삭제 도구는 두지 않는다.
export function writeTools(server: McpServer, ctx: Ctx) {
  const { db, owner, now } = ctx;
  // 쓰기 결과는 저장한 값으로 만들어 다시 조회하지 않는다. 성공하면 버전이 1 오른다.
  const after = (t: TaskRow, change: Partial<TaskRow>, at: number) =>
    taskView({ ...t, version: t.version + 1, ...change }, at, "compact");
  const spent = (t: TaskRow, at: number) =>
    t.elapsed + (t.started === null ? 0 : Math.max(0, at - t.started));
  server.registerTool(
    "start_work",
    {
      title: "작업 시작",
      description:
        '오늘(한국 시간) 날짜로 작업을 만들고 바로 타이머를 시작한다. 시작만 하며 결과는 넣지 않는다(결과는 finish_work). 진행 중이거나 일시정지된 작업이 있으면 기본값(if_running: "fail")으로는 그 작업 정보와 함께 오류를 돌려준다. 사용자가 동의하면 "finish_previous"로 기존 작업을 종료하고 시작한다.',
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe("작업 제목(한국어, 40자 이내 권장)"),
        note: z
          .string()
          .max(20000)
          .optional()
          .describe("할 일·목표. 이미 한 일과 결과는 적지 않는다"),
        target_minutes: minutesInput.optional().describe("목표 시간(분)"),
        if_running: z.enum(["fail", "finish_previous"]).optional(),
      }),
      annotations: write,
    },
    async ({ title, note, target_minutes, if_running }) => {
      const previous = await currentTask(ctx);
      if (previous) {
        if (if_running !== "finish_previous")
          return toolError(
            '이미 진행 중인 작업이 있습니다. 사용자에게 이 작업을 종료할지 묻고, 동의하면 if_running: "finish_previous"로 다시 호출하세요.\n' +
              JSON.stringify({ task: taskView(previous, now(), "compact") }),
          );
        const failure = await applyTaskAction(
          db,
          owner,
          { action: "finish", id: previous.id, version: previous.version, result: previous.result },
          now(),
        );
        if (failure) return failed(failure);
      }
      const at = now();
      const failure = await applyTaskAction(
        db,
        owner,
        {
          action: "create",
          title,
          day: kstToday(at),
          note: note ?? "",
          result: "",
          target: (target_minutes ?? 0) * 60000,
          elapsed: 0,
          run: true,
        },
        at,
      );
      if (failure) return failed(failure);
      const task = taskView((await currentTask(ctx))!, now(), "compact");
      return ok(
        previous ? "이전 작업을 종료하고 타이머를 시작했습니다." : "타이머를 시작했습니다.",
        { task, finished_task_id: previous?.id ?? null },
      );
    },
  );
  server.registerTool(
    "finish_work",
    {
      title: "작업 종료",
      description:
        "작업의 타이머를 종료하고 결과 요약을 저장한다. 사용자가 작업을 마치라고 하거나 진행 중인 작업에 결과를 넣으라고 하면 이 도구를 쓴다. task_id를 생략하면 진행 중이거나 일시정지된 작업이다. 결과가 이미 있으면 덮어쓰지 않고 구분선 뒤에 이어 붙인다.",
      inputSchema: z.object({
        task_id: z.string().optional(),
        summary: z
          .string()
          .min(1)
          .max(20000)
          .describe("무엇을, 왜, 결과(PR 링크·검증 결과)를 3~6줄로"),
        append_note: z.string().max(20000).optional().describe("작업 내용 뒤에 덧붙일 글"),
      }),
      annotations: write,
    },
    async ({ task_id, summary, append_note }) => {
      const t = task_id === undefined ? await currentTask(ctx) : await taskById(ctx, task_id);
      if (!t)
        return toolError(task_id === undefined ? "진행 중인 작업이 없습니다." : "작업이 없습니다.");
      if (t.status === "done")
        return toolError("이미 종료된 작업입니다. 결과를 고치려면 update_task를 쓰세요.");
      const result = t.result.trim() ? `${t.result}\n\n---\n\n${summary}` : summary;
      const note =
        append_note === undefined
          ? undefined
          : t.note.trim()
            ? `${t.note}\n\n${append_note}`
            : append_note;
      if (result.length > 20000 || (note?.length ?? 0) > 20000)
        return toolError("결과나 내용이 20000자를 넘습니다. 요약을 줄여 주세요.");
      const at = now();
      const failure = await applyTaskAction(
        db,
        owner,
        { action: "finish", id: t.id, version: t.version, result, note },
        at,
      );
      if (failure) return failed(failure);
      const task = after(
        t,
        { elapsed: spent(t, at), started: null, status: "done", ended_at: at },
        at,
      );
      return ok(`작업을 종료했습니다: ${task.minutes}분`, { task });
    },
  );
  for (const [name, action, from, title] of [
    ["pause_work", "pause", "running", "작업 일시정지"],
    ["resume_work", "resume", "paused", "작업 재개"],
  ] as const) {
    server.registerTool(
      name,
      {
        title,
        description:
          action === "pause"
            ? "진행 중인 작업의 타이머를 일시정지한다."
            : "일시정지된 작업의 타이머를 다시 시작한다.",
        annotations: write,
      },
      async () => {
        const t = await currentTask(ctx);
        if (t?.status !== from)
          return toolError(
            action === "pause" ? "진행 중인 작업이 없습니다." : "일시정지된 작업이 없습니다.",
          );
        const at = now();
        const failure = await applyTaskAction(
          db,
          owner,
          { action, id: t.id, version: t.version },
          at,
        );
        if (failure) return failed(failure);
        const task = after(
          t,
          {
            elapsed: spent(t, at),
            started: action === "resume" ? at : null,
            status: action === "pause" ? "paused" : "running",
          },
          at,
        );
        return ok(
          action === "pause"
            ? `일시정지했습니다: ${task.minutes}분 경과`
            : "타이머를 다시 시작했습니다.",
          { task },
        );
      },
    );
  }
  server.registerTool(
    "update_task",
    {
      title: "완료된 작업 수정",
      description:
        "이미 종료된 작업의 제목·내용·결과·소요 시간(분)을 고친다. 진행 중이거나 일시정지된 작업에는 쓸 수 없다(결과 저장은 finish_work). 생략한 항목은 그대로 둔다. version은 list_tasks 결과의 값을 넣는다. 날짜와 시작·종료 시각은 바꾸지 않는다.",
      inputSchema: z.object({
        task_id: z.string(),
        version: z.number().int(),
        title: z.string().min(1).max(200).optional(),
        note: z.string().max(20000).optional(),
        result: z.string().max(20000).optional(),
        minutes: minutesInput.optional(),
      }),
      annotations: write,
    },
    async ({ task_id, version, title, note, result, minutes: spentMinutes }) => {
      const t = await taskById(ctx, task_id);
      if (!t) return toolError("작업이 없습니다.");
      const at = now(),
        elapsed = spentMinutes === undefined ? t.elapsed : spentMinutes * 60000;
      const failure = await applyTaskAction(
        db,
        owner,
        {
          action: "edit",
          id: t.id,
          version,
          title: title ?? t.title,
          note: note ?? t.note,
          result: result ?? t.result,
          day: t.day,
          target: t.target,
          elapsed,
        },
        at,
      );
      if (failure) return failed(failure);
      return ok("작업을 수정했습니다.", {
        task: after(t, { title: (title ?? t.title).trim(), elapsed, version: version + 1 }, at),
      });
    },
  );
  server.registerTool(
    "save_daily_memo",
    {
      title: "날짜별 메모 저장",
      description:
        "날짜별 메모를 새로 만들거나(memo_id 생략) 기존 메모를 고친다(get_daily_memos 결과의 memo_id와 version). 고칠 때 생략한 title·body는 그대로 둔다. 결과에는 본문 없이 id·title·version만 온다.",
      inputSchema: z.object({
        day: dayInput,
        memo_id: z.string().optional(),
        version: z.number().int().optional(),
        title: z.string().max(200).optional(),
        body: z.string().max(20000).optional(),
      }),
      annotations: write,
    },
    async ({ day, memo_id, version, title, body }) => {
      if (!validDay(day)) return toolError("날짜는 YYYY-MM-DD 형식이어야 합니다.");
      const at = now();
      if (memo_id === undefined) {
        const memo = { id: crypto.randomUUID(), title: title ?? "", body: body ?? "", version: 0 };
        await db
          .prepare(
            "INSERT INTO daily_memos (id,owner,day,title,body,position,version,created,updated) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .bind(memo.id, owner, day, memo.title, memo.body, at, 0, at, at)
          .run();
        return ok(`${day} 메모를 만들었습니다.`, {
          day,
          memo: { id: memo.id, title: memo.title, version: memo.version },
        });
      }
      if (version === undefined)
        return toolError("메모를 고치려면 version이 필요합니다. get_daily_memos로 조회해 주세요.");
      const current = await db
        .prepare("SELECT id,title,body FROM daily_memos WHERE id=? AND owner=? AND day=?")
        .bind(memo_id, owner, day)
        .first<{ id: string; title: string; body: string }>();
      if (!current) return toolError("메모가 없습니다.");
      const memo = {
        id: current.id,
        title: title ?? current.title,
        body: body ?? current.body,
        version: version + 1,
      };
      const result = await db
        .prepare(
          "UPDATE daily_memos SET title=?,body=?,version=version+1,updated=? WHERE id=? AND owner=? AND day=? AND version=?",
        )
        .bind(memo.title, memo.body, at, memo_id, owner, day, version)
        .run();
      if (!result.meta.changes)
        return toolError(
          "다른 기기에서 변경되었습니다. get_daily_memos로 다시 조회한 뒤 시도하세요.",
        );
      return ok(`${day} 메모를 고쳤습니다.`, {
        day,
        memo: { id: memo.id, title: memo.title, version: memo.version },
      });
    },
  );
  server.registerTool(
    "save_global_memo",
    {
      title: "전역 메모 저장",
      description:
        "날짜와 상관없는 전역 메모를 새로 만들거나(memo_id 생략) 기존 메모를 고친다(get_global_memos 결과의 memo_id와 version). 고칠 때 생략한 title·body는 그대로 둔다. 결과에는 본문 없이 id·title·version만 온다.",
      inputSchema: z.object({
        memo_id: z.string().optional(),
        version: z.number().int().optional(),
        title: z.string().max(200).optional(),
        body: z.string().max(20000).optional(),
      }),
      annotations: write,
    },
    async ({ memo_id, version, title, body }) => {
      const at = now();
      if (memo_id === undefined) {
        const memo = { id: crypto.randomUUID(), title: title ?? "", body: body ?? "", version: 0 };
        await db
          .prepare(
            "INSERT INTO memos (id,owner,title,body,collapsed,position,version,created,updated) VALUES (?,?,?,?,FALSE,?,?,?,?)",
          )
          .bind(memo.id, owner, memo.title, memo.body, at, 0, at, at)
          .run();
        return ok("전역 메모를 만들었습니다.", {
          memo: { id: memo.id, title: memo.title, version: memo.version },
        });
      }
      if (version === undefined)
        return toolError("메모를 고치려면 version이 필요합니다. get_global_memos로 조회해 주세요.");
      const current = await db
        .prepare("SELECT id,title,body FROM memos WHERE id=? AND owner=?")
        .bind(memo_id, owner)
        .first<{ id: string; title: string; body: string }>();
      if (!current) return toolError("메모가 없습니다.");
      const memo = {
        id: current.id,
        title: title ?? current.title,
        body: body ?? current.body,
        version: version + 1,
      };
      const result = await db
        .prepare(
          "UPDATE memos SET title=?,body=?,version=version+1,updated=? WHERE id=? AND owner=? AND version=?",
        )
        .bind(memo.title, memo.body, at, memo_id, owner, version)
        .run();
      if (!result.meta.changes)
        return toolError(
          "다른 기기에서 변경되었습니다. get_global_memos로 다시 조회한 뒤 시도하세요.",
        );
      return ok("전역 메모를 고쳤습니다.", {
        memo: { id: memo.id, title: memo.title, version: memo.version },
      });
    },
  );
  // 지난 작업을 완료 상태로 바로 기록한다. 웹의 "기록 추가"와 같이 타이머 없이 만들고 시작·종료 시각은 비워 둔다.
  server.registerTool(
    "add_task",
    {
      title: "지난 작업 기록",
      description:
        "이미 끝난 작업을 지정한 날짜에 완료 상태로 기록한다. 타이머는 켜지 않고 시작·종료 시각은 비워 둔다. 지금 시작하는 작업은 start_work를 쓴다.",
      inputSchema: z.object({
        day: dayInput,
        title: z.string().min(1).max(200).describe("작업 제목(한국어, 40자 이내 권장)"),
        minutes: minutesInput.describe("소요 시간(분)"),
        note: z.string().max(20000).optional().describe("할 일·내용"),
        result: z.string().max(20000).optional().describe("결과"),
        target_minutes: minutesInput.optional().describe("목표 시간(분)"),
      }),
      annotations: write,
    },
    async ({ day, title, minutes: spent, note, result, target_minutes }) => {
      if (!validDay(day)) return toolError(badDay);
      const at = now();
      const failure = await applyTaskAction(
        db,
        owner,
        {
          action: "create",
          title,
          day,
          note: note ?? "",
          result: result ?? "",
          target: (target_minutes ?? 0) * 60000,
          elapsed: spent * 60000,
          run: false,
        },
        at,
      );
      if (failure) return failed(failure);
      const t = await db
        .prepare("SELECT * FROM tasks WHERE owner=? AND day=? AND created=? ORDER BY id LIMIT 1")
        .bind(owner, day, at)
        .first<TaskRow>();
      return ok(`${day}에 작업을 기록했습니다: ${spent}분`, {
        task: t && taskView(t, at, "compact"),
      });
    },
  );
}
