import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../app/.well-known/openai-apps-challenge/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('OpenAI domain challenge returns only the configured token as plain text',async()=>{
 const saved=process.env.OPENAI_APPS_CHALLENGE;
 try{
  delete process.env.OPENAI_APPS_CHALLENGE;
  assert.equal(GET().status,404);
  process.env.OPENAI_APPS_CHALLENGE='  token-123\n';
  const res=GET();
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/^text\/plain/);
  assert.equal(await res.text(),'token-123');
 }finally{if(saved===undefined)delete process.env.OPENAI_APPS_CHALLENGE;else process.env.OPENAI_APPS_CHALLENGE=saved;}
});
