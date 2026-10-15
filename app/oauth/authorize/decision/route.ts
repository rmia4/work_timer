import {getCodeUser} from '../../../_auth/code-auth';
import {clientAddress,sameOrigin} from '../../../../lib/auth';
import {database} from '../../../../db/raw';
import {checkAuthorizeRequest,authorizeRedirect,approve,readBody} from '../../../../lib/oauth';
const reply=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
// 동의 화면의 허용·거부. 인가 요청을 다시 검증하고 앱으로 돌아갈 주소를 돌려준다.
export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 // 연결 허용은 웹앱 화면에서만 받는다(확장 출처는 허용하지 않음).
 if(!sameOrigin(req,process.env.APP_ORIGIN))return reply({error:'허용되지 않은 요청입니다.'},403);
 try{
  const input=await readBody(req,8*1024);if(input===null)return reply({error:'요청을 확인해 주세요.'},400);
  let body;try{body=JSON.parse(input);}catch{return reply({error:'요청을 확인해 주세요.'},400);}
  if(typeof body?.query!=='string'||typeof body.approve!=='boolean')return reply({error:'요청을 확인해 주세요.'},400);
  const db=database(),now=Date.now(),check=await checkAuthorizeRequest(db,new URLSearchParams(body.query),now,clientAddress(req));
  if(!check.ok)return check.redirect?reply({redirect:check.redirect}):reply({error:check.message},400);
  const r=check.request;
  if(!body.approve)return reply({redirect:authorizeRedirect(r.redirectUri,{error:'access_denied',state:r.state})});
  return reply({redirect:await approve(db,user.userId,r,now)});
 }catch(e){console.error('OAuth decision failed',e);return reply({error:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
