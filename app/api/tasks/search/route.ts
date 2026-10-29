import {getCodeUser} from '../../../_auth/code-auth';
import {database} from '../../../../db/raw';
import {validRange} from '../../../../lib/stats';
import {searchTasks} from '../../../../lib/task-service';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// 통계 > 검색. 인증 조회도 DB를 쓰므로 그 오류까지 503으로 응답한다.
export async function GET(req:Request){
 try{
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 const params=new URL(req.url).searchParams,q=(params.get('q')??'').trim(),from=params.get('from'),to=params.get('to'),offset=params.get('offset')??'0';
 if(!q||q.length>100)return reply({error:'검색어를 확인해 주세요.'},400);
 if(!validRange(from,to,366))return reply({error:'기간을 확인해 주세요.'},400);
 // 「더 보기」로 이어 받을 위치. 0 이상 정수만 받는다.
 if(!/^\d{1,6}$/.test(offset))return reply({error:'요청을 확인해 주세요.'},400);
 return reply(await searchTasks(database(),user.userId,q,from,to as string,Number(offset),Date.now()));
 }catch(e){console.error(e);return reply({error:'검색하지 못했습니다. 다시 시도해 주세요.'},503);}
}
