// 키워드 검색: 대소문자 구분 없이 부분 일치. %·_·\는 글자 그대로 찾는다. MCP와 웹 검색이 같이 쓴다.
export const likePattern=(query:string)=>'%'+query.toLowerCase().replace(/[\\%_]/g,c=>'\\'+c)+'%';
export const likeAny=(columns:string[])=>'('+columns.map(c=>`LOWER(${c}) LIKE ? ESCAPE '\\'`).join(' OR ')+')';
// 원문에서 검색어 위치를 찾는다. 대소문자는 ASCII 영문만 무시한다(SQLite LOWER와 같음).
// toLowerCase()는 'İ'처럼 길이가 바뀌는 문자가 있어, 그 위치로 원문을 자르면 어긋난다.
const asciiLower=(text:string)=>text.replace(/[A-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+32));
export const findMatch=(text:string,query:string)=>query?asciiLower(text).indexOf(asciiLower(query)):-1;
