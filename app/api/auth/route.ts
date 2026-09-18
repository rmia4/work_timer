import {database} from '../../../db/raw';
import {clientAddress,hashToken,verifyCode,sessionToken,sessionCookie,sameOrigin,SESSION_SECONDS} from '../../../lib/access-code';
const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const FAILURES_PER_BLOCK=5;
const BASE_BLOCK_MS=15*60_000;
export async function POST(req:Request){
 if(!sameOrigin(req,process.env.APP_ORIGIN))return json({error:'허용되지 않은 요청입니다.'},403);
 try{
 if(Number(req.headers.get('content-length')||0)>2048)return json({error:'입력값이 너무 깁니다.'},400);
 const input=await req.text();if(input.length>2048)return json({error:'입력값이 너무 깁니다.'},400);
 let body;try{body=JSON.parse(input);}catch{return json({error:'코드를 입력해 주세요.'},400);}
 if(typeof body?.code!=='string'||!body.code||body.code.length>128)return json({error:'코드를 입력해 주세요.'},400);
 const db=database(),now=Date.now(),limitId='ip:'+await hashToken(clientAddress(req));
 const limit=await db.prepare('SELECT "window",attempts FROM code_limits WHERE id=?').bind(limitId).first<{window:number;attempts:number}>();
 if(limit&&limit.window>now)return json({error:'로그인 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((limit.window-now)/1000))});
 const users=await db.prepare("SELECT id,access_code_hash FROM users WHERE status='active' AND access_code_hash IS NOT NULL ORDER BY created,id LIMIT 2").all<{id:string;access_code_hash:string}>();
 if(users.results.length!==1)return json({error:'접속 설정을 확인해 주세요.'},503);
 const user=users.results[0];
 if(!await verifyCode(body.code,user.access_code_hash)){
  const failure=await db.prepare('INSERT INTO code_limits (id,"window",attempts) VALUES (?,0,1) ON CONFLICT(id) DO UPDATE SET attempts=code_limits.attempts+1 RETURNING attempts').bind(limitId).first<{attempts:number}>();
  const attempts=Number(failure?.attempts||1);
  if(attempts%FAILURES_PER_BLOCK!==0)return json({error:'접속 코드가 일치하지 않습니다.'},401);
  const blockLevel=attempts/FAILURES_PER_BLOCK-1;
  const blockedUntil=now+BASE_BLOCK_MS*5**blockLevel;
  await db.prepare('UPDATE code_limits SET "window"=CASE WHEN "window">? THEN "window" ELSE ? END WHERE id=?').bind(blockedUntil,blockedUntil,limitId).run();
  return json({error:'로그인 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((blockedUntil-now)/1000))});
 }
 const owner=user.id;
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await db.batch([
 db.prepare('DELETE FROM code_sessions WHERE expires<=?').bind(now),
 db.prepare('DELETE FROM code_limits WHERE id=?').bind(limitId),
 db.prepare('INSERT INTO code_sessions (token_hash,owner,expires) VALUES (?,?,?)').bind(await hashToken(token),owner,now+SESSION_SECONDS*1000)
 ]);
 return json({ok:true},200,{'Set-Cookie':sessionCookie(token)});
 }catch(e){console.error('Access code authentication failed',e);return json({error:'접속하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
export async function DELETE(req:Request){
 if(!sameOrigin(req,process.env.APP_ORIGIN))return json({error:'허용되지 않은 요청입니다.'},403);
 try{const token=sessionToken(req);if(token)await database().prepare('DELETE FROM code_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
 return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
 }catch{return json({error:'로그아웃하지 못했습니다. 다시 시도해 주세요.'},503);}
}
