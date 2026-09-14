'use client';

import {useEffect,useRef,useState} from 'react';
import {Plus,StickyNote,Trash2} from 'lucide-react';

type Memo={id:string;title:string;body:string;position:number;version:number;created:number;updated:number};
type SaveState='saved'|'saving'|'error';

async function memoRequest(body:unknown){
 const response=await fetch('/api/memos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json() as {memo?:Memo;error?:string;currentVersion?:number};
 if(!response.ok)throw Object.assign(new Error(data.error||'메모를 저장하지 못했습니다.'),{status:response.status,currentVersion:data.currentVersion});
 return data;
}

function MemoCard({memo,focus,onDeleted}:{memo:Memo;focus:boolean;onDeleted:(id:string)=>void}){
 const [title,setTitle]=useState(memo.title),[body,setBody]=useState(memo.body),[state,setState]=useState<SaveState>('saved'),[error,setError]=useState('');
 const titleRef=useRef(title),bodyRef=useRef(body),versionRef=useRef(memo.version),persistedRef=useRef({title:memo.title,body:memo.body}),timerRef=useRef<ReturnType<typeof setTimeout>|null>(null),savingRef=useRef(false),queuedRef=useRef(false),mountedRef=useRef(true),areaRef=useRef<HTMLTextAreaElement>(null);
 titleRef.current=title;bodyRef.current=body;

 const save=async()=>{
  if(savingRef.current){queuedRef.current=true;return;}
  const snapshot={title:titleRef.current,body:bodyRef.current};
  if(snapshot.title===persistedRef.current.title&&snapshot.body===persistedRef.current.body)return;
  savingRef.current=true;queuedRef.current=false;if(mountedRef.current){setState('saving');setError('');}
  try{
   const data=await memoRequest({action:'update',id:memo.id,version:versionRef.current,...snapshot});
   if(data.memo){versionRef.current=data.memo.version;persistedRef.current=snapshot;}
   if(mountedRef.current)setState('saved');
  }catch(reason){
   const failure=reason as Error&{currentVersion?:number};
   if(typeof failure.currentVersion==='number')versionRef.current=failure.currentVersion;
   if(mountedRef.current){setState('error');setError(failure.message);}
  }finally{
   savingRef.current=false;
   if(queuedRef.current&&(titleRef.current!==snapshot.title||bodyRef.current!==snapshot.body))void save();
  }
 };
 const schedule=()=>{if(timerRef.current)clearTimeout(timerRef.current);timerRef.current=setTimeout(()=>void save(),700);};

 useEffect(()=>()=>{mountedRef.current=false;if(timerRef.current)clearTimeout(timerRef.current);},[]);
 useEffect(()=>{const area=areaRef.current;if(area){area.style.height='auto';area.style.height=`${area.scrollHeight}px`;}},[body]);

 const remove=async()=>{
  if((title.trim()||body.trim())&&!window.confirm('이 메모를 삭제하시겠습니까?'))return;
  if(timerRef.current)clearTimeout(timerRef.current);
  try{await memoRequest({action:'delete',id:memo.id,version:versionRef.current});onDeleted(memo.id);}catch(reason){setState('error');setError((reason as Error).message);}
 };

 return <article className="memo-card">
  <div className="memo-card-actions"><span>{state==='saving'?'저장 중':state==='error'?'저장 실패':'저장됨'}</span><button type="button" aria-label="메모 삭제" title="메모 삭제" onClick={()=>void remove()}><Trash2 size={15}/></button></div>
  <input className="memo-title" aria-label="메모 제목" placeholder="제목" maxLength={200} autoFocus={focus} value={title} onChange={event=>{setTitle(event.target.value);schedule();}} onBlur={()=>void save()}/>
  <textarea ref={areaRef} className="memo-body" aria-label="메모 내용" placeholder="메모를 입력하세요." maxLength={20000} rows={2} value={body} onChange={event=>{setBody(event.target.value);schedule();}} onBlur={()=>void save()}/>
  {error&&<div className="memo-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void save()}>다시 저장</button></div>}
 </article>;
}

export default function MemoBoard(){
 const [memos,setMemos]=useState<Memo[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[focusId,setFocusId]=useState<string|null>(null);
 const load=async()=>{setLoading(true);setError('');try{const response=await fetch('/api/memos');const data=await response.json() as {memos?:Memo[];error?:string};if(!response.ok)throw new Error(data.error);setMemos(data.memos||[]);}catch(reason){setError((reason as Error).message);}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const create=async()=>{setError('');try{const data=await memoRequest({action:'create'});if(data.memo){setMemos(current=>[...current,data.memo!]);setFocusId(data.memo.id);}}catch(reason){setError((reason as Error).message);}};
 return <aside className="memo-board" aria-label="메모장">
  <div className="memo-board-head"><div className="section-title"><StickyNote size={20}/><h2>메모장</h2></div><button type="button" className="memo-add" onClick={()=>void create()}><Plus size={16}/>새 메모</button></div>
  {error&&<div className="memo-load-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void load()}>다시 불러오기</button></div>}
  {loading?<p className="memo-placeholder">메모를 불러오는 중입니다.</p>:memos.length===0?<div className="memo-placeholder"><p>항상 표시할 메모를 남겨보세요.</p><button type="button" onClick={()=>void create()}><Plus size={16}/>첫 메모 만들기</button></div>:memos.map(memo=><MemoCard key={memo.id} memo={memo} focus={focusId===memo.id} onDeleted={id=>setMemos(current=>current.filter(item=>item.id!==id))}/>)}
 </aside>;
}
