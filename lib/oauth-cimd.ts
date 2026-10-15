import {BlockList,isIP} from 'node:net';
import {lookup} from 'node:dns';
import {request} from 'node:https';
// Client ID Metadata Document(URL 형태의 client_id)를 가져온다. 누구나 정할 수 있는 URL을 서버가 요청하므로
// 내부망으로 가는 요청(SSRF)을 막는다. IP 검사는 DNS 조회 직후가 아니라 실제로 연결하는 순간의 주소에 하므로
// 조회와 연결 사이에 주소를 바꾸는 DNS rebinding도 통하지 않는다.
const blocked=new BlockList();
for(const [net,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',3]] as const)blocked.addSubnet(net,prefix,'ipv4');
// IPv4-mapped IPv6(::ffff:a.b.c.d)는 BlockList가 위 IPv4 규칙으로 검사하므로 따로 넣지 않는다(넣으면 모든 IPv4가 막힌다).
for(const [net,prefix] of [['::',127],['fc00::',7],['fe80::',10],['ff00::',8],['64:ff9b::',96],['2002::',16]] as const)blocked.addSubnet(net,prefix,'ipv6');
export function publicAddress(ip:string){const type=isIP(ip);return type!==0&&!blocked.check(ip,type===4?'ipv4':'ipv6');}
const blockedError=()=>Object.assign(new Error('Client metadata host resolves to a non-public address'),{code:'EBLOCKED'});
type LookupCallback=(error:Error|null,address:string|{address:string;family:number}[],family?:number)=>void;
// net.connect가 연결 직전에 부르는 lookup. 조회된 주소 중 하나라도 공인 주소가 아니면 연결하지 않는다.
export function safeLookup(hostname:string,options:{all?:boolean},callback:LookupCallback){
 lookup(hostname,{all:true},(error,addresses)=>{
  if(error)return callback(error,[]);
  if(!addresses.length||!addresses.every(a=>publicAddress(a.address)))return callback(blockedError(),[]);
  if(options?.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);
 });
}
// client_id로 받을 URL: 경로가 있는 https, 기본 포트, 사용자 정보·fragment 없음, IP 주소 직접 지정 불가.
export function validClientIdUrl(value:string){
 if(value.length>2000)return false;
 let url:URL;try{url=new URL(value);}catch{return false;}
 return url.protocol==='https:'&&url.href===value&&url.pathname!=='/'&&!url.port&&!url.username&&!url.password&&!url.hash&&isIP(url.hostname.replace(/^\[|\]$/g,''))===0;
}
export type FetchedDocument={body:string;cacheControl:string};
// 다른 주소로 넘기는 응답은 따라가지 않고, 크기와 전체 시간을 제한한다.
export function fetchClientDocument(url:string,{limit=5*1024,timeout=5000}={}):Promise<FetchedDocument>{
 return new Promise((resolve,reject)=>{
  if(!validClientIdUrl(url))return reject(blockedError());
  const req=request(url,{method:'GET',headers:{accept:'application/json'},lookup:safeLookup as never,timeout},res=>{
   if(res.statusCode!==200){res.resume();return reject(new Error('Client metadata responded with '+res.statusCode));}
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>limit)req.destroy(new Error('Client metadata is too large'));else chunks.push(chunk);});
   res.on('end',()=>{clearTimeout(timer);resolve({body:Buffer.concat(chunks).toString('utf8'),cacheControl:String(res.headers['cache-control']||'')});});
  });
  const timer=setTimeout(()=>req.destroy(new Error('Client metadata request timed out')),timeout);
  req.on('timeout',()=>req.destroy(new Error('Client metadata request timed out')));
  req.on('error',error=>{clearTimeout(timer);reject(error);});
  req.end();
 });
}
