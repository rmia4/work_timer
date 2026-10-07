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
 const forwarded=req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip');
 return forwarded?.split(',')[0]?.trim().slice(0,128)||'unavailable';
}
export function sessionToken(req:Request){
 const token=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
}
export function sessionCookie(token:string,maxAge=SESSION_SECONDS){return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;}
export function sameOrigin(req:Request,origin:string|undefined){return !!origin&&req.headers.get('origin')===origin&&req.headers.get('sec-fetch-site')!=='cross-site';}
