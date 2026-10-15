import {McpServer,type AuthInfo} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type {database} from '../db/raw';
import {verifyAccessToken,resourceUrl} from './oauth';
import {listTasks,dayTotals} from './task-service';
import {validRange} from './stats';
import {validDay} from './work-dates';
// MCP 서버(/api/mcp)의 인증과 도구. 요청마다 서버를 새로 만들고(stateless), 토큰 주인의 기록만 다룬다.
// 시각은 한국 시간 ISO 문자열, 시간 길이는 분 단위 정수로 내보내고 내부 epoch ms는 노출하지 않는다.
type Db=ReturnType<typeof database>;
type TaskRow=Record<string,unknown>&{id:string;day:string;title:string;note:string;result:string;status:string;target:number;elapsed:number;started:number|null;started_at:number|null;ended_at:number|null;version:number};
const KST_MS=9*3600000;
export const kstIso=(t:number|null)=>t===null?null:new Date(t+KST_MS).toISOString().slice(0,19)+'+09:00';
const kstToday=(now:number)=>new Date(now+KST_MS).toISOString().slice(0,10);
const minutes=(ms:number)=>Math.floor(Math.max(0,ms)/60000);

// Bearer 토큰을 확인하고 연결의 마지막 사용 시각을 분 단위로만 갱신한다. 유효하지 않으면 null.
export async function authenticate(db:Db,header:string|null,now:number):Promise<AuthInfo|null>{
 const match=/^Bearer ([A-Za-z0-9]+)$/i.exec(header||'');if(!match)return null;
 const grant=await verifyAccessToken(db,match[1],now);if(!grant)return null;
 await db.prepare('UPDATE oauth_grants SET last_used=? WHERE id=? AND (last_used IS NULL OR last_used<=?)').bind(now,grant.grantId,now-60000).run();
 return {token:match[1],clientId:grant.clientId,scopes:grant.scopes,resource:new URL(resourceUrl()),extra:{owner:grant.owner}};
}

function taskView(t:TaskRow,now:number){
 return {id:t.id,day:t.day,title:t.title,status:t.status,minutes:minutes(t.elapsed+(t.started===null?0:now-t.started)),target_minutes:t.target?minutes(t.target):null,
  started_at:kstIso(t.started_at),ended_at:kstIso(t.ended_at),note:t.note,result:t.result,version:t.version};
}
// 사용자 입력 텍스트는 데이터 필드에만 담는다. 텍스트 결과에는 한 줄 요약과 같은 JSON을 함께 넣는다.
const ok=(summary:string,data:Record<string,unknown>)=>({content:[{type:'text' as const,text:summary+'\n'+JSON.stringify(data)}],structuredContent:data});
const toolError=(message:string)=>({content:[{type:'text' as const,text:message}],isError:true});
const readOnly={readOnlyHint:true,openWorldHint:false};
const dayInput=z.string().describe('YYYY-MM-DD (한국 시간 기준 날짜)');

export function createMcpServer(db:Db,auth:AuthInfo,now=()=>Date.now()){
 const owner=auth.extra?.owner as string;
 const server=new McpServer({name:'work-timer',version:'1.0.0'});
 if(!auth.scopes.includes('tasks:read'))return server;
 server.registerTool('get_current_work',{title:'진행 중인 작업',description:'진행 중이거나 일시정지된 작업 1건과 경과 시간(분)을 돌려준다. 없으면 task가 null이다.',annotations:readOnly},async()=>{
  const t=await db.prepare("SELECT * FROM tasks WHERE owner=? AND status<>'done' ORDER BY created DESC").bind(owner).first<TaskRow>();
  const task=t&&taskView(t,now());
  return ok(task?`${task.status==='running'?'진행 중':'일시정지'}: ${task.minutes}분 경과`:'진행 중인 작업이 없습니다.',{task});
 });
 server.registerTool('list_tasks',{title:'날짜별 작업 목록',description:'한 날짜의 작업 목록(제목, 상태, 소요 분, 시작·종료 시각, 내용, 결과)을 만든 순서의 역순으로 돌려준다. day를 생략하면 오늘이다.',inputSchema:z.object({day:dayInput.optional()}),annotations:readOnly},async({day})=>{
  const target=day??kstToday(now());
  if(!validDay(target))return toolError('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const at=now(),tasks=(await listTasks(db,owner,target) as unknown as TaskRow[]).filter(t=>t.day===target).map(t=>taskView(t,at));
  return ok(`${target} 작업 ${tasks.length}건, 합계 ${tasks.reduce((sum,t)=>sum+t.minutes,0)}분`,{day:target,tasks});
 });
 server.registerTool('get_stats',{title:'기간 통계',description:'기간(최대 371일)의 총 작업 시간(분), 작업 수, 일별 합계를 돌려준다. 기록이 없는 날은 days에 없다.',inputSchema:z.object({from:dayInput,to:dayInput}),annotations:readOnly},async({from,to})=>{
  if(!validRange(from,to,371))return toolError('기간을 확인해 주세요. from과 to는 YYYY-MM-DD이고 from≤to, 최대 371일입니다.');
  const days=(await dayTotals(db,owner,from,to,now())).map(d=>({day:d.day,minutes:minutes(Number(d.total)),tasks:Number(d.count)})).sort((a,b)=>a.day.localeCompare(b.day));
  const total=days.reduce((sum,d)=>sum+d.minutes,0),count=days.reduce((sum,d)=>sum+d.tasks,0);
  return ok(`${from} ~ ${to}: 작업 ${count}건, 합계 ${total}분`,{from,to,total_minutes:total,task_count:count,days});
 });
 server.registerTool('get_memos',{title:'메모',description:'날짜와 상관없는 전역 메모와 한 날짜의 메모를 돌려준다. day를 생략하면 오늘이다.',inputSchema:z.object({day:dayInput.optional()}),annotations:readOnly},async({day})=>{
  const target=day??kstToday(now());
  if(!validDay(target))return toolError('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const memos=await db.prepare('SELECT id,title,body FROM memos WHERE owner=? ORDER BY position,created').bind(owner).all();
  const daily=await db.prepare('SELECT id,title,body,version FROM daily_memos WHERE owner=? AND day=? ORDER BY position,created').bind(owner,target).all();
  return ok(`전역 메모 ${memos.results.length}건, ${target} 메모 ${daily.results.length}건`,{memos:memos.results,day:target,daily_memos:daily.results});
 });
 return server;
}
