import {getCodeUser} from '../../code-auth';
import {sameOrigin} from '../../../lib/access-code';
import {validDay} from '../../../lib/work-dates';
import {database} from '../../../db/raw';

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const validText=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;

export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'접속 코드를 입력해 주세요.'},401);
 const day=new URL(req.url).searchParams.get('day');if(!validDay(day))return reply({error:'날짜를 확인해 주세요.'},400);
 try{
  const result=await database().prepare('SELECT id,title,body,position,version,created,updated FROM daily_memos WHERE owner=? AND day=? ORDER BY position,created').bind(user.userId,day).all();
  return reply({memos:result.results});
 }catch(error){console.error(error);return reply({error:'날짜별 메모를 불러오지 못했습니다. 다시 시도해 주세요.'},503);}
}

export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'접속 코드를 입력해 주세요.'},401);
 if(!sameOrigin(req,process.env.APP_ORIGIN))return reply({error:'허용되지 않은 요청입니다.'},403);
 let body:any;try{body=await req.json();}catch{return reply({error:'요청을 확인해 주세요.'},400);}
 if(!body||typeof body!=='object'||!validDay(body.day))return reply({error:'날짜를 확인해 주세요.'},400);
 try{
  const db=database(),owner=user.userId,day=body.day,now=Date.now();
  if(body.action==='create'){
   const memo={id:crypto.randomUUID(),title:'',body:'',position:now,version:0,created:now,updated:now};
   await db.prepare('INSERT INTO daily_memos (id,owner,day,title,body,position,version,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').bind(memo.id,owner,day,memo.title,memo.body,memo.position,memo.version,memo.created,memo.updated).run();
   return reply({memo});
  }
  if(typeof body.id!=='string'||!Number.isInteger(body.version))return reply({error:'메모를 다시 불러와 주세요.'},400);
  const current:any=await db.prepare('SELECT id,title,body,position,version,created,updated FROM daily_memos WHERE id=? AND owner=? AND day=?').bind(body.id,owner,day).first();
  if(!current)return reply({error:'메모가 없습니다.'},404);
  if(current.version!==body.version)return reply({error:'다른 기기에서 변경되었습니다.',currentVersion:current.version},409);
  if(body.action==='update'){
   if(!validText(body.title,200)||!validText(body.body,20000))return reply({error:'메모 내용을 확인해 주세요.'},400);
   const result=await db.prepare('UPDATE daily_memos SET title=?,body=?,version=version+1,updated=? WHERE id=? AND owner=? AND day=? AND version=?').bind(body.title,body.body,now,body.id,owner,day,body.version).run();
   if(!result.meta.changes)return reply({error:'다른 기기에서 변경되었습니다.',currentVersion:current.version},409);
   return reply({memo:{...current,title:body.title,body:body.body,version:body.version+1,updated:now}});
  }
  if(body.action==='delete'){
   const result=await db.prepare('DELETE FROM daily_memos WHERE id=? AND owner=? AND day=? AND version=?').bind(body.id,owner,day,body.version).run();
   if(!result.meta.changes)return reply({error:'다른 기기에서 변경되었습니다.',currentVersion:current.version},409);
   return reply({ok:true});
  }
  return reply({error:'요청을 확인해 주세요.'},400);
 }catch(error){console.error(error);return reply({error:'날짜별 메모를 저장하지 못했습니다. 입력 내용은 유지됩니다.'},503);}
}
