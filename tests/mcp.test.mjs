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
 const adapter={prepare(sql){return {bind(...args){args=args.map(value=>typeof value==='boolean'?Number(value):value);return {
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){return {meta:db.prepare(sql).run(...args)};},
 };}};},async batch(items){const results=[];for(const item of items)results.push(await item.run());return results;}};
 process.env.APP_ORIGIN=ORIGIN;
 const [auth,dates]=await Promise.all([load('lib/auth.ts'),load('lib/work-dates.ts')]);
 globalThis.mcpFixture={...auth,...dates,database:()=>adapter,McpServer,createMcpHandler,z,fetchClientDocument:null,validClientIdUrl:null};
 const f=globalThis.mcpFixture;
 Object.assign(f,await load('lib/oauth.ts','const {hashToken,fetchClientDocument,validClientIdUrl}=globalThis.mcpFixture;'));
 Object.assign(f,await load('lib/task-service.ts','const {validDay,validTimes}=globalThis.mcpFixture;'));
 Object.assign(f,await load('lib/stats.ts','const {validDay}=globalThis.mcpFixture;'));
 Object.assign(f,await load('lib/mcp.ts','const {McpServer,z,verifyAccessToken,resourceUrl,listTasks,dayTotals,validRange,validDay}=globalThis.mcpFixture;'));
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
 await jsonRpc(ownerToken,{jsonrpc:'2.0',id:2,method:'tools/list'});
 assert.equal(db.prepare("SELECT last_used FROM oauth_grants WHERE id='g-owner'").get().last_used,used,'no write within a minute');

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
  const tools=(await client.listTools()).tools;
  assert.deepEqual(tools.map(t=>t.name).sort(),['get_current_work','get_memos','get_stats','list_tasks']);
  assert.ok(tools.every(t=>t.annotations?.readOnlyHint===true));

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
  let error=await client.callTool({name:'get_stats',arguments:{from:'2026-10-15',to:'2026-10-14'}});
  assert.equal(error.isError,true,'reversed range is a tool error');
  error=await client.callTool({name:'list_tasks',arguments:{day:'2026-02-30'}});
  assert.equal(error.isError,true,'invalid date is a tool error');

  const memos=await data(client,'get_memos',{day:'2026-10-15'});
  assert.deepEqual(memos.memos.map(m=>m.id),['m1']);assert.deepEqual(memos.daily_memos.map(m=>[m.id,m.body,m.version]),[['d1','회의 3시',2]]);
  await client.close();
 }

 // 다른 사용자의 토큰으로는 그 사용자의 기록만 보인다.
 const other=await connect(otherToken,'legacy');
 assert.deepEqual((await data(other,'list_tasks',{day:'2026-10-15'})).tasks.map(t=>t.id),['x1']);
 assert.equal((await data(other,'get_current_work')).task,null);
 await other.close();

 // tasks:read 없는 토큰에는 조회 도구가 없다.
 const limited=await connect(writeOnly,'legacy');
 assert.deepEqual((await limited.listTools()).tools,[]);
 const denied=await limited.callTool({name:'list_tasks',arguments:{}}).catch(e=>({isError:true,message:e.message}));
 assert.equal(denied.isError,true);
 await limited.close();

 // 폐기된 연결의 토큰은 거절한다.
 await f.revokeGrant(adapter,'g-other',Date.now());
 assert.equal((await jsonRpc(otherToken,{jsonrpc:'2.0',id:1,method:'tools/list'})).status,401);
});
