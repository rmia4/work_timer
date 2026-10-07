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
 const csv=stats.tasksCsv([{day:'2026-10-07',title:'회의, "주간"',note:'첫줄\n둘째줄',result:'',target:1800000,elapsed:2700000,started_at:Date.parse('2026-10-07T09:05:00+09:00'),ended_at:null,status:'done'}]);
 assert.ok(csv.startsWith('﻿날짜,제목,'));
 assert.equal(csv.split('\r\n')[1],'2026-10-07,"회의, ""주간""","첫줄\n둘째줄",,30,45,09:05,,완료');
});
