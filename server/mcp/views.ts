import * as z from "zod/v4";
import type { database } from "@/server/db/raw";
import type { TaskFailure } from "@/server/tasks/task-service";
export type Db = ReturnType<typeof database>;
export type TaskRow = Record<string, unknown> & {
  id: string;
  day: string;
  title: string;
  note: string;
  result: string;
  status: string;
  target: number;
  elapsed: number;
  started: number | null;
  started_at: number | null;
  ended_at: number | null;
  version: number;
};
const KST_MS = 9 * 3600000;
export const kstIso = (t: number | null) =>
  t === null ? null : new Date(t + KST_MS).toISOString().slice(0, 19) + "+09:00";
export const kstToday = (now: number) => new Date(now + KST_MS).toISOString().slice(0, 10);
export const minutes = (ms: number) => Math.floor(Math.max(0, ms) / 60000);

// 응답 토큰을 줄이려고 긴 본문(작업 내용·결과, 메모 본문)은 기본으로 앞부분만 보낸다.
// full: 전문, preview: 앞 200자와 잘림 표시, compact: 본문 없음(쓰기 결과용)
export const PREVIEW_CHARS = 200,
  SEARCH_FULL_CHARS = 10000,
  MATCH_LIMIT = 20,
  EXCERPT_CHARS = 150;
type TextMode = "full" | "preview" | "compact";
const cut = (text: string) => text.slice(0, PREVIEW_CHARS);
export function taskView(t: TaskRow, now: number, mode: TextMode = "full") {
  const base = {
    id: t.id,
    day: t.day,
    title: t.title,
    status: t.status,
    minutes: minutes(t.elapsed + (t.started === null ? 0 : now - t.started)),
    target_minutes: t.target ? minutes(t.target) : null,
    started_at: kstIso(t.started_at),
    ended_at: kstIso(t.ended_at),
    version: t.version,
  };
  if (mode === "compact") return base;
  if (mode === "full") return { ...base, note: t.note, result: t.result };
  return {
    ...base,
    note: cut(t.note),
    result: cut(t.result),
    note_truncated: t.note.length > PREVIEW_CHARS,
    result_truncated: t.result.length > PREVIEW_CHARS,
  };
}
export type MemoRow = Record<string, unknown> & {
  id: string;
  title: string;
  body: string;
  version: number;
};
export const memoView = (m: MemoRow, full: boolean) =>
  full ? m : { ...m, body: cut(m.body), body_truncated: m.body.length > PREVIEW_CHARS };
function excerpt(texts: string[], query: string) {
  const q = query.toLowerCase();
  for (const text of texts) {
    const i = text.toLowerCase().indexOf(q);
    if (i >= 0) return text.slice(Math.max(0, i - EXCERPT_CHARS), i + q.length + EXCERPT_CHARS);
  }
  return null;
}
// 검색 결과는 AI가 사용자가 말한 대상을 고를 수 있게 본문을 최대한 넣는다.
// 본문 합계가 작으면 모두 전문, 크면 미리보기와 검색어 주변 발췌를 준다(truncated: true). rows는 MATCH_LIMIT+1건까지 받는다.
export function searchResults<T>(
  rows: T[],
  query: string,
  texts: (row: T) => string[],
  full: (row: T) => object,
  short: (row: T) => object,
) {
  const items = rows.slice(0, MATCH_LIMIT);
  const fits =
    items.reduce((n, row) => n + texts(row).reduce((m, text) => m + text.length, 0), 0) <=
    SEARCH_FULL_CHARS;
  return {
    items: items.map((row) =>
      fits ? full(row) : { ...short(row), match_excerpt: excerpt(texts(row), query) },
    ),
    has_more: rows.length > MATCH_LIMIT,
    truncated: !fits,
  };
}
// 사용자 입력 텍스트는 데이터 필드에만 담는다. 텍스트 결과에는 한 줄 요약과 같은 JSON을 함께 넣는다.
export const ok = (summary: string, data: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: summary + "\n" + JSON.stringify(data) }],
  structuredContent: data,
});
export const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});
// 버전 충돌·상태 불일치(409)는 AI가 다시 조회하도록 안내를 붙인다.
export const failed = (f: TaskFailure) =>
  toolError(
    f.status === 409
      ? f.error + " get_current_work나 list_tasks로 최신 상태를 다시 조회한 뒤 시도하세요."
      : f.error,
  );
export const readOnly = { readOnlyHint: true, openWorldHint: false };
export const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
export const dayInput = z.string().describe("YYYY-MM-DD (한국 시간 기준 날짜)");
export const minutesInput = z.number().int().min(0).max(525600);
export const queryInput = z
  .string()
  .min(1)
  .max(100)
  .describe("키워드(대소문자 구분 없는 부분 일치)");
export const detailsInput = z
  .boolean()
  .optional()
  .describe("true면 내용·결과 전문. 기본은 앞 200자");
export const badDay = "날짜는 YYYY-MM-DD 형식이어야 합니다.";
export type Ctx = { db: Db; owner: string; now: () => number };
export const currentTask = ({ db, owner }: Ctx) =>
  db
    .prepare("SELECT * FROM tasks WHERE owner=? AND status<>'done' ORDER BY created DESC")
    .bind(owner)
    .first<TaskRow>();
export const taskById = ({ db, owner }: Ctx, id: string) =>
  db.prepare("SELECT * FROM tasks WHERE id=? AND owner=?").bind(id, owner).first<TaskRow>();
