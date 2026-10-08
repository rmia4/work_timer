// 작업공간 화면 레이아웃. 설정 > 화면에서 계정별로 선택한다.
export const LAYOUTS = [
  { id: "default", name: "기본", description: "지금까지 쓰던 화면" },
  { id: "minimal", name: "미니멀", description: "한 열로 집중 · 새 작업은 빠른 입력줄" },
  { id: "dashboard", name: "대시보드", description: "메인 + 사이드바 · 새 작업은 팝업" },
  { id: "sidebar", name: "사이드바", description: "캘린더 상시 표시 · 새 작업은 일지 맨 위" },
  { id: "tabs", name: "탭", description: "오늘 / 업무 일지 / 메모 나눠 보기 · 새 작업은 서랍" },
  { id: "focus", name: "집중", description: "큰 타이머와 타임라인 · 새 작업은 명령 팔레트(N)" },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];
export const DEFAULT_LAYOUT: LayoutId = "default";

export function isLayoutId(value: unknown): value is LayoutId {
  return LAYOUTS.some((layout) => layout.id === value);
}
