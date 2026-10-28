// 팝업을 빨리 열기 위해 마지막으로 받은 오늘 기록과 메모장을 chrome.storage에 둔다.
// 팝업과 service worker(background.js)가 함께 쓰고, 로그아웃하면 지운다.
export const TASKS = "tasks-cache"; // { day, tasks, offset }
export const MEMOS = "memos-cache"; // 메모장 메모 목록

export const readCache = () => chrome.storage.local.get([TASKS, MEMOS]);
export const writeCache = (key, value) => chrome.storage.local.set({ [key]: value });
export const clearCache = (...keys) => chrome.storage.local.remove(keys.length ? keys : [TASKS, MEMOS]);
