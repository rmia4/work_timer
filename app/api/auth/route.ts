import {database} from '../../../db/raw';
import {clientAddress,hashToken,normalizeUsername,verifyPassword,sessionToken,sessionCookie,trustedOrigin,SESSION_SECONDS,MAX_PASSWORD_LENGTH,UNKNOWN_USER_HASH,blockedUntil,recordFailure,retryAfter} from '../../../lib/auth';
const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function POST(req:Request){
 if(!trustedOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);
 try{
 if(Number(req.headers.get('content-length')||0)>2048)return json({error:'입력값이 너무 깁니다.'},400);
 const input=await req.text();if(input.length>2048)return json({error:'입력값이 너무 깁니다.'},400);
 let body;try{body=JSON.parse(input);}catch{return json({error:'아이디와 비밀번호를 입력해 주세요.'},400);}
 if(typeof body?.username!=='string'||!body.username||typeof body?.password!=='string'||!body.password||body.username.length>128||body.password.length>MAX_PASSWORD_LENGTH)return json({error:'아이디와 비밀번호를 입력해 주세요.'},400);
 const username=normalizeUsername(body.username);
 // Limit per IP and per username; unknown usernames get the same key treatment so existence is not revealed.
 const db=database(),now=Date.now(),ipLimitId='ip:'+await hashToken(clientAddress(req)),userLimitId='user:'+await hashToken(username||body.username.trim().toLowerCase());
 const blocked=await blockedUntil(db,[ipLimitId,userLimitId],now);
 if(blocked)return json({error:'로그인 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':retryAfter(blocked,now)});
 const user=username?await db.prepare("SELECT id,password_hash FROM users WHERE status='active' AND username=? LIMIT 1").bind(username).first<{id:string;password_hash:string|null}>():null;
 if(!await verifyPassword(body.password,user?.password_hash||UNKNOWN_USER_HASH)||!user){
  const until=Math.max(await recordFailure(db,ipLimitId,now),await recordFailure(db,userLimitId,now));
  if(!until)return json({error:'아이디 또는 비밀번호가 일치하지 않습니다.'},401);
  return json({error:'로그인 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':retryAfter(until,now)});
 }
 const owner=user.id;
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await db.batch([
 db.prepare('DELETE FROM code_sessions WHERE expires<=?').bind(now),
 db.prepare('DELETE FROM code_limits WHERE id IN (?,?)').bind(ipLimitId,userLimitId),
 db.prepare('INSERT INTO code_sessions (token_hash,owner,expires) VALUES (?,?,?)').bind(await hashToken(token),owner,now+SESSION_SECONDS*1000)
 ]);
 return json({ok:true},200,{'Set-Cookie':sessionCookie(token)});
 }catch(e){console.error('Password authentication failed',e);return json({error:'접속하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
export async function DELETE(req:Request){
 if(!trustedOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);
 try{const token=sessionToken(req);if(token)await database().prepare('DELETE FROM code_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
 return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
 }catch{return json({error:'로그아웃하지 못했습니다. 다시 시도해 주세요.'},503);}
}
