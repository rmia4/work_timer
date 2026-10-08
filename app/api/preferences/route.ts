import {getCodeUser} from '../../_auth/code-auth';
import {sameOrigin} from '../../../lib/auth';
import {database} from '../../../db/raw';
import {DEFAULT_LAYOUT,isLayoutId} from '../../../lib/layouts';

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

// 화면 설정은 비밀번호 확인 없이 읽고 바꾼다 (계정 보안과 무관한 표시 설정).
export async function GET(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 try{
  const row=await database().prepare('SELECT layout FROM users WHERE id=? LIMIT 1').bind(user.userId).first<{layout:string|null}>();
  return reply({layout:isLayoutId(row?.layout)?row.layout:DEFAULT_LAYOUT});
 }catch(error){
  // 마이그레이션 적용 전에도 화면은 기본값으로 동작하게 한다.
  console.error(error);return reply({layout:DEFAULT_LAYOUT});
 }
}

export async function POST(req:Request){
 const user=await getCodeUser(req);if(!user)return reply({error:'로그인이 필요합니다.'},401);
 if(!sameOrigin(req,process.env.APP_ORIGIN))return reply({error:'허용되지 않은 요청입니다.'},403);
 let body:{layout?:unknown}|null;try{body=await req.json();}catch{return reply({error:'요청을 확인해 주세요.'},400);}
 const layout=body?.layout;
 if(!isLayoutId(layout))return reply({error:'화면을 확인해 주세요.'},400);
 try{
  await database().prepare('UPDATE users SET layout=?,updated=? WHERE id=?').bind(layout,Date.now(),user.userId).run();
  return reply({layout});
 }catch(error){console.error(error);return reply({error:'화면 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
