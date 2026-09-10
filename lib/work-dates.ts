export function validDay(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function validTimes(start:unknown,end:unknown){return [start,end].every(t=>t===null||(typeof t==='number'&&Number.isSafeInteger(t)&&t>=0&&t<=253402214400000))&&(start===null||end===null||(end as number)>=(start as number));}
export function localDay(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function clockDuration(ms:number){const s=Math.max(0,Math.floor(ms/1000));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function timestampLabel(t:number|null|undefined){return t==null?'미기록':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(t));}
export function timeInput(t:number|null|undefined){return t==null?'':new Date(t+9*3600000).toISOString().slice(0,19);}
export function parseTimeInput(t:string){return t?Date.parse(t+'+09:00'):null;}
