import {protectedResourceMetadata,oauthJson,corsPreflight} from '../../../lib/oauth';
// RFC 9728: MCP 클라이언트가 이 문서로 인가 서버를 찾는다.
export function GET(){
 try{return oauthJson(protectedResourceMetadata());}
 catch(e){console.error(e);return oauthJson({error:'server_error'},503);}
}
export const OPTIONS=corsPreflight;
