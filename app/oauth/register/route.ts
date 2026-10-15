import {database} from '../../../db/raw';
import {clientAddress,hashToken} from '../../../lib/auth';
import {registerClient,countRequest,readBody,oauthJson,oauthError,corsPreflight} from '../../../lib/oauth';
const REGISTRATIONS_PER_HOUR=20;
// RFC 7591 동적 클라이언트 등록. 누구나 호출할 수 있으므로 IP마다 시간당 등록 수를 제한한다.
export async function POST(req:Request){
 try{
  const input=await readBody(req);if(input===null)return oauthError('invalid_client_metadata','요청이 너무 큽니다.');
  let body;try{body=JSON.parse(input);}catch{return oauthError('invalid_client_metadata','JSON 본문이 필요합니다.');}
  if(!body||typeof body!=='object'||Array.isArray(body))return oauthError('invalid_client_metadata','JSON 객체가 필요합니다.');
  const db=database(),now=Date.now(),limitId='register:'+await hashToken(clientAddress(req));
  if(await countRequest(db,limitId,now)>REGISTRATIONS_PER_HOUR)return oauthError('slow_down','등록 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',429);
  const result=await registerClient(db,body,now);
  return result.ok?oauthJson(result.client,201):oauthError(result.error,result.description);
 }catch(e){console.error('OAuth client registration failed',e);return oauthError('server_error','등록하지 못했습니다.',503);}
}
export const OPTIONS=corsPreflight;
