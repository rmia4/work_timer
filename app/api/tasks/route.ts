import {getCodeUser} from '../../_auth/code-auth';
import {trustedOrigin} from '../../../lib/auth';
import {database} from '../../../db/raw';
import {validDay} from '../../../lib/work-dates';
import {listTasks,applyTaskAction,type TaskBody} from '../../../lib/task-service';
const reply=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const day=new URL(req.url).searchParams.get('day');if(!validDay(day))return reply({error:'날짜를 확인해 주세요.'},400);
 try{const tasks=await listTasks(database(),user.userId,day);return reply({tasks,now:Date.now()});}
 catch(e){console.error(e);return reply({error:'기록을 불러오지 못했습니다. 다시 시도해 주세요.'},503);}
}
export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 if(!trustedOrigin(req))return reply({error:'허용되지 않은 요청입니다.'},403);
 let b:TaskBody;try{
 const limit=256*1024;if(Number(req.headers.get('content-length')||0)>limit)return reply({error:'요청을 확인해 주세요.'},400);
 const input=await req.text();if(input.length>limit||new TextEncoder().encode(input).length>limit)return reply({error:'요청을 확인해 주세요.'},400);
 b=JSON.parse(input);
 }catch{return reply({error:'요청을 확인해 주세요.'},400);}
 if(!b||typeof b!=='object')return reply({error:'요청을 확인해 주세요.'},400);
 try{
 const failure=await applyTaskAction(database(),user.userId,b);
 return failure?reply({error:failure.error},failure.status):reply({ok:true});
 }catch(e){console.error(e);return reply({error:'저장하지 못했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.'},503);}
}
