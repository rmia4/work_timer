import {getCodeUser} from '../../_auth/code-auth';
import {database} from '../../../db/raw';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const month=new URL(req.url).searchParams.get('month');
 if(!month||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1900||Number(month.slice(0,4))>9998)return reply({error:'월을 확인해 주세요.'},400);
 try{
 const now=Date.now();
 const result=await database().prepare("SELECT day,COUNT(*) AS count,SUM(elapsed+CASE WHEN started IS NULL THEN 0 ELSE MAX(0,?-started) END) AS total,SUM(CASE WHEN started IS NULL THEN 0 ELSE 1 END) AS running FROM tasks WHERE owner=? AND day>=? AND day<=? GROUP BY day").bind(now,user.userId,month+'-01',month+'-31').all();
 return reply({days:result.results,now});
 }catch(e){console.error(e);return reply({error:'캘린더 기록을 불러오지 못했습니다.'},503);}
}
