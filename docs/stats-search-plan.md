# 통계 > 검색 기능 계획 (v2, Codex 검토 반영)

작성일: 2026-10-29. 이전 토의 기록(`discussions/20261026-1652_search`)은 참고하지 않고 현재 코드에서 새로 세운 계획이다.
Codex 검토(결론: 수정 후 승인)의 지적 8개와 결정 의견 4개를 반영했다. 반영 내역은 8절.

## 1. 목표

통계 다이얼로그에 「검색」 탭을 추가한다. 사용자가 고른 기간 안에서, 본인이 기록한 작업의 **제목·내용(note)·결과(result)**를 키워드로 찾는다.

성공 기준
- 기간과 키워드를 넣고 검색하면 그 기간의 본인 작업 중 세 필드 중 하나라도 키워드를 포함하는 작업이 최근 순으로 나온다.
- 한국어 1글자 검색어도 부분 일치로 찾는다(예: "회의" → "주간 회의록 정리").
- 대소문자 무시는 **ASCII 영문에 한해 보장**한다. SQLite `LOWER`는 ASCII만, Postgres `LOWER`는 비ASCII까지 소문자로 바꾸므로 `ÉCOLE`/`école` 같은 경우는 DB에 따라 결과가 다를 수 있다(한국어에는 대소문자가 없어 영향 없음).
- 결과를 누르면 다이얼로그가 닫히고 메인 화면이 그 날짜로 이동한다.
- 다른 사용자의 기록, 기간 밖 기록은 나오지 않는다.

범위 밖: 메모(전역·일별) 검색, 전체 기간 검색, 여러 단어 AND/OR, 상태 필터, 검색어 저장, 자동 검색(디바운스), 페이지네이션, 전문 검색 인덱스.

## 2. 현재 구조에서 확인한 사실

- `app/_components/stats-dialog.tsx`: `sections` 배열(summary·week·month·export) + `section` 상태로 탭을 그린다. 탭을 바꾸면 해당 뷰가 다시 마운트된다. `ExportView`가 `type="date"` 두 개로 기간을 받고 `invalid`(빈 값, from>to, 366일 초과)면 버튼을 막는다.
- `StatsDialog`는 `DailyActivityClock`(`daily-activity-clock.tsx:189-196`)에서만 렌더되고, 그 시계는 5개 레이아웃(default·dashboard·minimal·sidebar·tabs)에서 `tasks/day/now`만 받는다. `login-preview`는 `preview`라 `StatsDialog`를 그리지 않는다.
- 날짜 이동은 `use-workspace.ts:93`의 `chooseDay(value)`가 담당한다(레이아웃에서 `ws.chooseDay`로 접근).
- API 패턴: `app/api/stats/route.ts` — `getCodeUser` → 401, `validRange(from,to,N)` → 400, DB 오류 → 503, `Cache-Control: no-store`. 단 `getCodeUser`(`app/_auth/code-auth.ts:5`)도 DB를 조회하는데 기존 라우트에서는 `try` 밖에 있다.
- `lib/task-service.ts`: "웹 API와 MCP가 같은 규칙을 쓰도록" 작업 SQL을 모은 곳. `dayTotals`·`exportRows`가 기간 조회와 진행 중 작업 시간 계산(`elapsed+CASE WHEN started IS NULL THEN 0 ELSE MAX(0,?-started) END`)을 이미 한다.
- `db/raw.ts`: Postgres용으로 `?`→`$n`, `MAX(0,$n-started)`→`GREATEST(...)`만 바꾼다. 따라서 SQL은 SQLite와 Postgres 양쪽에서 그대로 도는 문법만 써야 한다(`ILIKE` 불가).
- `lib/mcp.ts:41-42`에 `likePattern`(소문자화 + `\ % _` 이스케이프)과 `likeAny`(`LOWER(col) LIKE ? ESCAPE '\'`를 OR로 묶음)가 이미 있고 MCP 작업·메모 검색이 쓴다. `tests/mcp.test.mjs`에 검증이 있다.
- 인덱스: 기간 검색에 쓸 수 있는 것은 `tasks_owner_day (owner, day)`다(그 밖에 `tasks_one_active` 유니크 인덱스가 있다). note·result는 최대 2만 자다.
- 테스트: `node --test tests/*.test.mjs`. `tests/data-api.test.mjs`·`tests/mcp.test.mjs`는 TS를 transpile하면서 **import 문을 지우고 필요한 이름을 `globalThis` fixture로 직접 주입**한다(`mcp.test.mjs:31-36`). 함수를 다른 파일로 옮기면 주입 목록도 고쳐야 한다. `tests/raw.test.mjs`가 Postgres SQL 변환을 검증한다.

## 3. 설계

### 3.1 서버: `searchTasks` (lib/task-service.ts)

```ts
// 기간 안의 본인 작업 중 제목·내용·결과에 검색어가 들어간 것을 최근 순으로 limit+1건까지 돌려준다.
export async function searchTasks(db, owner, query, from, to, now, limit)
```

- SQL
  ```sql
  SELECT id,day,title,note,result,status,
         elapsed+CASE WHEN started IS NULL THEN 0 ELSE MAX(0,?-started) END AS elapsed
  FROM tasks
  WHERE owner=? AND day>=? AND day<=? AND (LOWER(title) LIKE ? ESCAPE '\' OR LOWER(note) LIKE ? ESCAPE '\' OR LOWER(result) LIKE ? ESCAPE '\')
  ORDER BY day DESC, created DESC
  LIMIT ?
  ```
- `likePattern`·`likeAny` 두 함수만 `lib/mcp.ts`에서 새 작은 모듈 `lib/like-search.ts`로 옮겨 export하고, `lib/mcp.ts`는 import만 바꾼다(동작 변화 없음). 작업·전역 메모·일별 메모 검색이 이미 함께 쓰므로 작업 서비스보다 공통 모듈이 맞고, 웹 라우트가 MCP SDK가 딸린 `lib/mcp.ts`를 import하지 않게 된다. MCP의 `excerpt`·`searchResults`는 응답 형태가 달라 옮기지 않는다.
- note·result 전문은 응답에 넣지 않는다. 서버에서 행마다 아래를 만든 뒤 note·result를 버린다.
  - `field`: 제목에서 일치하면 `"title"`, 아니면 `"note"`, 아니면 `"result"`(이 우선순위로 첫 일치)
  - `snippet`: field가 note·result면 일치 위치 앞뒤 40자를 잘라 앞뒤가 잘렸으면 `…`를 붙인다. title이면 `null`.
  - **일치 위치는 원문 기준으로 찾는다.** `toLowerCase()`는 `İ`처럼 길이가 바뀌는 문자가 있어 소문자 문자열의 위치로 원문을 자르면 발췌가 어긋나거나 빈 문자열이 된다. 그래서 SQL과 같은 규칙인 **ASCII 영문만 대소문자 무시**하는 비교 함수(`A-Z`만 `a-z`로 바꾼 사본은 길이가 원문과 같다)로 위치를 찾는다. 이 함수 `findMatch(text, query) → index | -1`을 `lib/like-search.ts`에 두고 서버 발췌와 클라이언트 강조가 함께 쓴다.
  - Postgres `LOWER`는 비ASCII도 소문자로 바꾸므로 SQL은 일치했는데 `findMatch`는 못 찾는 행이 있을 수 있다. 이때는 `field`·`snippet`을 `null`로 두고 UI는 제목만 보여 준다.

### 3.2 API: `GET /api/tasks/search?q=&from=&to=` (app/api/tasks/search/route.ts)

- 응답은 모두 `Cache-Control: no-store`. 세션 없음 401, DB 오류 503. **`getCodeUser` 호출부터 `try` 안에 넣어** 인증 조회 중 DB 예외도 503 JSON으로 응답한다(기존 라우트는 고치지 않는다).
- `q`: trim 후 1~100자, 아니면 400 「검색어를 확인해 주세요.」
- `from`·`to`: `validRange(from,to,366)`, 아니면 400 「기간을 확인해 주세요.」 (같은 다이얼로그의 내보내기와 같은 366일)
- 결과는 최대 50건. 51건을 조회해 50건 이하면 `more: false`, 51건이면 앞 50건과 `more: true`.
- 응답: `{ results: [{ id, day, title, status, elapsed, field, snippet }], more }`
- 페이지네이션은 넣지 않는다. `more`면 UI가 「최신 50건만 표시합니다. 기간을 좁히거나 검색어를 구체적으로 입력해 주세요.」를 보여 준다.

### 3.3 UI: `SearchView` (stats-dialog.tsx)

- `Section` 타입에 `"search"`를 추가하고, `sections`에 `{ id: "search", label: "검색" }`을 마지막에 추가한다. `DialogDescription`(sr-only) 문구를 「작업 기록 통계, 기록 검색과 데이터 내보내기」로 바꾼다.
- 입력: `<form>` 안에 검색어 `<input type="search" maxLength={100}>`, 기간 date 두 개, 「검색」 버튼. Enter로 제출. 기본 기간은 `anchor`(메인 화면 날짜) 기준 **최근 90일**(`addDays(anchor,-89)`~`anchor`).
- 검증: 빈 검색어 또는 기간이 잘못되면 버튼 비활성화, 기간 오류 문구는 `ExportView`와 같은 형식(최대 366일).
- **편집 중 입력과 제출한 조건을 분리한다.** 입력칸 상태(`query/from/to`)와 별도로, 제출 시점의 `{ q, from, to }`를 `submitted`로 저장한다. 결과·강조·`more` 안내는 `submitted` 기준으로만 그린다. 결과를 받은 뒤 입력칸을 고쳐도 화면의 결과와 강조는 바뀌지 않는다.
- 상태: 검색 전(안내 없음) / 검색 중 「검색 중…」 / 결과 없음 「일치하는 기록이 없습니다.」 / 오류 `stats-error`. 요청마다 번호를 올리고, **성공·오류·로딩 종료 모두** 응답의 번호가 최신일 때만 반영한다(이전 요청의 `catch`·`finally`가 최신 상태를 덮지 않게).
- 결과 행(버튼): `2026.10.29 (목)` · 제목 · 소요 시간(`hoursLabel`). 요일은 기존 `weekdayIndex`로 구한다. 진행 중·일시정지면 상태 표시. `snippet`이 있으면 「내용」/「결과」 라벨과 발췌 한 줄.
- 강조: 제목·발췌에서 `findMatch`(원문 기준, ASCII 대소문자 무시)로 찾은 위치를 `<mark>`로 감싼다. `dangerouslySetInnerHTML`은 쓰지 않는다.
- 클릭: `onSelectDay(day)` 호출 후 다이얼로그 닫기.
- 탭을 떠났다 돌아오면 검색 상태는 초기화된다(기존 탭들과 같은 재마운트 동작).
- 스타일: `app/_styles/stats.css`에 결과 목록·`mark` 스타일 소량 추가, `dark.css`에 필요하면 다크 색만 추가.

### 3.4 날짜 이동 연결

- `StatsDialog`에 `onSelectDay?: (day: string) => void` prop 추가 → `SearchView`에 전달. 없으면 결과 행을 클릭 불가한 일반 행으로 그린다.
- `DailyActivityClock`에 같은 optional prop을 추가해 `StatsDialog`로 넘긴다.
- 5개 레이아웃의 `<DailyActivityClock … />`에 `onSelectDay={ws.chooseDay}`를 추가한다(각 1줄).

## 4. 성능

- 기간 필수 + 최대 366일 + `(owner, day)` 인덱스로 후보를 본인·기간으로 좁힌다. LIKE `%…%`는 인덱스를 못 쓰므로 후보 행을 모두 비교한다. `LIMIT 51`은 반환 행만 제한하고 후보 비교·정렬 비용은 제한하지 않는다.
- **가정**(코드상 제한 아님): 하루 10건이면 1년 약 3,650행이다. 이 수준이면 인덱스·마이그레이션 없이 충분하다고 보고 시작한다.
- 응답 크기 상한(문자 수): 50건 × (제목 최대 200자 + 발췌 최대 약 182자 = 앞뒤 40자 + 검색어 최대 100자 + 생략 부호 2개). JSON 이스케이프와 UTF-8 바이트는 이보다 크다. DB에서 서버로는 전문을 읽는다(행당 최대 4만 자).
- 느려지면 측정 후 pg_trgm 식 인덱스를 검토한다(이번 범위 아님).

## 5. 변경 파일

| 파일 | 변경 |
|---|---|
| `lib/like-search.ts` (새 파일) | `likePattern`·`likeAny`(mcp.ts에서 이동), `findMatch` |
| `lib/task-service.ts` | `searchTasks`, 발췌 생성 |
| `lib/mcp.ts` | 두 보조 함수를 import로 교체 |
| `app/api/tasks/search/route.ts` | 새 라우트 |
| `app/_components/stats-dialog.tsx` | `Section` 타입·`sections`·설명 문구, `SearchView`, `onSelectDay` prop |
| `app/_components/daily-activity-clock.tsx` | `onSelectDay` prop 전달 |
| `app/_components/layouts/*-layout.tsx` (5개) | `onSelectDay={ws.chooseDay}` |
| `app/_styles/stats.css` (+필요시 `dark.css`) | 결과 목록·강조 스타일 |
| `tests/mcp.test.mjs` | `lib/like-search.ts` 로드 추가, `lib/mcp.ts`·`lib/task-service.ts` 주입 목록에 `likePattern`·`likeAny` 추가(기존 검색 assertion 유지) |
| 새 `tests/search.test.mjs` | 아래 테스트. Postgres 변환은 `searchTasks`가 실제로 만든 SQL을 `postgresSql`에 넣어 검증한다(`raw.test.mjs`에 같은 SQL을 복사해 두지 않기 위해) |

## 6. 검증

자동 테스트(sqlite 어댑터)
1. 제목·내용·결과 각각에서 한국어 부분 일치로 찾고 `field`가 맞다.
2. 다른 owner, 기간 밖 기록은 빠진다.
3. `%`, `_`, `\`를 글자 그대로 찾는다. ASCII 영문 대소문자를 구분하지 않는다.
4. 정렬이 `day DESC, created DESC`다.
5. 정확히 50건이면 50건 + `more: false`, 51건이면 50건 + `more: true`.
6. 응답에 note·result 전문이 없고 snippet이 40자 반경으로 잘린다(앞·중간·끝 일치).
7. `findMatch`·발췌: 비ASCII 문자와 소문자화 시 길이가 바뀌는 문자(`İ` 여러 개 뒤의 검색어)에서도 원문 위치로 정확히 자르고 빈 발췌가 나오지 않는다.
8. 라우트: 401, 인증 조회 DB 예외 503, 검색 DB 예외 503, 모든 응답 `no-store`. q 빈 값·101자 400, from/to 누락·형식 오류·from>to·367일 400.
9. 라우트: `URLSearchParams`로 만든 쿼리에서 `+`, `&`, `#`, `%`, `\`가 든 검색어가 그대로 전달된다.
10. `raw.test.mjs`: 검색 SQL이 Postgres용으로 바르게 변환된다.
11. 기존 `tests/mcp.test.mjs` 검색 테스트가 주입 목록 갱신 후 그대로 통과(보조 함수 이동 회귀).
12. (클라이언트 로직을 순수 함수로 뺀다면) 역순 응답: 먼저 보낸 요청이 늦게 와도 최신 결과·오류·로딩 상태를 덮지 않는다. 순수 함수로 빼지 않으면 QA 항목으로 넘긴다.

실제 Postgres 실행은 자동 테스트하지 않는다(변환 결과만 검증).

마무리: `pnpm test`, `pnpm lint`, `pnpm build` 각 1회.

QA 필요(구현 보고에 기재): 검색·결과 없음·오류 표시, `<mark>` 강조, 검색 후 입력칸을 고쳐도 결과·강조가 그대로인지, 결과 클릭 시 5개 레이아웃 각각에서 날짜 이동, 모바일 폭에서 탭·결과 목록 배치, 다크 모드, 실제 Postgres(배포 환경)에서 검색 동작.

## 7. 결정 사항 (Codex 의견 반영)

1. **결과 50건 + `more` 안내, 페이지네이션 없음.** 같은 날 같은 키워드가 50건을 넘으면 다 볼 수 없으므로 안내에 「최신 50건만 표시」를 밝힌다.
2. **기본 기간은 선택 날짜 기준 최근 90일.** 기존 통계 탭들도 선택 날짜 기준으로 초기화한다.
3. **최대 기간 366일.** 같은 기간 입력 UI인 내보내기와 맞춘다. 371일은 통계의 53주 격자 맥락이라 검색에 맞출 필요가 없다.
4. **보조 함수는 별도 모듈 `lib/like-search.ts`.** 두 함수와 `findMatch`만 두고, MCP 발췌·응답 처리는 통합하지 않는다.

## 8. Codex 검토 반영 내역

| # | 지적 | 반영 |
|---|---|---|
| 1 | SQL과 JS 일치 판정이 다르고, `toLowerCase` 위치로 원문을 자르면 발췌가 어긋남 | 대소문자 무시를 ASCII로 한정해 명시, 원문 기준 `findMatch` 도입, 검증 7 추가 |
| 2 | 테스트 로더가 import를 지우고 주입하므로 함수 이동 시 MCP 테스트가 깨짐 | 변경 파일에 `tests/mcp.test.mjs` 주입 목록 갱신 추가 |
| 3 | 요청 번호만으로는 입력 수정·역순 응답 경쟁을 못 막음 | 입력과 `submitted` 조건 분리, 성공·오류·로딩 종료 모두 번호로 보호 |
| 4 | `getCodeUser`가 `try` 밖이면 인증 DB 오류가 503이 아님 | 새 라우트는 인증부터 `try` 안에 둠 |
| 5 | SQLite 테스트로 Postgres 변환은 검증되지 않음 | `raw.test.mjs`에 변환 검증, 라우트 특수문자 전달·503·`no-store` 검증 추가 |
| 6 | 발췌 크기 추정 오류(최대 약 182자), 성능 수치는 가정 | 크기 정정, 가정으로 표시, LIMIT의 한계 명시 |
| 7 | 인덱스·90일/3개월·요일·50/51 경계 표현 | 모두 정정 |
| 8 | `Section` 타입과 다이얼로그 설명 갱신 누락 | 3.3과 변경 파일에 추가 |
