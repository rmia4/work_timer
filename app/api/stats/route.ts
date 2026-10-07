import {getCodeUser} from '../../_auth/code-auth';
import {database} from '../../../db/raw';
import {validRange} from '../../../lib/stats';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const params=new URL(req.url).searchParams,from=params.get('from'),to=params.get('to');
 if(!validRange(from,to,371))return reply({error:'기간을 확인해 주세요.'},400);
 try{
 const now=Date.now();
 const result=await database().prepare("SELECT day,COUNT(*) AS count,SUM(elapsed+CASE WHEN started IS NULL THEN 0 ELSE MAX(0,?-started) END) AS total FROM tasks WHERE owner=? AND day>=? AND day<=? GROUP BY day").bind(now,user.userId,from,to).all();
 return reply({days:result.results,now});
 }catch(e){console.error(e);return reply({error:'통계를 불러오지 못했습니다.'},503);}
}
