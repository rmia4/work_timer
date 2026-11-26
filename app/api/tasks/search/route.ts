import { getCodeUser } from "@/server/auth/code-auth";
import { database } from "@/server/db/raw";
import { validRange } from "@/shared/stats";
import { searchRecords, SEARCH_SCOPES, type SearchScope } from "@/server/tasks/task-service";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
// 통계 > 검색(업무 기록·일일메모). 인증 조회도 DB를 쓰므로 그 오류까지 503으로 응답한다.
export async function GET(req: Request) {
  try {
    const user = await getCodeUser(req);
    if (!user) return reply({ error: "로그인이 필요합니다." }, 401);
    const params = new URL(req.url).searchParams,
      q = (params.get("q") ?? "").trim(),
      from = params.get("from"),
      to = params.get("to"),
      scope = params.get("scope") ?? "task",
      offset = params.get("offset") ?? "0";
    if (!q || q.length > 100) return reply({ error: "검색어를 확인해 주세요." }, 400);
    if (!validRange(from, to, 366)) return reply({ error: "기간을 확인해 주세요." }, 400);
    // 검색 대상: 전부·기록·메모. 생략하면 이전과 같이 기록만 찾는다.
    if (!(SEARCH_SCOPES as readonly string[]).includes(scope))
      return reply({ error: "검색 대상을 확인해 주세요." }, 400);
    // 「더 보기」로 이어 받을 위치. 0 이상 정수만 받는다.
    if (!/^\d{1,6}$/.test(offset)) return reply({ error: "요청을 확인해 주세요." }, 400);
    return reply(
      await searchRecords(
        database(),
        user.userId,
        q,
        from,
        to as string,
        scope as SearchScope,
        Number(offset),
        Date.now(),
      ),
    );
  } catch (e) {
    console.error(e);
    return reply({ error: "검색하지 못했습니다. 다시 시도해 주세요." }, 503);
  }
}
