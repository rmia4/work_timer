// 1분마다 오늘 기록과 메모장을 받아 캐시를 갱신한다. 팝업은 이 캐시를 먼저 보여 준다.
import { call } from "./api.js";
import { MEMOS, TASKS, clearCache, writeCache } from "./cache.js";
import { today } from "./dates.js";

const ALARM = "refresh";

async function refresh() {
  try {
    const day = today();
    const [tasks, memos] = await Promise.all([call(`/api/tasks?day=${day}`), call("/api/memos")]);
    // 로그아웃 상태면 이전 계정의 캐시를 남기지 않는다.
    if (tasks.status === 401 || memos.status === 401) return clearCache();
    if (tasks.ok) await writeCache(TASKS, { day, tasks: tasks.data.tasks, offset: tasks.data.now - Date.now() });
    if (memos.ok && memos.data.memos) await writeCache(MEMOS, memos.data.memos);
  } catch {
    // 네트워크 오류는 다음 알람에 다시 시도한다.
  }
}

function start() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  refresh();
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) refresh();
});
