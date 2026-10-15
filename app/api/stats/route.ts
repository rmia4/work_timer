import {getCodeUser} from '../../_auth/code-auth';
import {database} from '../../../db/raw';
import {validRange} from '../../../lib/stats';
import {dayTotals} from '../../../lib/task-service';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const params=new URL(req.url).searchParams,from=params.get('from'),to=params.get('to');
 if(!validRange(from,to,371))return reply({error:'기간을 확인해 주세요.'},400);
 try{
 const now=Date.now();
 return reply({days:await dayTotals(database(),user.userId,from,to as string,now),now});
 }catch(e){console.error(e);return reply({error:'통계를 불러오지 못했습니다.'},503);}
}
