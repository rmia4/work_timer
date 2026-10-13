# Work Timer 크롬 확장 (팝업)

툴바 팝업에서 진행 중인 작업을 보고 일시정지·다시 시작·종료하거나, 제목만 입력해 새 작업을 바로 시작합니다.
빌드 단계 없이 이 폴더를 그대로 크롬에 불러옵니다.

## 설치 (개발용)

1. 웹앱을 실행합니다(`pnpm dev`, 기본 `http://localhost:3000`).
2. 크롬에서 `chrome://extensions`를 열고 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 눌러 이 `extension/` 폴더를 고릅니다.
4. 카드에 표시된 확장 ID를 웹앱 `.env.local`에 넣고 서버를 다시 시작합니다.

   ```
   EXTENSION_ORIGIN="chrome-extension://<확장 ID>"
   ```

5. 브라우저에서 웹앱에 로그인한 뒤 팝업을 엽니다. 팝업은 사이트 로그인 쿠키를 그대로 씁니다.

## 다른 서버에 연결

`config.js`의 `APP_ORIGIN`과 `manifest.json`의 `host_permissions`를 같은 주소로 바꾸고, 그 서버의 `EXTENSION_ORIGIN`에 확장 ID를 설정합니다.
확장 ID는 폴더 경로가 같으면 유지됩니다.
