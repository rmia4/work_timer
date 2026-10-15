import {getCodeUser} from '../../_auth/code-auth';
import {trustedOrigin} from '../../../lib/auth';
import {database} from '../../../db/raw';
import {listConnections,disconnect} from '../../../lib/oauth';

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

// 설정 화면의 "연결된 앱"(MCP OAuth 연결). 연결 해제는 권한을 줄이는 동작이라 비밀번호를 다시 묻지 않는다.
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 try{return reply({connections:await listConnections(database(),user.userId)});}
 catch(e){console.error('Connections list failed',e);return reply({error:'연결된 앱을 불러오지 못했습니다.'},503);}
}

export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 if(!trustedOrigin(req))return reply({error:'허용되지 않은 요청입니다.'},403);
 try{
  if(Number(req.headers.get('content-length')||0)>1024)return reply({error:'요청을 확인해 주세요.'},400);
  const input=await req.text();if(input.length>1024)return reply({error:'요청을 확인해 주세요.'},400);
  let body;try{body=JSON.parse(input);}catch{return reply({error:'요청을 확인해 주세요.'},400);}
  if(body?.action!=='disconnect'||typeof body.id!=='string')return reply({error:'요청을 확인해 주세요.'},400);
  if(!await disconnect(database(),user.userId,body.id,Date.now()))return reply({error:'이미 해제되었거나 없는 연결입니다.'},404);
  return reply({ok:true});
 }catch(e){console.error('Disconnect failed',e);return reply({error:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
