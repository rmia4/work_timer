import {database} from '../../../../db/raw';
import {clientAddress,createPasswordHash,hashToken,normalizeUsername,sessionCookie,sameOrigin,SESSION_SECONDS,MIN_PASSWORD_LENGTH,MAX_PASSWORD_LENGTH} from '../../../../lib/auth';

const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const SIGNUP_WINDOW_MS=24*60*60_000;
const FAILURES_PER_BLOCK=5;
const BASE_BLOCK_MS=15*60_000;

async function failedAttempt(db:ReturnType<typeof database>,limitId:string,now:number,error='가입 정보를 확인해 주세요.'){
 const failure=await db.prepare('INSERT INTO code_limits (id,"window",attempts) VALUES (?,0,1) ON CONFLICT(id) DO UPDATE SET attempts=code_limits.attempts+1 RETURNING attempts').bind(limitId).first<{attempts:number}>();
 const attempts=Number(failure?.attempts||1);
 if(attempts%FAILURES_PER_BLOCK!==0)return json({error},409);
 const blockLevel=attempts/FAILURES_PER_BLOCK-1,blockedUntil=now+BASE_BLOCK_MS*5**blockLevel;
 await db.prepare('UPDATE code_limits SET "window"=CASE WHEN "window">? THEN "window" ELSE ? END WHERE id=?').bind(blockedUntil,blockedUntil,limitId).run();
 return json({error:'가입 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((blockedUntil-now)/1000))});
}

export async function POST(req:Request){
 if(!sameOrigin(req,process.env.APP_ORIGIN))return json({error:'허용되지 않은 요청입니다.'},403);
 try{
  if(Number(req.headers.get('content-length')||0)>2048)return json({error:'입력값이 너무 깁니다.'},400);
  const input=await req.text();if(input.length>2048)return json({error:'입력값이 너무 깁니다.'},400);
  let body;try{body=JSON.parse(input);}catch{return json({error:'아이디와 비밀번호를 입력해 주세요.'},400);}
  const username=normalizeUsername(body?.username);
  if(!username)return json({error:'아이디는 영문 소문자, 숫자, 밑줄(_)로 4~20자 입력해 주세요.'},400);
  if(typeof body?.password!=='string'||body.password.length<MIN_PASSWORD_LENGTH||body.password.length>MAX_PASSWORD_LENGTH)return json({error:`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요.`},400);
  if(typeof body?.confirmation!=='string'||body.password!==body.confirmation)return json({error:'비밀번호가 일치하지 않습니다.'},400);

  const db=database(),now=Date.now(),limitId='ip:'+await hashToken(clientAddress(req));
  const limit=await db.prepare('SELECT "window",attempts FROM code_limits WHERE id=?').bind(limitId).first<{window:number;attempts:number}>();
  if(limit&&limit.window>now)return json({error:'가입 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((limit.window-now)/1000))});
  const existing=await db.prepare('SELECT id FROM users WHERE username=? LIMIT 1').bind(username).first<{id:string}>();
  if(existing)return failedAttempt(db,limitId,now,'이미 사용 중인 아이디입니다.');

  const rateId='signup-ip:'+await hashToken(clientAddress(req));
  const claim=await db.prepare('INSERT INTO signup_limits (id,registered_at) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET registered_at=excluded.registered_at WHERE signup_limits.registered_at<=? RETURNING registered_at').bind(rateId,now,now-SIGNUP_WINDOW_MS).first<{registered_at:number}>();
  if(!claim){
   const limit=await db.prepare('SELECT registered_at FROM signup_limits WHERE id=?').bind(rateId).first<{registered_at:number}>();
   const retry=Math.max(1,Math.ceil(((limit?.registered_at||now)+SIGNUP_WINDOW_MS-now)/1000));
   return json({error:'같은 네트워크에서는 24시간에 한 번만 가입할 수 있습니다.'},429,{'Retry-After':String(retry)});
  }

  const owner=crypto.randomUUID(),token=hexToken();
  try{
   await db.prepare("INSERT INTO users (id,email,username,password_hash,display_name,role,status,created,updated) VALUES (?,NULL,?,?,?,'user','active',?,?)").bind(owner,username,await createPasswordHash(body.password),'',now,now).run();
  }catch(error){
   await db.prepare('DELETE FROM signup_limits WHERE id=? AND registered_at=?').bind(rateId,now).run();
   const duplicate=await db.prepare('SELECT id FROM users WHERE username=? LIMIT 1').bind(username).first<{id:string}>();
   if(duplicate)return failedAttempt(db,limitId,now,'이미 사용 중인 아이디입니다.');
   throw error;
  }
  await db.batch([
   db.prepare('DELETE FROM code_limits WHERE id=?').bind(limitId),
   db.prepare('INSERT INTO code_sessions (token_hash,owner,expires) VALUES (?,?,?)').bind(await hashToken(token),owner,now+SESSION_SECONDS*1000)
  ]);
  return json({ok:true},201,{'Set-Cookie':sessionCookie(token)});
 }catch(e){console.error('Password signup failed',e);return json({error:'가입하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}

function hexToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
