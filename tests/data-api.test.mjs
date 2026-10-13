import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function load(path,imports=''){
 const source=imports+'\n'+read(path).replace(/^import .*;\s*$/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}

test('task batches guard stale writes and data APIs bound bodies before parsing',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(name=>/^000[0-7]_.*\.sql$/.test(name)).sort())db.exec(read('drizzle/'+name));
 db.exec('CREATE TABLE task_sessions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, owner TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER)');
 let beforeBatch;
 const batches=[];
 const adapter={prepare(sql){return {bind(...args){args=args.map(value=>typeof value==='boolean'?Number(value):value);return {
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){return {meta:db.prepare(sql).run(...args)};},
 };}};},async batch(items){batches.push(items.length);if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}const results=[];for(const item of items)results.push(await item.run());return results;}};
 const dates=await load('lib/work-dates.ts');
 globalThis.dataApiFixture={...dates,getCodeUser:async()=>({userId:'owner'}),trustedOrigin:()=>true,database:()=>adapter};
 const imports='const {getCodeUser,trustedOrigin,database,validDay,validTimes}=globalThis.dataApiFixture;';
 const tasks=await load('app/api/tasks/route.ts',imports);
 const memos=await load('app/api/memos/route.ts',imports);
 const daily=await load('app/api/daily-memos/route.ts',imports);
 delete globalThis.dataApiFixture;
 const post=body=>tasks.POST(new Request('https://fixture.test/api/tasks',{method:'POST',body:JSON.stringify(body)}));
 const count=id=>db.prepare('SELECT COUNT(*) AS count FROM task_sessions WHERE task_id=?').get(id).count;
 const create={action:'create',title:'한글 업무',day:'2026-10-12',note:'가'.repeat(20000),result:'나'.repeat(20000),target:0,elapsed:60000,started_at:1000,ended_at:61000};
 try{
  assert.equal((await post(create)).status,200);
  assert.equal(batches[0],2,'create task and its session use one batch');
  const task=db.prepare('SELECT * FROM tasks').get();
  assert.equal(count(task.id),1);
  beforeBatch=()=>db.prepare('UPDATE tasks SET version=version+1 WHERE id=?').run(task.id);
  assert.equal((await post({...create,action:'edit',id:task.id,version:0,run:true})).status,409);
  assert.equal(count(task.id),1,'stale reopen must not add a session');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(task.id).status,'done');
  beforeBatch=()=>db.prepare('UPDATE tasks SET version=version+1 WHERE id=?').run(task.id);
  assert.equal((await post({...create,action:'edit',id:task.id,version:1,started_at:2000,ended_at:122000})).status,409);
  assert.deepEqual({...db.prepare('SELECT start_at,end_at FROM task_sessions WHERE task_id=?').get(task.id)},{start_at:1000,end_at:61000},'stale edit must not delete or replace sessions');
  db.prepare('DELETE FROM task_sessions WHERE task_id=?').run(task.id);
  assert.equal((await post({...create,action:'edit',id:task.id,version:2,run:true})).status,200);
  assert.equal(count(task.id),2,'legacy seed and reopened session are inserted together');
  assert.equal((await post({action:'pause',id:task.id,version:3})).status,200);
  beforeBatch=()=>db.prepare('UPDATE tasks SET version=version+1 WHERE id=?').run(task.id);
  assert.equal((await post({action:'resume',id:task.id,version:4})).status,409);
  assert.equal(count(task.id),2,'stale resume must not add a session');
  assert.equal((await post({action:'resume',id:task.id,version:5})).status,200);
  beforeBatch=()=>db.prepare('UPDATE tasks SET version=version+1 WHERE id=?').run(task.id);
  assert.equal((await post({action:'finish',id:task.id,version:6,result:'done'})).status,409);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_sessions WHERE task_id=? AND end_at IS NULL').get(task.id).count,1,'stale finish must not close a session');

  for(const route of [tasks,memos,daily]){
   let readBody=false;
   const claimed={headers:new Headers({'content-length':String(256*1024+1)}),async text(){readBody=true;return '{}';}};
   assert.equal((await route.POST(claimed)).status,400);
   assert.equal(readBody,false,'oversized content-length is rejected before reading');
   const big=new Request('https://fixture.test/api/data',{method:'POST',body:JSON.stringify({action:'create',day:'2026-10-12',extra:'가'.repeat(90000)})});
   assert.equal((await route.POST(big)).status,400,'UTF-8 byte limit applies without content-length');
   assert.equal((await route.POST(new Request('https://fixture.test/api/data',{method:'POST',body:'{'}))).status,400);
  }
 }finally{db.close();}
});
