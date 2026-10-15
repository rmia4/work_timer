import type {database} from '../db/raw';
import {validDay,validTimes} from './work-dates';
// 업무 기록의 검증·SQL·상태 전이. 웹 API(/api/tasks)와 MCP가 같은 규칙을 쓰도록 여기에 모은다.
type Db=ReturnType<typeof database>;
type TaskRow=Record<string,unknown>&{id:string;version:number;status:string;elapsed:number;started:number|null;started_at:number|null;ended_at:number|null;result:string};
export type TaskBody=Record<string,unknown>;
export type TaskFailure={status:number;error:string};
const fail=(error:string,status:number):TaskFailure=>({error,status});
// 측정 구간: 하루 요약 시계가 일시정지·재기록 사이의 빈 시간을 그리지 않도록 running 구간만 저장한다.
const sessionGuard='EXISTS (SELECT 1 FROM tasks WHERE id=? AND owner=? AND version=?)';
const addSession=(db:Db,task:string,owner:string,start:number,end:number|null,version=0)=>db.prepare(`INSERT INTO task_sessions (id,task_id,owner,start_at,end_at) SELECT ?,?,?,?,? WHERE ${sessionGuard}`).bind(crypto.randomUUID(),task,owner,start,end,task,owner,version);
const closeSession=(db:Db,task:string,owner:string,end:number,version:number)=>db.prepare(`UPDATE task_sessions SET end_at=? WHERE task_id=? AND owner=? AND end_at IS NULL AND ${sessionGuard}`).bind(end,task,owner,task,owner,version);
// 구간 기록 이전에 만든 업무를 다시 측정하면, 기존 시작–종료 범위를 첫 구간으로 남긴다.
function seedLegacy(db:Db,task:string,owner:string,start:number|null,end:number|null,version:number){
 if(start===null||end===null||end<=start)return [];
 return [db.prepare(`INSERT INTO task_sessions (id,task_id,owner,start_at,end_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM task_sessions WHERE task_id=? AND owner=?) AND ${sessionGuard}`).bind(crypto.randomUUID(),task,owner,start,end,task,owner,task,owner,version)];
}
const sameMinute=(a:number|null,b:number|null)=>a===null||b===null?a===b:Math.floor(a/60000)===Math.floor(b/60000);
// 그날 업무와 끝나지 않은 업무를 측정 구간과 함께 돌려준다. day는 호출하는 쪽에서 검증한다.
export async function listTasks(db:Db,owner:string,day:string){
 const result=await db.prepare("SELECT * FROM tasks WHERE owner=? AND (day=? OR status!='done') ORDER BY created DESC").bind(owner,day).all<TaskRow>();
 const spans=await db.prepare("SELECT task_id,start_at,end_at FROM task_sessions WHERE owner=? AND task_id IN (SELECT id FROM tasks WHERE owner=? AND (day=? OR status!='done')) ORDER BY start_at").bind(owner,owner,day).all();
 return result.results.map(t=>({...t,sessions:spans.results.filter(s=>s.task_id===t.id).map(s=>({start_at:s.start_at,end_at:s.end_at}))}));
}
// 기간의 날짜별 작업 수와 합계 시간(ms). 측정 중인 작업은 now까지 센다. 기간은 호출하는 쪽에서 검증한다.
export async function dayTotals(db:Db,owner:string,from:string,to:string,now:number){
 const result=await db.prepare("SELECT day,COUNT(*) AS count,SUM(elapsed+CASE WHEN started IS NULL THEN 0 ELSE MAX(0,?-started) END) AS total FROM tasks WHERE owner=? AND day>=? AND day<=? GROUP BY day").bind(now,owner,from,to).all<{day:string;count:number;total:number}>();
 return result.results;
}
// 업무 생성·수정·삭제·상태 전이를 처리한다. 성공하면 null, 사용자에게 보일 실패는 TaskFailure를 돌려준다.
// 그 밖의 DB 오류는 그대로 던진다.
export async function applyTaskAction(db:Db,owner:string,b:TaskBody,now=Date.now()):Promise<TaskFailure|null>{
 try{return await apply(db,owner,b,now);}
 catch(e){if((e as {code?:string})?.code==='23505')return fail('진행 중인 작업을 먼저 종료해 주세요.',409);throw e;}
}
async function apply(db:Db,owner:string,b:TaskBody,now:number):Promise<TaskFailure|null>{
 if(b.action==='create'){
 if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||!validDay(b.day)||typeof b.note!=='string'||b.note.length>20000||typeof b.result!=='string'||b.result.length>20000||typeof b.target!=='number'||!Number.isSafeInteger(b.target)||b.target<0||b.target>31536000000||typeof b.elapsed!=='number'||!Number.isSafeInteger(b.elapsed)||b.elapsed<0||b.elapsed>31536000000)return fail('제목, 날짜, 시간을 확인해 주세요.',400);
 const rawFirst=b.run?now:(b.started_at??null),rawLast=b.run?null:(b.ended_at??null);
 if(!validTimes(rawFirst,rawLast))return fail('종료 시각은 시작 시각 이후여야 합니다.',400);
 const first=rawFirst as number|null,last=rawLast as number|null;
 const taskId=crypto.randomUUID();
 // 바로 측정을 시작하는 기록은 보고 있는 날짜와 상관없이 오늘(KST)에 저장한다.
 const day=b.run?new Date(now+9*3600000).toISOString().slice(0,10):b.day;
 const statements=[db.prepare('INSERT INTO tasks (id,owner,day,title,note,result,target,elapsed,started,status,created,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(taskId,owner,day,b.title.trim(),b.note,b.result,b.target,b.run?0:b.elapsed,b.run?now:null,b.run?'running':'done',now,first,last)];
 if(first!==null&&(b.run||last!==null))statements.push(addSession(db,taskId,owner,first,last));
 await db.batch(statements);
 return null;
 }
 if(typeof b.id!=='string'||!Number.isInteger(b.version))return fail('기록을 다시 불러와 주세요.',400);
 const t=await db.prepare('SELECT * FROM tasks WHERE id=? AND owner=?').bind(b.id,owner).first<TaskRow>();
 if(!t)return fail('기록이 없습니다.',404);
 if(t.version!==b.version)return fail('다른 기기에서 변경되었습니다. 다시 시도해 주세요.',409);
 let q;const sessions:ReturnType<Db['prepare']>[]=[];const version=t.version;
 if(b.action==='delete'){if(t.status!=='done')return fail('측정을 종료한 뒤 삭제해 주세요.',400);q=db.prepare('DELETE FROM tasks WHERE id=? AND owner=? AND version=?').bind(t.id,owner,t.version);}
 else if(b.action==='edit'){
 if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||typeof b.note!=='string'||b.note.length>20000||typeof b.result!=='string'||b.result.length>20000||!validDay(b.day)||typeof b.target!=='number'||!Number.isSafeInteger(b.target)||b.target<0||b.target>31536000000||typeof b.elapsed!=='number'||!Number.isSafeInteger(b.elapsed)||b.elapsed<0||b.elapsed>31536000000)return fail('입력 내용을 확인해 주세요.',400);
 if(t.status!=='done')return fail('측정을 종료한 뒤 수정해 주세요.',400);
 const run=b.run===true;
 const rawFirst=b.started_at===undefined?t.started_at:b.started_at,rawLast=run?null:(b.ended_at===undefined?t.ended_at:b.ended_at);
 if(!validTimes(rawFirst,rawLast))return fail('종료 시각은 시작 시각 이후여야 합니다.',400);
 const first=rawFirst as number|null,last=rawLast as number|null;
 q=db.prepare('UPDATE tasks SET title=?,note=?,result=?,day=?,target=?,elapsed=?,started=?,status=?,started_at=?,ended_at=?,version=version+1 WHERE id=? AND owner=? AND version=?').bind(b.title.trim(),b.note,b.result,b.day,b.target,b.elapsed,run?now:null,run?'running':'done',first??(run?now:null),last,t.id,owner,t.version);
 if(run)sessions.push(...seedLegacy(db,t.id,owner,first,t.ended_at,version),addSession(db,t.id,owner,now,null,version));
 else if(!sameMinute(first,t.started_at)||!sameMinute(last,t.ended_at)){
 sessions.push(db.prepare(`DELETE FROM task_sessions WHERE task_id=? AND owner=? AND ${sessionGuard}`).bind(t.id,owner,t.id,owner,version));
 if(first!==null&&last!==null)sessions.push(addSession(db,t.id,owner,first,last,version));
 }
 }else{
 const transitions:Record<string,string>={pause:'paused',resume:'running',finish:'done'};
 if(typeof b.action!=='string'||!transitions[b.action]||(b.action==='pause'&&t.status!=='running')||(b.action==='resume'&&t.status!=='paused')||(b.action==='finish'&&t.status==='done'))return fail('타이머 상태를 다시 확인해 주세요.',409);
 if(b.action==='finish'&&(typeof b.result!=='string'||b.result.length>20000))return fail('업무 결과를 확인해 주세요.',400);
 const elapsed=t.elapsed+(t.started===null?0:Math.max(0,now-t.started));
 q=db.prepare('UPDATE tasks SET elapsed=?,started=?,status=?,ended_at=?,result=?,version=version+1 WHERE id=? AND owner=? AND version=?').bind(elapsed,b.action==='resume'?now:null,transitions[b.action],b.action==='finish'?now:t.ended_at,b.action==='finish'?b.result:t.result,t.id,owner,t.version);
 if(b.action==='resume')sessions.push(...seedLegacy(db,t.id,owner,t.started_at,t.ended_at??(t.started_at===null?null:t.started_at+t.elapsed),version),addSession(db,t.id,owner,now,null,version));
 else sessions.push(closeSession(db,t.id,owner,now,version));
 }
 // 먼저 기존 버전의 업무 행을 잠그고, 같은 버전에만 구간을 변경한 뒤 업무 상태를 바꾼다.
 // 버전이 이미 바뀐 경우 트랜잭션 없는 SQLite 테스트 어댑터에서도 구간은 변경되지 않는다.
 const lock=db.prepare('UPDATE tasks SET version=version WHERE id=? AND owner=? AND version=?').bind(t.id,owner,t.version);
 const results=await db.batch(sessions.length?[lock,...sessions,q]:[q]);if(!results[results.length-1].meta.changes)return fail('다른 기기에서 변경되었습니다. 다시 시도해 주세요.',409);
 return null;
}
