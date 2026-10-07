import {getCodeUser} from '../../_auth/code-auth';
import {database} from '../../../db/raw';
import {createPasswordHash,hashToken,verifyPassword,sessionToken,sameOrigin,MIN_PASSWORD_LENGTH,MAX_PASSWORD_LENGTH} from '../../../lib/auth';

const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const FAILURES_PER_BLOCK=5;
const BASE_BLOCK_MS=15*60_000;
const DELETE_TABLES:Record<string,string>={'delete-tasks':'tasks','delete-memos':'memos','delete-daily-memos':'daily_memos'};

// 설정 팝업의 모든 동작은 매 요청마다 현재 비밀번호를 다시 확인한다.
export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return json({error:'로그인이 필요합니다.'},401);
 if(!sameOrigin(req,process.env.APP_ORIGIN))return json({error:'허용되지 않은 요청입니다.'},403);
 try{
  if(Number(req.headers.get('content-length')||0)>2048)return json({error:'입력값이 너무 깁니다.'},400);
  const input=await req.text();if(input.length>2048)return json({error:'입력값이 너무 깁니다.'},400);
  let body;try{body=JSON.parse(input);}catch{return json({error:'요청을 확인해 주세요.'},400);}
  if(typeof body?.password!=='string'||!body.password||body.password.length>MAX_PASSWORD_LENGTH)return json({error:'현재 비밀번호를 입력해 주세요.'},400);
  const action=body.action;
  if(action!=='verify'&&action!=='change-password'&&!(typeof action==='string'&&Object.hasOwn(DELETE_TABLES,action)))return json({error:'요청을 확인해 주세요.'},400);
  if(action==='change-password'){
   if(typeof body.newPassword!=='string'||body.newPassword.length<MIN_PASSWORD_LENGTH||body.newPassword.length>MAX_PASSWORD_LENGTH)return json({error:`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요.`},400);
   if(typeof body.confirmation!=='string'||body.newPassword!==body.confirmation)return json({error:'새 비밀번호가 일치하지 않습니다.'},400);
  }

  const db=database(),now=Date.now(),owner=user.userId,limitId='account:'+owner;
  const limit=await db.prepare('SELECT "window",attempts FROM code_limits WHERE id=?').bind(limitId).first<{window:number;attempts:number}>();
  if(limit&&limit.window>now)return json({error:'비밀번호 확인이 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((limit.window-now)/1000))});
  const row=await db.prepare("SELECT password_hash FROM users WHERE id=? AND status='active' LIMIT 1").bind(owner).first<{password_hash:string|null}>();
  if(!row?.password_hash||!await verifyPassword(body.password,row.password_hash)){
   const failure=await db.prepare('INSERT INTO code_limits (id,"window",attempts) VALUES (?,0,1) ON CONFLICT(id) DO UPDATE SET attempts=code_limits.attempts+1 RETURNING attempts').bind(limitId).first<{attempts:number}>();
   const attempts=Number(failure?.attempts||1);
   if(attempts%FAILURES_PER_BLOCK!==0)return json({error:'비밀번호가 일치하지 않습니다.'},401);
   const blockedUntil=now+BASE_BLOCK_MS*5**(attempts/FAILURES_PER_BLOCK-1);
   await db.prepare('UPDATE code_limits SET "window"=CASE WHEN "window">? THEN "window" ELSE ? END WHERE id=?').bind(blockedUntil,blockedUntil,limitId).run();
   return json({error:'비밀번호 확인이 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((blockedUntil-now)/1000))});
  }
  const clearLimit=db.prepare('DELETE FROM code_limits WHERE id=?').bind(limitId);
  if(action==='verify'){await clearLimit.run();return json({ok:true});}
  if(action==='change-password'){
   // 비밀번호를 바꾸면 현재 기기를 제외한 다른 세션은 모두 로그아웃시킨다.
   const current=await hashToken(sessionToken(req)||'');
   await db.batch([
    clearLimit,
    db.prepare('UPDATE users SET password_hash=?,updated=? WHERE id=?').bind(await createPasswordHash(body.newPassword),now,owner),
    db.prepare('DELETE FROM code_sessions WHERE owner=? AND token_hash<>?').bind(owner,current)
   ]);
   return json({ok:true});
  }
  await db.batch([clearLimit,db.prepare(`DELETE FROM ${DELETE_TABLES[action]} WHERE owner=?`).bind(owner)]);
  return json({ok:true});
 }catch(e){console.error('Account action failed',e);return json({error:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
