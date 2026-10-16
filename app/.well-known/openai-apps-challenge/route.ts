// OpenAI 플러그인 제출의 도메인 확인. 대시보드가 준 토큰을 OPENAI_APPS_CHALLENGE에 넣으면 그 값만 평문으로 돌려준다.
export function GET(){
 const token=process.env.OPENAI_APPS_CHALLENGE?.trim();
 if(!token)return new Response('Not Found',{status:404});
 return new Response(token,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
