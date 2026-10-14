# 프로젝트 지침

기본 작업 지침은 [AGENTS.md](AGENTS.md)를 따른다.

## 브랜치 병합 규칙

- 작업 브랜치는 `main`이 아니라 `dev`에 먼저 병합한다.
- `main` ← `dev` 병합은 사용자가 요청했을 때에만 한다. 요청 없이 `main`에 직접 병합하거나 `dev`를 병합하지 않는다.
- 크롬 확장(`extension/`) 작업은 `extensions/main`·`extensions/dev` 줄기에서 같은 규칙으로 한다. 작업 브랜치 `extensions/<작업명>` → `extensions/dev` PR, `extensions/main` 병합은 요청 시에만. 서버(API) 수정은 웹앱 `dev`로 따로 PR한다.
