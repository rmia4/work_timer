import {getCodeUser} from '../../_auth/code-auth';
import {sameOrigin} from '../../../lib/access-code';
import {database} from '../../../db/raw';

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const validText=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;

export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'접속 코드를 입력해 주세요.'},401);
 try{
  const result=await database().prepare('SELECT id,title,body,collapsed,position,version,created,updated FROM memos WHERE owner=? ORDER BY position,created').bind(user.userId).all();
  return reply({memos:result.results.map((memo:any)=>({...memo,collapsed:Boolean(memo.collapsed)}))});
 }catch(error){console.error(error);return reply({error:'메모를 불러오지 못했습니다. 다시 시도해 주세요.'},503);}
}

export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'접속 코드를 입력해 주세요.'},401);
 if(!sameOrigin(req,process.env.APP_ORIGIN))return reply({error:'허용되지 않은 요청입니다.'},403);
 let body:any;try{body=await req.json();}catch{return reply({error:'요청을 확인해 주세요.'},400);}
 if(!body||typeof body!=='object')return reply({error:'요청을 확인해 주세요.'},400);
 try{
  const db=database(),owner=user.userId,now=Date.now();
  if(body.action==='create'){
   const memo={id:crypto.randomUUID(),title:'',body:'',collapsed:false,position:now,version:0,created:now,updated:now};
   await db.prepare('INSERT INTO memos (id,owner,title,body,collapsed,position,version,created,updated) VALUES (?,?,?,?,FALSE,?,?,?,?)').bind(memo.id,owner,memo.title,memo.body,memo.position,memo.version,memo.created,memo.updated).run();
   return reply({memo});
  }
  if(body.action==='reorder'){
   if(typeof body.id!=='string'||typeof body.swapId!=='string'||body.id===body.swapId)return reply({error:'요청을 확인해 주세요.'},400);
   const result=await db.prepare('WITH pair AS MATERIALIZED (SELECT id,position FROM memos WHERE owner=? AND id IN (?,?)) UPDATE memos AS target SET position=CASE WHEN target.id=? THEN (SELECT position FROM pair WHERE id=?) WHEN target.id=? THEN (SELECT position FROM pair WHERE id=?) ELSE target.position END WHERE target.owner=? AND target.id IN (?,?) AND (SELECT COUNT(*) FROM pair)=2 RETURNING id').bind(owner,body.id,body.swapId,body.id,body.swapId,body.swapId,body.id,owner,body.id,body.swapId).all<{id:string}>();
   if(result.results.length!==2)return reply({error:'메모가 없습니다.'},404);
   return reply({ok:true});
  }
  if(typeof body.id!=='string'||!Number.isInteger(body.version))return reply({error:'메모를 다시 불러와 주세요.'},400);
  const current:any=await db.prepare('SELECT id,title,body,collapsed,position,version,created,updated FROM memos WHERE id=? AND owner=?').bind(body.id,owner).first();
  if(!current)return reply({error:'메모가 없습니다.'},404);
  if(current.version!==body.version)return reply({error:'다른 기기에서 변경되었습니다.',currentVersion:current.version},409);
  if(body.action==='update'){
   if(!validText(body.title,200)||!validText(body.body,20000))return reply({error:'메모 내용을 확인해 주세요.'},400);
   if(body.collapsed!==undefined&&typeof body.collapsed!=='boolean')return reply({error:'메모 상태를 확인해 주세요.'},400);
   const collapsed=body.collapsed===undefined?Boolean(current.collapsed):body.collapsed;
   const result=await db.prepare('UPDATE memos SET title=?,body=?,collapsed=?,version=version+1,updated=? WHERE id=? AND owner=? AND version=?').bind(body.title,body.body,collapsed,now,body.id,owner,body.version).run();
   if(!result.meta.changes)return reply({error:'다른 기기에서 변경되었습니다.',currentVersion:current.version},409);
   return reply({memo:{...current,title:body.title,body:body.body,collapsed,version:body.version+1,updated:now}});
  }
  if(body.action==='delete'){
   const result=await db.prepare('DELETE FROM memos WHERE id=? AND owner=? AND version=?').bind(body.id,owner,body.version).run();
   if(!result.meta.changes)return reply({error:'다른 기기에서 변경되었습니다.',currentVersion:current.version},409);
   return reply({ok:true});
  }
  return reply({error:'요청을 확인해 주세요.'},400);
 }catch(error){console.error(error);return reply({error:'메모를 저장하지 못했습니다. 입력 내용은 유지됩니다.'},503);}
}
