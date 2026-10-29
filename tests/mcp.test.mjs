import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import * as z from 'zod/v4';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function load(path,imports=''){
 const source=imports+'\n'+read(path).replace(/^import .*;\s*$/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const ORIGIN='https://diary.test',ENDPOINT=ORIGIN+'/api/mcp';

test('MCP: bearer auth, both protocol eras, read tools, scope and owner isolation',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(name=>/^000[0-7]_.*\.sql$/.test(name)).sort())db.exec(read('drizzle/'+name));
 db.exec('CREATE TABLE task_sessions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, owner TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER)');
 db.exec(read('drizzle-neon/0007_oauth.sql'));
 const sqlLog=[];
 const adapter={prepare(sql){sqlLog.push(sql);return {bind(...args){args=args.map(value=>typeof value==='boolean'?Number(value):value);return {
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){return {meta:db.prepare(sql).run(...args)};},
 };}};},async batch(items){const results=[];for(const item of items)results.push(await item.run());return results;}};
 process.env.APP_ORIGIN=ORIGIN;
 const [auth,dates]=await Promise.all([load('lib/auth.ts'),load('lib/work-dates.ts')]);
 globalThis.mcpFixture={...auth,...dates,database:()=>adapter,McpServer,createMcpHandler,z,fetchClientDocument:null,validClientIdUrl:null};
 const f=globalThis.mcpFixture;
 Object.assign(f,await load('lib/oauth.ts','const {hashToken,fetchClientDocument,validClientIdUrl}=globalThis.mcpFixture;'));
 Object.assign(f,await load('lib/like-search.ts'));
 Object.assign(f,await load('lib/task-service.ts','const {validDay,validTimes,likePattern,likeAny,findMatch}=globalThis.mcpFixture;'));
 Object.assign(f,await load('lib/stats.ts','const {validDay}=globalThis.mcpFixture;'));
 Object.assign(f,await load('lib/mcp.ts','const {McpServer,z,verifyAccessToken,resourceUrl,listTasks,dayTotals,exportRows,applyTaskAction,validRange,validScope,tasksCsv,summaryPrompt,weekStart,validDay,likePattern,likeAny}=globalThis.mcpFixture;'));
 const route=await load('app/api/mcp/route.ts','const {createMcpHandler,database,appOrigin,oauthJson,corsPreflight,CORS,SCOPES,authenticate,createMcpServer}=globalThis.mcpFixture;');
 delete globalThis.mcpFixture;

 // 사용자 두 명과 연결(grant)을 만들고 토큰을 직접 넣는다. 발급 흐름은 oauth.test.mjs에서 확인한다.
 const now=Date.now(),HOUR=3600000;
 db.exec("INSERT INTO users (id) VALUES ('owner'),('other')");
 db.prepare('INSERT INTO oauth_clients (id,name,redirect_uris,created) VALUES (?,?,?,?)').run('client','Claude','["https://claude.ai/api/mcp/auth_callback"]',now);
 const token=async(id,owner,scope,expires=now+HOUR)=>{
  db.prepare('INSERT OR IGNORE INTO oauth_grants (id,owner,client_id,scope,created) VALUES (?,?,?,?,?)').run(id,owner,'client',scope,now);
  const value=f.randomToken();db.prepare("INSERT INTO oauth_tokens (token_hash,grant_id,kind,expires) VALUES (?,?,'access',?)").run(await auth.hashToken(value),id,expires);
  return value;
 };
 const ownerToken=await token('g-owner','owner','tasks:read tasks:write'),otherToken=await token('g-other','other','tasks:read');
 const writeOnly=await token('g-write','owner','tasks:write'),expired=await token('g-owner','owner','tasks:read tasks:write',now-1);

 // KST 2026-10-15 09:00 = UTC 00:00. 진행 중 1건, 그날 완료 1건, 다른 날 1건, 다른 사용자 1건.
 const day=Date.parse('2026-10-15T00:00:00Z');
 const task=db.prepare('INSERT INTO tasks (id,owner,day,title,note,result,target,elapsed,started,status,created,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
 task.run('done1','owner','2026-10-15','설계 검토','메모','완료함',0,30*60000,null,'done',day,day,day+30*60000);
 task.run('run1','owner','2026-10-15','MCP 구현','','',60*60000,5*60000,now-10*60000,'running',day+HOUR,day+HOUR,null);
 task.run('old1','owner','2026-10-14','어제 일','','',0,90*60000,null,'done',day-86400000,null,null);
 task.run('x1','other','2026-10-15','남의 일','비밀','',0,60000,null,'done',day,null,null);
 db.prepare('INSERT INTO memos (id,owner,title,body,collapsed,position,version,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').run('m1','owner','할 일','목록',0,1,0,now,now);
 db.prepare('INSERT INTO memos (id,owner,title,body,collapsed,position,version,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').run('m2','other','남의 메모','비밀',0,1,0,now,now);
 db.prepare('INSERT INTO daily_memos (id,owner,day,title,body,position,version,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').run('d1','owner','2026-10-15','오늘','회의 3시',1,2,now,now);

 const call=(method,headers={},body)=>route[method](new Request(ENDPOINT,{method,headers,body}));
 const jsonRpc=(bearer,payload)=>call('POST',{authorization:'Bearer '+bearer,'content-type':'application/json',accept:'application/json, text/event-stream'},JSON.stringify(payload));

 // 토큰 확인
 let res=await call('POST',{'content-type':'application/json'},'{}');
 assert.equal(res.status,401);
 assert.match(res.headers.get('www-authenticate'),/^Bearer resource_metadata="https:\/\/diary\.test\/\.well-known\/oauth-protected-resource"/);
 assert.doesNotMatch(res.headers.get('www-authenticate'),/error=/,'no error code when the token is missing');
 assert.equal(res.headers.get('access-control-allow-origin'),'*');
 res=await jsonRpc('not-a-token',{jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal(res.status,401);assert.match(res.headers.get('www-authenticate'),/error="invalid_token"/);
 assert.equal((await jsonRpc(expired,{jsonrpc:'2.0',id:1,method:'tools/list'})).status,401,'expired token');
 res=await call('POST',{authorization:'Basic '+ownerToken},'{}');assert.equal(res.status,401,'only the Bearer scheme');
 assert.equal((await call('GET',{authorization:'Bearer '+ownerToken})).status,405);
 assert.equal((await call('OPTIONS')).status,204);

 // 연결의 마지막 사용 시각은 분 단위로만 갱신한다.
 db.exec("UPDATE oauth_grants SET last_used=NULL WHERE id='g-owner'");
 res=await jsonRpc(ownerToken,{jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),'*');
 const used=db.prepare("SELECT last_used FROM oauth_grants WHERE id='g-owner'").get().last_used;assert.ok(used>=now);
 sqlLog.length=0;
 await jsonRpc(ownerToken,{jsonrpc:'2.0',id:2,method:'tools/list'});
 assert.equal(db.prepare("SELECT last_used FROM oauth_grants WHERE id='g-owner'").get().last_used,used,'no write within a minute');
 assert.equal(sqlLog.filter(q=>/UPDATE oauth_grants/.test(q)).length,0,'no UPDATE query within a minute');

 // 실제 SDK 클라이언트로 2025(initialize) 방식과 2026-07-28 방식 모두 연결한다.
 const fetchRoute=bearer=>async(url,init)=>{const req=new Request(url,init);req.headers.set('authorization','Bearer '+bearer);return route[req.method](req);};
 const connect=async(bearer,mode)=>{
  const client=new Client({name:'test',version:'1.0.0'},{versionNegotiation:{mode}});
  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT),{fetch:fetchRoute(bearer)}));
  return client;
 };
 const data=async(client,name,args={})=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,result.content?.[0]?.text);return result.structuredContent;};
 for(const mode of ['legacy',{pin:'2026-07-28'}]){
  const client=await connect(ownerToken,mode);
  assert.equal(client.getProtocolEra(),mode==='legacy'?'legacy':'modern');
  assert.match(client.getInstructions(),/start_work/);
  const tools=(await client.listTools()).tools;
  assert.deepEqual(tools.map(t=>t.name).sort(),['add_task','export_tasks','finish_work','get_current_work','get_daily_memos','get_global_memos','get_stats','list_tasks','pause_work','resume_work','save_daily_memo','save_global_memo','start_work','update_task']);
  assert.ok(tools.filter(t=>t.name.startsWith('get_')||t.name==='list_tasks').every(t=>t.annotations?.readOnlyHint===true));
  assert.ok(tools.every(t=>t.annotations?.destructiveHint!==true),'no destructive tools');

  const current=(await data(client,'get_current_work')).task;
  assert.equal(current.id,'run1');assert.equal(current.status,'running');assert.equal(current.target_minutes,60);
  assert.ok(current.minutes>=15&&current.minutes<=16,'elapsed includes the running span');
  assert.equal(current.started_at,'2026-10-15T10:00:00+09:00');assert.equal(current.ended_at,null);

  const listed=await data(client,'list_tasks',{day:'2026-10-15'});
  assert.deepEqual(listed.tasks.map(t=>t.id),['run1','done1'],'only that day, only my tasks');
  const done=listed.tasks[1];
  assert.equal(done.minutes,30);assert.equal(done.result,'완료함');assert.equal(done.ended_at,'2026-10-15T09:30:00+09:00');assert.equal(done.version,0);
  assert.equal((await data(client,'list_tasks',{day:'2026-10-14'})).tasks[0].id,'old1');
  assert.match((await data(client,'list_tasks')).day,/^\d{4}-\d{2}-\d{2}$/,'defaults to today');

  const stats=await data(client,'get_stats',{from:'2026-10-14',to:'2026-10-15'});
  assert.deepEqual(stats.days.map(d=>[d.day,d.tasks]),[['2026-10-14',1],['2026-10-15',2]]);
  assert.equal(stats.task_count,3);assert.equal(stats.total_minutes,90+30+stats.days[1].minutes-30);
  // 긴 기간은 주(월요일 시작)·월 단위로 묶는다. 2026-10-14(수)·15(목)는 같은 주.
  const weekly=await data(client,'get_stats',{from:'2026-10-14',to:'2026-10-15',group:'week'});
  assert.equal(weekly.days,undefined);assert.deepEqual(weekly.periods,[{period:'2026-10-12',minutes:stats.total_minutes,tasks:3}]);
  const monthly=await data(client,'get_stats',{from:'2026-10-01',to:'2026-10-31',group:'month'});
  assert.deepEqual(monthly.periods.map(p=>[p.period,p.tasks]),[['2026-10',3]]);assert.equal(monthly.periods[0].minutes,monthly.total_minutes);
  let error=await client.callTool({name:'get_stats',arguments:{from:'2026-10-15',to:'2026-10-14'}});
  assert.equal(error.isError,true,'reversed range is a tool error');
  error=await client.callTool({name:'list_tasks',arguments:{day:'2026-02-30'}});
  assert.equal(error.isError,true,'invalid date is a tool error');

  assert.deepEqual((await data(client,'get_global_memos',{})).memos.map(m=>m.id),['m1']);
  const daily=await data(client,'get_daily_memos',{day:'2026-10-15'});
  assert.equal(daily.memos,undefined);assert.deepEqual(daily.daily_memos.map(m=>[m.id,m.body,m.version]),[['d1','회의 3시',2]]);

  // CSV 내보내기: 웹과 같은 CSV를 텍스트로, 요약 지침은 요청할 때만 앞에 붙는다.
  const exported=await client.callTool({name:'export_tasks',arguments:{from:'2026-10-14',to:'2026-10-15',scope:'all'}});
  assert.equal(exported.structuredContent,undefined,'CSV must reach clients that prefer structuredContent');
  const lines=exported.content[0].text.split('\r\n');
  assert.equal(lines[0],'2026-10-14 ~ 2026-10-15: 작업 3건\n날짜,제목,업무 내용,결과,목표(분),소요(분),시작 시각,종료 시각,상태');
  assert.deepEqual(lines.slice(1,4).map(l=>l.split(',')[1]),['어제 일','설계 검토','MCP 구현'],'date order, only my tasks');
  assert.doesNotMatch(exported.content[0].text,/남의 일|\uFEFF/);
  const timeOnly=await client.callTool({name:'export_tasks',arguments:{from:'2026-10-15',to:'2026-10-15'}});
  assert.match(timeOnly.content[0].text,/\n날짜,제목,목표\(분\)/,'defaults to time scope');
  assert.doesNotMatch(timeOnly.content[0].text,/업무 내용/);assert.doesNotMatch(timeOnly.content[0].text,/\[출력 형식\]/);
  const guided=(await client.callTool({name:'export_tasks',arguments:{from:'2026-10-15',to:'2026-10-15',with_summary_guide:true}})).content[0].text;
  assert.match(guided,/\n\n아래 CSV는 2026-10-15부터/);assert.match(guided,/\[출력 형식\][\s\S]*\n날짜,제목,/);
  assert.equal((await client.callTool({name:'export_tasks',arguments:{from:'2026-01-01',to:'2027-01-02'}})).isError,true,'over 366 days');
  // 업무 내용 열을 포함하면 31일까지만
  assert.equal((await client.callTool({name:'export_tasks',arguments:{from:'2026-01-01',to:'2026-12-31'}})).isError,undefined,'time allows 366 days');
  for(const scope of ['all','detail']){
   const tooWide=await client.callTool({name:'export_tasks',arguments:{from:'2026-10-01',to:'2026-11-01',scope}});
   assert.equal(tooWide.isError,true,`${scope} over 31 days`);assert.match(tooWide.content[0].text,/최대 31일/);
  }
  assert.equal((await client.callTool({name:'export_tasks',arguments:{from:'2026-10-01',to:'2026-10-31',scope:'all'}})).isError,undefined);
  await assert.rejects(client.getPrompt({name:'summarize_work',arguments:{from:'2026-10-01',to:'2026-11-01',scope:'detail'}}),/최대 31일/);

  // 슬래시 프롬프트: 요약 지침과 CSV를 한 메시지로 넣는다.
  assert.deepEqual((await client.listPrompts()).prompts.map(p=>p.name),['summarize_work']);
  const prompt=await client.getPrompt({name:'summarize_work',arguments:{from:'2026-10-15',to:'2026-10-15'}});
  const text=prompt.messages[0].content.text;
  assert.match(text,/^아래 CSV는 2026-10-15부터/);assert.match(text,/\n날짜,제목,목표\(분\)/,'defaults to time scope');assert.match(text,/설계 검토/);
  await assert.rejects(client.getPrompt({name:'summarize_work',arguments:{from:'2026-10-15',to:'2026-10-14'}}));
  await assert.rejects(client.getPrompt({name:'summarize_work',arguments:{from:'2026-10-15',to:'2026-10-15',scope:'x'}}));
  await client.close();
 }

 // 다른 사용자의 토큰으로는 그 사용자의 기록만 보인다.
 const other=await connect(otherToken,'legacy');
 assert.deepEqual((await data(other,'list_tasks',{day:'2026-10-15'})).tasks.map(t=>t.id),['x1']);
 assert.equal((await data(other,'get_current_work')).task,null);
 await other.close();

 // tasks:read 없는 토큰에는 조회 도구가 없고, tasks:write 없는 토큰에는 쓰기 도구가 없다.
 const limited=await connect(writeOnly,'legacy');
 assert.ok((await limited.listTools()).tools.every(t=>!t.annotations?.readOnlyHint));
 const denied=await limited.callTool({name:'list_tasks',arguments:{}}).catch(e=>({isError:true,message:e.message}));
 assert.equal(denied.isError,true);
 await limited.close();
 const readOnlyClient=await connect(otherToken,'legacy');
 assert.deepEqual((await readOnlyClient.listTools()).tools.map(t=>t.name).sort(),['export_tasks','get_current_work','get_daily_memos','get_global_memos','get_stats','list_tasks']);
 const noWrite=await readOnlyClient.callTool({name:'start_work',arguments:{title:'몰래'}}).catch(e=>({isError:true,message:e.message}));
 assert.equal(noWrite.isError,true);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE owner='other'").get().n,1);
 await readOnlyClient.close();

 // 쓰기 도구: 시작 충돌 → 이전 작업 종료 후 시작 → 일시정지·재개 → 요약과 함께 종료 → 수정.
 const writer=await connect(ownerToken,'legacy');
 let result=await writer.callTool({name:'start_work',arguments:{title:'쓰기 도구'}});
 assert.equal(result.isError,true,'conflict with the running task');assert.match(result.content[0].text,/run1/);
 assert.equal(db.prepare("SELECT status FROM tasks WHERE id='run1'").get().status,'running','fail leaves the running task alone');
 const started=await data(writer,'start_work',{title:'쓰기 도구',note:'계획',target_minutes:90,if_running:'finish_previous'});
 assert.equal(started.finished_task_id,'run1');
 assert.equal(started.task.status,'running');assert.equal(started.task.target_minutes,90);assert.equal('note' in started.task,false,'write results are compact');
 assert.equal(db.prepare('SELECT note FROM tasks WHERE id=?').get(started.task.id).note,'계획');
 assert.equal(started.task.day,new Date(Date.now()+9*HOUR).toISOString().slice(0,10),'today in KST');
 assert.equal(db.prepare("SELECT status FROM tasks WHERE id='run1'").get().status,'done');
 assert.equal((await data(writer,'get_current_work')).task.id,started.task.id);
 assert.equal((await writer.callTool({name:'resume_work',arguments:{}})).isError,true,'not paused');
 // 쓰기 결과는 다시 조회하지 않고 만든다. DB에 저장된 값과 같아야 한다.
 const matchesDb=task=>{const row=db.prepare('SELECT status,version,elapsed,started FROM tasks WHERE id=?').get(task.id);
  assert.equal(task.status,row.status);assert.equal(task.version,row.version);assert.equal(task.minutes,Math.floor((row.elapsed+(row.started===null?0:Date.now()-row.started))/60000));return task;};
 assert.equal(matchesDb((await data(writer,'pause_work')).task).status,'paused');
 assert.equal(matchesDb((await data(writer,'resume_work')).task).status,'running');
 const finished=await data(writer,'finish_work',{summary:'도구 추가함',append_note:'추가 메모'});
 matchesDb(finished.task);assert.equal(finished.task.ended_at,(await data(writer,'list_tasks',{day:finished.task.day})).tasks.find(t=>t.id===finished.task.id).ended_at);
 assert.equal(finished.task.status,'done');assert.equal('result' in finished.task,false);
 const saved=(await data(writer,'list_tasks',{day:finished.task.day,include_details:true})).tasks.find(t=>t.id===finished.task.id);
 assert.equal(saved.result,'도구 추가함');assert.equal(saved.note,'계획\n\n추가 메모');
 assert.ok(finished.task.ended_at);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_sessions WHERE task_id=? AND end_at IS NULL').get(finished.task.id).n,0,'sessions closed');
 assert.equal((await writer.callTool({name:'finish_work',arguments:{summary:'또'}})).isError,true,'nothing running');
 assert.equal((await writer.callTool({name:'finish_work',arguments:{task_id:finished.task.id,summary:'또'}})).isError,true,'already done');
 // 결과가 이미 있는 작업을 종료하면 이어 붙인다.
 const second=await data(writer,'start_work',{title:'두 번째'});
 db.prepare("UPDATE tasks SET result='기존 결과' WHERE id=?").run(second.task.id);
 await data(writer,'finish_work',{task_id:second.task.id,summary:'새 요약'});
 assert.equal(db.prepare('SELECT result FROM tasks WHERE id=?').get(second.task.id).result,'기존 결과\n\n---\n\n새 요약');
 assert.equal((await writer.callTool({name:'finish_work',arguments:{task_id:'x1',summary:'남의 것'}})).isError,true,'not my task');
 assert.equal(db.prepare("SELECT status FROM tasks WHERE id='x1'").get().status,'done');

 const edited=await data(writer,'update_task',{task_id:finished.task.id,version:finished.task.version,title:' 고친 제목 ',minutes:45});matchesDb(edited.task);
 assert.equal(edited.task.title,'고친 제목');assert.equal(edited.task.minutes,45);assert.equal(db.prepare('SELECT result FROM tasks WHERE id=?').get(edited.task.id).result,'도구 추가함');assert.equal(edited.task.version,finished.task.version+1);
 result=await writer.callTool({name:'update_task',arguments:{task_id:finished.task.id,version:finished.task.version,title:'옛 버전'}});
 assert.equal(result.isError,true,'stale version');assert.match(result.content[0].text,/다시 조회/);
 assert.equal((await writer.callTool({name:'update_task',arguments:{task_id:'x1',version:0,title:'남의 것'}})).isError,true);
 assert.equal(db.prepare("SELECT title FROM tasks WHERE id='x1'").get().title,'남의 일');

 // 지난 작업 기록: 완료 상태로 만들고 타이머·시작 시각·측정 구간은 두지 않는다.
 const added=await data(writer,'add_task',{day:'2026-10-14',title:' 회의 ',minutes:60,result:'결정함'});
 assert.equal(added.task.day,'2026-10-14');assert.equal(added.task.title,'회의');assert.equal(added.task.status,'done');assert.equal(added.task.minutes,60);assert.equal(added.task.started_at,null);
 assert.equal(db.prepare('SELECT result FROM tasks WHERE id=?').get(added.task.id).result,'결정함');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_sessions WHERE task_id=?').get(added.task.id).n,0,'no sessions');
 assert.equal((await data(writer,'get_current_work')).task?.id===added.task.id,false,'not running');
 assert.equal((await writer.callTool({name:'add_task',arguments:{day:'2026-02-30',title:'x',minutes:1}})).isError,true,'invalid date');

 // 날짜별 메모 생성·수정과 버전 충돌
 const created=await data(writer,'save_daily_memo',{day:'2026-10-16',title:'내일',body:'할 일'});
 assert.equal(created.memo.version,0);
 const updated=await data(writer,'save_daily_memo',{day:'2026-10-16',memo_id:created.memo.id,version:0,body:'바뀐 할 일'});
 assert.deepEqual(updated.memo,{id:created.memo.id,title:'내일',version:1},'no body in write results');
 assert.deepEqual((await data(writer,'get_daily_memos',{day:'2026-10-16'})).daily_memos.map(m=>[m.title,m.body,m.version]),[['내일','바뀐 할 일',1]]);
 assert.equal((await writer.callTool({name:'save_daily_memo',arguments:{day:'2026-10-16',memo_id:created.memo.id,version:0,body:'옛 버전'}})).isError,true);
 assert.equal((await writer.callTool({name:'save_daily_memo',arguments:{day:'2026-10-16',memo_id:created.memo.id,body:'버전 없음'}})).isError,true);
 assert.equal((await writer.callTool({name:'save_daily_memo',arguments:{day:'2026-10-15',memo_id:'d1',version:2,body:'x'}})).isError,undefined);

 // 전역 메모 생성·수정과 버전 충돌, 남의 메모 보호
 const global=await data(writer,'save_global_memo',{title:'전역',body:'처음'});
 assert.equal(global.memo.version,0);
 assert.deepEqual((await data(writer,'save_global_memo',{memo_id:global.memo.id,version:0,body:'고침'})).memo,{id:global.memo.id,title:'전역',version:1});
 assert.deepEqual((await data(writer,'get_global_memos',{})).memos.map(m=>[m.id,m.body,m.version]),[['m1','목록',0],[global.memo.id,'고침',1]]);
 assert.equal((await writer.callTool({name:'save_global_memo',arguments:{memo_id:global.memo.id,version:0,body:'옛 버전'}})).isError,true);
 assert.equal((await writer.callTool({name:'save_global_memo',arguments:{memo_id:global.memo.id,body:'버전 없음'}})).isError,true);
 assert.equal((await writer.callTool({name:'save_global_memo',arguments:{memo_id:'m2',version:0,body:'남의 것'}})).isError,true);
 assert.equal(db.prepare("SELECT body FROM memos WHERE id='m2'").get().body,'비밀');

 // 긴 본문은 기본으로 앞 200자만, include_details로 전문을 받는다.
 const long='가'.repeat(250),DAY=86400000;
 task.run('long1','owner','2026-09-01','긴 기록',long+'키워드',long,0,60000,null,'done',day-40*DAY,null,null);
 let longTask=(await data(writer,'list_tasks',{day:'2026-09-01'})).tasks[0];
 assert.equal(longTask.note.length,200);assert.equal(longTask.note_truncated,true);assert.equal(longTask.result_truncated,true);
 longTask=(await data(writer,'list_tasks',{day:'2026-09-01',include_details:true})).tasks[0];
 assert.equal(longTask.note,long+'키워드');assert.equal(longTask.note_truncated,undefined);
 await data(writer,'start_work',{title:'긴 작업',note:long});
 const current2=(await data(writer,'get_current_work')).task;
 assert.equal(current2.note.length,200);assert.equal(current2.note_truncated,true);
 assert.equal((await data(writer,'get_current_work',{include_details:true})).task.note,long);
 await data(writer,'finish_work',{summary:'끝'});

 // 작업 검색: day를 생략하면 모든 날짜에서 최근 순, 본문이 작으면 여러 건 모두 전문
 task.run('kw1','owner','2026-08-01','키워드 정리','짧은 내용','',0,60000,null,'done',day-75*DAY,null,null);
 let found=await data(writer,'list_tasks',{query:'키워드'});
 assert.deepEqual(found.tasks.map(t=>t.id),['long1','kw1']);assert.equal(found.has_more,false);
 assert.equal(found.tasks[0].note,long+'키워드','small results come in full');assert.equal(found.truncated,false);
 assert.deepEqual((await data(writer,'list_tasks',{query:'키워드',day:'2026-08-01'})).tasks.map(t=>t.id),['kw1']);
 assert.equal((await data(writer,'list_tasks',{query:'비밀'})).tasks.length,0,'not other users');
 // 본문 합계가 10000자를 넘으면 미리보기와 검색어 주변 발췌
 task.run('big1','owner','2026-08-02','큰 기록','나'.repeat(6000)+'키워드'+'다'.repeat(6000),'',0,60000,null,'done',day-74*DAY,null,null);
 found=await data(writer,'list_tasks',{query:'키워드'});
 const big=found.tasks.find(t=>t.id==='big1');
 assert.equal(found.truncated,true);assert.equal(big.note.length,200);assert.equal(big.note_truncated,true);assert.match(big.match_excerpt,/^나{150}키워드다{150}$/);
 assert.equal((await data(writer,'list_tasks',{query:'키워드',include_details:true})).tasks.find(t=>t.id==='big1').note.length,12003);

 // 메모: 목록은 미리보기, memo_id면 전문, query는 제목·본문 검색(%·_는 글자 그대로)
 const longMemo=await data(writer,'save_global_memo',{title:'회의록',body:'라'.repeat(300)});
 const listedMemo=(await data(writer,'get_global_memos')).memos.find(m=>m.id===longMemo.memo.id);
 assert.equal(listedMemo.body.length,200);assert.equal(listedMemo.body_truncated,true);
 assert.equal((await data(writer,'get_global_memos',{memo_id:longMemo.memo.id})).memo.body.length,300);
 assert.equal((await writer.callTool({name:'get_global_memos',arguments:{memo_id:'m2'}})).isError,true,'not my memo');
 await data(writer,'save_global_memo',{title:'진행률',body:'100% 완료'});
 assert.deepEqual((await data(writer,'get_global_memos',{query:'%'})).memos.map(m=>m.title),['진행률'],'% is literal');
 const meetingFound=await data(writer,'get_global_memos',{query:'회의'});
 assert.deepEqual(meetingFound.memos.map(m=>[m.title,m.body.length]),[['회의록',300]]);assert.equal(meetingFound.truncated,false);
 assert.equal((await data(writer,'get_global_memos',{query:'비밀'})).memos.length,0);
 db.prepare('INSERT INTO daily_memos (id,owner,day,title,body,position,version,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').run('d9','other','2026-10-16','남의 할 일','할 일',1,0,now,now);
 await data(writer,'save_daily_memo',{day:'2026-09-01',title:'지난 할 일',body:'할 일 목록'});
 assert.deepEqual((await data(writer,'get_daily_memos',{query:'할 일'})).daily_memos.map(m=>[m.day,m.title]),[['2026-10-16','내일'],['2026-09-01','지난 할 일']],'all days, only mine');
 assert.equal((await data(writer,'get_daily_memos',{memo_id:'d1'})).memo.day,'2026-10-15');
 assert.equal((await writer.callTool({name:'get_daily_memos',arguments:{memo_id:'d9'}})).isError,true,'not my daily memo');

 // 기간 안이어도 내용이 50000자를 넘으면 긴 작업의 업무 내용·결과만 잘라 상한에 맞춘다. 따옴표는 CSV에서 두 배가 된다.
 task.run('huge1','owner','2026-07-01','긴 내용 1','마'.repeat(40000),'',0,60000,null,'done',day-100*DAY+1,null,null);
 task.run('huge2','owner','2026-07-01','긴 내용 2','바'.repeat(15000),'"'.repeat(15000),0,60000,null,'done',day-100*DAY+2,null,null);
 task.run('huge3','owner','2026-07-01','짧은 일','짧은 내용','짧은 결과',0,60000,null,'done',day-100*DAY+3,null,null);
 const huge=(await writer.callTool({name:'export_tasks',arguments:{from:'2026-07-01',to:'2026-07-01',scope:'detail',with_summary_guide:true}}));
 assert.equal(huge.isError,undefined,huge.content[0].text.slice(0,200));
 const hugeText=huge.content[0].text;
 assert.ok(hugeText.length<=50000&&hugeText.length>49000,`fits the limit: ${hugeText.length}`);
 assert.match(hugeText,/^2026-07-01 ~ 2026-07-01: 작업 3건\. 글자 수 상한 때문에 2건의/);
 assert.equal(hugeText.match(/…\(잘림\)/g).length-1,3,'note of huge1, note and result of huge2 (one mark is in the summary)');
 assert.match(hugeText,/,짧은 일,짧은 내용,짧은 결과\r\n/,'short task untouched');
 const kept=hugeText.split('\r\n').slice(1).map(line=>line.replace(/""/g,'"').length);
 assert.ok(Math.abs(kept[0]-kept[1])<kept[0]*0.2,`long tasks share the budget: ${kept}`);
 assert.equal((await writer.callTool({name:'export_tasks',arguments:{from:'2026-07-01',to:'2026-07-01'}})).isError,undefined,'time scope stays small');
 const hugePrompt=(await writer.getPrompt({name:'summarize_work',arguments:{from:'2026-07-01',to:'2026-07-01',scope:'all'}})).messages[0].content.text;
 assert.ok(hugePrompt.length<=50000);assert.match(hugePrompt,/2건의 업무 내용·결과 뒷부분을 잘랐습니다/);
 await writer.close();

 // 폐기된 연결의 토큰은 거절한다.
 await f.revokeGrant(adapter,'g-other',Date.now());
 assert.equal((await jsonRpc(otherToken,{jsonrpc:'2.0',id:1,method:'tools/list'})).status,401);
});
