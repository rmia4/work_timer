import {database} from '../../../db/raw';
import {revokeToken,readBody,oauthJson,oauthError,corsPreflight} from '../../../lib/oauth';
// RFC 7009 토큰 폐기.
export async function POST(req:Request){
 try{
  const input=await readBody(req);if(input===null)return oauthError('invalid_request','요청이 너무 큽니다.');
  const p=new URLSearchParams(input),token=p.get('token'),clientId=p.get('client_id');
  if(!token)return oauthError('invalid_request','token이 필요합니다.');
  if(!clientId)return oauthError('invalid_client','client_id가 필요합니다.',401);
  await revokeToken(database(),token,clientId,Date.now());
  return oauthJson({});
 }catch(e){console.error('OAuth revoke failed',e);return oauthError('server_error','폐기하지 못했습니다.',503);}
}
export const OPTIONS=corsPreflight;
