import {database} from '../../../../db/raw';
import {clientAddress,codeLookup,createCodeHash,hashToken,sessionCookie,sameOrigin,SESSION_SECONDS,verifyCode,MIN_CODE_LENGTH} from '../../../../lib/access-code';

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
  let body;try{body=JSON.parse(input);}catch{return json({error:'개인 코드를 입력해 주세요.'},400);}
  if(typeof body?.code!=='string'||body.code.length<MIN_CODE_LENGTH||body.code.length>128)return json({error:`개인 코드는 ${MIN_CODE_LENGTH}자 이상 입력해 주세요.`},400);
  if(typeof body?.confirmation!=='string'||body.code!==body.confirmation)return json({error:'개인 코드가 일치하지 않습니다.'},400);

  const db=database(),now=Date.now(),limitId='ip:'+await hashToken(clientAddress(req));
  const limit=await db.prepare('SELECT "window",attempts FROM code_limits WHERE id=?').bind(limitId).first<{window:number;attempts:number}>();
  if(limit&&limit.window>now)return json({error:'가입 시도가 차단되었습니다. 잠시 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((limit.window-now)/1000))});
  const lookup=await codeLookup(body.code,process.env.ACCESS_CODE_SECRET);
  const existing=await db.prepare('SELECT id FROM users WHERE access_code_lookup=? LIMIT 1').bind(lookup).first<{id:string}>();
  if(existing)return failedAttempt(db,limitId,now,'이미 사용 중인 개인 코드입니다.');
  const legacy=await db.prepare("SELECT access_code_hash FROM users WHERE access_code_lookup IS NULL AND access_code_hash IS NOT NULL ORDER BY created,id LIMIT 2").all<{access_code_hash:string}>();
  for(const user of legacy.results)if(await verifyCode(body.code,user.access_code_hash))return failedAttempt(db,limitId,now,'이미 사용 중인 개인 코드입니다.');

  const rateId='signup-ip:'+await hashToken(clientAddress(req));
  const claim=await db.prepare('INSERT INTO signup_limits (id,registered_at) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET registered_at=excluded.registered_at WHERE signup_limits.registered_at<=? RETURNING registered_at').bind(rateId,now,now-SIGNUP_WINDOW_MS).first<{registered_at:number}>();
  if(!claim){
   const limit=await db.prepare('SELECT registered_at FROM signup_limits WHERE id=?').bind(rateId).first<{registered_at:number}>();
   const retry=Math.max(1,Math.ceil(((limit?.registered_at||now)+SIGNUP_WINDOW_MS-now)/1000));
   return json({error:'같은 네트워크에서는 24시간에 한 번만 가입할 수 있습니다.'},429,{'Retry-After':String(retry)});
  }

  const owner=crypto.randomUUID(),token=hexToken();
  try{
   await db.prepare("INSERT INTO users (id,email,access_code_hash,access_code_lookup,display_name,role,status,created,updated) VALUES (?,NULL,?,?,?,'user','active',?,?)").bind(owner,await createCodeHash(body.code),lookup,'',now,now).run();
  }catch(error){
   await db.prepare('DELETE FROM signup_limits WHERE id=? AND registered_at=?').bind(rateId,now).run();
   const duplicate=await db.prepare('SELECT id FROM users WHERE access_code_lookup=? LIMIT 1').bind(lookup).first<{id:string}>();
   if(duplicate)return failedAttempt(db,limitId,now,'이미 사용 중인 개인 코드입니다.');
   throw error;
  }
  await db.batch([
   db.prepare('DELETE FROM code_limits WHERE id=?').bind(limitId),
   db.prepare('INSERT INTO code_sessions (token_hash,owner,expires) VALUES (?,?,?)').bind(await hashToken(token),owner,now+SESSION_SECONDS*1000)
  ]);
  return json({ok:true},201,{'Set-Cookie':sessionCookie(token)});
 }catch(e){console.error('Access code signup failed',e);return json({error:'가입하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}

function hexToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
