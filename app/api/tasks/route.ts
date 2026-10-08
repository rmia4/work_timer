import {getCodeUser} from '../../_auth/code-auth';
import {sameOrigin} from '../../../lib/auth';
import {database} from '../../../db/raw';
import {validTimes} from '../../../lib/work-dates';
const reply=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const dayValid=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
type Db=ReturnType<typeof database>;
// 측정 구간: 하루 요약 시계가 일시정지·재기록 사이의 빈 시간을 그리지 않도록 running 구간만 저장한다.
const addSession=(db:Db,task:string,owner:string,start:number,end:number|null)=>db.prepare('INSERT INTO task_sessions (id,task_id,owner,start_at,end_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),task,owner,start,end).run();
const closeSession=(db:Db,task:string,owner:string,end:number)=>db.prepare('UPDATE task_sessions SET end_at=? WHERE task_id=? AND owner=? AND end_at IS NULL').bind(end,task,owner).run();
// 구간 기록 이전에 만든 업무를 다시 측정하면, 기존 시작–종료 범위를 첫 구간으로 남긴다.
async function seedLegacy(db:Db,task:string,owner:string,start:number|null,end:number|null){
 if(start===null||end===null||end<=start)return;
 if(!await db.prepare('SELECT 1 FROM task_sessions WHERE task_id=? AND owner=? LIMIT 1').bind(task,owner).first())await addSession(db,task,owner,start,end);
}
const sameMinute=(a:number|null,b:number|null)=>a===null||b===null?a===b:Math.floor(a/60000)===Math.floor(b/60000);
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const day=new URL(req.url).searchParams.get('day');if(!dayValid(day))return reply({error:'날짜를 확인해 주세요.'},400);
 try{const db=database(),result=await db.prepare("SELECT * FROM tasks WHERE owner=? AND (day=? OR status!='done') ORDER BY created DESC").bind(user.userId,day).all();
 const spans=await db.prepare("SELECT task_id,start_at,end_at FROM task_sessions WHERE owner=? AND task_id IN (SELECT id FROM tasks WHERE owner=? AND (day=? OR status!='done')) ORDER BY start_at").bind(user.userId,user.userId,day).all();
 const tasks=result.results.map(t=>({...t,sessions:spans.results.filter(s=>s.task_id===t.id).map(s=>({start_at:s.start_at,end_at:s.end_at}))}));
 return reply({tasks,now:Date.now()});}
 catch(e){console.error(e);return reply({error:'기록을 불러오지 못했습니다. 다시 시도해 주세요.'},503);}
}
export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 if(!sameOrigin(req,process.env.APP_ORIGIN))return reply({error:'허용되지 않은 요청입니다.'},403);
 let b:any;try{b=await req.json();}catch{return reply({error:'요청을 확인해 주세요.'},400);}
 if(!b||typeof b!=='object')return reply({error:'요청을 확인해 주세요.'},400);
 try{
 const db=database(),now=Date.now(),owner=user.userId;
 if(b.action==='create'){
 if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||!dayValid(b.day)||typeof b.note!=='string'||b.note.length>20000||typeof b.result!=='string'||b.result.length>20000||!Number.isSafeInteger(b.target)||b.target<0||b.target>31536000000||!Number.isSafeInteger(b.elapsed)||b.elapsed<0||b.elapsed>31536000000)return reply({error:'제목, 날짜, 시간을 확인해 주세요.'},400);
 const first=b.run?now:(b.started_at??null),last=b.run?null:(b.ended_at??null);
 if(!validTimes(first,last))return reply({error:'종료 시각은 시작 시각 이후여야 합니다.'},400);
 const taskId=crypto.randomUUID();
 // 바로 측정을 시작하는 기록은 보고 있는 날짜와 상관없이 오늘(KST)에 저장한다.
 const day=b.run?new Date(now+9*3600000).toISOString().slice(0,10):b.day;
 await db.prepare('INSERT INTO tasks (id,owner,day,title,note,result,target,elapsed,started,status,created,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(taskId,owner,day,b.title.trim(),b.note,b.result,b.target,b.run?0:b.elapsed,b.run?now:null,b.run?'running':'done',now,first,last).run();
 if(first!==null&&(b.run||last!==null))await addSession(db,taskId,owner,first,last);
 }else{
 if(typeof b.id!=='string'||!Number.isInteger(b.version))return reply({error:'기록을 다시 불러와 주세요.'},400);
 const t:any=await db.prepare('SELECT * FROM tasks WHERE id=? AND owner=?').bind(b.id,owner).first();
 if(!t)return reply({error:'기록이 없습니다.'},404);
 if(t.version!==b.version)return reply({error:'다른 기기에서 변경되었습니다. 다시 시도해 주세요.'},409);
 let q,after:(()=>Promise<unknown>)|undefined;
 if(b.action==='delete'){if(t.status!=='done')return reply({error:'측정을 종료한 뒤 삭제해 주세요.'},400);q=db.prepare('DELETE FROM tasks WHERE id=? AND owner=? AND version=?').bind(t.id,owner,t.version);}
 else if(b.action==='edit'){
 if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||typeof b.note!=='string'||b.note.length>20000||typeof b.result!=='string'||b.result.length>20000||!dayValid(b.day)||!Number.isSafeInteger(b.target)||b.target<0||b.target>31536000000||!Number.isSafeInteger(b.elapsed)||b.elapsed<0||b.elapsed>31536000000)return reply({error:'입력 내용을 확인해 주세요.'},400);
 if(t.status!=='done')return reply({error:'측정을 종료한 뒤 수정해 주세요.'},400);
 const run=b.run===true;
 const first=b.started_at===undefined?t.started_at:b.started_at,last=run?null:(b.ended_at===undefined?t.ended_at:b.ended_at);
 if(!validTimes(first,last))return reply({error:'종료 시각은 시작 시각 이후여야 합니다.'},400);
 q=db.prepare('UPDATE tasks SET title=?,note=?,result=?,day=?,target=?,elapsed=?,started=?,status=?,started_at=?,ended_at=?,version=version+1 WHERE id=? AND owner=? AND version=?').bind(b.title.trim(),b.note,b.result,b.day,b.target,b.elapsed,run?now:null,run?'running':'done',first??(run?now:null),last,t.id,owner,t.version);
 if(run)after=async()=>{await seedLegacy(db,t.id,owner,first,t.ended_at);await addSession(db,t.id,owner,now,null);};
 else if(!sameMinute(first,t.started_at)||!sameMinute(last,t.ended_at))after=async()=>{await db.prepare('DELETE FROM task_sessions WHERE task_id=? AND owner=?').bind(t.id,owner).run();if(first!==null&&last!==null)await addSession(db,t.id,owner,first,last);};
 }else{
 const transitions:Record<string,string>={pause:'paused',resume:'running',finish:'done'};
 if(!transitions[b.action]||(b.action==='pause'&&t.status!=='running')||(b.action==='resume'&&t.status!=='paused')||(b.action==='finish'&&t.status==='done'))return reply({error:'타이머 상태를 다시 확인해 주세요.'},409);
 if(b.action==='finish'&&(typeof b.result!=='string'||b.result.length>20000))return reply({error:'업무 결과를 확인해 주세요.'},400);
 const elapsed=t.elapsed+(t.started===null?0:Math.max(0,now-t.started));
 q=db.prepare('UPDATE tasks SET elapsed=?,started=?,status=?,ended_at=?,result=?,version=version+1 WHERE id=? AND owner=? AND version=?').bind(elapsed,b.action==='resume'?now:null,transitions[b.action],b.action==='finish'?now:t.ended_at,b.action==='finish'?b.result:t.result,t.id,owner,t.version);
 after=b.action==='resume'?async()=>{await seedLegacy(db,t.id,owner,t.started_at,t.ended_at??(t.started_at===null?null:t.started_at+t.elapsed));await addSession(db,t.id,owner,now,null);}:()=>closeSession(db,t.id,owner,now);
 }
 const result=await q.run();if(!result.meta.changes)return reply({error:'다른 기기에서 변경되었습니다. 다시 시도해 주세요.'},409);
 if(after)await after();
 }
 return reply({ok:true});
 }catch(e){console.error(e);if((e as {code?:string})?.code==='23505')return reply({error:'진행 중인 작업을 먼저 종료해 주세요.'},409);return reply({error:'저장하지 못했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.'},503);}
}
