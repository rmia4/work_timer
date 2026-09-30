import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/work-dates.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const dates=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('validDay accepts real calendar dates only',()=>{
 assert.equal(dates.validDay('2026-09-30'),true);
 assert.equal(dates.validDay('2024-02-29'),true);
 assert.equal(dates.validDay('2026-02-29'),false);
 assert.equal(dates.validDay('2026-13-01'),false);
 assert.equal(dates.validDay('2026-9-30'),false);
 assert.equal(dates.validDay(null),false);
});

test('validTimes allows missing values and rejects end before start',()=>{
 assert.equal(dates.validTimes(null,null),true);
 assert.equal(dates.validTimes(1000,null),true);
 assert.equal(dates.validTimes(1000,1000),true);
 assert.equal(dates.validTimes(2000,1000),false);
 assert.equal(dates.validTimes(-1,null),false);
 assert.equal(dates.validTimes(1.5,null),false);
 assert.equal(dates.validTimes('1000',null),false);
});

test('clockDuration formats elapsed milliseconds as HH:MM:SS',()=>{
 assert.equal(dates.clockDuration(0),'00:00:00');
 assert.equal(dates.clockDuration(3_723_999),'01:02:03');
 assert.equal(dates.clockDuration(-5000),'00:00:00');
 assert.equal(dates.clockDuration(100*3600_000),'100:00:00');
});

test('time inputs round-trip in Korean time regardless of host timezone',()=>{
 const t=Date.parse('2026-09-30T00:30:15Z');
 assert.equal(dates.timeInput(t),'2026-09-30T09:30:15');
 assert.equal(dates.parseTimeInput(dates.timeInput(t)),t);
 assert.equal(dates.timeInput(null),'');
 assert.equal(dates.parseTimeInput(''),null);
});

test('time labels show 미기록 for missing values and use Korean time',()=>{
 assert.equal(dates.timeLabel(null),'미기록');
 assert.equal(dates.timestampLabel(undefined),'미기록');
 assert.equal(dates.timeLabel(Date.parse('2026-09-30T15:05:00Z')),'00:05');
});
