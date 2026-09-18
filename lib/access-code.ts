const encoder = new TextEncoder();
export const COOKIE = '__Host-work_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export async function hashToken(token: string) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyCode(code: string, stored: string) {
 const [rounds,salt,expected] = stored.split(':');
 if(rounds!=='100000'||!/^([a-f0-9]{2}){16}$/.test(salt||'')||!/^([a-f0-9]{2}){32}$/.test(expected||''))return false;
 const key = await crypto.subtle.importKey('raw',encoder.encode(code),'PBKDF2',false,['deriveBits']);
 const bytes = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g)!,x=>parseInt(x,16)),iterations:100000},key,256));
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
