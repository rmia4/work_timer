import {getCodeUser} from '../../_auth/code-auth';
import {database} from '../../../db/raw';
import {tasksCsv,validRange,validScope} from '../../../lib/stats';
import {exportRows} from '../../../lib/task-service';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const params=new URL(req.url).searchParams,from=params.get('from'),to=params.get('to'),scope=params.get('scope');
 if(!validRange(from,to,366))return reply({error:'기간을 확인해 주세요.'},400);
 if(!validScope(scope))return reply({error:'내보내기 범위를 확인해 주세요.'},400);
 try{
 const rows=await exportRows(database(),user.userId,from,to!,Date.now());
 return new Response(tasksCsv(rows,scope),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="work-timer_${from}_${to}.csv"`,'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return reply({error:'데이터를 내보내지 못했습니다.'},503);}
}
