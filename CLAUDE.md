# 프로젝트 지침

기본 작업 지침은 [AGENTS.md](AGENTS.md)를 따른다.

## 브랜치 병합 규칙

- 작업 브랜치는 `main`이 아니라 `dev`에 먼저 병합한다.
- `dev` 병합은 직접 `git merge`하지 않고 PR로 한다. 작업 브랜치를 push한 뒤 `dev`를 대상으로 PR을 만들고, 설명란에 변경 요약·이유·검증 결과를 적는다. 병합 후 작업 브랜치는 삭제한다.
- `main` ← `dev` 병합은 사용자가 요청했을 때에만 한다. 요청 없이 `main`에 직접 병합하거나 `dev`를 병합하지 않는다.
- `main` ← `dev` PR을 만들기 전에 `README.md`가 `dev`에 쌓인 변경(`git log origin/main..origin/dev`)을 반영하는지 확인한다. 빠진 기능·동작·설치 방법이 있으면 README 최신화 브랜치를 만들어 `dev`에 먼저 PR로 병합한 뒤 `main` PR을 만든다. `main` PR 설명란에는 README를 확인·갱신했는지 적는다.
