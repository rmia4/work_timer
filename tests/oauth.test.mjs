import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function load(path,imports=''){
 const source=imports+'\n'+read(path).replace(/^import .*;\s*$/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const ORIGIN='https://diary.test',RESOURCE=ORIGIN+'/api/mcp',CALLBACK='https://claude.ai/api/mcp/auth_callback';
const loadCimd=async()=>{
 const [net,dns,https]=await Promise.all([import('node:net'),import('node:dns'),import('node:https')]);
 globalThis.cimdFixture={BlockList:net.BlockList,isIP:net.isIP,lookup:dns.lookup,request:https.request};
 try{return await load('lib/oauth-cimd.ts','const {BlockList,isIP,lookup,request}=globalThis.cimdFixture;');}finally{delete globalThis.cimdFixture;}
};
const pkce=()=>{const verifier=randomBytes(32).toString('base64url');return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')};};

test('OAuth: registration, consent, PKCE, code reuse and expiry, refresh rotation, revocation and audience',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
 db.exec('CREATE TABLE code_limits (id TEXT PRIMARY KEY, "window" INTEGER NOT NULL, attempts INTEGER NOT NULL)');
 db.exec(read('drizzle-neon/0007_oauth.sql'));
 db.exec("INSERT INTO users (id) VALUES ('owner'),('other')");
 const adapter={prepare(sql){return {bind(...args){return {
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){return {meta:db.prepare(sql).run(...args)};},
 };}};},async batch(items){const results=[];for(const item of items)results.push(await item.run());return results;}};
 process.env.APP_ORIGIN=ORIGIN;
 const auth=await load('lib/auth.ts');
 // CIMD 문서는 네트워크 대신 이 표에서 돌려준다. 실제 가져오기의 SSRF 방어는 아래 별도 테스트에서 확인한다.
 const documents=new Map(),fetched=[];
 const fetchClientDocument=async url=>{fetched.push(url);const doc=documents.get(url);if(!doc)throw new Error('unreachable');return doc;};
 const cimd=await loadCimd();
 globalThis.oauthFixture={...auth,database:()=>adapter,fetchClientDocument,validClientIdUrl:cimd.validClientIdUrl,getCodeUser:async req=>{const m=/user=(\w+)/.exec(req.headers.get('cookie')||'');return m?{userId:m[1]}:null;}};
 const libImports='const {hashToken,fetchClientDocument,validClientIdUrl}=globalThis.oauthFixture;';
 Object.assign(globalThis.oauthFixture,await load('lib/oauth.ts',libImports));
 const imports='const {database,getCodeUser,clientAddress,hashToken,sameOrigin,protectedResourceMetadata,authorizationServerMetadata,oauthJson,oauthError,corsPreflight,readBody,registerClient,countRequest,exchangeToken,revokeToken,checkAuthorizeRequest,authorizeRedirect,approve}=globalThis.oauthFixture;';
 const oauth=globalThis.oauthFixture;
 const [prm,asm,register,token,revoke,decision]=await Promise.all([
  'app/.well-known/oauth-protected-resource/route.ts','app/.well-known/oauth-authorization-server/route.ts',
  'app/oauth/register/route.ts','app/oauth/token/route.ts','app/oauth/revoke/route.ts','app/oauth/authorize/decision/route.ts',
 ].map(path=>load(path,imports)));
 delete globalThis.oauthFixture;
 const originalNow=Date.now;
 try{
  // 메타데이터
  const resourceMeta=await (await prm.GET()).json();
  assert.equal(resourceMeta.resource,RESOURCE);assert.deepEqual(resourceMeta.authorization_servers,[ORIGIN]);
  const serverMeta=await (await asm.GET()).json();
  assert.equal(serverMeta.issuer,ORIGIN);assert.deepEqual(serverMeta.code_challenge_methods_supported,['S256']);
  assert.equal(serverMeta.authorization_response_iss_parameter_supported,true);
  assert.equal(serverMeta.client_id_metadata_document_supported,true);assert.deepEqual(serverMeta.token_endpoint_auth_methods_supported,['none'],'Claude uses CIMD only with both values');

  // 동적 등록
  const registerRequest=(body,ip='203.0.113.1')=>register.POST(new Request(ORIGIN+'/oauth/register',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:JSON.stringify(body)}));
  for(const uris of [['http://evil.test/cb'],['https://ok.test/cb#frag'],[],'https://ok.test/cb'])assert.equal((await registerRequest({redirect_uris:uris})).status,400);
  assert.equal((await registerRequest({redirect_uris:[CALLBACK],client_name:'가'.repeat(101)})).status,400);
  const registered=await registerRequest({client_name:'Claude',redirect_uris:[CALLBACK,'http://localhost/callback'],token_endpoint_auth_method:'client_secret_post'});
  assert.equal(registered.status,201);
  const client=await registered.json();
  assert.equal(client.token_endpoint_auth_method,'none');assert.equal(client.client_secret,undefined);
  const intruder=(await (await registerRequest({redirect_uris:['https://evil.test/cb']})).json()).client_id;
  for(let i=0;i<20;i++)assert.equal((await registerRequest({redirect_uris:[CALLBACK]},'198.51.100.9')).status,201);
  assert.equal((await registerRequest({redirect_uris:[CALLBACK]},'198.51.100.9')).status,429,'registration is rate limited per IP');

  // 동의
  const query=(extra={})=>{const {challenge}=extra.pkce||pkce();delete extra.pkce;return new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:CALLBACK,code_challenge:challenge,code_challenge_method:'S256',state:'xyz',resource:RESOURCE,scope:'tasks:read tasks:write',...extra}).toString();};
  const decide=(q,approve=true,{user='owner',origin=ORIGIN}={})=>decision.POST(new Request(ORIGIN+'/oauth/authorize/decision',{method:'POST',headers:{origin,cookie:user?'user='+user:''},body:JSON.stringify({query:q,approve})}));
  assert.equal((await decide(query(),true,{user:null})).status,401);
  assert.equal((await decide(query(),true,{origin:'https://evil.test'})).status,403);
  assert.equal((await decide(query({client_id:'unknown'}))).status,400);
  assert.equal((await decide(query({redirect_uri:'https://evil.test/cb'}))).status,400,'unregistered redirect is shown, not followed');
  assert.equal((await decide(query({client_id:intruder}))).status,400,'redirect must belong to the same client');
  const errorOf=async res=>{const url=new URL((await res.json()).redirect);return {error:url.searchParams.get('error'),state:url.searchParams.get('state'),iss:url.searchParams.get('iss'),code:url.searchParams.get('code'),url};};
  assert.deepEqual(await errorOf(await decide(query({code_challenge_method:'plain'}))).then(x=>[x.error,x.iss]),['invalid_request',ORIGIN]);
  assert.equal((await errorOf(await decide(query({resource:'https://other.test/api/mcp'})))).error,'invalid_target');
  assert.equal((await errorOf(await decide(query({scope:'tasks:delete'})))).error,'invalid_scope');
  assert.deepEqual(await errorOf(await decide(query(),false)).then(x=>[x.error,x.state,x.code]),['access_denied','xyz',null]);
  const authorize=async(extra={},user='owner')=>{const p=pkce();const res=await errorOf(await decide(query({...extra,pkce:p}),true,{user}));assert.equal(res.error,null);assert.equal(res.iss,ORIGIN);assert.equal(res.state,'xyz');return {...p,code:res.code,url:res.url};};
  const loopback=await authorize({redirect_uri:'http://localhost:4567/callback'});
  assert.equal(loopback.url.origin,'http://localhost:4567','loopback redirect ignores the port');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM oauth_grants').get().n,1,'re-consent reuses the grant');

  // 토큰 교환
  const tokenRequest=body=>token.POST(new Request(ORIGIN+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,resource:RESOURCE,...body})}));
  const exchange=(a,extra={})=>tokenRequest({grant_type:'authorization_code',code:a.code,code_verifier:a.verifier,redirect_uri:CALLBACK,...extra});
  let a=await authorize();
  let res=await exchange(a,{code_verifier:pkce().verifier});assert.equal(res.status,400);assert.equal((await res.json()).error,'invalid_grant','PKCE mismatch');
  assert.equal((await exchange(a)).status,400,'a failed code cannot be retried');
  a=await authorize();assert.equal((await exchange(a,{redirect_uri:'http://localhost/callback'})).status,400,'redirect_uri must match the code');
  a=await authorize();res=await exchange(a,{resource:'https://other.test/api/mcp'});assert.equal((await res.json()).error,'invalid_target');
  a=await authorize();res=await exchange(a,{client_id:intruder});assert.equal((await res.json()).error,'invalid_grant','code is bound to its client');
  a=await authorize();const start=Date.now();Date.now=()=>start+60001;
  assert.equal((await exchange(a)).status,400,'expired code');Date.now=originalNow;
  a=await authorize();res=await exchange(a);assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  const first=await res.json();
  assert.equal(first.token_type,'Bearer');assert.equal(first.expires_in,3600);assert.equal(first.scope,'tasks:read tasks:write');
  assert.equal((await exchange(a)).status,400,'code reuse is rejected');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens WHERE token_hash=?').get(first.access_token).n,0,'only hashes are stored');
  assert.equal((await oauth.verifyAccessToken(adapter,first.access_token,Date.now())).owner,'owner');
  assert.equal(await oauth.verifyAccessToken(adapter,first.refresh_token,Date.now()),null,'refresh token is not an access token');
  assert.equal(await oauth.verifyAccessToken(adapter,first.access_token,Date.now()+3600001),null,'access token expires');
  assert.equal((await tokenRequest({grant_type:'password'})).status,400);

  // refresh rotation과 재사용 감지
  const refresh=(t,extra={})=>tokenRequest({grant_type:'refresh_token',refresh_token:t,...extra});
  assert.equal((await refresh(first.refresh_token,{client_id:intruder})).status,400,'refresh token is bound to its client');
  res=await refresh(first.refresh_token);assert.equal(res.status,200);const second=await res.json();
  assert.notEqual(second.refresh_token,first.refresh_token);
  assert.ok(await oauth.verifyAccessToken(adapter,second.access_token,Date.now()));
  res=await refresh(first.refresh_token);assert.equal((await res.json()).error,'invalid_grant','reused refresh token');
  assert.equal(await oauth.verifyAccessToken(adapter,second.access_token,Date.now()),null,'reuse revokes the whole grant');
  assert.equal((await refresh(second.refresh_token)).status,400);
  const grant=db.prepare("SELECT * FROM oauth_grants WHERE owner='owner'").get();assert.ok(grant.revoked);

  // 폐기된 grant 이후 다시 연결하면 새 grant가 생기고, 토큰 폐기는 발급 클라이언트만 할 수 있다.
  a=await authorize();const third=await (await exchange(a)).json();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM oauth_grants WHERE owner='owner' AND revoked IS NULL").get().n,1);
  const revokeRequest=body=>revoke.POST(new Request(ORIGIN+'/oauth/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}));
  assert.equal((await revokeRequest({token:third.refresh_token,client_id:intruder})).status,200);
  assert.ok(await oauth.verifyAccessToken(adapter,third.access_token,Date.now()),'another client cannot revoke');
  assert.equal((await revokeRequest({token:third.access_token,client_id:client.client_id})).status,200);
  assert.equal(await oauth.verifyAccessToken(adapter,third.access_token,Date.now()),null);
  assert.equal((await refresh(third.refresh_token)).status,200,'revoking an access token keeps the grant');
  assert.equal((await revokeRequest({token:third.refresh_token,client_id:client.client_id})).status,200);

  // CIMD: URL이 곧 client_id다. 문서를 가져와 캐시하고, 이후 토큰 흐름은 DCR과 같다.
  const CIMD='https://claude.ai/oauth/claude-code-client-metadata',LOCAL='http://127.0.0.1:53682/callback';
  const cimdDoc=(over={},url=CIMD)=>({body:JSON.stringify({client_id:url,client_name:'Claude Code',redirect_uris:['http://localhost/callback','http://127.0.0.1/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',...over}),cacheControl:'max-age=600'});
  documents.set(CIMD,cimdDoc());fetched.length=0;
  const viaCimd=await authorize({client_id:CIMD,redirect_uri:LOCAL});
  assert.equal(viaCimd.url.origin,'http://127.0.0.1:53682');
  await authorize({client_id:CIMD,redirect_uri:'http://localhost:4000/callback'});
  assert.deepEqual(fetched,[CIMD],'a cached document is not fetched again');
  const checked=await oauth.checkAuthorizeRequest(adapter,new URLSearchParams(query({client_id:CIMD,redirect_uri:LOCAL})),Date.now(),'203.0.113.5');
  assert.equal(checked.request.clientHost,'claude.ai','consent shows the document host');assert.equal(checked.request.clientName,'Claude Code');
  const cimdTokens=await (await exchange(viaCimd,{client_id:CIMD,redirect_uri:LOCAL})).json();
  assert.ok(cimdTokens.access_token);assert.equal((await exchange(viaCimd,{client_id:CIMD,redirect_uri:LOCAL})).status,400);
  assert.equal((await refresh(cimdTokens.refresh_token,{client_id:CIMD})).status,200);
  assert.equal((await refresh(cimdTokens.refresh_token,{client_id:client.client_id})).status,400,'a DCR client cannot use a CIMD grant');
  assert.equal((await decide(query({client_id:CIMD,redirect_uri:'https://evil.test/cb'}))).status,400,'redirect must be listed in the document');
  // 캐시가 만료되면 다시 가져오고, 바뀐 redirect 목록을 따른다.
  documents.set(CIMD,cimdDoc({redirect_uris:['http://localhost/callback']}));
  const cacheStart=Date.now();Date.now=()=>cacheStart+600001;
  assert.equal((await decide(query({client_id:CIMD,redirect_uri:LOCAL}))).status,400);Date.now=originalNow;
  assert.equal(fetched.length,2);
  // 잘못된 문서와 URL은 거부한다. URL 형식이 틀리면 아예 가져오지 않는다.
  const rejectedCimd=async(url,doc)=>{if(doc)documents.set(url,doc);const before=fetched.length;assert.equal((await decide(query({client_id:url,redirect_uri:LOCAL}))).status,400,url);return fetched.length-before;};
  assert.equal(await rejectedCimd('https://claude.ai/a',cimdDoc({},'https://claude.ai/other')),1,'client_id must match the URL');
  assert.equal(await rejectedCimd('https://claude.ai/b',cimdDoc({token_endpoint_auth_method:'private_key_jwt'})),1,'only public clients');
  assert.equal(await rejectedCimd('https://claude.ai/c',cimdDoc({client_name:''})),1);
  assert.equal(await rejectedCimd('https://claude.ai/d',{body:'not json',cacheControl:''}),1);
  assert.equal(await rejectedCimd('https://claude.ai/unreachable'),1);
  for(const url of ['http://claude.ai/x','https://claude.ai:8443/x','https://claude.ai/','https://127.0.0.1/x','https://[::1]/x','https://user@claude.ai/x','https://CLAUDE.ai/x'])assert.equal(await rejectedCimd(url),0,url);
  assert.equal(oauth.cacheSeconds('max-age=60'),300);assert.equal(oauth.cacheSeconds('public, max-age=999999'),86400);
  assert.equal(oauth.cacheSeconds(''),3600);assert.equal(oauth.cacheSeconds('no-store'),300);
  // 문서를 가져오는 횟수는 IP마다 시간당 30번으로 제한한다.
  db.prepare("DELETE FROM code_limits WHERE id LIKE 'cimd:%'").run();
  const limitStart=fetched.length;
  for(let i=0;i<35;i++)await decide(query({client_id:'https://example.test/client-'+i,redirect_uri:LOCAL}));
  assert.equal(fetched.length-limitStart,30);

  // 계정을 지우면 연결도 함께 지워진다.
  const otherCode=await authorize({},'other');assert.equal((await exchange(otherCode)).status,200);
  db.prepare("DELETE FROM users WHERE id='other'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM oauth_grants WHERE owner='other'").get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens t LEFT JOIN oauth_grants g ON g.id=t.grant_id WHERE g.id IS NULL').get().n,0);
 }finally{Date.now=originalNow;db.close();delete process.env.APP_ORIGIN;}
});

test('CIMD fetch refuses non-public addresses at connect time',async()=>{
 const cimd=await loadCimd();
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','255.255.255.255','::','::1','fe80::1','fd00::1','::ffff:127.0.0.1'])assert.equal(cimd.publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','160.79.104.10','2606:4700:4700::1111'])assert.equal(cimd.publicAddress(ip),true,ip);
 assert.equal(cimd.validClientIdUrl('https://claude.ai/oauth/claude-code-client-metadata'),true);
 // localhost는 이름 검사를 통과하지만, 연결 직전 lookup이 루프백 주소를 막는다.
 await new Promise(resolve=>cimd.safeLookup('localhost',{},error=>{assert.equal(error?.code,'EBLOCKED');resolve();}));
 await assert.rejects(cimd.fetchClientDocument('https://localhost/client.json'),{code:'EBLOCKED'});
 await assert.rejects(cimd.fetchClientDocument('https://127.0.0.1/client.json'),{code:'EBLOCKED'});
});
