import {database} from '../../../db/raw';
import {exchangeToken,readBody,oauthJson,oauthError,corsPreflight} from '../../../lib/oauth';
// 인가 코드 교환과 refresh 토큰 갱신. 본문은 application/x-www-form-urlencoded다.
export async function POST(req:Request){
 try{
  const input=await readBody(req);if(input===null)return oauthError('invalid_request','요청이 너무 큽니다.');
  const result=await exchangeToken(database(),new URLSearchParams(input),Date.now());
  return result.ok?oauthJson(result.body):oauthError(result.error,result.description,result.error==='invalid_client'?401:400);
 }catch(e){console.error('OAuth token request failed',e);return oauthError('server_error','토큰을 발급하지 못했습니다.',503);}
}
export const OPTIONS=corsPreflight;
