import {createMcpHandler} from '@modelcontextprotocol/server';
import {database} from '../../../db/raw';
import {appOrigin,oauthJson,corsPreflight,CORS,SCOPES} from '../../../lib/oauth';
import {authenticate,createMcpServer} from '../../../lib/mcp';
// MCP Streamable HTTP 엔드포인트(stateless). 쿠키는 보지 않고 OAuth Bearer 토큰만 인정한다.
// 2026-07-28 사양 요청과 2025년 사양(initialize) 요청을 모두 받는다.
const handler=createMcpHandler(({authInfo})=>createMcpServer(database(),authInfo!),{maxRequestBodySize:256*1024,onerror:e=>console.error('MCP request failed',e.message)});
// 토큰이 없거나 유효하지 않으면 401과 함께 보호 자원 메타데이터 위치를 알려 OAuth 흐름을 시작하게 한다(RFC 9728).
function unauthorized(invalid:boolean){
 const res=oauthJson({error:'invalid_token',error_description:invalid?'토큰이 만료되었거나 폐기되었습니다.':'인증이 필요합니다.'},401);
 res.headers.set('WWW-Authenticate',`Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource", scope="${SCOPES.join(' ')}"`+(invalid?', error="invalid_token"':''));
 return res;
}
export async function POST(req:Request){
 let authInfo;
 try{
  const header=req.headers.get('authorization');if(!header)return unauthorized(false);
  authInfo=await authenticate(database(),header,Date.now());if(!authInfo)return unauthorized(true);
 }catch(e){console.error('MCP auth failed',e);return oauthJson({error:'server_error'},503);}
 const res=await handler.fetch(req,{authInfo});
 const headers=new Headers(res.headers);for(const [key,value] of Object.entries(CORS))headers.set(key,value);
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
}
// stateless 서버라 SSE 스트림(GET)과 세션 종료(DELETE)는 지원하지 않는다.
const notAllowed=()=>new Response(null,{status:405,headers:{Allow:'POST, OPTIONS',...CORS}});
export const GET=notAllowed,DELETE=notAllowed;
export const OPTIONS=corsPreflight;
