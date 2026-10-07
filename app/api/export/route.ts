import {getCodeUser} from '../../_auth/code-auth';
import {database} from '../../../db/raw';
import {tasksCsv,validRange,type ExportRow} from '../../../lib/stats';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const params=new URL(req.url).searchParams,from=params.get('from'),to=params.get('to');
 if(!validRange(from,to,366))return reply({error:'기간을 확인해 주세요.'},400);
 try{
 const now=Date.now();
 const result=await database().prepare("SELECT day,title,note,result,target,elapsed+CASE WHEN started IS NULL THEN 0 ELSE MAX(0,?-started) END AS elapsed,started_at,ended_at,status FROM tasks WHERE owner=? AND day>=? AND day<=? ORDER BY day,created").bind(now,user.userId,from,to).all<ExportRow>();
 return new Response(tasksCsv(result.results),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="work-timer_${from}_${to}.csv"`,'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return reply({error:'데이터를 내보내지 못했습니다.'},503);}
}
