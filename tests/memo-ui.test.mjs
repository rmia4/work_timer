import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('memo boards support global and date-specific notes with the same editor',()=>{
 const component=read('app/_components/memo-board.tsx');
 const workspace=read('app/_components/workspace.tsx');
 const styles=read('app/_styles/memo-board.css');
 const activityClock=read('app/_components/daily-activity-clock.tsx');
 const activityStyles=read('app/_styles/daily-activity-clock.css');
 assert.match(workspace,/<MemoBoard\/>/);
 assert.match(workspace,/<MemoBoard key=\{day\} day=\{day\}\/>/);
 assert.match(component,/day\?:string/);
 assert.match(component,/\/api\/daily-memos/);
 assert.match(styles,/\.left-panels\{display:flex;flex-direction:column;gap:24px\}/);
 assert.match(component,/className="memo-title"/);
 assert.match(component,/className="memo-body"/);
 assert.match(component,/scrollHeight/);
 assert.match(component,/setTimeout\(\(\)=>void save\(\),700\)/);
 assert.match(styles,/\.memo-title\{font-size:18px/);
 assert.match(styles,/\.memo-body\{font-size:16px/);
 assert.match(styles,/main\{max-width:calc\(\(100vw \+ 1540px\)\/2\);margin-left:auto;margin-right:auto\}/);
 assert.match(styles,/grid-template-columns:360px minmax\(0,clamp\(500px,calc\(80vw - 620\.8px\),611\.2px\)\) minmax\(400px,1fr\)/);
 assert.match(styles,/@media\(max-width:1360px\)/);
 assert.match(workspace,/<DailyActivityClock tasks=\{daily\} day=\{day\} now=\{now \+ offset\} \/>/);
 assert.match(activityClock,/className="day-timeline-panel"/);
 assert.match(activityStyles,/\.day-timeline-panel/);
});

test('workspace removes intro copy and keeps only the Korean brand name',()=>{
 const workspace=read('app/_components/workspace.tsx');
 const styles=read('app/_styles/memo-board.css');
 assert.doesNotMatch(workspace,/DAILY WORKSPACE/);
 assert.doesNotMatch(workspace,/하루의 일을 기록하세요\./);
 assert.match(workspace,/<div className="brand"><strong>업무 기록<\/strong><\/div>/);
 assert.doesNotMatch(workspace,/<div className="brand"><Clock3/);
 assert.doesNotMatch(workspace,/<span>WORK TIMER<\/span>/);
 assert.match(workspace,/className="heading heading-controls"/);
 assert.match(styles,/\.heading\.heading-controls\{justify-content:flex-end\}/);
});

test('summary shows the selected date and owns the today action',()=>{
 const workspace=read('app/_components/workspace.tsx');
 const styles=read('app/_styles/workspace.css');
 assert.doesNotMatch(workspace,/선택한 날짜의 기록/);
 assert.doesNotMatch(workspace,/<label htmlFor="day">기록 날짜<\/label>/);
 assert.doesNotMatch(workspace,/<input id="day"/);
 assert.match(workspace,/<p className="summary-date">\{day\}<\/p>/);
 assert.match(workspace,/className="summary-today" onClick=\{\(\)=>chooseDay\(today\(\)\)\}>오늘/);
 assert.match(styles,/\.summary-date\{font-size:36px/);
 assert.match(styles,/\.summary-today\{position:absolute;top:20px;right:20px\}/);
});

test('timer target and record clock text use the requested size and time-only format',()=>{
 const workspace=read('app/_components/workspace.tsx');
 const styles=read('app/_styles/memo-board.css');
 assert.match(workspace,/<dd>\{timeLabel\(t\.started_at\)\}<\/dd>/);
 assert.match(workspace,/timeLabel\(t\.ended_at\)/);
 assert.match(styles,/\.target-time\{font-size:21px\}/);
 assert.match(styles,/\.task-times\{font-size:15px\}/);
});

test('activity clock tooltip shows the timer-recorded duration',()=>{
 const activityClock=read('app/_components/daily-activity-clock.tsx');
 assert.match(activityClock,/task\.elapsed \+ \(task\.started === null \? 0 : Math\.max\(0, now - task\.started\)\)/);
 assert.match(activityClock,/durationLabel\(recordedDuration\(tooltip\.segment, now\)\)/);
 assert.doesNotMatch(activityClock,/durationLabel\(tooltip\.segment\.end - tooltip\.segment\.start\)/);
});

test('memo title starts at the top of each card',()=>{
 const styles=read('app/_styles/memo-board.css');
 assert.match(styles,/\.memo-card-actions\{[^}]*position:absolute/);
 assert.match(styles,/\.memo-title\{[^}]*padding-right:/);
});

test('new memo button is placed at the bottom right of the memo area',()=>{
 const component=read('app/_components/memo-board.tsx');
 const styles=read('app/_styles/memo-board.css');
 assert.ok(component.indexOf('className="memo-add"')>component.indexOf('memos.map'));
 assert.match(styles,/\.memo-add\{[^}]*width:fit-content[^}]*margin-left:auto/);
});

test('record target time and work tabs use neutral gray styling',()=>{
 const workspaceStyles=read('app/_styles/memo-board.css');
 const resultStyles=read('app/_styles/result.css');
 assert.match(workspaceStyles,/\.record-times span:first-child:not\(:last-child\) strong\{color:#7a8799\}/);
 assert.match(resultStyles,/\[data-state=active\]\{background:#5f6670;border-color:#555c65;color:#fff/);
});

test('calendar previews a date and commits it on a second click or popup close',()=>{
 const workspace=read('app/_components/workspace.tsx');
 const calendar=read('app/_components/work-calendar.tsx');
 assert.match(workspace,/calendarSelection,setCalendarSelection/);
 assert.match(workspace,/if\(value===calendarSelection\)\{chooseDay\(value\);setCalendarOpen\(false\);\}/);
 assert.match(workspace,/if\(!open&&calendarSelection!==day\)chooseDay\(calendarSelection\)/);
 assert.match(calendar,/onDayClick=\{date=>onSelect\(localDay\(date\)\)\}/);
 assert.match(calendar,/`작업 \$\{selected\?\.count\|\|0\}개, \$\{summaryDuration/);
});
