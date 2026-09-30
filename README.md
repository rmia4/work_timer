# Work Timer · 업무 기록

개인용 한국어 업무 일지와 서버 기반 스톱워치입니다. Next.js, React, TypeScript와 Neon PostgreSQL을 사용합니다.

## 주요 기능

- 날짜별 업무 제목, 내용, 결과, 목표 시간과 소요 시간 기록
- 작업 시작, 일시정지, 재개, 종료 및 수동 시간 입력
- 최초 시작 시각과 최종 종료 시각 표시(한국 시간)
- 완료 기록 수정, 삭제 및 저장된 기록부터 타이머 재개
- 월별 캘린더를 통한 날짜 이동과 일별 작업 수·시간 확인
- 이전 날짜, 오늘, 다음 날짜 이동과 선택 날짜의 요일 표시
- 완료 작업의 총시간과 기록 수 요약
- 전역 메모와 날짜별 메모 생성, 자동 저장, 삭제
- 선택 날짜의 활동을 보여주는 24시간 원형 시계
  - 업무 시작·종료 구간을 파스텔 색상 원호로 표시
  - 가까운 시간대의 업무를 안쪽 트랙에 교차 배치
  - 3시간 간격 눈금과 현재 시각 바늘 표시
  - 원호에 커서 또는 키보드 초점을 두면 업무명과 시간 표시
- 800px 이하 화면에서 타이머를 첫 행에, 요약과 활동 시계를 둘째 행에 배치
- 10초 간격 및 화면 복귀 시 서버 기록 동기화
- 버전 비교 업데이트를 통한 여러 기기의 중복 조작 방지
- 사용자당 진행 또는 일시정지 작업 한 개를 DB 고유 인덱스로 보장

## 인증

- 사용자별 개인 코드로 회원가입 및 로그인
- 접속 코드 해시는 `users.access_code_hash`에 PBKDF2 형식으로 저장
- 같은 IP에서는 24시간에 한 계정만 가입 가능
- 세션은 `code_sessions` 테이블과 `__Host-work_session` 쿠키로 관리
- 로그인 성공 후 7일간 유지되는 HttpOnly·Secure·SameSite 세션 사용
- 연속 5회 로그인 실패 시 15분 차단하며, 이후 반복 실패 시 차단 시간 증가
- 상태 변경 API는 요청 Origin과 `APP_ORIGIN`이 일치하는지 확인
- 인증되지 않은 사용자의 업무·메모 API 접근 차단

## 로컬 실행

Node.js 22.13 이상과 `package.json`에 선언된 pnpm 버전을 사용합니다.

1. 의존성을 설치합니다.

   ```powershell
   pnpm install --frozen-lockfile
   ```

2. `.env.local`에 Neon 연결 정보와 로컬 Origin을 설정합니다.

   ```env
   DATABASE_URL_POOLED="Neon pooler connection string"
   APP_ORIGIN="http://localhost:3000"
   ACCESS_CODE_SECRET="32자 이상의 임의 문자열"
   ```

   DB 연결 변수는 `DATABASE_URL_POOLED`, `DATABASE_URL`, `CONNECTION_STRING` 순서로 사용합니다. 비밀값이 포함된 `.env.local`은 Git에 커밋하지 않습니다.

3. 개발 서버를 실행합니다.

   ```powershell
   pnpm dev
   ```

4. 브라우저에서 `http://localhost:3000`을 엽니다.

로컬 환경도 지정한 Neon DB를 직접 사용합니다. 로컬에서 업무나 메모를 수정하면 연결된 DB에 반영됩니다.

## 새 Neon DB 준비

빈 Neon DB를 처음 준비할 때만 직접 연결 URL을 `DATABASE_URL`에 설정한 뒤 스키마를 적용합니다.

```powershell
pnpm db:neon:apply
```

`drizzle-neon/0000_initial.sql`은 빈 데이터베이스용입니다. 기존 Work Timer 테이블과 데이터가 있는 DB에는 적용하지 않습니다.

## 검사

```powershell
pnpm build
node --test tests/code-auth.test.mjs
```

프로덕션 빌드는 TypeScript 검사와 페이지 생성을 함께 수행합니다.

## 배포

배포 환경에는 최소 다음 변수를 설정합니다.

```env
DATABASE_URL_POOLED="Neon pooler connection string"
APP_ORIGIN="https://your-domain.example"
ACCESS_CODE_SECRET="32자 이상의 임의 문자열"
```

`APP_ORIGIN`은 실제 HTTPS Origin과 정확히 일치해야 하며 마지막에 `/`를 붙이지 않습니다. `ACCESS_CODE_SECRET`은 배포 후에도 같은 값을 유지해야 합니다. Vercel 배포는 저장소 관리자가 직접 수행합니다.

## 동작 범위

- 오프라인 작성은 지원하지 않습니다.
- 저장에 실패하면 입력값을 유지하고 오류를 표시합니다.
- 시작·종료 시각이 없는 기존 기록은 해당 값을 `미기록`으로 표시하며 24시간 활동 시계의 원호에서는 제외합니다.
- 작업 시간과 시작·종료 시각의 차이는 일시정지 또는 수동 보정 때문에 다를 수 있습니다.
- 자정을 넘기는 작업의 합계는 업무 기록 날짜에 귀속되며 자동 분할하지 않습니다.
- 진행 중인 작업은 선택 날짜의 기록과 함께 조회될 수 있습니다.

## 향후 수정

- **24시간 활동 시계 막대 계산 수정:** 시작 시각부터 종료 시각까지 단순 계산하면 타이머를 수정한 뒤 재시작할 때 실제 작업 시간보다 막대가 길어질 수 있습니다. 일시정지 시간을 제외하고 실제 작업 구간을 반영하도록 개선합니다.
- **통계 페이지:** 주간·월간 통계를 제공하고, 기간별 작업 수와 총 작업 시간을 그래프로 표시합니다. 주간 총 작업 시간 그래프와 목표 시간 달성 여부도 포함합니다.
- **기록 삭제 기능 보완:** 기존 기록 삭제 기능을 점검하고 사용 흐름을 보완합니다.
