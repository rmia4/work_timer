const encoder = new TextEncoder();
export const COOKIE = '__Host-work_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const MIN_CODE_LENGTH = 5;
const CODE_ROUNDS = 100000;
const hex = (bytes: Uint8Array) => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function hashToken(token: string) {
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));
}
async function deriveCode(code:string,salt:Uint8Array<ArrayBuffer>){
 const key=await crypto.subtle.importKey('raw',encoder.encode(code),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:CODE_ROUNDS},key,256));
}
export async function createCodeHash(code:string){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return `${CODE_ROUNDS}:${hex(salt)}:${hex(await deriveCode(code,salt))}`;
}
export async function codeLookup(code:string,secret:string|undefined){
 if(!secret||secret.length<32)throw new Error('ACCESS_CODE_SECRET must contain at least 32 characters');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(code))));
}
export async function verifyCode(code: string, stored: string) {
 const [rounds,salt,expected] = stored.split(':');
 if(rounds!==String(CODE_ROUNDS)||!/^([a-f0-9]{2}){16}$/.test(salt||'')||!/^([a-f0-9]{2}){32}$/.test(expected||''))return false;
 const bytes=await deriveCode(code,Uint8Array.from(salt.match(/../g)!,x=>parseInt(x,16)));
 const target=Uint8Array.from(expected.match(/../g)!,x=>parseInt(x,16));
 let diff=0;for(let i=0;i<bytes.length;i++)diff|=bytes[i]^target[i];return diff===0;
}
export function clientAddress(req:Request){
 const forwarded=req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip');
 return forwarded?.split(',')[0]?.trim().slice(0,128)||'unavailable';
}
export function sessionToken(req:Request){
 const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
}
export function sessionCookie(token:string,maxAge=SESSION_SECONDS){return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;}
export function sameOrigin(req:Request,origin:string|undefined){return !!origin&&req.headers.get('origin')===origin&&req.headers.get('sec-fetch-site')!=='cross-site';}
