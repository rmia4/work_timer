import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const load=(path,replace=s=>s)=>{const source=replace(readFileSync(new URL(path,import.meta.url),'utf8'));const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');};
const datesUrl=load('../lib/work-dates.ts');
const stats=await import(load('../lib/stats.ts',s=>s.replace('"./work-dates"',JSON.stringify(datesUrl))));

test('weekDays starts on Monday',()=>{
 assert.deepEqual(stats.weekDays('2026-10-07'),['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
 assert.equal(stats.weekStart('2026-10-11'),'2026-10-05');
 assert.equal(stats.weekStart('2026-10-12'),'2026-10-12');
});

test('monthWeeks splits by Monday and stays inside the month',()=>{
 assert.deepEqual(stats.monthWeeks('2026-10-15'),[
  {from:'2026-10-01',to:'2026-10-04'},
  {from:'2026-10-05',to:'2026-10-11'},
  {from:'2026-10-12',to:'2026-10-18'},
  {from:'2026-10-19',to:'2026-10-25'},
  {from:'2026-10-26',to:'2026-10-31'},
 ]);
 assert.deepEqual(stats.monthRange('2024-02-10'),{from:'2024-02-01',to:'2024-02-29'});
 assert.equal(stats.shiftMonth('2026-01-31',-1),'2025-12-01');
});

test('heatmapWeeks starts on Sunday and ends with the week containing today',()=>{
 const weeks=stats.heatmapWeeks('2026-10-07');
 assert.equal(weeks.length,53);
 assert.equal(weeks.at(-1)[0],'2026-10-04');
 assert.equal(weeks.at(-1)[6],'2026-10-10');
 assert.equal(weeks[0][0],'2025-10-05');
 assert.equal(stats.heatmapWeeks('2026-10-04').at(-1)[0],'2026-10-04');
});

test('heatLevel uses 3 hour steps up to 9 hours',()=>{
 const h=3600000;
 assert.deepEqual([0,1,3*h-1,3*h,6*h,9*h-1,9*h,20*h].map(stats.heatLevel),[0,1,1,2,3,3,4,4]);
});

test('validRange checks order and length',()=>{
 assert.equal(stats.validRange('2026-01-01','2026-12-31',366),true);
 assert.equal(stats.validRange('2026-01-01','2027-01-02',366),false);
 assert.equal(stats.validRange('2026-02-01','2026-01-01',366),false);
 assert.equal(stats.validRange('2026-02-30','2026-03-01',366),false);
 assert.equal(stats.validRange(null,'2026-03-01',366),false);
});

test('tasksCsv escapes cells and adds BOM',()=>{
 const csv=stats.tasksCsv([{day:'2026-10-07',title:'회의, "주간"',note:'첫줄\n둘째줄',result:'',target:1800000,elapsed:2700000,started_at:Date.parse('2026-10-07T09:05:00+09:00'),ended_at:null,status:'done'}],'all');
 assert.ok(csv.startsWith('﻿날짜,제목,'));
 assert.equal(csv.split('\r\n')[1],'2026-10-07,"회의, ""주간""","첫줄\n둘째줄",,30,45,09:05,,완료');
});

test('tasksCsv picks columns by export scope',()=>{
 const rows=[{day:'2026-10-07',title:'회의',note:'내용',result:'결과',target:null,elapsed:600000,started_at:null,ended_at:null,status:'done'}];
 const lines=scope=>stats.tasksCsv(rows,scope).slice(1).split('\r\n');
 assert.deepEqual(lines('time').slice(0,2),['날짜,제목,목표(분),소요(분),시작 시각,종료 시각,상태','2026-10-07,회의,,10,,,완료']);
 assert.deepEqual(lines('all').slice(0,2),['날짜,제목,업무 내용,결과,목표(분),소요(분),시작 시각,종료 시각,상태','2026-10-07,회의,내용,결과,,10,,,완료']);
 assert.deepEqual(lines('detail').slice(0,2),['날짜,제목,업무 내용,결과','2026-10-07,회의,내용,결과']);
 assert.ok(stats.validScope('detail'));
 assert.ok(!stats.validScope('x'));
 assert.ok(!stats.validScope(null));
});

test('summaryPrompt changes instructions by export scope',()=>{
 const time=stats.summaryPrompt('2026-10-01','2026-10-31','time');
 const all=stats.summaryPrompt('2026-10-01','2026-10-31','all');
 const detail=stats.summaryPrompt('2026-10-01','2026-10-31','detail');
 for(const p of [time,all,detail]){assert.ok(p.includes('2026-10-01부터 2026-10-31까지'));assert.ok(p.includes('[제목 묶기]')&&p.includes('## 한눈에 보기')&&p.includes('## 기록 팁')&&p.includes('[내부 검증 - 출력하지 않음]'));}
 assert.ok(time.includes('업무 내용·결과 열이 없습니다')&&!time.includes('- 업무 내용:')&&time.includes('## 업무별 시간')&&!time.includes('## 주요 성과')&&!time.includes('## 이어서 할 일'));
 assert.ok(all.includes('- 업무 내용:')&&all.includes('## 업무별 시간')&&all.includes('## 이번 기간의 주요 성과')&&all.includes('## 이어서 할 일'));
 assert.ok(detail.includes('시간 기록 열이 없습니다')&&!detail.includes('- 소요(분):')&&detail.includes('## 주요 업무')&&!detail.includes('## 업무별 시간')&&detail.includes('## 이어서 할 일'));
 assert.ok(time.includes('[작업 시간대 기준]')&&!time.includes('[성과·이어서 할 일 기준]'));
 assert.ok(all.includes('[작업 시간대 기준]')&&all.includes('[성과·이어서 할 일 기준]'));
 assert.ok(!detail.includes('[작업 시간대 기준]')&&detail.includes('[성과·이어서 할 일 기준]'));
 assert.ok(all.includes('자정을 넘긴 작업 N회')&&!detail.includes('N시간 M분')&&time.includes('N시간 M분'));
 assert.ok(!all.includes('월별'));
 assert.ok(stats.summaryPrompt('2026-09-15','2026-10-07','all').includes('월별'));
});
