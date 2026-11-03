import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { dayTotals, exportRows } from "@/server/tasks/task-service";
import {
  validRange,
  validScope,
  tasksCsv,
  summaryPrompt,
  weekStart,
  type ExportScope,
} from "@/shared/stats";
import { validDay } from "@/shared/work-dates";
import { likePattern, likeAny } from "@/shared/like-search";
import {
  MATCH_LIMIT,
  badDay,
  currentTask,
  dayInput,
  detailsInput,
  kstToday,
  memoView,
  minutes,
  ok,
  queryInput,
  readOnly,
  searchResults,
  taskView,
  toolError,
  type Ctx,
  type MemoRow,
  type TaskRow,
} from "../views";
export function readTools(server: McpServer, ctx: Ctx) {
  const { db, owner, now } = ctx;
  server.registerTool(
    "get_current_work",
    {
      title: "진행 중인 작업",
      description:
        "진행 중이거나 일시정지된 작업 1건과 경과 시간(분)을 돌려준다. 없으면 task가 null이다. 내용·결과는 앞 200자만 오고, 전문은 include_details: true.",
      inputSchema: z.object({ include_details: detailsInput }),
      annotations: readOnly,
    },
    async ({ include_details }) => {
      const t = await currentTask(ctx);
      const task = t && taskView(t, now(), include_details ? "full" : "preview");
      return ok(
        task
          ? `${task.status === "running" ? "진행 중" : "일시정지"}: ${task.minutes}분 경과`
          : "진행 중인 작업이 없습니다.",
        { task },
      );
    },
  );
  server.registerTool(
    "list_tasks",
    {
      title: "작업 목록·검색",
      description:
        "한 날짜의 작업 목록(제목, 상태, 소요 분, 시작·종료 시각, 내용, 결과)을 만든 순서의 역순으로 돌려준다. day를 생략하면 오늘이다. 내용·결과는 앞 200자만 오고(잘린 항목은 note_truncated·result_truncated: true), 전문은 include_details: true. query를 주면 제목·내용·결과에서 찾는다(day를 생략하면 모든 날짜, 최근 순 최대 20건). 검색 결과는 truncated: false면 전문이고, true면 match_excerpt로 대상을 고른 뒤 include_details로 다시 조회한다.",
      inputSchema: z.object({
        day: dayInput.optional(),
        query: queryInput.optional(),
        include_details: detailsInput,
      }),
      annotations: readOnly,
    },
    async ({ day, query, include_details }) => {
      if (day !== undefined && !validDay(day)) return toolError(badDay);
      const at = now(),
        mode = include_details ? "full" : "preview";
      if (query !== undefined) {
        const pattern = likePattern(query);
        const rows = (
          await db
            .prepare(
              `SELECT * FROM tasks WHERE owner=?${day ? " AND day=?" : ""} AND ${likeAny(["title", "note", "result"])} ORDER BY day DESC,created DESC LIMIT ?`,
            )
            .bind(...[owner, ...(day ? [day] : []), pattern, pattern, pattern, MATCH_LIMIT + 1])
            .all<TaskRow>()
        ).results;
        const { items, has_more, truncated } = searchResults(
          rows,
          query,
          (t) => [t.note, t.result],
          (t) => taskView(t, at, "full"),
          (t) => taskView(t, at, mode),
        );
        return ok(`"${query}" 일치 작업 ${items.length}건${has_more ? " 이상" : ""}`, {
          query,
          day: day ?? null,
          tasks: items,
          has_more,
          truncated,
        });
      }
      const target = day ?? kstToday(at);
      // 웹용 listTasks는 측정 구간과 다른 날의 미완료 작업까지 가져온다. MCP는 그날 작업만 한 번에 조회한다.
      const tasks = (
        await db
          .prepare("SELECT * FROM tasks WHERE owner=? AND day=? ORDER BY created DESC")
          .bind(owner, target)
          .all<TaskRow>()
      ).results.map((t) => taskView(t, at, mode));
      return ok(
        `${target} 작업 ${tasks.length}건, 합계 ${tasks.reduce((sum, t) => sum + t.minutes, 0)}분`,
        { day: target, tasks },
      );
    },
  );
  server.registerTool(
    "get_stats",
    {
      title: "기간 통계",
      description:
        "기간(최대 371일)의 총 작업 시간(분), 작업 수와 기간별 합계를 돌려준다. group이 day(기본)면 days에 일별, week·month면 periods에 주별(월요일 시작일)·월별 합계가 온다. 기간이 길면 week나 month를 쓴다. 기록이 없는 날·기간은 빠진다.",
      inputSchema: z.object({
        from: dayInput,
        to: dayInput,
        group: z.enum(["day", "week", "month"]).optional(),
      }),
      annotations: readOnly,
    },
    async ({ from, to, group = "day" }) => {
      if (!validRange(from, to, 371))
        return toolError(
          "기간을 확인해 주세요. from과 to는 YYYY-MM-DD이고 from≤to, 최대 371일입니다.",
        );
      const days = (await dayTotals(db, owner, from, to, now()))
        .map((d) => ({ day: d.day, minutes: minutes(Number(d.total)), tasks: Number(d.count) }))
        .sort((a, b) => a.day.localeCompare(b.day));
      const total = days.reduce((sum, d) => sum + d.minutes, 0),
        count = days.reduce((sum, d) => sum + d.tasks, 0);
      const summary = `${from} ~ ${to}: 작업 ${count}건, 합계 ${total}분`;
      if (group === "day")
        return ok(summary, { from, to, total_minutes: total, task_count: count, days });
      const periods = new Map<string, { period: string; minutes: number; tasks: number }>();
      for (const d of days) {
        const period = group === "week" ? weekStart(d.day) : d.day.slice(0, 7),
          sum = periods.get(period) ?? { period, minutes: 0, tasks: 0 };
        sum.minutes += d.minutes;
        sum.tasks += d.tasks;
        periods.set(period, sum);
      }
      return ok(summary, {
        from,
        to,
        group,
        total_minutes: total,
        task_count: count,
        periods: [...periods.values()],
      });
    },
  );
  server.registerTool(
    "get_daily_memos",
    {
      title: "날짜별 메모 조회·검색",
      description:
        "한 날짜의 메모를 돌려준다(day 생략 시 오늘). 본문은 앞 200자만 온다(잘린 항목은 body_truncated: true). memo_id를 주면 그 메모 1건을 전문으로 준다. query를 주면 제목·본문에서 찾는다(day를 생략하면 모든 날짜, 최근 순 최대 20건). 검색 결과는 truncated: false면 전문이고, true면 match_excerpt로 대상을 고른 뒤 memo_id로 전문을 가져온다. 날짜와 상관없는 메모는 get_global_memos.",
      inputSchema: z.object({
        day: dayInput.optional(),
        memo_id: z.string().optional(),
        query: queryInput.optional(),
      }),
      annotations: readOnly,
    },
    async ({ day, memo_id, query }) => {
      if (day !== undefined && !validDay(day)) return toolError(badDay);
      if (memo_id !== undefined) {
        const memo = await db
          .prepare("SELECT id,day,title,body,version FROM daily_memos WHERE id=? AND owner=?")
          .bind(memo_id, owner)
          .first<MemoRow>();
        return memo ? ok(`${memo.day} 메모`, { memo }) : toolError("메모가 없습니다.");
      }
      if (query !== undefined) {
        const pattern = likePattern(query);
        const rows = (
          await db
            .prepare(
              `SELECT id,day,title,body,version FROM daily_memos WHERE owner=?${day ? " AND day=?" : ""} AND ${likeAny(["title", "body"])} ORDER BY day DESC,position,created LIMIT ?`,
            )
            .bind(...[owner, ...(day ? [day] : []), pattern, pattern, MATCH_LIMIT + 1])
            .all<MemoRow>()
        ).results;
        const { items, has_more, truncated } = searchResults(
          rows,
          query,
          (m) => [m.body],
          (m) => m,
          (m) => memoView(m, false),
        );
        return ok(`"${query}" 일치 메모 ${items.length}건${has_more ? " 이상" : ""}`, {
          query,
          day: day ?? null,
          daily_memos: items,
          has_more,
          truncated,
        });
      }
      const target = day ?? kstToday(now());
      const daily = await db
        .prepare(
          "SELECT id,title,body,version FROM daily_memos WHERE owner=? AND day=? ORDER BY position,created",
        )
        .bind(owner, target)
        .all<MemoRow>();
      return ok(`${target} 메모 ${daily.results.length}건`, {
        day: target,
        daily_memos: daily.results.map((m) => memoView(m, false)),
      });
    },
  );
  server.registerTool(
    "get_global_memos",
    {
      title: "전역 메모 조회·검색",
      description:
        "날짜와 상관없는 전역 메모를 돌려준다. 본문은 앞 200자만 온다(잘린 항목은 body_truncated: true). memo_id를 주면 그 메모 1건을 전문으로 준다. query를 주면 제목·본문에서 찾는다(최대 20건). 검색 결과는 truncated: false면 전문이고, true면 match_excerpt로 대상을 고른 뒤 memo_id로 전문을 가져온다. 날짜별 메모는 get_daily_memos.",
      inputSchema: z.object({ memo_id: z.string().optional(), query: queryInput.optional() }),
      annotations: readOnly,
    },
    async ({ memo_id, query }) => {
      if (memo_id !== undefined) {
        const memo = await db
          .prepare("SELECT id,title,body,version FROM memos WHERE id=? AND owner=?")
          .bind(memo_id, owner)
          .first<MemoRow>();
        return memo ? ok("전역 메모", { memo }) : toolError("메모가 없습니다.");
      }
      if (query !== undefined) {
        const pattern = likePattern(query);
        const rows = (
          await db
            .prepare(
              `SELECT id,title,body,version FROM memos WHERE owner=? AND ${likeAny(["title", "body"])} ORDER BY position,created LIMIT ?`,
            )
            .bind(owner, pattern, pattern, MATCH_LIMIT + 1)
            .all<MemoRow>()
        ).results;
        const { items, has_more, truncated } = searchResults(
          rows,
          query,
          (m) => [m.body],
          (m) => m,
          (m) => memoView(m, false),
        );
        return ok(`"${query}" 일치 메모 ${items.length}건${has_more ? " 이상" : ""}`, {
          query,
          memos: items,
          has_more,
          truncated,
        });
      }
      const memos = await db
        .prepare("SELECT id,title,body,version FROM memos WHERE owner=? ORDER BY position,created")
        .bind(owner)
        .all<MemoRow>();
      return ok(`전역 메모 ${memos.results.length}건`, {
        memos: memos.results.map((m) => memoView(m, false)),
      });
    },
  );
  // 웹의 "CSV 다운로드"·"AI 요약 프롬프트 복사"와 같은 내용을 AI가 바로 읽도록 텍스트로 돌려준다. 파일은 만들지 않는다.
  // 업무 내용 열은 길어지기 쉬워 all·detail은 31일까지만 받고, 전체 글자 수에도 안전 상한을 둔다.
  const EXPORT_MAX_CHARS = 50000,
    DETAIL_EXPORT_DAYS = 31;
  const exportRangeError = (from: string, to: string, scope: ExportScope) => {
    if (!validRange(from, to, 366))
      return "기간을 확인해 주세요. from과 to는 YYYY-MM-DD이고 from≤to, 최대 366일입니다.";
    if (scope !== "time" && !validRange(from, to, DETAIL_EXPORT_DAYS))
      return `업무 내용 열을 포함하면(scope: ${scope}) 최대 ${DETAIL_EXPORT_DAYS}일입니다. 기간을 줄이거나 scope: "time"을 쓰세요.`;
    return null;
  };
  const tooLong = (size: number) =>
    `내보낼 내용이 ${size}자로 너무 깁니다(최대 ${EXPORT_MAX_CHARS}자). 기간을 줄이거나 scope: "time"으로 다시 호출하세요.`;
  const CUT_MARK = "…(잘림)";
  const cutText = (text: string, size: number) =>
    text.length <= size
      ? text
      : text.slice(0, Math.max(0, size - CUT_MARK.length)).replace(/[\uD800-\uDBFF]$/, "") +
        CUT_MARK;
  // 작업별 업무 내용+결과 길이 상한. 상한보다 짧은 작업은 그대로 두고 남는 몫을 긴 작업에 나눈다.
  const fairCap = (sizes: number[], budget: number) => {
    const sorted = [...sizes].sort((a, b) => a - b);
    for (let i = 0, rest = budget; i < sorted.length; rest -= sorted[i], i++) {
      const share = Math.floor(Math.max(0, rest) / (sorted.length - i));
      if (sorted[i] > share) return share;
    }
    return Infinity;
  };
  // 상한을 넘으면 업무 내용·결과를 작업별로 잘라 맞춘다. CSV 이스케이프로 길이가 달라지니 다시 재서 예산을 고치고, 상한 안에서 가장 긴 결과를 고른다.
  // compose는 CSV, 잘린 작업 수, 전체 작업 수로 최종 텍스트를 만든다. 다 잘라도 넘으면 상한을 넘는 텍스트를 그대로 돌려준다.
  const exportText = async (
    from: string,
    to: string,
    scope: ExportScope,
    compose: (csv: string, cut: number, count: number) => string,
  ) => {
    const rows = await exportRows(db, owner, from, to, now());
    const build = (list: typeof rows, cut: number) =>
      compose(tasksCsv(list, scope).replace(/^\uFEFF/, ""), cut, rows.length);
    let text = build(rows, 0);
    if (text.length <= EXPORT_MAX_CHARS || scope === "time") return text;
    const sizes = rows.map((r) => r.note.length + r.result.length);
    let budget = sizes.reduce((a, b) => a + b, 0);
    let best: string | null = null;
    for (let i = 0; i < 5 && text.length !== EXPORT_MAX_CHARS; i++) {
      budget -= text.length - EXPORT_MAX_CHARS;
      const cap = fairCap(sizes, budget);
      let cut = 0;
      const fitted = rows.map((r, j) => {
        if (sizes[j] <= cap) return r;
        cut++;
        const noteSize = Math.floor((cap * r.note.length) / sizes[j]);
        return { ...r, note: cutText(r.note, noteSize), result: cutText(r.result, cap - noteSize) };
      });
      text = build(fitted, cut);
      if (text.length <= EXPORT_MAX_CHARS && text.length > (best?.length ?? -1)) best = text;
    }
    return best ?? text;
  };
  server.registerTool(
    "export_tasks",
    {
      title: "CSV 내보내기",
      description: `업무 기록을 웹의 내보내기와 같은 CSV 텍스트로 돌려준다. scope는 time(시간 기록 열, 기본값, 최대 366일), detail(업무 내용·결과 열)·all(전부)은 최대 ${DETAIL_EXPORT_DAYS}일. 업무 내용까지 봐야 할 때만 all·detail을 쓴다. 전체가 ${EXPORT_MAX_CHARS}자를 넘으면 긴 작업의 업무 내용·결과 뒷부분을 잘라 "${CUT_MARK}"을 붙인다. 사용자가 기간 업무 요약·분석을 원하면 with_summary_guide: true로 호출하고, CSV 앞에 붙는 지침대로 요약한다.`,
      inputSchema: z.object({
        from: dayInput,
        to: dayInput,
        scope: z.enum(["time", "all", "detail"]).optional(),
        with_summary_guide: z
          .boolean()
          .optional()
          .describe('웹의 "AI 요약 프롬프트"를 CSV 앞에 붙인다'),
      }),
      annotations: readOnly,
    },
    async ({ from, to, scope = "time", with_summary_guide }) => {
      const rangeError = exportRangeError(from, to, scope);
      if (rangeError) return toolError(rangeError);
      const text = await exportText(from, to, scope, (csv, cut, count) => {
        const summary =
          `${from} ~ ${to}: 작업 ${count}건` +
          (cut
            ? `. 글자 수 상한 때문에 ${cut}건의 업무 내용·결과 뒷부분을 잘랐습니다(칸 끝 "${CUT_MARK}"). 전문은 list_tasks에 day와 include_details: true로 조회합니다.`
            : "");
        return with_summary_guide
          ? `${summary}\n\n${summaryPrompt(from, to, scope, "below")}\n\n${csv}`
          : `${summary}\n${csv}`;
      });
      if (text.length > EXPORT_MAX_CHARS) return toolError(tooLong(text.length));
      // structuredContent를 두면 그것만 모델에 넘기는 클라이언트(Claude Code 등)에서 CSV가 빠진다. 텍스트로만 돌려준다.
      return { content: [{ type: "text" as const, text }] };
    },
  );
  server.registerPrompt(
    "summarize_work",
    {
      title: "업무 기록 요약",
      description: `기간의 업무 기록 CSV와 웹의 AI 요약 프롬프트를 함께 넣는다. scope는 time(기본, 최대 366일), all·detail(최대 ${DETAIL_EXPORT_DAYS}일).`,
      argsSchema: z.object({
        from: dayInput,
        to: dayInput,
        scope: z.string().optional().describe("time(기본) / all / detail"),
      }),
    },
    async ({ from, to, scope = "time" }) => {
      if (!validScope(scope)) throw new Error("scope는 time, all, detail 중 하나여야 합니다.");
      const rangeError = exportRangeError(from, to, scope);
      if (rangeError) throw new Error(rangeError);
      const text = await exportText(
        from,
        to,
        scope,
        (csv, cut) =>
          `${summaryPrompt(from, to, scope, "below")}\n\n${cut ? `글자 수 상한 때문에 ${cut}건의 업무 내용·결과 뒷부분을 잘랐습니다(칸 끝 "${CUT_MARK}").\n\n` : ""}${csv}`,
      );
      if (text.length > EXPORT_MAX_CHARS) throw new Error(tooLong(text.length));
      return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
    },
  );
}
