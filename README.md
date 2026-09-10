# Work Timer · 업무 기록

개인용 한국어 업무 일지와 서버 기반 스톱워치입니다. React / TypeScript / Vinext와 Cloudflare D1을 사용합니다.

## 기능

- 날짜별 업무 제목·내용·소요 시간 작성, 수정, 삭제
- 시작, 일시정지, 재개, 종료. 시작 시각과 누적 밀리초를 서버에 저장
- 사용자당 진행 또는 일시정지 작업 1개를 DB 고유 인덱스로 보장
- 버전 비교 업데이트로 여러 기기에서의 중복 조작 방지
- 화면 복귀 및 10초 간격 동기화, 서버 시간 보정
- 한국 날짜 기준. 자정을 넘기는 작업은 시작 날짜에 전체 시간 합산
- ChatGPT 로그인과 Sites 소유자 전용 접근 정책, API별 사용자 소유권 검사

## 실행 및 검사

Node 22.13 이상과 package.json에 선언된 pnpm 버전을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm run db:generate
pnpm run build
pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0000_wide_starjammers.sql
pnpm run dev
pnpm exec tsc --noEmit
node --test tests/timer-db.test.mjs
```

로컬 DB에는 미적용 마이그레이션만 순서대로 적용합니다. 서버 실행은 개발용이며 배포가 아닙니다. 환경별 실행 프로필은 Sites 설정 도구가 관리합니다. portable 개발 환경은 로컬 테스트 로그인을 제공하고 managed 환경은 실제 플랫폼 인증을 사용합니다.

## 배포

Sites에서 비공개 배포합니다. `.openai/hosting.json`은 배포 프로젝트와 논리 DB 바인딩을 지정합니다. Sites가 실제 DB, 인증, HTTPS, 운영 마이그레이션 적용을 관리합니다. 소스를 커밋·푸시하고 빌드 산출물을 패키징하여 버전 저장 후 비공개 배포합니다. GitHub에는 소스와 변경 이력을 보관하며 사용자 업무 데이터는 포함하지 않습니다.

별도 API 키나 DB 비밀번호는 필요하지 않습니다. 환경변수·비밀정보를 Git에 커밋하지 않습니다. 다른 호스팅으로 이전할 경우 D1 바인딩과 신뢰할 수 있는 인증 프록시를 대체해야 하며, 외부가 보낸 인증 헤더를 직접 신뢰해서는 안 됩니다.

## 제한

오프라인 작성은 지원하지 않습니다. 저장 실패 시 입력을 유지하고 오류를 표시합니다. WebMCP 지원 브라우저에는 날짜별 기록 조회 도구를 등록하며, 일반 브라우저에서도 전체 UI를 사용할 수 있습니다.
