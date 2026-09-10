import {env} from 'cloudflare:workers';
import {database} from '../../../db/raw';
import {hashToken,verifyCode,sessionToken,sessionCookie,sameOrigin,SESSION_SECONDS} from '../../../lib/access-code';
const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function POST(req:Request){
 if(!sameOrigin(req,env.APP_ORIGIN))return json({error:'허용되지 않은 요청입니다.'},403);
 try{
 if(!env.ACCESS_CODE_HASH)return json({error:'접속 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요.'},503);
 if(Number(req.headers.get('content-length')||0)>2048)return json({error:'입력값이 너무 깁니다.'},400);
 const input=await req.text();if(input.length>2048)return json({error:'입력값이 너무 깁니다.'},400);
 let body;try{body=JSON.parse(input);}catch{return json({error:'코드를 입력해 주세요.'},400);}
 if(typeof body?.code!=='string'||!body.code||body.code.length>128)return json({error:'코드를 입력해 주세요.'},400);
 const db=database(),now=Date.now(),window=Math.floor(now/900000);
 const limit=await db.prepare("INSERT INTO code_limits (id,window,attempts) VALUES ('global',?,1) ON CONFLICT(id) DO UPDATE SET window=excluded.window,attempts=CASE WHEN code_limits.window=excluded.window THEN code_limits.attempts+1 ELSE 1 END RETURNING attempts").bind(window).first<{attempts:number}>();
 if(!limit||limit.attempts>10)return json({error:'입력 횟수를 초과했습니다. 최대 15분 뒤 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil(((window+1)*900000-now)/1000))});
 if(!await verifyCode(body.code,env.ACCESS_CODE_HASH))return json({error:'접속 코드가 일치하지 않습니다.'},401);
 // The previously owner-only app has one diary. Reuse its owner key without altering records.
 const owners=await db.prepare('SELECT DISTINCT owner FROM tasks LIMIT 2').all<{owner:string}>();
 if(owners.results.length>1)return json({error:'기존 기록 확인이 필요합니다. 관리자에게 문의해 주세요.'},503);
 const owner=owners.results[0]?.owner||'personal-workspace';
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await db.batch([
 db.prepare('DELETE FROM code_sessions WHERE expires<=?').bind(now),
 db.prepare('INSERT INTO code_sessions (token_hash,owner,expires) VALUES (?,?,?)').bind(await hashToken(token),owner,now+SESSION_SECONDS*1000)
 ]);
 return json({ok:true},200,{'Set-Cookie':sessionCookie(token)});
 }catch(e){console.error('Access code authentication failed',e);return json({error:'접속하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
export async function DELETE(req:Request){
 if(!sameOrigin(req,env.APP_ORIGIN))return json({error:'허용되지 않은 요청입니다.'},403);
 try{const token=sessionToken(req);if(token)await database().prepare('DELETE FROM code_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
 return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
 }catch{return json({error:'로그아웃하지 못했습니다. 다시 시도해 주세요.'},503);}
}
