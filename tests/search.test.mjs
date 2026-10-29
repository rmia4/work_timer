import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function load(path,imports='',exports=''){
 const source=imports+'\n'+read(path).replace(/^import .*;\s*$/gm,'')+exports;
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}

test('task search: fields, owner and range isolation, literal LIKE, snippets, paging and route validation',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(name=>/^000[0-7]_.*\.sql$/.test(name)).sort())db.exec(read('drizzle/'+name));
 const sqlLog=[];
 let user={userId:'owner'},authDown=false,dbDown=false;
 const adapter={prepare(sql){sqlLog.push(sql);if(dbDown)throw Error('db down');return {bind(...args){return {
  async all(){return {results:db.prepare(sql).all(...args)};},
 };}};}};
 const fx=globalThis.searchFixture={...await load('lib/work-dates.ts'),...await load('lib/like-search.ts'),database:()=>adapter,
  getCodeUser:async()=>{if(authDown)throw Error('auth db down');return user;}};
 Object.assign(fx,await load('lib/stats.ts','const {validDay}=globalThis.searchFixture;'));
 Object.assign(fx,await load('lib/task-service.ts','const {validDay,validTimes,likePattern,likeAny,findMatch}=globalThis.searchFixture;'));
 const route=await load('app/api/tasks/search/route.ts','const {getCodeUser,database,validRange,searchTasks}=globalThis.searchFixture;');
 const add=(id,day,title,{note='',result='',owner='owner',created=1,elapsed=60000,started=null,status='done'}={})=>
  db.prepare('INSERT INTO tasks (id,owner,day,title,note,result,elapsed,started,status,created) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,owner,day,title,note,result,elapsed,started,status,created);
 const search=(q,from,to,{offset=0,now=0}={})=>fx.searchTasks(adapter,'owner',q,from,to,offset,now);
 const get=async params=>{
  const r=await route.GET(new Request('http://localhost/api/tasks/search?'+new URLSearchParams(params)));
  return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};
 };

 // 제목·내용·결과의 한국어 부분 일치, 정렬, 일치 필드, 본인·기간 격리, 진행 중 시간
 const NOW=10_000_000;
 add('t1','2026-10-01','주간 회의록 정리');
 add('n1','2026-10-02','작업',{note:'오늘 회의에서 결정'});
 add('r1','2026-10-03','작업 2',{result:'회의 결과 공유',created:3});
 add('run','2026-10-03','회의 진행',{status:'running',started:NOW-120000,created:4});
 add('other','2026-10-03','회의',{owner:'someone'});
 add('old','2025-10-01','회의');
 const found=await search('회의','2026-10-01','2026-10-31',{now:NOW});
 assert.equal(found.more,false);
 assert.equal(found.total,4,'total excludes other owner and out-of-range');
 assert.deepEqual(found.results.map(t=>t.id),['run','r1','n1','t1'],'day DESC, created DESC; other owner and out-of-range excluded');
 assert.deepEqual(found.results.map(t=>[t.field,t.snippet]),[['title',null],['result','회의 결과 공유'],['note','오늘 회의에서 결정'],['title',null]]);
 assert.equal(found.results[0].elapsed,180000,'running task counts up to now');
 assert.deepEqual(Object.keys(found.results[1]).sort(),['day','elapsed','field','id','snippet','status','title'],'no full note/result in response');

 // %·_·\는 글자 그대로, 대소문자는 ASCII만 무시
 add('pct','2026-11-01','100% done');
 add('und','2026-11-01','a_b');
 add('bsl','2026-11-01','c\\d');
 add('plain','2026-11-01','100 DONE axb');
 const ids=async q=>(await search(q,'2026-11-01','2026-11-01')).results.map(t=>t.id).sort();
 assert.deepEqual(await ids('%'),['pct']);
 assert.deepEqual(await ids('_'),['und']);
 assert.deepEqual(await ids('\\'),['bsl']);
 assert.deepEqual(await ids('done'),['pct','plain']);
 assert.equal(fx.findMatch('ABC','b'),1);
 assert.equal(fx.findMatch('ÉCOLE','école'),-1,'non-ASCII case is not folded');
 assert.equal(fx.findMatch('İİx','x'),2,'index is in the original text');

 // 발췌: 앞뒤 40자, 잘린 쪽에만 생략 부호, 소문자화로 길이가 바뀌는 문자에서도 원문 위치
 const a=n=>'a'.repeat(n),b=n=>'b'.repeat(n);
 add('mid','2026-11-02','x',{note:a(100)+'키워드'+b(100),created:4});
 add('start','2026-11-02','x',{note:'키워드'+b(100),created:3});
 add('end','2026-11-02','x',{result:a(100)+'키워드',created:2});
 add('dotted','2026-11-02','x',{note:'İ'.repeat(100)+'키워드',created:1});
 assert.deepEqual((await search('키워드','2026-11-02','2026-11-02')).results.map(t=>t.snippet),[
  '…'+a(40)+'키워드'+b(40)+'…','키워드'+b(40)+'…','…'+a(40)+'키워드','…'+'İ'.repeat(40)+'키워드']);

 // 10건씩 페이지: 남은 기록이 11건 이상이면 more:true, 10건 이하면 false. 같은 시각 기록은 id 역순으로 겹침·누락 없이 이어진다.
 const many=Array.from({length:25},(_,i)=>'p'+String(i).padStart(2,'0'));
 for(const id of many)add(id,'2026-12-01','반복 '+id,{created:0});
 const page=offset=>search('반복','2026-12-01','2026-12-01',{offset});
 const pages=[await page(0),await page(10),await page(20)];
 assert.deepEqual(pages.map(p=>[p.results.length,p.more,p.total]),[[10,true,25],[10,true,25],[5,false,25]]);
 assert.deepEqual(pages.flatMap(p=>p.results.map(t=>t.id)),[...many].reverse());
 assert.deepEqual([(await page(14)).more,(await page(15)).more],[true,false],'11 left vs exactly 10 left');

 // 라우트: 검색어 trim, 특수문자 전달, 검증, 인증, 오류, no-store
 add('special','2026-10-10','a+b&c#d%e\\f');
 let r=await get({q:' +b&c#d%e\\ ',from:'2026-10-01',to:'2026-10-31'});
 assert.equal(r.status,200);assert.equal(r.cache,'no-store');
 assert.deepEqual(r.body.results.map(t=>t.id),['special']);
 assert.equal((await get({q:'회의',from:'2025-10-31',to:'2026-10-31'})).status,200,'366 days is allowed');
 r=await get({q:'반복',from:'2026-12-01',to:'2026-12-01',offset:'20'});
 assert.equal(r.status,200);assert.deepEqual([r.body.results.length,r.body.more,r.body.total],[5,false,25]);
 for(const params of [
  {q:'   ',from:'2026-10-01',to:'2026-10-31'},
  {q:'가'.repeat(101),from:'2026-10-01',to:'2026-10-31'},
  {q:'회의',to:'2026-10-31'},
  {q:'회의',from:'2026-10-01'},
  {q:'회의',from:'2026-13-01',to:'2026-12-31'},
  {q:'회의',from:'2026-10-31',to:'2026-10-01'},
  {q:'회의',from:'2025-10-30',to:'2026-10-31'},
  ...['-1','a','1.5','','1234567'].map(offset=>({q:'회의',from:'2026-10-01',to:'2026-10-31',offset})),
 ]){r=await get(params);assert.equal(r.status,400,JSON.stringify(params));assert.equal(r.cache,'no-store');}
 const valid={q:'회의',from:'2026-10-01',to:'2026-10-31'};
 const error=console.error;console.error=()=>{};
 try{
  user=null;r=await get(valid);assert.equal(r.status,401);assert.equal(r.cache,'no-store');user={userId:'owner'};
  authDown=true;r=await get(valid);assert.equal(r.status,503,'auth lookup error');assert.equal(r.cache,'no-store');authDown=false;
  dbDown=true;r=await get(valid);assert.equal(r.status,503,'search query error');assert.equal(r.cache,'no-store');dbDown=false;
 }finally{console.error=error;}

 // Postgres 변환: 자리표시자 순서와 GREATEST, ESCAPE 리터럴 유지
 globalThis.rawFixture={neon:()=>null};
 const raw=await load('db/raw.ts','const {neon}=globalThis.rawFixture;','\nexport {postgresSql};');
 const sql=raw.postgresSql(sqlLog.find(q=>q.includes('LIKE')&&q.includes('ORDER BY')));
 assert.match(raw.postgresSql(sqlLog.find(q=>q.includes('LIKE')&&q.includes('COUNT(*)'))),/owner=\$1 AND day>=\$2 AND day<=\$3 AND .*LIKE \$6 ESCAPE '\\'\)$/);
 assert.match(sql,/GREATEST\(0, \$1-started\)/);
 assert.match(sql,/owner=\$2 AND day>=\$3 AND day<=\$4 AND \(LOWER\(title\) LIKE \$5 ESCAPE '\\' OR LOWER\(note\) LIKE \$6 ESCAPE '\\' OR LOWER\(result\) LIKE \$7 ESCAPE '\\'\)/);
 assert.match(sql,/ORDER BY day DESC,created DESC,id DESC LIMIT \$8 OFFSET \$9$/);
 delete globalThis.rawFixture;
 delete globalThis.searchFixture;
});
