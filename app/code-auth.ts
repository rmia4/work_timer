import {database} from '../db/raw';
import {hashToken,sessionToken} from '../lib/access-code';
export async function getCodeUser(req:Request){
 const token=sessionToken(req);if(!token)return null;
 const row=await database().prepare('SELECT owner FROM code_sessions WHERE token_hash=? AND expires>?').bind(await hashToken(token),Date.now()).first<{owner:string}>();
 return row?{userId:row.owner}:null;
}
