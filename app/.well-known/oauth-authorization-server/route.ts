import {authorizationServerMetadata,oauthJson,corsPreflight} from '../../../lib/oauth';
// RFC 8414: 인가·토큰·등록 엔드포인트와 지원 기능을 알린다.
export function GET(){
 try{return oauthJson(authorizationServerMetadata());}
 catch(e){console.error(e);return oauthJson({error:'server_error'},503);}
}
export const OPTIONS=corsPreflight;
