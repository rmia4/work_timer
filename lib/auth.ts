const encoder = new TextEncoder();
export const COOKIE = '__Host-work_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/;
const PASSWORD_ROUNDS = 100000;
// Verified when the username does not exist, so a miss costs the same time as a wrong password.
export const UNKNOWN_USER_HASH = `${PASSWORD_ROUNDS}:${'0'.repeat(32)}:${'0'.repeat(64)}`;
const hex = (bytes: Uint8Array) => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function hashToken(token: string) {
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));
}
export function normalizeUsername(value:unknown){
 if(typeof value!=='string')return null;
 const username=value.trim().toLowerCase();
 return USERNAME_PATTERN.test(username)?username:null;
}
async function derivePassword(password:string,salt:Uint8Array<ArrayBuffer>){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:PASSWORD_ROUNDS},key,256));
}
export async function createPasswordHash(password:string){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return `${PASSWORD_ROUNDS}:${hex(salt)}:${hex(await derivePassword(password,salt))}`;
}
export async function verifyPassword(password: string, stored: string) {
 const [rounds,salt,expected] = stored.split(':');
 if(rounds!==String(PASSWORD_ROUNDS)||!/^([a-f0-9]{2}){16}$/.test(salt||'')||!/^([a-f0-9]{2}){32}$/.test(expected||''))return false;
 const bytes=await derivePassword(password,Uint8Array.from(salt.match(/../g)!,x=>parseInt(x,16)));
 const target=Uint8Array.from(expected.match(/../g)!,x=>parseInt(x,16));
 let diff=0;for(let i=0;i<bytes.length;i++)diff|=bytes[i]^target[i];return diff===0;
}
export function clientAddress(req:Request){
 // On Vercel only x-vercel-forwarded-for is set by the platform; x-forwarded-for can carry client-supplied values.
 const forwarded=process.env.VERCEL?req.headers.get('x-vercel-forwarded-for'):req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip');
 return forwarded?.split(',')[0]?.trim().slice(0,128)||'unavailable';
}
type LimitDb={prepare(sql:string):{bind(...values:unknown[]):{first<T extends Record<string,unknown>>():Promise<T|null>;run():Promise<unknown>}}};
const FAILURES_PER_BLOCK=5;
const BASE_BLOCK_MS=15*60_000;
// Latest block end among the given code_limits keys, or 0 when none is blocked.
export async function blockedUntil(db:LimitDb,ids:string[],now:number){
 let until=0;
 for(const id of ids){
  const limit=await db.prepare('SELECT "window" FROM code_limits WHERE id=?').bind(id).first<{window:number}>();
  if(limit&&Number(limit.window)>now)until=Math.max(until,Number(limit.window));
 }
 return until;
}
// Counts one failure; every 5th failure blocks for 15 min x 5^n. Returns the block end, or 0 when not blocked.
export async function recordFailure(db:LimitDb,id:string,now:number){
 const failure=await db.prepare('INSERT INTO code_limits (id,"window",attempts) VALUES (?,0,1) ON CONFLICT(id) DO UPDATE SET attempts=code_limits.attempts+1 RETURNING attempts').bind(id).first<{attempts:number}>();
 const attempts=Number(failure?.attempts||1);
 if(attempts%FAILURES_PER_BLOCK!==0)return 0;
 const until=now+BASE_BLOCK_MS*5**(attempts/FAILURES_PER_BLOCK-1);
 await db.prepare('UPDATE code_limits SET "window"=CASE WHEN "window">? THEN "window" ELSE ? END WHERE id=?').bind(until,until,id).run();
 return until;
}
export const retryAfter=(until:number,now:number)=>String(Math.ceil((until-now)/1000));
export function sessionToken(req:Request){
 const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
}
export function sessionCookie(token:string,maxAge=SESSION_SECONDS){return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;}
export function sameOrigin(req:Request,origin:string|undefined){return !!origin&&req.headers.get('origin')===origin&&req.headers.get('sec-fetch-site')!=='cross-site';}
// 웹앱과 크롬 확장 팝업(EXTENSION_ORIGIN, 쉼표로 여러 개)의 쓰기 요청을 허용한다.
export function trustedOrigin(req:Request){return sameOrigin(req,process.env.APP_ORIGIN)||(process.env.EXTENSION_ORIGIN||'').split(',').some(origin=>sameOrigin(req,origin.trim()));}
