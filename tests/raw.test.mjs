import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const sql={query(text,values){return {text,values};},async transaction(queries){return queries.map(query=>query.text.includes('version=0')?[]:[{_changed:1}]);}};
globalThis.rawFixture={neon:()=>sql};
const source=readFileSync(new URL('../db/raw.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'const {neon}=globalThis.rawFixture;')+'\nexport {postgresSql};';
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const raw=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
delete globalThis.rawFixture;

test('postgresSql skips question marks in literals, including escaped quotes',()=>{
 assert.equal(raw.postgresSql("SELECT '?', ?, 'it''s ? here', ?, ''"),"SELECT '?', $1, 'it''s ? here', $2, ''");
 assert.equal(raw.postgresSql("SELECT '??', ?, '?' || ?, MAX(0, ?-started)"),"SELECT '??', $1, '?' || $2, GREATEST(0, $3-started)");
 assert.equal(raw.postgresSql("SELECT 'only ? literal'"),"SELECT 'only ? literal'");
});

test('batch returns per-statement changes',async()=>{
 const originalUrl=process.env.DATABASE_URL;
 process.env.DATABASE_URL='postgresql://fixture';
 try{
  const db=raw.database();
  const stale=db.prepare('UPDATE tasks SET version=version+1 WHERE version=0').bind();
  assert.match(stale.toQuery().text,/RETURNING 1 AS _changed$/);
  const results=await db.batch([stale,db.prepare('DELETE FROM task_sessions WHERE task_id=?').bind('task')]);
  assert.deepEqual(results,[{meta:{changes:0}},{meta:{changes:1}}]);
 }finally{if(originalUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalUrl;}
});
