import type {database} from '../db/raw';
import {hashToken} from './auth';
import {fetchClientDocument,validClientIdUrl} from './oauth-cimd';
// MCP 연동용 OAuth 2.1 인가 서버. Work Timer가 인가 서버와 리소스 서버(/api/mcp)를 겸한다.
// 클라이언트는 공개 클라이언트만 받고 PKCE(S256)를 반드시 요구한다. 클라이언트 식별은 두 방식을 지원한다.
// - Client ID Metadata Document(CIMD): https URL이 곧 client_id. 문서를 가져와 oauth_clients에 캐시한다.
// - 동적 등록(RFC 7591, DCR): /oauth/register가 UUID client_id를 발급한다. CIMD를 모르는 클라이언트용.
type Db=ReturnType<typeof database>;
export const SCOPES=['tasks:read','tasks:write'];
export const SCOPE_LABELS:Record<string,string>={'tasks:read':'업무 기록·메모·통계 보기','tasks:write':'타이머 시작·종료와 업무 기록 수정'};
const ACCESS_SECONDS=60*60,REFRESH_MS=30*24*60*60*1000,CODE_MS=60*1000;
const MAX_REDIRECTS=10,MAX_URI=2000,MAX_NAME=100;
export function appOrigin(){const origin=process.env.APP_ORIGIN;if(!origin)throw Error('APP_ORIGIN is not set');return origin.replace(/\/$/,'');}
// 발급한 토큰은 이 MCP 엔드포인트 전용이다(RFC 8707 audience).
export const resourceUrl=()=>appOrigin()+'/api/mcp';
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');

export function protectedResourceMetadata(){
 return {resource:resourceUrl(),authorization_servers:[appOrigin()],scopes_supported:SCOPES,bearer_methods_supported:['header'],resource_name:'Work Timer'};
}
export function authorizationServerMetadata(){
 const o=appOrigin();
 return {issuer:o,authorization_endpoint:o+'/oauth/authorize',token_endpoint:o+'/oauth/token',registration_endpoint:o+'/oauth/register',revocation_endpoint:o+'/oauth/revoke',
  response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],
  token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],scopes_supported:SCOPES,authorization_response_iss_parameter_supported:true,
  client_id_metadata_document_supported:true};
}

// OAuth 엔드포인트는 쿠키를 받지 않으므로 브라우저 기반 클라이언트를 위해 모든 출처를 허용한다(credentials 불허).
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, MCP-Protocol-Version'};
export const oauthJson=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store',Pragma:'no-cache',...CORS}});
export const oauthError=(error:string,description:string,status=400)=>oauthJson({error,error_description:description},status);
export const corsPreflight=()=>new Response(null,{status:204,headers:CORS});
// 크기를 제한해 본문을 읽는다. 너무 크면 null.
export async function readBody(req:Request,limit=16*1024){
 if(Number(req.headers.get('content-length')||0)>limit)return null;
 const text=await req.text();
 return text.length>limit||new TextEncoder().encode(text).length>limit?null:text;
}

const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]']);
// https 또는 루프백 http(Claude Code 같은 네이티브 앱의 로컬 콜백)만 허용한다.
function validRedirect(value:unknown):value is string{
 if(typeof value!=='string'||value.length>MAX_URI)return false;
 let url:URL;try{url=new URL(value);}catch{return false;}
 if(url.hash||url.username||url.password)return false;
 return url.protocol==='https:'||(url.protocol==='http:'&&LOOPBACK.has(url.hostname));
}
// 등록된 값과 정확히 일치해야 한다. 루프백 주소만 RFC 8252 7.3에 따라 포트를 무시한다.
export function redirectMatches(registered:string[],requested:string){
 if(registered.includes(requested))return true;
 let want:URL;try{want=new URL(requested);}catch{return false;}
 if(want.protocol!=='http:'||!LOOPBACK.has(want.hostname))return false;
 return registered.some(value=>{const url=new URL(value);url.port=want.port;return url.href===want.href;});
}
export const isLoopback=(uri:string)=>{try{return LOOPBACK.has(new URL(uri).hostname);}catch{return false;}};

type Registration={ok:true;client:Record<string,unknown>}|{ok:false;error:string;description:string};
export async function registerClient(db:Db,body:Record<string,unknown>,now:number):Promise<Registration>{
 const uris=body.redirect_uris;
 if(!Array.isArray(uris)||!uris.length||uris.length>MAX_REDIRECTS||!uris.every(validRedirect))return {ok:false,error:'invalid_redirect_uri',description:'redirect_uris는 https 또는 루프백 http 주소여야 합니다.'};
 if(body.client_name!==undefined&&(typeof body.client_name!=='string'||body.client_name.length>MAX_NAME))return {ok:false,error:'invalid_client_metadata',description:`client_name은 ${MAX_NAME}자 이하여야 합니다.`};
 const grantTypes=body.grant_types??['authorization_code'],responseTypes=body.response_types??['code'];
 if(!Array.isArray(grantTypes)||!grantTypes.every(g=>g==='authorization_code'||g==='refresh_token')||!Array.isArray(responseTypes)||!responseTypes.every(r=>r==='code'))return {ok:false,error:'invalid_client_metadata',description:'authorization_code와 refresh_token만 지원합니다.'};
 const id=crypto.randomUUID(),name=(body.client_name as string|undefined)?.trim()||'이름 없는 앱';
 await db.prepare('INSERT INTO oauth_clients (id,name,redirect_uris,created) VALUES (?,?,?,?)').bind(id,name,JSON.stringify(uris),now).run();
 // 클라이언트 비밀값은 발급하지 않는다(공개 클라이언트). 요청한 인증 방식과 무관하게 none으로 답한다.
 return {ok:true,client:{client_id:id,client_id_issued_at:Math.floor(now/1000),client_name:name,redirect_uris:uris,grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'}};
}

// 고정 시간 창 안의 요청 수를 code_limits에 센다. 이번 요청을 포함한 수를 돌려준다.
export async function countRequest(db:Db,id:string,now:number,windowMs=3600000){
 const row=await db.prepare('INSERT INTO code_limits (id,"window",attempts) VALUES (?,?,1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN code_limits."window"<=? THEN 1 ELSE code_limits.attempts+1 END,"window"=CASE WHEN code_limits."window"<=? THEN ? ELSE code_limits."window" END RETURNING attempts').bind(id,now+windowMs,now,now,now+windowMs).first<{attempts:number}>();
 return Number(row?.attempts||1);
}

const CIMD_FETCHES_PER_HOUR=30,CIMD_MIN_CACHE=5*60,CIMD_MAX_CACHE=24*60*60,CIMD_DEFAULT_CACHE=60*60;
// CIMD 문서를 검증한다. client_id가 문서 URL과 정확히 같아야 하고, 공개 클라이언트(none)만 받는다.
export function parseClientMetadata(url:string,body:string){
 let doc;try{doc=JSON.parse(body);}catch{return null;}
 if(!doc||typeof doc!=='object'||doc.client_id!==url)return null;
 if(typeof doc.client_name!=='string'||!doc.client_name.trim()||doc.client_name.length>MAX_NAME)return null;
 const uris=doc.redirect_uris;
 if(!Array.isArray(uris)||!uris.length||uris.length>MAX_REDIRECTS||!uris.every(validRedirect))return null;
 if(doc.token_endpoint_auth_method!==undefined&&doc.token_endpoint_auth_method!=='none')return null;
 if(doc.grant_types!==undefined&&!(Array.isArray(doc.grant_types)&&doc.grant_types.includes('authorization_code')))return null;
 if(doc.response_types!==undefined&&!(Array.isArray(doc.response_types)&&doc.response_types.includes('code')))return null;
 return {name:doc.client_name.trim() as string,redirectUris:uris as string[]};
}
// Cache-Control의 max-age를 따르되 5분~24시간으로 제한한다. no-store·no-cache도 최소 5분은 캐시한다.
export function cacheSeconds(cacheControl:string){
 const maxAge=/(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
 const seconds=/no-store|no-cache/i.test(cacheControl)?0:maxAge?Number(maxAge[1]):CIMD_DEFAULT_CACHE;
 return Math.min(CIMD_MAX_CACHE,Math.max(CIMD_MIN_CACHE,seconds));
}
type Client={id:string;name:string;redirect_uris:string};
// DCR 클라이언트는 DB에서 찾고, CIMD 클라이언트는 캐시가 만료되었을 때만 문서를 다시 가져온다.
// 문서를 가져오는 횟수는 요청한 IP마다 시간당 30번으로 제한한다(외부 요청 증폭 방지).
async function findClient(db:Db,clientId:string,now:number,address:string):Promise<Client|null>{
 const cimd=clientId.startsWith('https://');
 if(cimd?!validClientIdUrl(clientId):clientId.length>64)return null;
 const cached=await db.prepare('SELECT id,name,redirect_uris,refresh_after FROM oauth_clients WHERE id=?').bind(clientId).first<Client&{refresh_after:number|null}>();
 if(!cimd||(cached&&cached.refresh_after!==null&&cached.refresh_after>now))return cached;
 if(await countRequest(db,'cimd:'+await hashToken(address),now)>CIMD_FETCHES_PER_HOUR)return null;
 let fetched;try{fetched=await fetchClientDocument(clientId);}
 catch(e){console.warn('Client metadata fetch failed',clientId,(e as Error).message);return null;}
 const meta=parseClientMetadata(clientId,fetched.body);if(!meta)return null;
 const client={id:clientId,name:meta.name,redirect_uris:JSON.stringify(meta.redirectUris)};
 await db.prepare('INSERT INTO oauth_clients (id,name,redirect_uris,created,refresh_after) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,redirect_uris=excluded.redirect_uris,refresh_after=excluded.refresh_after').bind(client.id,client.name,client.redirect_uris,now,now+cacheSeconds(fetched.cacheControl)*1000).run();
 return client;
}

// clientHost: CIMD 클라이언트의 문서 도메인. 앱 이름은 스스로 밝힌 값이므로 동의 화면에 함께 보여 준다.
export type AuthorizeRequest={clientId:string;clientName:string;clientHost:string|null;redirectUri:string;scope:string;state:string|null;codeChallenge:string;resource:string};
// redirect할 수 없는 오류(클라이언트·redirect_uri 불일치)는 화면에 보여 주고, 나머지는 redirect_uri로 돌려보낸다.
export type AuthorizeCheck={ok:true;request:AuthorizeRequest}|{ok:false;redirect:string|null;message:string};
export async function checkAuthorizeRequest(db:Db,params:URLSearchParams,now:number,address:string):Promise<AuthorizeCheck>{
 const clientId=params.get('client_id'),redirectUri=params.get('redirect_uri'),state=params.get('state');
 const client=clientId?await findClient(db,clientId,now,address):null;
 if(!client)return {ok:false,redirect:null,message:'등록되지 않았거나 정보를 확인할 수 없는 앱입니다.'};
 if(!redirectUri||!redirectMatches(JSON.parse(client.redirect_uris),redirectUri))return {ok:false,redirect:null,message:'앱의 돌아갈 주소가 등록된 값과 다릅니다.'};
 if(state!==null&&state.length>1000)return {ok:false,redirect:null,message:'요청이 너무 깁니다.'};
 const fail=(error:string,message:string):AuthorizeCheck=>({ok:false,redirect:authorizeRedirect(redirectUri,{error,state}),message});
 if(params.get('response_type')!=='code')return fail('unsupported_response_type','지원하지 않는 응답 방식입니다.');
 const challenge=params.get('code_challenge');
 if(params.get('code_challenge_method')!=='S256'||!challenge||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return fail('invalid_request','PKCE(S256)가 필요합니다.');
 const resource=params.get('resource')??resourceUrl();
 if(resource!==resourceUrl())return fail('invalid_target','이 서버용이 아닌 권한 요청입니다.');
 const requested=(params.get('scope')||SCOPES.join(' ')).split(' ').filter(Boolean);
 if(!requested.length||!requested.every(s=>SCOPES.includes(s)))return fail('invalid_scope','알 수 없는 권한을 요청했습니다.');
 const scope=SCOPES.filter(s=>requested.includes(s)).join(' ');
 return {ok:true,request:{clientId:client.id,clientName:client.name,clientHost:client.id.startsWith('https://')?new URL(client.id).host:null,redirectUri,scope,state,codeChallenge:challenge,resource}};
}
export function authorizeRedirect(redirectUri:string,values:Record<string,string|null>){
 const url=new URL(redirectUri);
 for(const [key,value] of Object.entries({...values,iss:appOrigin()}))if(value!==null)url.searchParams.set(key,value);
 return url.href;
}
// 사용자가 허용하면 연결(grant)을 만들거나 갱신하고 1회용 인가 코드를 발급한다.
export async function approve(db:Db,owner:string,r:AuthorizeRequest,now:number){
 const existing=await db.prepare('SELECT id FROM oauth_grants WHERE owner=? AND client_id=? AND revoked IS NULL').bind(owner,r.clientId).first<{id:string}>();
 const grantId=existing?.id||crypto.randomUUID(),code=randomToken();
 await db.batch([
  existing?db.prepare('UPDATE oauth_grants SET scope=? WHERE id=?').bind(r.scope,grantId):db.prepare('INSERT INTO oauth_grants (id,owner,client_id,scope,created) VALUES (?,?,?,?,?)').bind(grantId,owner,r.clientId,r.scope,now),
  db.prepare('INSERT INTO oauth_codes (code_hash,grant_id,code_challenge,redirect_uri,resource,expires) VALUES (?,?,?,?,?,?)').bind(await hashToken(code),grantId,r.codeChallenge,r.redirectUri,r.resource,now+CODE_MS),
 ]);
 return authorizeRedirect(r.redirectUri,{code,state:r.state});
}

async function s256(verifier:string){
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 return btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
type Grant={id:string;client_id:string;scope:string;revoked:number|null};
type TokenResult={ok:true;body:Record<string,unknown>}|{ok:false;error:string;description:string};
const tokenFail=(error:string,description:string):TokenResult=>({ok:false,error,description});
async function issueTokens(db:Db,grant:Grant,now:number):Promise<TokenResult>{
 const access=randomToken(),refresh=randomToken();
 await db.batch([
  db.prepare('DELETE FROM oauth_tokens WHERE grant_id=? AND expires<=?').bind(grant.id,now),
  db.prepare("INSERT INTO oauth_tokens (token_hash,grant_id,kind,expires) VALUES (?,?,'access',?)").bind(await hashToken(access),grant.id,now+ACCESS_SECONDS*1000),
  db.prepare("INSERT INTO oauth_tokens (token_hash,grant_id,kind,expires) VALUES (?,?,'refresh',?)").bind(await hashToken(refresh),grant.id,now+REFRESH_MS),
 ]);
 return {ok:true,body:{access_token:access,token_type:'Bearer',expires_in:ACCESS_SECONDS,refresh_token:refresh,scope:grant.scope}};
}
// 연결을 폐기하고 딸린 토큰·코드를 지운다.
export function revokeGrant(db:Db,grantId:string,now:number){
 return db.batch([
  db.prepare('UPDATE oauth_grants SET revoked=? WHERE id=? AND revoked IS NULL').bind(now,grantId),
  db.prepare('DELETE FROM oauth_tokens WHERE grant_id=?').bind(grantId),
  db.prepare('DELETE FROM oauth_codes WHERE grant_id=?').bind(grantId),
 ]);
}
const grantOf=(db:Db,id:string)=>db.prepare('SELECT id,client_id,scope,revoked FROM oauth_grants WHERE id=?').bind(id).first<Grant>();
export async function exchangeToken(db:Db,p:URLSearchParams,now:number):Promise<TokenResult>{
 const clientId=p.get('client_id'),resource=p.get('resource');
 if(!clientId)return tokenFail('invalid_client','client_id가 필요합니다.');
 if(resource!==null&&resource!==resourceUrl())return tokenFail('invalid_target','이 서버용이 아닌 토큰 요청입니다.');
 const type=p.get('grant_type');
 if(type==='authorization_code'){
  const code=p.get('code'),verifier=p.get('code_verifier'),redirectUri=p.get('redirect_uri');
  if(!code||!verifier||!redirectUri)return tokenFail('invalid_request','code, code_verifier, redirect_uri가 필요합니다.');
  // 지우면서 읽어 코드를 한 번만 쓰게 한다.
  const row=await db.prepare('DELETE FROM oauth_codes WHERE code_hash=? RETURNING grant_id,code_challenge,redirect_uri,expires').bind(await hashToken(code)).first<{grant_id:string;code_challenge:string;redirect_uri:string;expires:number}>();
  if(!row||row.expires<=now)return tokenFail('invalid_grant','인가 코드가 없거나 만료되었습니다.');
  const grant=await grantOf(db,row.grant_id);
  if(!grant||grant.revoked!==null||grant.client_id!==clientId||row.redirect_uri!==redirectUri)return tokenFail('invalid_grant','인가 코드가 이 요청과 맞지 않습니다.');
  if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||await s256(verifier)!==row.code_challenge)return tokenFail('invalid_grant','PKCE 검증에 실패했습니다.');
  return issueTokens(db,grant,now);
 }
 if(type==='refresh_token'){
  const token=p.get('refresh_token');if(!token)return tokenFail('invalid_request','refresh_token이 필요합니다.');
  const hash=await hashToken(token);
  const row=await db.prepare("SELECT grant_id,expires,used FROM oauth_tokens WHERE token_hash=? AND kind='refresh'").bind(hash).first<{grant_id:string;expires:number;used:number|null}>();
  const grant=row&&await grantOf(db,row.grant_id);
  if(!row||!grant||grant.revoked!==null||grant.client_id!==clientId)return tokenFail('invalid_grant','refresh 토큰이 유효하지 않습니다.');
  if(row.expires<=now)return tokenFail('invalid_grant','refresh 토큰이 만료되었습니다.');
  // 이미 쓴 refresh 토큰이 다시 오면 탈취로 보고 연결 전체를 폐기한다.
  const marked=row.used===null&&(await db.prepare('UPDATE oauth_tokens SET used=? WHERE token_hash=? AND used IS NULL').bind(now,hash).run()).meta.changes;
  if(!marked){await revokeGrant(db,grant.id,now);return tokenFail('invalid_grant','이미 사용한 refresh 토큰입니다. 다시 연결해 주세요.');}
  return issueTokens(db,grant,now);
 }
 return tokenFail('unsupported_grant_type','authorization_code와 refresh_token만 지원합니다.');
}
// RFC 7009: 발급한 클라이언트만 폐기할 수 있고, 결과와 상관없이 성공으로 답한다. refresh 토큰을 폐기하면 연결 전체를 끊는다.
export async function revokeToken(db:Db,token:string,clientId:string,now:number){
 const row=await db.prepare('SELECT t.token_hash,t.kind,g.id AS grant_id FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=? AND g.client_id=?').bind(await hashToken(token),clientId).first<{token_hash:string;kind:string;grant_id:string}>();
 if(!row)return;
 if(row.kind==='refresh')await revokeGrant(db,row.grant_id,now);
 else await db.prepare('DELETE FROM oauth_tokens WHERE token_hash=?').bind(row.token_hash).run();
}
// MCP 요청의 Bearer 토큰을 확인한다. 만료·폐기된 토큰이면 null.
export async function verifyAccessToken(db:Db,token:string,now:number){
 const row=await db.prepare("SELECT g.id,g.owner,g.scope FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=? AND t.kind='access' AND t.expires>? AND g.revoked IS NULL").bind(await hashToken(token),now).first<{id:string;owner:string;scope:string}>();
 return row?{grantId:row.id,owner:row.owner,scopes:row.scope.split(' ')}:null;
}
